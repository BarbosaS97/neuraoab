-- NeuraOAB — Portal do Professor — subtítulo opcional de turma.
-- Execute este script uma vez no SQL Editor do Supabase, depois de
-- schema_turmas.sql. Aditivo (só "add column if not exists") — seguro
-- re-rodar.
--
-- Usado no card de turma do dashboard (ver professor-portal/js/turmas.js,
-- buildTurmaCard) como legenda abaixo do nome, ex.: "Preparação - 2ª Fase
-- OAB". Opcional: turma sem descrição simplesmente não mostra essa linha no
-- card, nunca um texto genérico inventado no lugar.

alter table turmas add column if not exists descricao text;
