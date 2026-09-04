-- NeuraOAB — histórico persistido do chat com o Dr. Laureano
-- Execute este script uma vez no projeto Supabase (SQL Editor), depois de
-- schema.sql (precisa de oab_questions) e schema_portal_mestre.sql (precisa
-- de auth.users/profiles já existindo). Aditivo e idempotente — seguro
-- re-rodar.
--
-- CONTEXTO: o chat do Dr. Laureano é por QUESTÃO — cada questão tem seu
-- próprio contexto/conversa (ver buildSystemPrompt em
-- supabase/functions/dr-laureano/index.ts, que restringe a IA a discutir
-- só a questão atual). Por isso a chave natural de uma "conversa" aqui é
-- (aluno, questão), não um chat único contínuo — uma linha por par, com o
-- histórico inteiro de mensagens num jsonb (mesmo array {role, content}
-- que o front-end já mantém em memória, ver chatHistory em
-- estudos/dr-laureano.js), em vez de uma tabela relacional de uma
-- mensagem por linha: o volume por questão é pequeno, e salvar/carregar o
-- array inteiro de uma vez é muito mais simples que gerenciar inserts
-- incrementais + paginação pra uma lista curta.
--
-- Só ALUNOS LOGADOS têm a conversa salva (ver requireUser-like checagem de
-- currentSession?.user em estudos/dr-laureano.js) — é assim que "revisar em
-- qualquer dispositivo" funciona (precisa de uma identidade estável pra
-- sincronizar); uso anônimo do chat continua funcionando exatamente como
-- antes, só sem persistir nada entre visitas.

create table if not exists chat_conversas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references oab_questions(id) on delete cascade,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, question_id)
);

create index if not exists idx_chat_conversas_user on chat_conversas (user_id);

alter table chat_conversas enable row level security;

-- Só o próprio dono lê/escreve/apaga a própria conversa — nunca outro
-- aluno, nunca anon (uso anônimo do chat não persiste nada, ver comentário
-- acima). Sem exceção pra admin/professor de propósito: o conteúdo de uma
-- conversa com o Dr. Laureano é do aluno, não faz parte de nenhuma tela de
-- acompanhamento hoje (diferente de oab_respostas/oab2_tentativas, que o
-- professor já enxerga pelo Portal do Professor).
drop policy if exists "chat_conversas_select" on chat_conversas;
create policy "chat_conversas_select" on chat_conversas
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "chat_conversas_insert" on chat_conversas;
create policy "chat_conversas_insert" on chat_conversas
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "chat_conversas_update" on chat_conversas;
create policy "chat_conversas_update" on chat_conversas
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "chat_conversas_delete" on chat_conversas;
create policy "chat_conversas_delete" on chat_conversas
  for delete to authenticated
  using (user_id = auth.uid());

create or replace function touch_chat_conversas_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_chat_conversas_updated_at on chat_conversas;
create trigger trg_touch_chat_conversas_updated_at
  before update on chat_conversas
  for each row
  execute function touch_chat_conversas_updated_at();
