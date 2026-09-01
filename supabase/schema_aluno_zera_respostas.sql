-- NeuraOAB — aluno consegue zerar as PRÓPRIAS estatísticas (1ª fase)
-- Execute este script uma vez no SQL Editor do Supabase, depois de
-- schema_professor_portal.sql (onde "oab_respostas" é criada). Aditivo e
-- seguro de re-rodar (create policy vem sempre precedido de "drop policy
-- if exists").
--
-- POR QUE ISSO É NECESSÁRIO:
--
-- schema_professor_portal.sql criou "oab_respostas" DE PROPÓSITO sem
-- nenhuma policy de update/delete (comentário original: "uma resposta é
-- gravada uma vez só... e não deveria ser apagada"). O botão "Zerar
-- estatísticas" (estudos/estudos.js, tela de Estatísticas) precisa apagar
-- as respostas do PRÓPRIO aluno quando ele pede — sem esta policy, o
-- DELETE não dá erro nenhum, só apaga 0 linhas (RLS barrando em silêncio),
-- e a tela continuaria mostrando as mesmas estatísticas de sempre.
--
-- Escopo estritamente pessoal (user_id = auth.uid()): um aluno só consegue
-- apagar as PRÓPRIAS respostas, nunca as de outro aluno — nem mesmo o
-- professor que o convidou tem essa permissão aqui (ele só tem SELECT,
-- ver "oab_respostas_select").

drop policy if exists "oab_respostas_delete_self" on oab_respostas;
create policy "oab_respostas_delete_self" on oab_respostas
  for delete to authenticated
  using (user_id = auth.uid());
