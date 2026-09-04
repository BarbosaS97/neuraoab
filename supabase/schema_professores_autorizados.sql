-- NeuraOAB — allowlist de e-mails autorizados a entrar no Portal do
-- Professor via login com Google (ver supabase/functions/professor-auth-
-- check/index.ts e professor-portal/js/auth.js). Execute este script uma
-- vez no SQL Editor do Supabase, depois de schema_portal_mestre.sql
-- (precisa de is_admin()). Aditivo e idempotente — seguro re-rodar.
--
-- CONTEXTO: antes, virar professor exigia o admin criar a conta manualmente
-- no Portal Mestre (convite por e-mail/senha, ver portal-admin/index.ts).
-- Isso continua funcionando em paralelo — quem já tem profiles.role_id
-- ='professor' não passa por esta tabela. Esta allowlist é um segundo
-- caminho, mais leve: o admin só precisa cadastrar o e-mail aqui (Portal
-- Mestre, painel "Professores autorizados") e a pessoa entra sozinha
-- fazendo login com Google — a Edge Function professor-auth-check promove
-- profiles.role_id pra "professor" na hora, na primeira vez que o e-mail
-- autorizado loga.

create table if not exists professores_autorizados (
  email text primary key,
  nome text,
  autorizado_por uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- Normaliza pra minúsculo sempre — "Fulano@x.com" e "fulano@x.com" não
-- podem virar duas linhas diferentes (mesmo cuidado já usado em
-- professor-portal/index.ts: input.email?.trim().toLowerCase()).
create or replace function normalize_professor_autorizado_email()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(trim(new.email));
  return new;
end;
$$;

drop trigger if exists trg_normalize_professor_autorizado_email on professores_autorizados;
create trigger trg_normalize_professor_autorizado_email
  before insert or update on professores_autorizados
  for each row execute function normalize_professor_autorizado_email();

alter table professores_autorizados enable row level security;

-- Só admin lê/escreve — mesmo padrão de plan_limits (schema_planos.sql):
-- a checagem de LOGIN em si (professor-auth-check) usa a service_role key,
-- que ignora RLS, então isto aqui só precisa cobrir o acesso via cliente
-- comum (a tela do Portal Mestre).
drop policy if exists "professores_autorizados_admin" on professores_autorizados;
create policy "professores_autorizados_admin" on professores_autorizados
  for all to authenticated
  using (is_admin())
  with check (is_admin());
