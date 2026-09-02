-- NeuraOAB — dashboard da 2ª fase, v2 (desempenho por tipo de item)
-- Execute este script uma vez no projeto Supabase (SQL Editor), depois de
-- schema_fase2_dashboard.sql. Aditivo e idempotente — seguro re-rodar.
--
-- A evolução de UX do dashboard (painel "Como você está indo" e a seção
-- "Foco de hoje") passou a comparar o desempenho do aluno na PEÇA
-- profissional contra o desempenho nas QUESTÕES discursivas — algo que
-- oab2_minhas_tentativas() (schema_fase2_dashboard.sql) não dá pra calcular
-- sozinha, porque ela só devolve uma nota por TENTATIVA (peça + questões
-- somadas), não por item. oab2_minhas_respostas_corrigidas() abaixo desce um
-- nível: devolve a nota de cada ITEM já corrigido do aluno, com o tipo
-- (peça/questão), pra o front-end (estudos/simulado2fase.js) somar por
-- categoria em vez de por tentativa.
--
-- Mesmo modelo de segurança das outras funções deste fluxo anônimo: filtra
-- por aluno_id (id aleatório gerado no primeiro acesso, guardado só no
-- localStorage do navegador do aluno — ver getAlunoId() em
-- estudos/simulado2fase.js), a mesma "capacidade imprevisível" já usada por
-- oab2_minhas_tentativas().

create or replace function oab2_minhas_respostas_corrigidas(p_aluno_id text)
returns table (
  tentativa_id uuid,
  item_tipo text,
  nota numeric,
  valor_total numeric
)
language sql
security definer
set search_path = public
stable
as $$
  select r.tentativa_id, i.tipo, r.nota, i.valor_total
  from oab2_respostas r
  join oab2_tentativas t on t.id = r.tentativa_id
  join oab2_itens i on i.id = r.item_id
  where t.aluno_id = p_aluno_id
    and t.status = 'corrigida'
    and r.nota is not null
  order by t.started_at desc
  limit 2000;
$$;

revoke all on function oab2_minhas_respostas_corrigidas(text) from public;
grant execute on function oab2_minhas_respostas_corrigidas(text) to anon, authenticated;

-- ROTEIRO:
--   1. Rode este arquivo inteiro no SQL Editor do Supabase (depois dos
--      outros schema_fase2*.sql).
--   2. estudos/simulado2fase.js já foi atualizado pra chamar
--      oab2_minhas_respostas_corrigidas() e usar o resultado no painel de
--      desempenho e na seção "Foco de hoje".
