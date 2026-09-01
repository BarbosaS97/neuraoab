-- NeuraOAB — aluno favorita exames da 1ª fase (estrela no dashboard)
-- Execute este script uma vez no SQL Editor do Supabase, depois de
-- schema.sql (onde "oab_questions" é criada — exam_number vem de lá, mas
-- sem foreign key: um exame é vários registros de oab_questions com o
-- mesmo exam_number, não uma linha só, então não há uma PK única pra
-- referenciar). Aditivo e seguro de re-rodar (create table/policy sempre
-- com "if not exists"/"drop policy if exists" antes).
--
-- Sem Edge Function: o clique na estrela grava/apaga direto pelo cliente
-- (client.from("oab_favoritos").insert/delete(...)), mesmo modelo de
-- "oab_respostas" — RLS quem garante que cada aluno só mexe nos PRÓPRIOS
-- favoritos (ver schema_aluno_zera_respostas.sql, mesmo raciocínio).

create table if not exists oab_favoritos (
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_number integer not null,
  created_at timestamptz not null default now(),
  primary key (user_id, exam_number)
);

create index if not exists idx_oab_favoritos_user on oab_favoritos (user_id);

alter table oab_favoritos enable row level security;

drop policy if exists "oab_favoritos_select_own" on oab_favoritos;
create policy "oab_favoritos_select_own" on oab_favoritos
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "oab_favoritos_insert_own" on oab_favoritos;
create policy "oab_favoritos_insert_own" on oab_favoritos
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "oab_favoritos_delete_own" on oab_favoritos;
create policy "oab_favoritos_delete_own" on oab_favoritos
  for delete to authenticated
  using (user_id = auth.uid());
