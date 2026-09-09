-- NeuraOAB — sinalização de questões possivelmente desatualizadas
-- Execute este script uma vez no SQL Editor do Supabase. Aditivo e
-- idempotente (seguro rodar de novo).
--
-- possibly_outdated: true quando uma revisão jurídica (feita fora do app,
-- questão a questão) concluiu que a lei/entendimento/valor citado no
-- enunciado pode não refletir mais o direito vigente. outdated_reason
-- guarda o motivo em texto simples — é mostrado ao Dr. Laureano (ver
-- supabase/functions/dr-laureano/index.ts) como contexto de verdade quando o
-- aluno clica no botão "Questão possivelmente desatualizada"
-- (estudos/estudos.js, buildOutdatedBanner) e pergunta sobre isso, em vez de
-- deixar a IA adivinhar sozinha o que mudou.
--
-- Os UPDATEs que de fato marcam questões específicas (gerados pela revisão
-- jurídica exame a exame, do mais antigo pro mais novo) ficam em arquivos
-- separados dentro de supabase/scripts/, mesmo padrão já usado por
-- supabase/scripts/classificar_disciplinas_2026_09_09.sql.

alter table oab_questions add column if not exists possibly_outdated boolean not null default false;
alter table oab_questions add column if not exists outdated_reason text;
