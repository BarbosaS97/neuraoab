-- NeuraOAB — schema de alertas jurídicos (2ª fase)
-- Execute este script uma vez no projeto Supabase (SQL Editor), depois de
-- schema_fase2.sql. Aditivo, seguro re-rodar.
--
-- "Camada 2" da correção (ver relatório de testes que motivou isto):
-- observações jurídicas/formais que a IA percebe na resposta do aluno mas
-- que NÃO correspondem a nenhum critério pontuável do espelho — por isso
-- nunca afetam "nota", só aparecem como feedback pedagógico adicional.
-- Gerado por supabase/functions/corretor-2fase/index.ts (campo
-- "alertas_juridicos" no JSON de correção) e gravado pelo frontend
-- (estudos/simulado2fase.js) junto com o resto do resultado do item.

alter table oab2_respostas add column if not exists alertas_juridicos jsonb;

-- ROTEIRO:
--   1. Rode este arquivo no SQL Editor.
--   2. Recole supabase/functions/corretor-2fase/index.ts atualizado no
--      editor de Edge Functions do Dashboard do Supabase.
