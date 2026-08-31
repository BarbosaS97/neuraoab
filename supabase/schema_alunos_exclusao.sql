-- NeuraOAB — schema de exclusão/restauração de aluno (Portal do Professor)
-- Execute este script uma vez no projeto Supabase (SQL Editor), depois de
-- schema_professor_portal.sql e schema_turmas.sql. Aditivo, seguro re-rodar.
--
-- ROTEIRO:
--   1. Rode este arquivo inteiro no SQL Editor.
--   2. Re-cole o código atualizado de supabase/functions/professor-portal/
--      index.ts no editor de Edge Functions do Dashboard do Supabase (as
--      novas ações "restore-student"/"deactivate-student"/"activate-student"
--      e a mudança em "delete-student" vivem lá).
--
-- Conceito: "excluir" e "inativar" são DUAS coisas diferentes agora.
--   - "ativo" (já existia): pausa temporária, reversível a qualquer momento
--     ("Inativar"/"Reativar" na tabela de alunos) — o aluno continua
--     aparecendo normalmente na turma e nas estatísticas, só com o badge
--     "Inativo".
--   - "excluido_em" (novo): remoção de verdade da lista/turma. Um aluno
--     excluído some da tabela principal, vai para a caixa "Excluídos" (só
--     pode ser restaurado por lá) e para de contar em QUALQUER estatística
--     (Turmas, Análises, stats da própria turma). O histórico de respostas
--     nunca é apagado — só fica "escondido" enquanto excluído.

alter table profiles add column if not exists excluido_em timestamptz;

-- Redeclaração (supersede schema_turmas.sql) de
-- protect_profile_privileged_fields: excluido_em entra na MESMA trava de
-- role_id/ativo/professor_id (só admin ou service_role, NUNCA o professor
-- via update direto na tabela) — excluir/restaurar sempre passa pela Edge
-- Function professor-portal, nunca por um UPDATE direto do navegador,
-- mesmo tratamento que "ativo" já recebia. turma_id continua com a
-- exceção pro "próprio professor", como já era.
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
    if not is_own_professor then
      new.turma_id := old.turma_id;
    end if;
  end if;
  return new;
end;
$$;
