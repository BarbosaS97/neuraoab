-- NeuraOAB — schema de Turmas (organização dos alunos do Portal do Professor)
-- Execute este script uma vez no projeto Supabase (SQL Editor), depois de
-- schema.sql, schema_fase2.sql, schema_portal_mestre.sql e
-- schema_professor_portal.sql. Aditivo (nenhum "drop table") — seguro
-- re-rodar (tudo "if not exists" ou "create or replace").
--
-- ROTEIRO:
--   1. Rode este arquivo inteiro no SQL Editor.
--   2. Re-cole o código atualizado de supabase/functions/professor-portal/
--      index.ts no editor de Edge Functions do Dashboard do Supabase
--      (mesmo processo de sempre — arquivo autocontido, sem import de
--      módulo compartilhado, porque o deploy é feito colando no editor).

-- ---------------------------------------------------------------------------
-- Turmas
-- ---------------------------------------------------------------------------

create table if not exists turmas (
  id uuid primary key default gen_random_uuid(),
  professor_id uuid not null references profiles(id) on delete cascade,
  nome text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_turmas_professor on turmas (professor_id);

alter table turmas enable row level security;

-- CRUD de turma e' direto client-side (nao precisa de Edge Function): so'
-- mexe na tabela "turmas", nunca em auth.users, entao RLS sozinho ja' basta
-- — mesmo raciocinio de "editar professor" em portal-mestre/js/admin.js
-- (update direto, sem passar por service_role).
drop policy if exists "turmas_select" on turmas;
create policy "turmas_select" on turmas
  for select to authenticated
  using (professor_id = auth.uid() or is_admin());

drop policy if exists "turmas_insert" on turmas;
create policy "turmas_insert" on turmas
  for insert to authenticated
  with check (professor_id = auth.uid() or is_admin());

drop policy if exists "turmas_update" on turmas;
create policy "turmas_update" on turmas
  for update to authenticated
  using (professor_id = auth.uid() or is_admin())
  with check (professor_id = auth.uid() or is_admin());

drop policy if exists "turmas_delete" on turmas;
create policy "turmas_delete" on turmas
  for delete to authenticated
  using (professor_id = auth.uid() or is_admin());

-- ---------------------------------------------------------------------------
-- profiles.turma_id — em qual turma o aluno está (null = "Sem turma")
-- ---------------------------------------------------------------------------
--
-- "on delete set null": excluir uma turma NUNCA apaga aluno — ele só volta
-- pra "Sem turma" (mesmo espírito do soft-delete em professor-portal/
-- index.ts: não destruir histórico/vínculo por causa de uma reorganização).

alter table profiles add column if not exists turma_id uuid references turmas(id) on delete set null;
create index if not exists idx_profiles_turma on profiles (turma_id);

-- ---------------------------------------------------------------------------
-- Redeclarações (supersedem schema_professor_portal.sql) — turma_id entra
-- no jogo de trava/policy sem reabrir a brecha que professor_id/role_id/
-- ativo já fecham.
-- ---------------------------------------------------------------------------

-- protect_profile_privileged_fields: turma_id fica travado pra qualquer
-- UPDATE, EXCETO quando quem chama é admin, service_role, OU o PRÓPRIO
-- professor daquele aluno (is_professor() and old.professor_id =
-- auth.uid()) — assim o professor consegue mover seu aluno de turma direto
-- pela tabela (profiles_update_professor, abaixo), mas nem o aluno (via
-- profiles_update_self) nem outro professor conseguem.
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
    if not is_own_professor then
      new.turma_id := old.turma_id;
    end if;
  end if;
  return new;
end;
$$;

-- profiles_update_professor: acrescenta a validação de que a turma pra qual
-- o aluno está sendo movido também pertence a este professor (sem isso,
-- nada impediria atribuir turma_id de outro professor a um UPDATE direto).
drop policy if exists "profiles_update_professor" on profiles;
create policy "profiles_update_professor" on profiles
  for update to authenticated
  using (professor_id = auth.uid())
  with check (
    professor_id = auth.uid()
    and (
      turma_id is null
      or exists (select 1 from turmas t where t.id = turma_id and t.professor_id = auth.uid())
    )
  );
