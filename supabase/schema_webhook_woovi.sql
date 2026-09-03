-- NeuraOAB — integração de cobrança PIX com a Woovi (ex-OpenPix)
-- Execute este script uma vez no projeto Supabase (SQL Editor), depois de
-- schema_asaas.sql (reaproveita a tabela "cobrancas" e a função is_admin()
-- de lá). Aditivo e idempotente — seguro re-rodar.
--
-- ARQUITETURA: "cobrancas" passa a servir DOIS gateways (Asaas e Woovi) na
-- mesma tabela, diferenciados pela nova coluna "gateway" — mesma linha,
-- mesmo fluxo de "status"/profiles.plano, só troca QUEM preenche
-- asaas_* vs woovi_*. Motivo de reaproveitar em vez de criar uma tabela
-- "cobrancas_woovi" separada: o resto do produto (histórico do aluno,
-- policy de RLS, painel de admin) já lê de "cobrancas" — duplicar a tabela
-- duplicaria também toda tela que mostra "minhas cobranças".
--
-- Duas Edge Functions cobrem o fluxo completo: "criar-cobranca-woovi" (gera
-- a cobrança PIX na Woovi e grava a linha em "cobrancas" ANTES do
-- pagamento) e "webhook-woovi" (recebe a confirmação e libera o plano) —
-- casadas por cobrancas.woovi_correlation_id, que criar-cobranca-woovi
-- decide ANTES de chamar a Woovi (ver comentário lá) e usa como
-- correlationID da cobrança, então webhook-woovi sempre acha a linha certa
-- sem passo extra nenhum.
--
-- ROTEIRO pra colocar isso no ar (nenhum destes passos é feito por SQL):
--
--   1. Rode este arquivo inteiro no SQL Editor.
--
--   2. Deploy das Edge Functions "criar-cobranca-woovi" e "webhook-woovi"
--      (colar o código de cada uma no editor de Edge Functions do
--      Dashboard do Supabase, mesmo processo de sempre neste projeto).
--
--   3. Configure os secrets (Project Settings > Edge Functions > Secrets):
--        - WOOVI_APP_ID: a "AppID" da Woovi (Configurações > Aplicações no
--          painel dela) — usada só por criar-cobranca-woovi pra criar a
--          cobrança.
--        - WOOVI_ENV: "production" ou "sandbox" (controla a base URL usada
--          por criar-cobranca-woovi) — default "sandbox" se não setado,
--          por segurança (não gera cobrança real sem trocar
--          explicitamente).
--        - WOOVI_WEBHOOK_TOKEN: uma string aleatória só sua, usada só por
--          webhook-woovi, ex.: openssl rand -hex 32
--
--   4. IMPORTANTE — desative "Enforce JWT Verification" só na function
--      "webhook-woovi" (nas configurações dela no Dashboard, ou
--      `supabase functions deploy webhook-woovi --no-verify-jwt` se
--      deployar via CLI). Ela usa o header "Authorization" pra um segredo
--      DA WOOVI (WOOVI_WEBHOOK_TOKEN), não um JWT do Supabase — com a
--      verificação padrão ligada, o gateway do Supabase rejeita a chamada
--      ANTES do código da function rodar (sintoma: só aparece "booted"/
--      "shutdown" nos logs, nenhum log da function em si). NÃO desative em
--      "criar-cobranca-woovi" — ela É chamada com o JWT de sessão do
--      próprio aluno (via supabase-js do navegador), então a verificação
--      padrão é exatamente a proteção certa ali.
--
--   5. No painel da Woovi (Configurações > Webhooks > Adicionar Webhook),
--      cadastre:
--        - URL: https://lgcphxncteqpbntnlzhe.supabase.co/functions/v1/webhook-woovi
--        - Evento: "Cobrança Completa" (OPENPIX:CHARGE_COMPLETED)
--        - Cabeçalho customizado: adicione um header "Authorization" com o
--          valor "Bearer <o MESMO valor do secret WOOVI_WEBHOOK_TOKEN>" —
--          é a Woovi quem deixa você anexar qualquer header à escolha em
--          TODA chamada do webhook (não é uma assinatura própria dela); é
--          esse valor que webhook-woovi confere antes de confiar em
--          qualquer coisa do corpo da requisição.
--
--      NOTA DE SEGURANÇA: a Woovi também oferece (e recomenda como método
--      mais forte) validar o header "x-webhook-signature", uma assinatura
--      RSA gerada com a chave privada dela sobre o corpo da requisição —
--      ver "Validando Webhook payload usando x-webhook-signature" na
--      documentação deles. O esquema implementado aqui (header
--      Authorization com um segredo compartilhado, igual ao que este
--      projeto já faz com o Asaas em ASAAS_WEBHOOK_TOKEN) é mais simples e
--      consistente com o resto do código, mas é você quem digita esse
--      header no cadastro do webhook — não é validado pela Woovi
--      automaticamente. Se quiser o esquema mais forte depois, é uma
--      function separada de verificação, não uma troca de uma linha.
--
--   6. Ainda falta o front-end chamar "criar-cobranca-woovi" de fato (a
--      tela de planos hoje só chama "criar-cobranca", do Asaas) — não fazia
--      parte deste pedido. A resposta de criar-cobranca-woovi usa os MESMOS
--      nomes de campo da resposta do criar-cobranca (cobrancaId,
--      pixPayload, pixQrImage, pixExpiration, invoiceUrl, valor) de
--      propósito, pra a troca no front-end ser só "qual function chamar",
--      não uma tela nova — mas pixQrImage aqui é uma URL de imagem (Woovi),
--      não uma imagem base64 (Asaas): funciona igual num <img src="...">,
--      só não é a mesma STRING de formato.
--
--   7. Confirme que RECORRÊNCIA NÃO É AUTOMÁTICA por este caminho — ao
--      contrário do Asaas (assinatura de verdade, renova sozinha),
--      criar-cobranca-woovi gera uma cobrança PIX AVULSA por vez (ver
--      comentário no topo do arquivo dela). Sem um fluxo de renovação
--      separado (fora do escopo deste pedido), um aluno que assina pela
--      Woovi só continua com o plano ativo enquanto pagar manualmente de
--      novo antes do plano "vencer" — não existe hoje um relógio revogando
--      o plano automaticamente por falta de renovação (mesma lacuna que já
--      existe pro Asaas em atraso, ver OVERDUE_EVENTS em
--      webhook-asaas/index.ts, só que lá pelo menos a cobrança nova É
--      gerada sozinha).

-- ---------------------------------------------------------------------------
-- cobrancas — colunas novas pra Woovi + relaxa NOT NULL das colunas do Asaas
-- ---------------------------------------------------------------------------

-- asaas_customer_id/asaas_subscription_id eram "not null" (só existia o
-- Asaas até aqui) — uma cobrança Woovi não tem nenhum dos dois.
alter table cobrancas alter column asaas_customer_id drop not null;
alter table cobrancas alter column asaas_subscription_id drop not null;

-- Discrimina qual gateway processou esta cobrança — sem isso, "tem
-- woovi_correlation_id preenchido" seria o único jeito de saber, o que
-- funciona mas é implícito demais pra uma tela de admin/suporte.
alter table cobrancas add column if not exists gateway text not null default 'asaas'
  check (gateway in ('asaas', 'woovi'));

-- charge.correlationID (Woovi) — o id que NÓS escolhemos ao criar a
-- cobrança (equivalente ao externalReference do Asaas); é o campo
-- desenhado pela própria Woovi pra correlação com sistemas externos, então
-- é a chave primária de busca no webhook. charge.identifier/transactionID
-- é o id que a WOOVI escolhe — mantido como fallback (mesmo padrão de
-- asaas_subscription_id/asaas_payment_id em webhook-asaas). end_to_end_id é
-- só informativo (comprovante do PIX em si, não usado pra busca).
alter table cobrancas add column if not exists woovi_correlation_id text;
alter table cobrancas add column if not exists woovi_charge_id text;
alter table cobrancas add column if not exists woovi_end_to_end_id text;

create index if not exists idx_cobrancas_woovi_correlation on cobrancas (woovi_correlation_id);
create index if not exists idx_cobrancas_woovi_charge on cobrancas (woovi_charge_id);

-- ---------------------------------------------------------------------------
-- historico_pagamentos — log de auditoria de todo webhook de pagamento
-- processado (Woovi hoje; Asaas pode passar a gravar aqui também depois,
-- não mexido neste script pra não sair do escopo do pedido)
-- ---------------------------------------------------------------------------
--
-- Existe À PARTE de "cobrancas.status" de propósito: "cobrancas" guarda só
-- o estado ATUAL (uma linha por assinatura/cobrança, sobrescrita a cada
-- evento); isto aqui é o HISTÓRICO — uma linha por notificação recebida,
-- nunca sobrescrita, incluindo tentativas que não bateram com nenhuma
-- cobrança (cobranca_id nulo) — útil justamente enquanto não existe a
-- function de criação (ver comentário no topo), pra conseguir ver no banco
-- "chegou notificação X, não achei pra casar" sem precisar vasculhar log de
-- Edge Function.

create table if not exists historico_pagamentos (
  id uuid primary key default gen_random_uuid(),
  cobranca_id uuid references cobrancas(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  gateway text not null check (gateway in ('asaas', 'woovi')),
  evento text not null,
  status text not null,
  valor numeric,
  charge_id text,
  correlation_id text,
  raw_payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_historico_pagamentos_cobranca on historico_pagamentos (cobranca_id);
create index if not exists idx_historico_pagamentos_user on historico_pagamentos (user_id);

alter table historico_pagamentos enable row level security;

-- Mesmo modelo de "cobrancas": aluno vê o PRÓPRIO histórico, admin vê tudo,
-- nenhuma policy de insert/update/delete pra anon/authenticated (só
-- webhook-woovi grava, com a service_role key, que ignora RLS).
drop policy if exists "historico_pagamentos_select" on historico_pagamentos;
create policy "historico_pagamentos_select" on historico_pagamentos
  for select to authenticated
  using (user_id = auth.uid() or is_admin());
