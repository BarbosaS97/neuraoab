-- NeuraOAB -- marca questoes possivelmente desatualizadas (2a leva da revisao juridica)
-- Execute no SQL Editor do Supabase, depois de supabase/schema_questoes_desatualizadas.sql
-- e da leva 1 (supabase/scripts/questoes_desatualizadas_leva1_2026_09_09.sql).
-- Aditivo e idempotente (WHERE id = ... sempre resolve para a mesma linha).
--
-- Cobertura desta leva: os 16 exames que faltavam da leva 1 (18, 23, 26, 27, 28, 30, 34,
-- 36 a 41, 43, 44, 46) -- com isso, os 29 exames do banco (16 a 46) ja foram revisados.
-- Mesma metodologia da leva 1: cada questao revisada por IA em 2026-09-10 contra mudancas
-- legislativas/jurisprudenciais reais posteriores a aplicacao da prova (extincao da EIRELI,
-- Nova Lei de Licitacoes revogando a Lei 8.666/93, equiparacao da injuria racial a racismo,
-- Lei 13.718/2018 sobre acao penal em crimes sexuais, voto plural em S.A., fim da contribuicao
-- sindical obrigatoria, entre outras).
--
-- 11 questoes sinalizadas nesta leva, de 16 exames analisados.

select count(*) as ja_marcadas_antes from oab_questions where possibly_outdated = true;

begin;

update oab_questions as q
set possibly_outdated = true,
    outdated_reason = v.reason
from (values
  ('5d660fa7-912f-47b3-9506-c85f7fcc56d0'::uuid, 'A Lei 8.666/93 (cujo Art. 57, II fixava o limite de 60 meses para contratos de serviços contínuos) foi revogada pela Nova Lei de Licitações (Lei nº 14.133/2021), que passou a permitir prorrogação de contratos de serviços contínuos por prazo de até 10 anos, tornando desatualizado o limite de ''sessenta meses'' indicado no gabarito.'),
  ('551dbdde-8d07-4f34-9f09-71201669acb0'::uuid, 'O Novo CPC (Lei 13.105/2015, em vigor desde 18/03/2016) extinguiu o processo cautelar preparatório autônomo, substituindo-o pela tutela cautelar antecedente (Arts. 305-310), além de ter alterado a regra de contagem de prazos processuais para dias úteis (Art. 219), o que muda o cálculo do prazo de 30 dias tratado na questão e pode alterar a conclusão sobre a perda de eficácia da liminar.'),
  ('3fc8f593-b7ab-4cb3-98a2-9ab0e245f157'::uuid, 'A Lei nº 13.718/2018 alterou o Art. 225 do Código Penal, tornando incondicionada (independente de representação da vítima) a ação penal pública para todos os crimes contra a dignidade sexual, inclusive o estupro simples de vítima adulta, o que contraria a premissa da questão sobre a necessidade de representação de Maria.'),
  ('9411be90-df9c-403b-b78b-2cd67dc4e776'::uuid, 'A Reforma Trabalhista (Lei nº 13.467/2017) reescreveu o Art. 800 da CLT, exigindo que a exceção de incompetência territorial seja apresentada por petição escrita no prazo de 5 dias antes da audiência (e não oralmente na própria audiência, como narrado na questão), alterando todo o procedimento e os prazos de manifestação do autor-exceto.'),
  ('c51d3bca-ac92-4541-9cf7-1520aa2c270a'::uuid, 'A Lei 14.195/2021 (Lei do Ambiente de Negócios) inseriu o art. 110-A na Lei das S.A. (Lei 6.404/76), passando a admitir ações com voto plural em hipóteses específicas, de modo que a assertiva dada como correta (''é vedado atribuir voto plural a qualquer espécie ou classe de ação'') deixou de ser absolutamente verdadeira.'),
  ('21739fe7-4b4c-4de1-adc7-75d59f636b80'::uuid, 'A Reforma Trabalhista (Lei 13.467/2017), com vigência a partir de 11/11/2017 (posterior à aplicação desta prova, de setembro/2017), tornou a contribuição sindical facultativa, exigindo autorização prévia e expressa do empregado; assim, hoje o desconto da contribuição sindical de empregado não sindicalizado e sem autorização também seria inválido, contrariando o gabarito oficial (alternativa C), que se baseava na compulsoriedade da antiga ''contribuição sindical'' obrigatória a todos os empregados.'),
  ('8d701771-0779-4212-aa73-998808949f27'::uuid, 'A questão tem como premissa a adoção do Regime Diferenciado de Contratações (RDC, Lei nº 12.462/2011); essa lei foi integralmente revogada pela Nova Lei de Licitações (Lei nº 14.133/2021), com efeitos a partir de 30/12/2023, de modo que o RDC não existe mais como regime a ser ''optado'' pela Administração e a matéria de desempate passou a ser regida pelo art. 60 da Lei nº 14.133/2021.'),
  ('85ea127b-dda4-424e-9b08-8a10a8ee3282'::uuid, 'A Lei nº 14.442/2022 alterou o art. 62, III, da CLT: apenas o teletrabalhador que presta serviço por produção ou tarefa continua excluído do capítulo de duração do trabalho; o teletrabalhador submetido a controle de jornada passou a ter direito a horas extras, o que contraria a afirmação categórica do gabarito (alternativa A) de que não há pagamento de horas extras no teletrabalho, tornando a alternativa C também potencialmente correta hoje.'),
  ('a3aa16a0-4dea-4721-9718-e6b7df661108'::uuid, 'A questão trata da modalidade licitatória ''convite'' e do procedimento do art. 22, §7º, da Lei nº 8.666/93 (repetição do convite quando comparecem menos de 3 licitantes por limitação de mercado). A Lei nº 14.133/2021 (Nova Lei de Licitações) extinguiu as modalidades convite e tomada de preços, e a Lei nº 8.666/93 foi integralmente revogada a partir de 1º de abril de 2023, de modo que esse instituto não existe mais no ordenamento vigente.'),
  ('fd067f6a-1011-4e4b-b069-6a98e2405fe7'::uuid, 'A alternativa correta (B) inclui a ''empresa individual de responsabilidade limitada (EIRELI)'' como uma das formas jurídicas de ME/EPP nos termos da LC 123/2006. A Lei nº 14.195/2021 extinguiu a EIRELI como tipo societário, convertendo automaticamente as EIRELIs existentes em sociedades limitadas unipessoais, de modo que essa forma jurídica não existe mais como tal no ordenamento.'),
  ('95828547-01e4-4fd3-a824-c1e15f5a74c0'::uuid, 'A Lei 14.532/2023 revogou o art. 140, §3º, do CP e inseriu o art. 2º-A na Lei 7.716/89, equiparando a injúria racial/religiosa ao crime de racismo (ação penal pública incondicionada e imprescritível). Isso elimina a hipótese de extinção da punibilidade por ausência de representação da vítima, premissa central da questão sobre a ofensa religiosa dirigida à mãe de Plínio.')
) as v(id, reason)
where q.id = v.id;

commit;

select count(*) as marcadas_depois from oab_questions where possibly_outdated = true;
