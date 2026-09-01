-- NeuraOAB — aluno consegue ver o cursinho do PROPRIO professor
-- Execute este script uma vez no SQL Editor do Supabase, depois de
-- schema_portal_mestre.sql e schema_professor_portal.sql. Aditivo e seguro
-- de re-rodar (create policy vem sempre precedido de "drop policy if
-- exists", create function usa "or replace").
--
-- Se você já rodou uma versão anterior deste arquivo (a policy usava um
-- "id in (select professor_id from profiles where id = auth.uid())" direto,
-- sem essa função), REPITA a execução com este arquivo — a versão antiga
-- causava "infinite recursion detected in policy for relation profiles" (ver
-- explicação abaixo), e esse erro vazava pra QUALQUER consulta que passasse
-- pela RLS de "profiles", inclusive indiretamente (ex.: carregar
-- Estatísticas, que consulta oab_respostas, cuja própria policy consulta
-- profiles por baixo — ver oab_respostas_select em
-- schema_professor_portal.sql). O "drop policy if exists" abaixo troca a
-- policy quebrada por esta versão corrigida.
--
-- POR QUE A POLICY É NECESSÁRIA:
--
-- "Meu Perfil" (estudos/estudos.js, loadProfile()) mostra o nome do
-- cursinho — mas esse campo não pertence ao próprio aluno: é
-- profiles.cursinho da linha do PROFESSOR que o convidou (definido pelo
-- admin no Portal Mestre, ver portal-mestre/js/admin.js), e o aluno está
-- ligado a ele via profiles.professor_id (setado quando o professor manda o
-- convite, ver professor-portal/index.ts).
--
-- As policies de SELECT que já existem em "profiles" cobrem só três casos:
--   - profiles_select            -> cada um vê a PRÓPRIA linha (ou admin vê tudo)
--   - profiles_select_professor  -> um PROFESSOR vê as linhas dos SEUS ALUNOS
-- Nenhuma delas cobre o sentido inverso (um ALUNO vendo a linha do PRÓPRIO
-- PROFESSOR) — sem a policy abaixo, a consulta em loadProfile() não dá erro
-- nenhum, só volta vazia (RLS barrando em silêncio), e o campo "Cursinho"
-- fica sempre como "Não informado" mesmo quando o professor tem um
-- cadastrado.
--
-- POR QUE PRECISA DE UMA FUNÇÃO EM VEZ DE UM SUBSELECT DIRETO NA POLICY:
--
-- Uma policy de SELECT em "profiles" cujo USING consulta a própria
-- "profiles" (ex.: "id in (select professor_id from profiles where id =
-- auth.uid())") faz o Postgres reavaliar a RLS de "profiles" pra resolver
-- esse subselect — que por sua vez reavalia a mesma policy de novo, e assim
-- por diante: recursão infinita. É exatamente o mesmo problema que
-- is_admin()/is_professor() já resolvem (ver comentário original em
-- schema_portal_mestre.sql) — "security definer" roda a função com os
-- privilégios do DONO dela, que ignora RLS, quebrando o ciclo. A função
-- abaixo segue o mesmo padrão.

create or replace function my_professor_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select professor_id from profiles where id = auth.uid();
$$;

drop policy if exists "profiles_select_own_professor" on profiles;
create policy "profiles_select_own_professor" on profiles
  for select to authenticated
  using (id = my_professor_id());
