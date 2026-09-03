-- NeuraOAB — dashboard da 2ª fase (histórico/estatísticas do aluno)
-- Execute este script uma vez no projeto Supabase (SQL Editor), depois de
-- schema_security_hardening.sql e schema_alertas_juridicos.sql. Aditivo e
-- idempotente — seguro re-rodar.
--
-- [ATUALIZADO — ver schema_fase2_login_obrigatorio.sql] O "fluxo anônimo"
-- mencionado abaixo (aluno_id por localStorage, getAlunoId()) não existe
-- mais — a 2ª fase passou a exigir login, igual ao resto do site. O comando
-- em si (oab2_minhas_tentativas) continua igual, só que "aluno_id" hoje é
-- sempre o próprio user.id (uuid) como texto, nunca mais um id aleatório
-- separado.
--
-- O novo dashboard de estudos/simulado2fase.html (cards "Simulados
-- realizados"/"Nota média"/"Sequência", "Continuar simulado", "Últimos
-- simulados" e o gráfico de evolução) precisa de duas coisas que o schema
-- anterior não tinha:
--
--   1. Listar TODAS as tentativas do próprio aluno de uma vez — as funções
--      de schema_security_hardening.sql só buscam uma tentativa/resposta
--      por vez, pelo id exato. oab2_minhas_tentativas() cobre isso, com o
--      mesmo modelo de segurança já usado no resto do fluxo anônimo:
--      aluno_id é um id aleatório gerado no primeiro acesso e guardado só no
--      localStorage do navegador do aluno (ver getAlunoId() em
--      estudos/simulado2fase.js) — filtrar por ele aqui é a mesma
--      "capacidade imprevisível como filtro" que oab2_get_tentativa/
--      oab2_get_respostas já usam com o id da tentativa, só que em lista.
--
--   2. Saber que TIPO de treinamento cada tentativa foi ("Novo simulado" no
--      dashboard agora deixa escolher entre Simulado completo, só a Peça
--      profissional ou só as Questões discursivas — colunas modo/
--      valor_total_tentativa abaixo) — sem isso, a nota de uma tentativa só
--      da peça apareceria errada, comparada contra o valor_total do CADERNO
--      inteiro (ex.: "4,00 / 10,00" numa peça que valia só 4,00).

alter table oab2_tentativas add column if not exists modo text not null default 'completo'
  check (modo in ('completo', 'peca', 'questoes'));
alter table oab2_tentativas add column if not exists valor_total_tentativa numeric(4,2);

-- Backfill: tentativas já existentes (todas anteriores a este recurso) eram
-- sempre "completo", com o valor_total do caderno inteiro.
update oab2_tentativas t set valor_total_tentativa = p.valor_total
from oab2_provas p
where t.prova_id = p.id and t.valor_total_tentativa is null;

create or replace function oab2_minhas_tentativas(p_aluno_id text)
returns table (
  tentativa_id uuid,
  prova_id uuid,
  exam_number integer,
  area text,
  modo text,
  valor_total numeric,
  status text,
  nota_total numeric,
  started_at timestamptz,
  finished_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select t.id, p.id, p.exam_number, p.area, t.modo,
         coalesce(t.valor_total_tentativa, p.valor_total),
         t.status, t.nota_total, t.started_at, t.finished_at
  from oab2_tentativas t
  join oab2_provas p on p.id = t.prova_id
  where t.aluno_id = p_aluno_id
  order by t.started_at desc
  limit 200;
$$;

revoke all on function oab2_minhas_tentativas(text) from public;
grant execute on function oab2_minhas_tentativas(text) to anon, authenticated;

-- oab2_get_respostas (schema_security_hardening.sql) devolvia só
-- item_id/texto_resposta — o suficiente pra retomar rascunhos, mas o novo
-- card "Últimos simulados" também precisa reabrir o RESULTADO já corrigido
-- (nota + feedback item a item) de uma tentativa antiga. Mesma função, mais
-- colunas: quem já sabia o id da tentativa (a mesma "senha" de antes) sempre
-- teve acesso equivalente à correção dela — não é uma exposição nova.
drop function if exists oab2_get_respostas(uuid);

create function oab2_get_respostas(p_tentativa_id uuid)
returns table (
  item_id uuid,
  texto_resposta text,
  nota numeric,
  feedback_geral text,
  feedback_criterios jsonb,
  alertas_juridicos jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  select item_id, texto_resposta, nota, feedback_geral, feedback_criterios, alertas_juridicos
  from oab2_respostas
  where tentativa_id = p_tentativa_id;
$$;

revoke all on function oab2_get_respostas(uuid) from public;
grant execute on function oab2_get_respostas(uuid) to anon, authenticated;

-- ROTEIRO:
--   1. Rode este arquivo inteiro no SQL Editor do Supabase.
--   2. estudos/simulado2fase.js já foi atualizado pra gravar modo/
--      valor_total_tentativa ao criar uma tentativa, e pra usar
--      oab2_minhas_tentativas() no dashboard e os novos campos de
--      oab2_get_respostas() na tela de resultado.
