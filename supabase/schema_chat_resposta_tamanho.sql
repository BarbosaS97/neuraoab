-- NeuraOAB — preferência de tamanho das respostas do Dr. Laureano
-- Execute este script uma vez no SQL Editor do Supabase. Aditivo e
-- idempotente (seguro rodar de novo).
--
-- Uma linha por aluno (a própria "profiles", não uma tabela nova) — é
-- preferência de conta, não de questão, então persiste entre trocas de
-- questão e de dispositivo, igual a "nome"/"telefone" já fazem ali. Lido e
-- gravado por estudos/dr-laureano.js (control "chat-length-row" no topo do
-- painel de chat) e usado por supabase/functions/dr-laureano/index.ts pra
-- ajustar o tamanho-alvo da resposta.

alter table profiles add column if not exists chat_resposta_tamanho text not null default 'media';

alter table profiles drop constraint if exists profiles_chat_resposta_tamanho_check;
alter table profiles add constraint profiles_chat_resposta_tamanho_check
  check (chat_resposta_tamanho in ('curta', 'media', 'longa'));

-- Sem policy nova: profiles_update_self (schema_portal_mestre.sql) já libera
-- qualquer autenticado dar UPDATE na própria linha, e o gatilho
-- protect_profile_privileged_fields só protege role_id/ativo — esta coluna
-- passa livre por ele.
