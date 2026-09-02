-- NeuraOAB — hardening de segurança (auditoria de 2026-09-02)
-- Execute este script uma vez no projeto Supabase (SQL Editor), depois de
-- todos os outros schema_*.sql. Aditivo e idempotente — seguro re-rodar.
--
-- Resumo do que cada bloco corrige (ver relatório completo da auditoria
-- pra motivação/exploração detalhada de cada item):
--
--   1. oab2_tentativas / oab2_respostas liam e gravavam ABERTO pro papel
--      anon (using(true), sem filtro nenhum) — qualquer um com a anon key
--      (pública em qualquer HTML do site) conseguia ler ou reescrever a
--      resposta/nota da 2ª fase de QUALQUER aluno, sem estar logado.
--      Correção: o fluxo anônimo (uso sem conta, documentado e mantido de
--      propósito — ver estudos/simulado2fase.js) já funciona só com o
--      próprio id (aleatório, imprevisível) da tentativa/resposta como
--      "capacidade" — nunca faz um SELECT/UPDATE sem filtrar por esse id.
--      RLS não consegue expressar "só permite se o cliente filtrou pelo id
--      certo" (a policy vale pra linha, não pro formato da query), então a
--      correção move essas duas tabelas pra funções SECURITY DEFINER que
--      EXIGEM o id como parâmetro — o mesmo modelo de segurança, só que
--      agora realmente aplicado, em vez de confiar que o cliente sempre vai
--      "se comportar". O código-fonte (estudos/simulado2fase.js) precisa
--      trocar as chamadas .from(...).select()/.update()/.upsert() por
--      .rpc(...) equivalentes — ver comentário no topo de cada função.
--
--   2. oab2_provas/itens/subitens/criterios (gabarito oficial da 2ª fase)
--      aceitavam UPDATE de qualquer um com a anon key — dava pra reescrever
--      silenciosamente o gabarito comentado/critério de correção de uma
--      prova já publicada (a corretor-2fase usa esse conteúdo como fonte de
--      verdade pra nota do aluno). Nada no app legítimo faz UPDATE nessas
--      tabelas depois da importação — só INSERT (admin/import2fase.html).
--      Correção: remove as policies de update.
--
--   3. oab_respostas.correct (1ª fase) era decidido pelo PRÓPRIO CLIENTE e
--      gravado sem checagem — um aluno logado podia inserir "correct: true"
--      pra questão que errou, inflando a própria estatística mostrada a si
--      e ao professor. Correção: trigger que recalcula "correct" no
--      servidor a partir de oab_questions.correct_answer, ignorando
--      qualquer valor que o client tenha mandado.
--
--   4. corretor-2fase e dr-laureano (Edge Functions) são públicas de
--      propósito (mesmo fluxo anônimo do item 1) e cada chamada custa
--      dinheiro de verdade (API paga de IA) — sem limite nenhum de
--      chamadas, viram vetor de negação de serviço por esgotamento de
--      orçamento. Correção: função de rate limit por chave (IP ou
--      aluno/professor autenticado), chamada pelas próprias Edge Functions
--      via RPC — ver check_rate_limit() abaixo.

-- ---------------------------------------------------------------------------
-- 1. oab2_tentativas / oab2_respostas — fecha o buraco do papel anon
-- ---------------------------------------------------------------------------

-- As policies "_anon" (schema_professor_portal.sql) liberavam using(true)
-- pro papel anon sem NENHUM filtro — é isso que permitia ler/gravar a linha
-- de qualquer aluno. Removidas; o acesso anônimo passa a ser só pelas
-- funções abaixo, que exigem o id exato.
drop policy if exists "oab2_tentativas_select_anon" on oab2_tentativas;
drop policy if exists "oab2_tentativas_update_anon" on oab2_tentativas;
drop policy if exists "oab2_respostas_select_anon" on oab2_respostas;
drop policy if exists "oab2_respostas_update_anon" on oab2_respostas;

-- As policies "_auth" (professor dono/admin/aluno dono via auth.uid())
-- continuam exatamente como estavam — não mexemos nelas, seguem cobrindo
-- quem acessa logado (inclusive o Portal do Professor).

-- Busca uma tentativa específica pelo próprio id (o "ponteiro" que
-- estudos/simulado2fase.js guarda no localStorage do navegador) — filtro
-- por status embutido, mesmo comportamento de antes (findTentativa()).
create or replace function oab2_get_tentativa(p_tentativa_id uuid)
returns setof oab2_tentativas
language sql
security definer
set search_path = public
stable
as $$
  select * from oab2_tentativas
  where id = p_tentativa_id and status = 'em_andamento';
$$;

-- Respostas (rascunhos) já salvas de uma tentativa — usa o id da PRÓPRIA
-- tentativa como filtro (loadDrafts()).
create or replace function oab2_get_respostas(p_tentativa_id uuid)
returns table (item_id uuid, texto_resposta text)
language sql
security definer
set search_path = public
stable
as $$
  select item_id, texto_resposta from oab2_respostas
  where tentativa_id = p_tentativa_id;
$$;

-- Upsert de uma resposta (rascunho automático a cada 1.5s, e o resultado
-- final da correção por IA) — sempre escopado à tentativa_id informada,
-- nunca "todas as respostas". nota/feedback ficam null por padrão (rascunho
-- normal); a correção final passa esses argumentos.
create or replace function oab2_upsert_resposta(
  p_tentativa_id uuid,
  p_item_id uuid,
  p_texto_resposta text,
  p_nota numeric default null,
  p_feedback_geral text default null,
  p_feedback_criterios jsonb default null,
  p_alertas_juridicos jsonb default null,
  p_corrected boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into oab2_respostas (tentativa_id, item_id, texto_resposta, nota, feedback_geral, feedback_criterios, alertas_juridicos, corrected_at)
  values (
    p_tentativa_id, p_item_id, p_texto_resposta, p_nota, p_feedback_geral, p_feedback_criterios, p_alertas_juridicos,
    case when p_corrected then now() else null end
  )
  on conflict (tentativa_id, item_id) do update set
    texto_resposta = excluded.texto_resposta,
    nota = excluded.nota,
    feedback_geral = excluded.feedback_geral,
    feedback_criterios = excluded.feedback_criterios,
    alertas_juridicos = excluded.alertas_juridicos,
    corrected_at = excluded.corrected_at;
end;
$$;

-- Atualiza status/nota da própria tentativa (ao clicar "Finalizar") — só os
-- campos que o front-end de fato muda (status, nota_total, finished_at,
-- corrected_at), sempre pelo id exato da tentativa em andamento.
create or replace function oab2_update_tentativa_status(
  p_tentativa_id uuid,
  p_status text,
  p_nota_total numeric default null,
  p_mark_finished boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update oab2_tentativas set
    status = p_status,
    nota_total = coalesce(p_nota_total, nota_total),
    finished_at = case when p_mark_finished then now() else finished_at end,
    corrected_at = case when p_mark_finished then now() else corrected_at end
  where id = p_tentativa_id;
end;
$$;

revoke all on function oab2_get_tentativa(uuid) from public;
revoke all on function oab2_get_respostas(uuid) from public;
revoke all on function oab2_upsert_resposta(uuid, uuid, text, numeric, text, jsonb, jsonb, boolean) from public;
revoke all on function oab2_update_tentativa_status(uuid, text, numeric, boolean) from public;

grant execute on function oab2_get_tentativa(uuid) to anon, authenticated;
grant execute on function oab2_get_respostas(uuid) to anon, authenticated;
grant execute on function oab2_upsert_resposta(uuid, uuid, text, numeric, text, jsonb, jsonb, boolean) to anon, authenticated;
grant execute on function oab2_update_tentativa_status(uuid, text, numeric, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. oab2_provas/itens/subitens/criterios — remove UPDATE aberto
-- ---------------------------------------------------------------------------
-- Nada no app legítimo reescreve conteúdo já importado — só admin/import2fase.html
-- faz INSERT (isso continua liberado, é o mesmo modelo já documentado em
-- schema_fase2.sql pra conteúdo público de questões). Se algum dia precisar
-- corrigir um gabarito já importado, faça via SQL Editor (como admin) ou
-- reimporte com DELETE + INSERT.
drop policy if exists "oab2_provas_update" on oab2_provas;
drop policy if exists "oab2_itens_update" on oab2_itens;

-- ---------------------------------------------------------------------------
-- 3. oab_respostas.correct — deixa de confiar no valor mandado pelo cliente
-- ---------------------------------------------------------------------------
create or replace function compute_oab_resposta_correct()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select (correct_answer = new.letter) into new.correct
  from oab_questions
  where id = new.question_id;

  if new.correct is null then
    new.correct := false;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_oab_respostas_correct on oab_respostas;
create trigger trg_oab_respostas_correct
  before insert on oab_respostas
  for each row
  execute function compute_oab_resposta_correct();

-- ---------------------------------------------------------------------------
-- 4. Rate limiting pras Edge Functions públicas (corretor-2fase, dr-laureano)
-- ---------------------------------------------------------------------------
-- Janela deslizante simples por chave (ex.: "corretor:203.0.113.5") — a
-- linha é sobrescrita quando a janela expira, sem precisar de job de
-- limpeza separado.
create table if not exists edge_rate_limits (
  rate_key text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 0
);

alter table edge_rate_limits enable row level security;
-- Sem policy nenhuma pro papel anon/authenticated de propósito: a tabela só
-- é tocada via check_rate_limit() (security definer), nunca lida/gravada
-- direto pelo cliente.

create or replace function check_rate_limit(p_key text, p_max_count integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into edge_rate_limits (rate_key, window_start, count)
  values (p_key, now(), 1)
  on conflict (rate_key) do update set
    count = case
      when edge_rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then 1
      else edge_rate_limits.count + 1
    end,
    window_start = case
      when edge_rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then now()
      else edge_rate_limits.window_start
    end
  returning count into v_count;

  return v_count <= p_max_count;
end;
$$;

revoke all on function check_rate_limit(text, integer, integer) from public;
grant execute on function check_rate_limit(text, integer, integer) to anon, authenticated, service_role;

-- ROTEIRO:
--   1. Rode este arquivo inteiro no SQL Editor do Supabase.
--   2. Troque as chamadas .from("oab2_tentativas"/"oab2_respostas") em
--      estudos/simulado2fase.js pelas .rpc() equivalentes (já feito neste
--      commit, ver arquivo).
--   3. Recole corretor-2fase/index.ts e dr-laureano/index.ts atualizados no
--      editor de Edge Functions (já feito neste commit, ver arquivos).
