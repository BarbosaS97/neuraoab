-- NeuraOAB — sistema de medalhas (gamificação)
-- Execute este script uma vez no SQL Editor do Supabase. Aditivo e seguro de
-- re-rodar (create table/policy sempre com "if not exists"/"drop policy if
-- exists" antes), mesmo padrão de schema_oab_favoritos.sql.
--
-- Sem Edge Function: o catálogo de medalhas (nomes, ícones, critérios) vive
-- só no client (estudos/medals.js) — esta tabela só guarda O QUÊ ("medal_id",
-- um slug estável definido nesse catálogo) e QUANDO cada aluno conquistou,
-- uma linha por medalha por aluno. Sem policy de update/delete: uma medalha
-- conquistada é permanente, nunca é reavaliada nem apagada pelo próprio
-- aluno (nem "Zerar estatísticas" mexe aqui — ver schema_aluno_zera_respostas.sql,
-- que só afeta oab_respostas).

create table if not exists oab_medals_earned (
  user_id uuid not null references auth.users(id) on delete cascade,
  medal_id text not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, medal_id)
);

create index if not exists idx_oab_medals_earned_user on oab_medals_earned (user_id);

alter table oab_medals_earned enable row level security;

drop policy if exists "oab_medals_earned_select_own" on oab_medals_earned;
create policy "oab_medals_earned_select_own" on oab_medals_earned
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "oab_medals_earned_insert_own" on oab_medals_earned;
create policy "oab_medals_earned_insert_own" on oab_medals_earned
  for insert to authenticated
  with check (user_id = auth.uid());
