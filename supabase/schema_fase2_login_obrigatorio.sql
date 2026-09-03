-- NeuraOAB — 2ª fase passa a exigir login (igual ao resto do sistema)
-- Execute este script uma vez no SQL Editor do Supabase, depois de
-- schema_security_hardening.sql, schema_fase2_dashboard.sql e
-- schema_fase2_dashboard_v2.sql. Aditivo e idempotente — seguro re-rodar.
--
-- CONTEXTO: até aqui, a 2ª fase (estudos/simulado2fase.html) era a ÚNICA
-- área do site que funcionava sem conta — documentado e mantido de
-- propósito nos comentários de schema_fase2.sql/schema_security_hardening.sql
-- (o fluxo anônimo já era seguro contra OUTRO aluno ler/gravar sua tentativa,
-- via as funções SECURITY DEFINER que exigem o id exato — não era um buraco
-- de RLS). O que sobrava era uma escolha de PRODUTO: "corretor-2fase" (a
-- correção por IA, que custa dinheiro de verdade a cada chamada) não tinha
-- NENHUM limite de plano pra quem não estivesse logado — ver comentário em
-- planAllowsSegundaFase, supabase/functions/corretor-2fase/index.ts (corrigido
-- junto com este arquivo) — ou seja, o paywall dos planos Básico/Pro era
-- trivialmente contornável só não fazendo login. Agora que a página inteira
-- exige login (ver requireAuth em estudos/simulado2fase.js), fecha-se esse
-- caminho por completo: sem sessão, nem chega a abrir a página.
--
-- ROTEIRO:
--   1. Rode este arquivo inteiro no SQL Editor.
--   2. Recole supabase/functions/corretor-2fase/index.ts atualizado no editor
--      de Edge Functions do Dashboard do Supabase.

-- ---------------------------------------------------------------------------
-- oab2_tentativas/oab2_respostas — INSERT/UPDATE deixam de aceitar "anon"
-- ---------------------------------------------------------------------------
--
-- SELECT/UPDATE de oab2_tentativas/oab2_respostas pro papel anon já tinham
-- sido removidos em schema_security_hardening.sql (substituídos pelas
-- funções oab2_get_tentativa/oab2_get_respostas/oab2_upsert_resposta/
-- oab2_update_tentativa_status) — só o INSERT direto (criar uma tentativa
-- nova, ver createTentativa em estudos/simulado2fase.js) e o UPDATE/INSERT
-- de oab2_respostas (hoje praticamente só usados via oab2_upsert_resposta,
-- mas a policy antiga continuava aberta) ainda aceitavam o papel anon.

drop policy if exists "oab2_tentativas_insert" on oab2_tentativas;
create policy "oab2_tentativas_insert" on oab2_tentativas
  for insert to authenticated
  -- user_id = auth.uid() (nunca null, nunca de outra pessoa) — antes disso
  -- a policy só exigia with check(true), então nada impedia um cliente
  -- autenticado inserir uma tentativa com o user_id de OUTRO aluno (útil
  -- fechar agora que login é sempre garantido, mesmo sem ter sido pedido
  -- explicitamente — é uma consequência direta e barata de exigir login).
  with check (user_id = auth.uid());

drop policy if exists "oab2_respostas_insert" on oab2_respostas;
create policy "oab2_respostas_insert" on oab2_respostas
  for insert to authenticated with check (true);

drop policy if exists "oab2_respostas_update" on oab2_respostas;
create policy "oab2_respostas_update" on oab2_respostas
  for update to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Funções SECURITY DEFINER do fluxo da 2ª fase — revoga o grant pro anon
-- ---------------------------------------------------------------------------
--
-- Continuavam liberadas pro papel anon (o modelo "id imprevisível como
-- capacidade" já as tornava seguras mesmo assim — ver schema_security_
-- hardening.sql) só porque o fluxo anônimo ainda existia. Sem ele, não há
-- motivo pra manter a porta aberta.

revoke execute on function oab2_get_tentativa(uuid) from anon;
revoke execute on function oab2_get_respostas(uuid) from anon;
revoke execute on function oab2_upsert_resposta(uuid, uuid, text, numeric, text, jsonb, jsonb, boolean) from anon;
revoke execute on function oab2_update_tentativa_status(uuid, text, numeric, boolean) from anon;
revoke execute on function oab2_minhas_tentativas(text) from anon;
revoke execute on function oab2_minhas_respostas_corrigidas(text) from anon;
