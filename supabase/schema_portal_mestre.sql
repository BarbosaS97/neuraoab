-- NeuraOAB — schema do Portal Mestre (login + gestão de professores)
-- Execute este script uma vez no projeto Supabase (SQL Editor), depois do
-- schema.sql (e, se for usar, do schema_fase2.sql).
--
-- ROTEIRO COMPLETO pra colocar o Portal Mestre no ar (nenhum desses passos
-- pode ser feito por código, precisa ser feito manualmente por quem tem
-- acesso ao projeto Supabase):
--
--   1. Rode este arquivo inteiro no SQL Editor.
--   2. Deploy da Edge Function:
--        supabase functions deploy portal-admin
--      (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY ja' vem configurados
--      automaticamente pelo Supabase em toda Edge Function do projeto —
--      nao precisa rodar "supabase secrets set" pra nada aqui.)
--   3. Em Authentication > Providers > Email, desligue "Allow new users to
--      sign up". Sem isso, qualquer pessoa com a anon key (que ja e' publica
--      no HTML) consegue criar a propria conta direto pela API do Supabase,
--      por fora do Portal Mestre.
--   4. Crie sua propria conta em Authentication > Users > "Add user" (seu
--      e-mail/senha reais), depois rode o UPDATE no final deste arquivo
--      trocando o e-mail.
--   5. Em Authentication > URL Configuration > Redirect URLs, adicione
--      a URL de professor/definir-senha.html (ex.:
--      https://neuraoab.com.br/professor/definir-senha.html) — sem isso o
--      link de convite do professor nao funciona. Se ja rodou este arquivo
--      antes (v1, sem convite), rode de novo: e' seguro re-rodar tudo.
--   6. Pra o convite ser enviado por e-mail automaticamente (em vez de so'
--      aparecer o link pra copiar): crie uma conta no Resend
--      (https://resend.com), verifique o dominio neuraoab.com.br em
--      Domains (adicionando os registros DNS que o Resend pedir), gere uma
--      API key e rode:
--        supabase secrets set RESEND_API_KEY=sua_chave_aqui
--      Sem isso o professor ainda e' criado normalmente — so' o e-mail nao
--      sai, e o admin precisa copiar e mandar o link manualmente (ver
--      supabase/functions/portal-admin/index.ts).

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Papeis e perfis
-- ---------------------------------------------------------------------------

create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

insert into roles (name) values ('admin'), ('professor'), ('aluno')
  on conflict (name) do nothing;

-- Um perfil por usuario do Supabase Auth (id = auth.users.id). So existe
-- para quem faz login de verdade (admin/professor) — o restante do app
-- (alunos usando 1a/2a fase) continua sem conta, como sempre foi.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role_id uuid not null references roles(id),
  nome text,
  email text,
  cursinho text,
  telefone text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_profiles_role on profiles (role_id);

-- ---------------------------------------------------------------------------
-- Funcao auxiliar: "sou admin?" sem recursao de RLS
-- ---------------------------------------------------------------------------
--
-- Uma policy em "profiles" que precisasse consultar "profiles" pra saber se
-- quem esta' logado e' admin cairia numa recursao (a propria consulta
-- dispara a policy de novo). "security definer" roda com o dono da funcao
-- (que ignora RLS), quebrando esse ciclo — padrao recomendado pelo proprio
-- Supabase pra esse caso.
create or replace function is_admin()
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
    where p.id = auth.uid() and r.name = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
--
-- Diferente do resto do app (que libera a role "anon" pra tudo, por design
-- — ver o aviso grande em schema_fase2.sql sobre o app rodar sem login):
-- aqui SO "authenticated" tem qualquer acesso, e a maior parte das operacoes
-- exige ser admin. Ninguem sem login le ou escreve nada nestas duas tabelas.

alter table roles enable row level security;
alter table profiles enable row level security;

drop policy if exists "roles_select" on roles;
create policy "roles_select" on roles
  for select to authenticated using (true);

drop policy if exists "profiles_select" on profiles;
create policy "profiles_select" on profiles
  for select to authenticated
  using (id = auth.uid() or is_admin());

drop policy if exists "profiles_update_admin" on profiles;
create policy "profiles_update_admin" on profiles
  for update to authenticated
  using (is_admin())
  with check (is_admin());

-- O professor precisa conseguir gravar o proprio nome ao aceitar o convite
-- (ver professor/definir-senha.html) — sem isso ele nunca conseguiria
-- terminar o proprio cadastro. Deixa qualquer usuario autenticado dar
-- UPDATE na PROPRIA linha (id = auth.uid()); o gatilho abaixo e' quem
-- garante que isso nao vira uma brecha pra alguem se autopromover.
drop policy if exists "profiles_update_self" on profiles;
create policy "profiles_update_self" on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- "with check" so' enxerga a linha NOVA, nao da' pra comparar com a
-- antiga nele — por isso quem barra um professor de trocar o proprio
-- role_id ou "ativo" (mesmo que ele edite o payload da requisicao pra
-- tentar) e' este gatilho, nao a policy acima.
create or replace function protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    new.role_id := old.role_id;
    new.ativo := old.ativo;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_privileged_fields on profiles;
create trigger trg_protect_profile_privileged_fields
  before update on profiles
  for each row
  execute function protect_profile_privileged_fields();

-- Sem policy de INSERT/DELETE pra "authenticated" de proposito: criar ou
-- excluir um professor mexe em auth.users (nao so' em "profiles"), o que so'
-- a service_role consegue fazer via API administrativa — e' por isso que
-- essas duas acoes passam pela Edge Function "portal-admin", nao por um
-- INSERT/DELETE direto do navegador. A service_role ignora RLS por padrao,
-- entao ela nao precisa de nenhuma policy aqui pra funcionar.

-- ---------------------------------------------------------------------------
-- Passo 5 do roteiro: rode isto DEPOIS de criar sua conta em
-- Authentication > Users, trocando o e-mail abaixo pelo seu.
-- ---------------------------------------------------------------------------

-- insert into profiles (id, role_id, nome, email)
-- select id, (select id from roles where name = 'admin'), 'Seu Nome', email
-- from auth.users where email = 'barbosafellipee@gmail.com'
-- on conflict (id) do update set role_id = excluded.role_id;
