-- NeuraOAB — auditoria de segurança geral (2026-09-09)
-- Execute este script uma vez no SQL Editor do Supabase, depois de TODOS os
-- outros schema_*.sql (inclusive schema_fase2_login_obrigatorio.sql, que é
-- exatamente o que este arquivo corrige). Aditivo/idempotente — seguro
-- re-rodar.
--
-- ---------------------------------------------------------------------------
-- REGRESSÃO CRÍTICA: oab2_respostas voltou a aceitar UPDATE/INSERT aberto
-- ---------------------------------------------------------------------------
--
-- schema_security_hardening.sql (2026-09-02) fechou oab2_tentativas/
-- oab2_respostas pro papel "anon" (SELECT/UPDATE sem filtro nenhum deixava
-- qualquer um com a anon key ler ou REESCREVER A NOTA da 2ª fase de
-- qualquer aluno). schema_fase2_login_obrigatorio.sql (mesmo dia seguinte),
-- ao tirar "anon" da lista de roles de oab2_respostas_insert/oab2_respostas_
-- update, RECRIOU as duas com "to authenticated ... using(true) with
-- check(true)" — ou seja, exatamente o MESMO buraco, só que agora
-- alcançável por QUALQUER CONTA (inclusive uma auto-cadastrada de graça na
-- landing, trivial de criar em massa), não só pela anon key. Como o
-- Postgres combina múltiplas policies permissivas com OR, essa policy aberta
-- convivia com a "oab2_respostas_update_auth" (schema_professor_portal.sql,
-- corretamente restrita a dono/admin) e VENCIA — qualquer aluno logado
-- conseguia sobrescrever nota/feedback/gabarito comentado da tentativa de
-- QUALQUER outro aluno via uma chamada direta ao PostgREST (sem nem precisar
-- da UI), e inserir uma resposta em nome de outro aluno.
--
-- Nenhum código legítimo do app faz INSERT/UPDATE direto nessas tabelas —
-- tanto estudos/simulado2fase.js quanto a Edge Function corretor-2fase
-- sempre passam pelas funções SECURITY DEFINER oab2_upsert_resposta()/
-- oab2_update_tentativa_status() (ver schema_security_hardening.sql), que já
-- validam o id certo. As policies de tabela abaixo são só uma segunda
-- camada de defesa (defense in depth) — não deveriam nunca ser exercitadas
-- pelo app de verdade, então apertá-las não quebra nada em uso normal.

-- Remove de vez a versão aberta — "oab2_respostas_update_auth" (dono/admin)
-- já cobre todo acesso de update legítimo, não precisa de duas policies.
drop policy if exists "oab2_respostas_update" on oab2_respostas;

-- oab2_respostas_insert: mesma correção, mas para INSERT (não existe uma
-- "_auth" já certa pra reaproveitar aqui — schema_professor_portal.sql só
-- tinha a de select/update). Passa a exigir que a tentativa_id sendo
-- inserida pertença a quem está chamando (ou seja admin) — mesmo predicado
-- de oab2_respostas_update_auth.
drop policy if exists "oab2_respostas_insert" on oab2_respostas;
create policy "oab2_respostas_insert" on oab2_respostas
  for insert to authenticated
  with check (
    exists (
      select 1 from oab2_tentativas t
      where t.id = oab2_respostas.tentativa_id and (t.user_id = auth.uid() or is_admin())
    )
  );

-- O restante do hardening desta auditoria (2026-09-09) é em código das Edge
-- Functions e do front-end (rate limiting em recomendacao-dashboard/
-- estatisticas-ia, correção do pre-hijacking em professor-self-signup,
-- Turnstile, CSP, headers de segurança) — não precisa de SQL adicional, ver
-- os arquivos alterados no mesmo commit.
