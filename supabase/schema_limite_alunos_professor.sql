-- NeuraOAB — limite de alunos por PROFESSOR (Portal Mestre)
-- Execute este script uma vez no projeto Supabase (SQL Editor), depois de
-- TODOS os outros schema_*.sql (inclusive schema_aluno_avulso.sql — ver nota
-- abaixo sobre a redeclaração do gatilho). Aditivo, seguro re-rodar.
--
-- CONTEXTO: até aqui só existia limite de vagas por TURMA (turmas.limite_
-- alunos, ver schema_convites_turma.sql), controlado pelo próprio professor.
-- Este arquivo acrescenta um limite por PROFESSOR (profiles.limite_alunos,
-- null = sem limite), controlado só pelo admin no Portal Mestre (ver
-- portal-mestre/dashboard.html + js/admin.js) — pensado pra admin poder
-- limitar quantos alunos cada professor pode ter no total, independente de
-- quantas turmas ele crie. Checado nos dois mesmos pontos que já checam
-- turmas.limite_alunos: ao gerar o convite (createConvite em supabase/
-- functions/professor-portal/index.ts) e ao aceitar (validateConvite em
-- supabase/functions/aluno-portal/index.ts).
--
-- ROTEIRO:
--   1. Rode este arquivo inteiro no SQL Editor.
--   2. Re-cole o código atualizado das três Edge Functions no editor de
--      Edge Functions do Dashboard do Supabase: portal-admin, professor-
--      portal, aluno-portal.

alter table profiles add column if not exists limite_alunos integer;

-- Redeclaração de protect_profile_privileged_fields — mesma trava de
-- role_id/ativo/professor_id/excluido_em/is_avulso/plano (só admin ou
-- service_role editam, nunca o próprio professor via UPDATE direto na
-- tabela, ex.: profiles_update_self ao salvar o nome no convite), +
-- limite_alunos agora. Reúne aqui a versão MAIS COMPLETA de todas as
-- redeclarações anteriores (schema_portal_mestre.sql, schema_turmas.sql,
-- schema_alunos_exclusao.sql, schema_professor_portal.sql,
-- schema_aluno_avulso.sql) porque, como cada uma faz um "create or replace"
-- do zero, só a ÚLTIMA a rodar vale — e a de schema_aluno_avulso.sql (que
-- pede pra rodar por último) tinha ficado pra trás, sem a proteção de
-- excluido_em nem a exceção de turma_id pro próprio professor que
-- schema_alunos_exclusao.sql havia introduzido. Esta redeclaração corrige
-- isso de quebra, já que precisava mexer na função de qualquer forma.
create or replace function protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_own_professor boolean := is_professor() and old.professor_id = auth.uid();
begin
  if not is_admin() and coalesce(auth.role(), '') <> 'service_role' then
    new.role_id := old.role_id;
    new.ativo := old.ativo;
    new.professor_id := old.professor_id;
    new.excluido_em := old.excluido_em;
    new.is_avulso := old.is_avulso;
    new.plano := old.plano;
    new.limite_alunos := old.limite_alunos;
    if not is_own_professor then
      new.turma_id := old.turma_id;
    end if;
  end if;
  return new;
end;
$$;
