-- NeuraOAB — integração de cobrança com o Asaas (assinaturas Básico/Pro)
-- Execute este script uma vez no projeto Supabase (SQL Editor), depois de
-- schema_planos.sql (precisa de profiles.plano, is_admin(), check_rate_limit()).
-- Aditivo e idempotente — seguro re-rodar.
--
-- ARQUITETURA: o Asaas nunca é chamado direto do navegador (a API key é
-- secreta) — só pelas Edge Functions "criar-cobranca" (inicia uma
-- assinatura + devolve QR code PIX ou link de boleto) e "webhook-asaas"
-- (recebe a confirmação de pagamento do Asaas e libera o plano). As duas
-- usam a service_role key, então esta tabela não precisa de policy de
-- insert/update pra ninguém além delas.
--
-- ROTEIRO pra colocar isso no ar (nenhum destes passos é feito por SQL):
--
--   1. Rode este arquivo inteiro no SQL Editor.
--
--   2. Deploy das Edge Functions "criar-cobranca" e "webhook-asaas" (colar
--      o código de cada uma no editor de Edge Functions do Dashboard do
--      Supabase, mesmo processo de sempre neste projeto).
--
--   3. No painel do Asaas (Integrações > Webhooks), cadastre um webhook
--      apontando para a URL de verdade da function, que é
--        https://lgcphxncteqpbntnlzhe.supabase.co/functions/v1/webhook-asaas
--      NÃO "https://neuraoab.com.br/api/webhook-asaas" — esse domínio é só
--      a landing page estática, não tem nenhum servidor por trás capaz de
--      responder nesse caminho; pra usar essa URL "bonita" seria preciso
--      configurar um proxy/redirect por fora deste projeto (ex.: Cloudflare
--      Worker, regra no host), o que este projeto não tem hoje. Configure:
--        - Token de autenticação (authToken): o MESMO valor já salvo no
--          secret ASAAS_WEBHOOK_TOKEN das Edge Functions — o Asaas manda
--          esse valor de volta no header "asaas-access-token" a cada
--          chamada, e é isso que webhook-asaas valida antes de confiar em
--          qualquer coisa do corpo da requisição.
--        - Eventos: pelo menos PAYMENT_CONFIRMED, PAYMENT_RECEIVED,
--          PAYMENT_OVERDUE, PAYMENT_REFUNDED, PAYMENT_DELETED,
--          SUBSCRIPTION_DELETED, SUBSCRIPTION_INACTIVATED (ver
--          webhook-asaas/index.ts pra saber o que cada um faz aqui).
--        - Versão da API: v3.
--
--   4. Confirme que ASAAS_API_KEY, ASAAS_WEBHOOK_TOKEN e ASAAS_ENV já estão
--      configurados como secret nas Edge Functions (Project Settings > Edge
--      Functions > Secrets) — a mensagem que pediu esta integração disse
--      que sim, mas vale conferir antes do primeiro teste real.

-- ---------------------------------------------------------------------------
-- profiles.cpf_cnpj — obrigatório pro Asaas criar o cliente, opcional aqui
-- ---------------------------------------------------------------------------
--
-- Só é preenchido no momento em que o aluno assina um plano pela primeira
-- vez (ver criar-cobranca/index.ts) — nunca pedido no cadastro. Gravado só
-- pela Edge Function (service_role), nunca por update direto do cliente,
-- então não precisa entrar na lista de campos travados de
-- protect_profile_privileged_fields (não é um campo de privilégio, é só um
-- dado que o próprio aluno informa — mas mora "de fora" mesmo assim, pra
-- não abrir mais um caminho de escrita direto do navegador).

alter table profiles add column if not exists cpf_cnpj text;

-- ---------------------------------------------------------------------------
-- cobrancas — uma linha por assinatura Asaas criada (não por pagamento
-- individual: renovações mensais/anuais atualizam a MESMA linha, ver
-- webhook-asaas/index.ts, casadas por asaas_subscription_id)
-- ---------------------------------------------------------------------------

create table if not exists cobrancas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plano text not null check (plano in ('basico', 'pro')),
  ciclo text not null check (ciclo in ('MONTHLY', 'YEARLY')),
  billing_type text not null check (billing_type in ('PIX', 'BOLETO')),
  valor numeric not null,
  asaas_customer_id text not null,
  asaas_subscription_id text not null,
  asaas_payment_id text,
  -- 'pendente' (aguardando pagamento do PIX/boleto gerado), 'pago' (última
  -- cobrança confirmada — o plano está ativo), 'atrasado' (venceu sem
  -- pagar — plano ainda não é revogado, ver comentário em webhook-asaas
  -- sobre carência), 'cancelado' (assinatura encerrada ou pagamento
  -- estornado/removido).
  status text not null default 'pendente' check (status in ('pendente', 'pago', 'atrasado', 'cancelado')),
  pix_payload text,
  pix_expiration timestamptz,
  boleto_url text,
  invoice_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cobrancas_user on cobrancas (user_id);
create index if not exists idx_cobrancas_subscription on cobrancas (asaas_subscription_id);
create index if not exists idx_cobrancas_payment on cobrancas (asaas_payment_id);

alter table cobrancas enable row level security;

-- Aluno vê as PRÓPRIAS cobranças (histórico/status) — nunca de outro
-- aluno. Admin vê todas (suporte/conferência financeira). Sem policy de
-- insert/update/delete pra anon/authenticated de propósito: toda escrita
-- vem só das duas Edge Functions, com a service_role key (que ignora RLS).
drop policy if exists "cobrancas_select" on cobrancas;
create policy "cobrancas_select" on cobrancas
  for select to authenticated
  using (user_id = auth.uid() or is_admin());

create or replace function touch_cobrancas_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_cobrancas_updated_at on cobrancas;
create trigger trg_touch_cobrancas_updated_at
  before update on cobrancas
  for each row
  execute function touch_cobrancas_updated_at();
