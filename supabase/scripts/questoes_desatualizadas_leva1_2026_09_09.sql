-- NeuraOAB -- marca questoes possivelmente desatualizadas (1a leva da revisao juridica)
-- Execute no SQL Editor do Supabase, depois de supabase/schema_questoes_desatualizadas.sql.
-- Aditivo e idempotente (WHERE id = ... sempre resolve para a mesma linha).
--
-- Cobertura desta leva: 13 dos 29 exames do banco (16 a 35, do mais antigo pro mais novo,
-- ordem pedida pelo usuario), revisados um a um por IA em 2026-09-09, cada questao contra mudancas
-- legislativas/jurisprudenciais reais posteriores a aplicacao da prova (Reforma Trabalhista 2017,
-- Nova Lei de Improbidade 2021, extincao da EIRELI 2021, AP 937 QO do STF sobre foro por
-- prerrogativa de funcao, mudanca no piso de PPP, entre outras). A varredura foi interrompida antes
-- de cobrir os exames 36 em diante (2022-2026) por custo -- retomar depois exame a exame, na mesma
-- ordem, do mais antigo pro mais novo, seguindo esta leva.
--
-- 13 questoes sinalizadas nesta leva, de 13 exames analisados.

select count(*) as ja_marcadas_antes from oab_questions where possibly_outdated = true;

begin;

update oab_questions as q
set possibly_outdated = true,
    outdated_reason = v.reason
from (values
  ('9dd3264e-7fa0-4c60-9829-78dd54013874'::uuid, 'A Reforma Trabalhista (Lei 13.467/2017) incluiu o §2º ao art. 4º da CLT, estabelecendo que o tempo de deslocamento do empregado entre a portaria e o posto de trabalho não é mais considerado tempo à disposição do empregador, o que superou a Súmula 429 do TST usada para justificar o gabarito ''C'' (direito a horas extras por deslocamento superior a 10 minutos).'),
  ('0ba2ca48-0ec2-4ded-b379-eeab57c808fd'::uuid, 'A Lei 13.467/2017 alterou o art. 71, §3º, da CLT: a redução do intervalo intrajornada para 30 minutos deixou de depender de autorização do Ministério do Trabalho (mecanismo usado para justificar o gabarito ''B'', a validade da autorização dada à empresa BETA pela Superintendência Regional do Trabalho) e passou a ser possível apenas mediante convenção ou acordo coletivo de trabalho.'),
  ('d5475d6c-9a1b-4e77-8544-52556a03da88'::uuid, 'Em 2018 o STF (AP 937 QO, rel. Min. Barroso) restringiu o foro por prerrogativa de função dos parlamentares apenas a crimes cometidos no exercício do cargo e relacionados às funções desempenhadas; um homicídio motivado por rivalidade política, mesmo ocorrido nas dependências da Casa Legislativa, não se enquadra nesse critério, de modo que hoje a competência do STF não seria automática como afirma o gabarito (alternativa A).'),
  ('961489ac-da16-4f78-b523-a125db7d893c'::uuid, 'A Lei nº 13.529/2017 alterou o art. 2º, §4º, I, da Lei nº 11.079/2004, reduzindo o valor mínimo dos contratos de parceria público-privada de R$ 20.000.000,00 para R$ 10.000.000,00, tornando desatualizado o valor indicado como correto na alternativa B.'),
  ('62564ac9-d640-4ce0-8c25-28acb6f3fbf2'::uuid, 'A Lei nº 14.195/2021 extinguiu a figura da EIRELI, convertendo automaticamente as EIRELIs existentes em sociedades limitadas unipessoais (SLU); hoje não é mais possível constituir uma EIRELI nos moldes descritos no enunciado.'),
  ('7d324956-ef6d-4fc5-bc60-e59755798ed7'::uuid, 'A Reforma Trabalhista (Lei nº 13.467/2017) incluiu o §10 ao art. 899 da CLT, isentando também as empresas em recuperação judicial do depósito recursal, o que compromete a distinção feita pelo gabarito entre a sociedade falida (isenta de preparo) e a em recuperação judicial (obrigada a realizá-la integralmente).'),
  ('5db058e5-8be4-416e-978d-e70d4fdadb1f'::uuid, 'A questão baseia-se na antiga redação do art. 477, §6º, da CLT, que distinguia o prazo de pagamento das verbas rescisórias conforme o aviso prévio fosse trabalhado (1º dia útil após o término do contrato) ou dispensado/indenizado (até o 10º dia). A Reforma Trabalhista (Lei 13.467/2017) unificou essa regra, estabelecendo prazo único de 10 dias contados do término do contrato para ambos os casos, tornando a alternativa apontada como correta (que mantém a distinção antiga) desatualizada.'),
  ('8e3d3794-a2b4-41c3-8349-3e235e6b7d82'::uuid, 'A questão trata da constituição e regras da EIRELI (Art. 980-A do Código Civil, incluindo a restrição de que a pessoa só pode figurar em uma única EIRELI), mas esse instituto foi extinto pela Lei nº 14.195/2021, que revogou o art. 980-A do CC e determinou a transformação de todas as EIRELIs existentes em Sociedades Limitadas Unipessoais, regime que não reproduz essas mesmas regras.'),
  ('642b1447-46ac-4dbb-8114-e2f713ae544e'::uuid, 'A questão baseia-se na antiga redação do art. 457, §2º, da CLT e na Súmula 101 do TST, segundo as quais diárias de viagem que excedessem 50% do salário integravam a remuneração na totalidade. A Reforma Trabalhista (Lei 13.467/2017), em vigor desde 11/11/2017 (a prova foi aplicada em abril/2017, antes da reforma), alterou o art. 457, §2º, da CLT para estabelecer que diárias de viagem, ainda que habituais e independentemente do percentual, não integram a remuneração do empregado, tornando o gabarito ''A'' incorreto hoje.'),
  ('754dd02f-86b1-4c48-8e92-342e82b41e3d'::uuid, 'A alternativa correta (A) exige valor de contrato igual ou superior a R$ 20.000.000,00 para PPP na modalidade patrocinada (Art. 2º, §4º, I, da Lei 11.079/2004), mas a Lei 13.529/2017, publicada em 4/12/2017 (após a aplicação desta prova em 19/11/2017), reduziu esse piso para R$ 10.000.000,00, tornando desatualizado o valor usado para justificar o gabarito.'),
  ('73c639f5-5725-4b9c-bbea-116dde358c40'::uuid, 'A questão baseia-se na antiga redação do art. 23 da Lei 8.429/1992 (prescrição em 5 anos contados do término do mandato/exercício da função). A Lei 14.230/2021 reformou profundamente a Lei de Improbidade Administrativa e alterou esse regime, unificando o prazo prescricional em 8 anos contados da ocorrência do fato (ou do fim da continuidade, se o caso), e não mais do término do mandato. Assim, a fundamentação da alternativa dada como correta (5 anos, termo inicial no fim do mandato) não corresponde mais à regra legal vigente.'),
  ('73dabc02-6923-4315-b319-d7cd3b27cb1f'::uuid, 'A Lei 14.230/2021 reformou a Lei de Improbidade Administrativa (Lei 8.429/92) e extinguiu a modalidade culposa para todos os tipos de improbidade, exigindo dolo específico inclusive para os atos que causam lesão ao erário (art. 10), com aplicação retroativa reconhecida pelo STF no Tema 1199. Hoje Felipe, que agiu apenas com culpa, não responderia por improbidade, ao contrário do gabarito oficial (alternativa B).'),
  ('999c7b4b-027b-45c1-be30-d74597120f2d'::uuid, 'A questão baseia-se no regime de prescrição do art. 23 da Lei 8.429/92 (redação original), que previa prazo diferenciado de 5 anos contado do término do exercício de cargo em comissão/mandato/função de confiança. A Lei 14.230/2021 (posterior a esta prova, aplicada em 13/06/2021) revogou essa distinção e unificou o prazo prescricional em 8 anos contados da ocorrência do fato, o que altera a premissa jurídica usada para justificar o gabarito oficial (alternativa A).')
) as v(id, reason)
where q.id = v.id;

commit;

select count(*) as marcadas_depois from oab_questions where possibly_outdated = true;
