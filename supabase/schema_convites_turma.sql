-- NeuraOAB — convite de aluno por CÓDIGO (substitui a geração automática de
-- conta do convite antigo) + limite de vagas por turma.
-- Execute este script uma vez no projeto Supabase (SQL Editor), depois de
-- schema.sql, schema_portal_mestre.sql, schema_professor_portal.sql,
-- schema_turmas.sql e schema_aluno_avulso.sql. Aditivo (nenhum "drop
-- table") — seguro re-rodar (tudo "if not exists" ou "create or replace").
--
-- CONTEXTO: o convite antigo (auth.admin.generateLink({type:"invite"}), ver
-- supabase/functions/professor-portal/index.ts) CRIA a conta do aluno na
-- hora — o que quebra quando o e-mail convidado já tem conta própria
-- (fluxo de aluno avulso, ver schema_aluno_avulso.sql): generateLink volta
-- "e-mail já cadastrado" e não existe nenhum jeito de vincular essa conta
-- já existente a uma turma. Este arquivo introduz "convites": um REGISTRO
-- (código + validade), não uma criação de conta — o aluno aceita logado
-- (conta nova ou avulsa já existente, tanto faz), e só nesse momento o
-- perfil dele é vinculado à turma — o link do e-mail leva direto pro
-- dashboard do aluno (estudos/index.html?convite=CODIGO), que abre um modal
-- de aceite sozinho (ver "Convite de turma" em estudos/estudos.js e
-- supabase/functions/aluno-portal/index.ts).
--
-- ROTEIRO:
--   1. Rode este arquivo inteiro no SQL Editor.
--   2. Re-cole o código atualizado de supabase/functions/professor-portal/
--      index.ts no editor de Edge Functions do Dashboard do Supabase.
--   3. Crie (deploy) a nova Edge Function "aluno-portal" colando
--      supabase/functions/aluno-portal/index.ts — mesmo processo de sempre
--      (arquivo autocontido, sem import de módulo compartilhado).

-- ---------------------------------------------------------------------------
-- turmas.limite_alunos — vagas da turma (null = sem limite)
-- ---------------------------------------------------------------------------

alter table turmas add column if not exists limite_alunos integer;

-- ---------------------------------------------------------------------------
-- convites — um registro por convite de aluno enviado por um professor
-- ---------------------------------------------------------------------------
--
-- "professor_id" é denormalizado (já dá pra chegar nele via turma_id ->
-- turmas.professor_id), mas mantém a policy de SELECT abaixo simples e
-- rápida (sem join), mesmo raciocínio de profiles.professor_id já ser
-- denormalizado em vez de só existir em turmas.

-- "turma_id" é NULLABLE (e "on delete set null", não cascade) de propósito:
-- turma.html também é usada pro pseudo-agrupamento "Sem turma" (ver
-- IS_UNASSIGNED em professor-portal/js/turma.js), e convidar um aluno
-- dali manda turma_id ausente — mesmo formato que profiles.turma_id já
-- aceita. Excluir a turma depois não apaga o convite pendente, só solta a
-- referência (mesmo espírito de profiles.turma_id em schema_turmas.sql).
create table if not exists convites (
  id uuid primary key default gen_random_uuid(),
  turma_id uuid references turmas(id) on delete set null,
  professor_id uuid not null references profiles(id) on delete cascade,
  email text not null,
  nome text,
  codigo text not null unique,
  status text not null default 'pendente' check (status in ('pendente', 'usado', 'cancelado')),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_convites_codigo on convites (codigo);
create index if not exists idx_convites_professor on convites (professor_id);
create index if not exists idx_convites_turma on convites (turma_id);

-- Evita dois convites pendentes pro mesmo e-mail na mesma turma ao mesmo
-- tempo (ver createConvite em professor-portal/index.ts, que checa isso
-- antes de inserir — este índice é o cinto de segurança no banco). Só cobre
-- o caso com turma_id preenchido: índice único trata NULL como valores
-- distintos entre si, então duplicata pendente pra "Sem turma" (turma_id
-- null) não é pega aqui — fica só a checagem em createConvite mesmo (menos
-- crítico: "Sem turma" não tem limite de vaga nenhum pra proteger).
create unique index if not exists idx_convites_pendente_unico
  on convites (turma_id, lower(email))
  where status = 'pendente' and turma_id is not null;

alter table convites enable row level security;

-- Só SELECT pro professor dono (ou admin) — é o que turma.js usa pra listar
-- "convite pendente" ao lado dos alunos já aceitos (ver loadConvites()).
-- Sem policy de INSERT/UPDATE/DELETE pra "authenticated" de propósito: toda
-- escrita (gerar código, reenviar, cancelar, e o aceite do aluno) precisa
-- reavaliar turma/e-mail/vaga com cuidado (mesmo raciocínio de
-- requireOwnStudent em professor-portal/index.ts) e mexe em "profiles" na
-- mesma operação (ativar-convite) — fica tudo nas Edge Functions, com
-- service_role, nunca direto do cliente.
drop policy if exists "convites_select" on convites;
create policy "convites_select" on convites
  for select to authenticated
  using (professor_id = auth.uid() or is_admin());
