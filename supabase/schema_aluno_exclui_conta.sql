-- NeuraOAB — aluno exclui a PRÓPRIA conta ("Meu Perfil" > Excluir conta)
-- Execute este script uma vez no SQL Editor do Supabase, depois de
-- schema_convites_turma.sql. Aditivo e seguro de re-rodar (o "alter table
-- ... drop constraint if exists" + "add constraint" abaixo pode ser
-- reaplicado sem problema).
--
-- CONTEXTO: a exclusão de verdade é feita por
-- supabase/functions/aluno-portal/index.ts (ação "excluir-conta"), que
-- chama auth.admin.deleteUser — a única forma de apagar uma conta de
-- Supabase Auth, só disponível com a service_role key (o cliente nunca
-- consegue apagar a própria conta de autenticação sozinho). Isso já
-- cascade-apaga profiles (schema_portal_mestre.sql) e, por tabela,
-- cobrancas/oab_favoritos/plan_usage_monthly (todas "on delete cascade"
-- desde auth.users) — a Edge Function cuida à parte de oab_respostas/
-- oab2_tentativas (que são "on delete SET NULL" de propósito, pra
-- continuar valendo pro uso anônimo, ver schema_professor_portal.sql — mas
-- "excluir conta" quer apagar de verdade, não só desvincular).
--
-- ESTE ARQUIVO corrige só uma coisa: "convites.used_by" (schema_convites_
-- turma.sql) foi criada SEM "on delete" nenhum — o padrão do Postgres pra
-- isso é bloquear o delete (erro de violação de chave estrangeira) se
-- algum convite ainda referenciar o perfil sendo apagado. Qualquer aluno
-- que já aceitou um convite (ver "ativar-convite" em aluno-portal/
-- index.ts, que grava used_by) ficaria IMPOSSÍVEL de excluir sem isso.
--
-- ROTEIRO:
--   1. Rode este arquivo inteiro no SQL Editor.
--   2. Crie (deploy) a Edge Function "aluno-portal" atualizada — mesmo
--      processo de sempre (colar supabase/functions/aluno-portal/index.ts
--      no editor de Edge Functions do Dashboard do Supabase).

alter table convites drop constraint if exists convites_used_by_fkey;
alter table convites add constraint convites_used_by_fkey
  foreign key (used_by) references profiles(id) on delete set null;
