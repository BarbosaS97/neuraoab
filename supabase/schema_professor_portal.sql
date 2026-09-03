-- NeuraOAB — schema do Portal do Professor (convite de alunos + estatísticas)
-- Execute este script uma vez no projeto Supabase (SQL Editor), depois do
-- schema.sql, schema_fase2.sql e schema_portal_mestre.sql. Ao contrário de
-- schema_fase2.sql, este arquivo é ADITIVO — não faz "drop table", porque
-- oab2_tentativas/oab2_respostas já têm dados reais de alunos anônimos que
-- precisam ser preservados. Seguro re-rodar (todo comando é "if not exists"
-- ou "create or replace").
--
-- ROTEIRO pra colocar o Portal do Professor no ar:
--
--   1. Rode este arquivo inteiro no SQL Editor.
--   2. Deploy das Edge Functions portal-admin (código atualizado — mesmo
--      envio por e-mail de antes, sem mudança de comportamento) e
--      professor-portal (nova). Colando o código de cada uma no editor de
--      Edge Functions do Dashboard do Supabase (Create/Edit function >
--      colar o conteúdo de supabase/functions/<nome>/index.ts) — cada
--      arquivo é autocontido de propósito (sem import de módulo
--      compartilhado), porque esse editor só enxerga o código daquela
--      function, um import relativo tipo "../_shared/..." quebra o
--      bundling ("Module not found").
--   3. Em Authentication > URL Configuration > Redirect URLs, adicione
--      a de professor/definir-senha.html, se ainda não tiver sido feito
--      (convite de PROFESSOR continua usando generateLink/redirectTo).
--
--      [ATUALIZADO — ver schema_convites_turma.sql] O passo 3 original
--      deste roteiro mandava cadastrar também
--      "https://neuraoab.com.br/estudos/aceitar-convite.html" — esse
--      arquivo não existe mais, e o convite de ALUNO não usa mais
--      generateLink/redirectTo nenhum (virou um código validado por
--      supabase/functions/aluno-portal/index.ts, ver schema_convites_
--      turma.sql), então esse passo não é mais necessário.

-- ---------------------------------------------------------------------------
-- profiles.professor_id — liga um aluno ao professor que o convidou
-- ---------------------------------------------------------------------------

alter table profiles add column if not exists professor_id uuid references profiles(id);
create index if not exists idx_profiles_professor on profiles (professor_id);

-- "sou professor?" — mesmo padrão de is_admin() (schema_portal_mestre.sql).
create or replace function is_professor()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from profiles p
    join roles r on r.id = p.role_id
    where p.id = auth.uid() and r.name = 'professor'
  );
$$;

-- Redeclaração de protect_profile_privileged_fields (schema_portal_mestre.sql)
-- com duas mudanças:
--   1. professor_id entra na lista de campos travados pra quem não é admin
--      — sem isso, um aluno trocando o próprio nome (profiles_update_self)
--      poderia se re-atribuir a outro professor.
--   2. Bypass pra service_role: as Edge Functions portal-admin/
--      professor-portal usam a service_role key (sem sessão de usuário, logo
--      auth.uid() é null e is_admin() dá falso) pra fazer a exclusão "soft"
--      de aluno (profiles.ativo = false, ver professor-portal/index.ts) — sem
--      esse bypass o gatilho reverteria esse UPDATE silenciosamente, porque
--      ele roda pra qualquer chamador, service_role incluído. auth.role() é
--      a claim "role" do JWT usado na conexão: 'service_role' só quando a
--      chamada usa a service_role key (nunca o valor de uma sessão de
--      navegador), então isso não abre brecha nenhuma pro cliente.
create or replace function protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() and coalesce(auth.role(), '') <> 'service_role' then
    new.role_id := old.role_id;
    new.ativo := old.ativo;
    new.professor_id := old.professor_id;
  end if;
  return new;
end;
$$;

-- Professor enxerga os próprios alunos (policy ADITIVA — a "profiles_select"
-- de schema_portal_mestre.sql, que já libera a própria linha e o admin,
-- continua valendo; RLS combina policies permissivas com OR).
drop policy if exists "profiles_select_professor" on profiles;
create policy "profiles_select_professor" on profiles
  for select to authenticated
  using (professor_id = auth.uid());

-- Professor edita campos simples (nome/cursinho/telefone) dos próprios
-- alunos direto pela tabela, mesmo padrão de "editar professor" no Portal
-- Mestre (client.from("profiles").update(...), ver portal-mestre/js/
-- admin.js). role_id/ativo/professor_id continuam travados pelo gatilho
-- acima mesmo com essa policy — ativar/desativar aluno passa pela Edge
-- Function professor-portal (action "delete-student"), não por aqui.
drop policy if exists "profiles_update_professor" on profiles;
create policy "profiles_update_professor" on profiles
  for update to authenticated
  using (professor_id = auth.uid())
  with check (professor_id = auth.uid());

-- ---------------------------------------------------------------------------
-- oab2_tentativas.user_id — liga uma tentativa da 2ª fase a um aluno logado
-- ---------------------------------------------------------------------------
--
-- Aditivo: a coluna aluno_id (texto, UUID anônimo do localStorage) continua
-- existindo e sendo gravada normalmente — é a chave de retomada de quem usa
-- o app sem login, que continua funcionando exatamente como antes. user_id
-- só é preenchido quando quem responde está logado (ver estudos/
-- simulado2fase.js) — linhas antigas (de antes deste recurso existir) ficam
-- com user_id nulo pra sempre, o que é aceitável: não dá pra atribuir
-- retroativamente uma tentativa anônima a uma pessoa real.
alter table oab2_tentativas add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists idx_oab2_tentativas_user on oab2_tentativas (user_id);

-- ---------------------------------------------------------------------------
-- oab_respostas — respostas da 1ª fase (múltipla escolha), não existia antes
-- ---------------------------------------------------------------------------
--
-- Só é gravada por aluno logado (ver estudos/estudos.js) — quem usa o app
-- anonimamente (o público em geral, sem convite de professor) continua sem
-- nenhuma gravação de tentativa de 1ª fase, exatamente como hoje.
create table if not exists oab_respostas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  question_id uuid references oab_questions(id) on delete set null,
  letter text not null,
  correct boolean not null,
  answered_at timestamptz not null default now()
);

create index if not exists idx_oab_respostas_user on oab_respostas (user_id);
create index if not exists idx_oab_respostas_question on oab_respostas (question_id);

alter table oab_respostas enable row level security;

drop policy if exists "oab_respostas_select" on oab_respostas;
create policy "oab_respostas_select" on oab_respostas
  for select to authenticated
  using (
    user_id = auth.uid()
    or is_admin()
    or exists (
      select 1 from profiles st
      where st.id = oab_respostas.user_id and st.professor_id = auth.uid()
    )
  );

drop policy if exists "oab_respostas_insert" on oab_respostas;
create policy "oab_respostas_insert" on oab_respostas
  for insert to authenticated
  with check (user_id = auth.uid());

-- Sem policy de update/delete de propósito: uma resposta é gravada uma vez
-- só (estudos/estudos.js só grava a primeira resposta de cada questão) e
-- fica assim pra sempre — histórico, não precisa ser editável.

-- ---------------------------------------------------------------------------
-- Aperta o RLS de oab2_tentativas/oab2_respostas (schema_fase2.sql)
-- ---------------------------------------------------------------------------
--
-- Hoje select/update dessas duas tabelas são "to anon, authenticated using
-- (true)" — completamente abertas. Isso significa que, a partir do momento
-- em que existe QUALQUER conta de professor logada, ela já conseguiria ler
-- a resposta/nota de QUALQUER aluno (não só os próprios) com uma chamada
-- direta, portal do professor ou não — layering de UI sem controle de
-- acesso real por trás. Por isso aqui a policy única de cada ação é trocada
-- por DUAS: uma "to anon using (true)" (preserva o fluxo anônimo/convidado
-- exatamente como está) e uma "to authenticated" com predicado de verdade
-- (dono da tentativa, admin, ou professor do aluno dono da tentativa).
-- Insert continua aberto pra anon/authenticated sem mudança — quem responde
-- anonimamente ainda precisa conseguir criar/gravar a própria tentativa.

-- "drop policy if exists" pro nome ANTIGO (uma policy só, pré-split) E pros
-- dois nomes NOVOS (_anon/_auth) antes de cada create — sem os dois de
-- "_anon"/"_auth", reexecutar este arquivo falhava com "policy ... already
-- exists" a partir da segunda vez (create policy não tem "if not exists").
drop policy if exists "oab2_tentativas_select" on oab2_tentativas;
drop policy if exists "oab2_tentativas_select_anon" on oab2_tentativas;
create policy "oab2_tentativas_select_anon" on oab2_tentativas
  for select to anon using (true);
drop policy if exists "oab2_tentativas_select_auth" on oab2_tentativas;
create policy "oab2_tentativas_select_auth" on oab2_tentativas
  for select to authenticated using (
    user_id = auth.uid()
    or is_admin()
    or exists (
      select 1 from profiles st
      where st.id = oab2_tentativas.user_id and st.professor_id = auth.uid()
    )
  );

drop policy if exists "oab2_tentativas_update" on oab2_tentativas;
drop policy if exists "oab2_tentativas_update_anon" on oab2_tentativas;
create policy "oab2_tentativas_update_anon" on oab2_tentativas
  for update to anon using (true) with check (true);
drop policy if exists "oab2_tentativas_update_auth" on oab2_tentativas;
create policy "oab2_tentativas_update_auth" on oab2_tentativas
  for update to authenticated
  using (user_id = auth.uid() or is_admin())
  with check (user_id = auth.uid() or is_admin());

drop policy if exists "oab2_respostas_select" on oab2_respostas;
drop policy if exists "oab2_respostas_select_anon" on oab2_respostas;
create policy "oab2_respostas_select_anon" on oab2_respostas
  for select to anon using (true);
drop policy if exists "oab2_respostas_select_auth" on oab2_respostas;
create policy "oab2_respostas_select_auth" on oab2_respostas
  for select to authenticated using (
    exists (
      select 1 from oab2_tentativas t
      where t.id = oab2_respostas.tentativa_id
        and (
          t.user_id = auth.uid()
          or is_admin()
          or exists (
            select 1 from profiles st
            where st.id = t.user_id and st.professor_id = auth.uid()
          )
        )
    )
  );

drop policy if exists "oab2_respostas_update" on oab2_respostas;
drop policy if exists "oab2_respostas_update_anon" on oab2_respostas;
create policy "oab2_respostas_update_anon" on oab2_respostas
  for update to anon using (true) with check (true);
drop policy if exists "oab2_respostas_update_auth" on oab2_respostas;
create policy "oab2_respostas_update_auth" on oab2_respostas
  for update to authenticated
  using (
    exists (
      select 1 from oab2_tentativas t
      where t.id = oab2_respostas.tentativa_id and (t.user_id = auth.uid() or is_admin())
    )
  )
  with check (
    exists (
      select 1 from oab2_tentativas t
      where t.id = oab2_respostas.tentativa_id and (t.user_id = auth.uid() or is_admin())
    )
  );
