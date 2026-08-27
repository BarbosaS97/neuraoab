-- NeuraOAB — schema para importação de questões da OAB
-- Execute este script uma vez no projeto Supabase (SQL Editor ou via conexão direta).

create extension if not exists "uuid-ossp";

create table if not exists oab_questions (
  id uuid primary key default uuid_generate_v4(),
  year integer not null,
  exam_number integer,
  exam_type text not null,
  number integer not null,
  discipline text,
  statement text not null,
  alternatives jsonb not null,
  correct_answer text not null,
  created_at timestamptz default now()
);

-- A OAB realiza mais de um exame por ano (ex.: 35º e 36º Exame de Ordem
-- Unificado, ambos em 2022). Se a tabela já existia de antes dessa mudança,
-- adiciona a coluna que falta (idempotente — seguro rodar de novo).
alter table oab_questions add column if not exists exam_number integer;

-- Backfill: as questões já importadas antes do suporte a exam_number são,
-- comprovadamente, todas do 35º Exame de 2022 (único exame importado até
-- aqui). Se você já tiver outros exames no banco quando rodar isso, ajuste
-- ou remova esta linha antes de executar.
update oab_questions
  set exam_number = 35
  where exam_number is null and year = 2022;

-- Evita duplicatas: mesmo exame (ano + número do exame + tipo) não pode ter
-- o mesmo número de questão duas vezes. Sem exam_number, um 35º e um 36º
-- exame do mesmo ano colidiriam no índice (ambos têm "tipo1, questão 1").
drop index if exists idx_oab_questions_unique;
create unique index if not exists idx_oab_questions_unique
  on oab_questions (year, exam_number, exam_type, number);

-- RLS: a ferramenta de importação (admin/import.html) usa a anon key no navegador.
-- Habilitamos RLS e liberamos leitura/inserção para o papel anon, que é o que a
-- ferramenta usa. Isso é apropriado para uma tabela de conteúdo público de questões
-- (sem dados sensíveis de usuário), mas deixa a tabela gravável por qualquer pessoa
-- que tenha a anon key (que já é pública no HTML). Se isso não for aceitável,
-- restrinja a policy de insert a um papel autenticado/service role.
alter table oab_questions enable row level security;

drop policy if exists "oab_questions_select_anon" on oab_questions;
create policy "oab_questions_select_anon"
  on oab_questions
  for select
  to anon, authenticated
  using (true);

drop policy if exists "oab_questions_insert_anon" on oab_questions;
create policy "oab_questions_insert_anon"
  on oab_questions
  for insert
  to anon, authenticated
  with check (true);
