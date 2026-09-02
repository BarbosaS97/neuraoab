-- NeuraOAB — cadastro/login de aluno avulso (auto-cadastro, sem professor)
-- Execute este script uma vez no projeto Supabase (SQL Editor), depois de
-- todos os outros schema_*.sql. Aditivo e idempotente — seguro re-rodar.
--
-- CONTEXTO: até aqui, TODA conta (professor, aluno) era criada por convite
-- (portal-admin / professor-portal, usando service_role) — por isso o passo
-- 3 do roteiro de schema_portal_mestre.sql manda DESLIGAR "Allow new users
-- to sign up" no painel do Supabase (pra' evitar que alguém criasse a
-- própria conta direto pela API, por fora do convite). Este arquivo
-- introduz um jeito LEGÍTIMO de auto-cadastro: o "aluno avulso", que testa
-- o plano grátis por conta própria, sem vínculo com professor/turma nenhum
-- (profiles.professor_id e profiles.turma_id ficam NULL pra sempre nesse
-- caso — já são colunas nullable, nenhuma mudança extra precisa aqui).
--
-- ROTEIRO pra colocar isso no ar (nenhum destes passos é feito por SQL —
-- todos manuais no painel do Supabase):
--
--   1. Rode este arquivo inteiro no SQL Editor.
--
--   2. Em Authentication > Providers > Email, LIGUE "Allow new users to
--      sign up" (estava desligado por causa do passo 3 de
--      schema_portal_mestre.sql). Precisa estar ligado, senão nem o
--      cadastro por e-mail/senha (client.auth.signUp, ver index.html) nem o
--      primeiro login de um aluno novo com Google funcionam — os dois
--      passam pela criação normal de usuário do GoTrue, que essa chave
--      bloqueia quando desligada; a criação por CONVITE (generateLink) não
--      é afetada, ela usa a API administrativa, que ignora essa
--      configuração.
--
--      Isso reabre a possibilidade de alguém chamar client.auth.signUp()
--      direto pela anon key, por fora do formulário (que valida Turnstile
--      antes de chamar signUp — ver index.html). Mesmo trade-off que o
--      login já assume hoje (ver o comentário grande perto de
--      "signInWithPassword" em index.html sobre não conseguir plugar o
--      token do Turnstile direto no GoTrue): a tela cuida da experiência
--      normal, quem impede abuso de verdade é o rate-limit padrão do
--      próprio GoTrue nesse endpoint.
--
--   3. (Opcional, mas recomendado) Em Authentication > Providers > Email,
--      mantenha "Confirm email" ligado. O front-end (index.html) já lida
--      com os dois casos — se o cadastro volta com sessão na hora, o aluno
--      entra direto; se não, mostra "confira seu e-mail".
--
--   4. Em Authentication > Providers > Google, habilite o provider e
--      preencha Client ID / Client Secret de um OAuth Client "Web
--      application" criado no Google Cloud Console, com a URI de
--      redirecionamento autorizada = a URL de callback que o próprio painel
--      do Supabase mostra ali (algo como
--      https://lgcphxncteqpbntnlzhe.supabase.co/auth/v1/callback).
--
--   5. Em Authentication > URL Configuration > Redirect URLs, adicione a
--      URL da landing page (ex.: https://neuraoab.com.br/ e
--      https://neuraoab.com.br/index.html) — sem isso o retorno do login
--      com Google falha ("redirect_to not allowed").

-- ---------------------------------------------------------------------------
-- profiles.is_avulso / profiles.plano
-- ---------------------------------------------------------------------------

alter table profiles add column if not exists is_avulso boolean not null default false;
alter table profiles add column if not exists plano text not null default 'gratuito';

-- Sem CHECK de valores válidos em "plano" de propósito: os planos pagos
-- ainda não existem (ver comentário no topo do arquivo que introduziu esta
-- feature) — a lista definitiva vem junto da implementação de assinaturas.

-- ---------------------------------------------------------------------------
-- Auto-criação do perfil de aluno avulso no primeiro login/cadastro
-- ---------------------------------------------------------------------------
--
-- Diferente do aluno/professor convidado (perfil inserido explicitamente
-- por portal-admin/professor-portal, que rodam com service_role e sabem
-- exatamente qual role/professor_id/turma_id atribuir), o aluno avulso cria
-- a PRÓPRIA conta direto pela API pública do Supabase Auth (client.auth.
-- signUp ou signInWithOAuth com Google, ver index.html) — ninguém no
-- servidor "decide" o perfil dele linha por linha, então esse gatilho faz
-- esse papel: toda linha NOVA em auth.users que não veio de um convite vira
-- profiles.role_id = 'aluno', is_avulso = true, plano = 'gratuito', sem
-- professor_id/turma_id.
--
-- A condição "new.invited_at is null" é o que evita colisão com os fluxos
-- de convite: generateLink({type: "invite"}) (portal-admin,
-- professor-portal) preenche invited_at ao criar a linha em auth.users —
-- pra essas contas, este gatilho não faz nada, e o INSERT explícito que já
-- existe em cada uma dessas Edge Functions continua sendo o único a criar o
-- perfil (com o role/professor_id/turma_id corretos). Sem essa condição, o
-- gatilho rodaria ANTES do INSERT das Edge Functions e quebraria os dois
-- convites (chave primária duplicada em profiles.id).
create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  aluno_role_id uuid;
begin
  if new.invited_at is not null then
    return new;
  end if;

  select id into aluno_role_id from roles where name = 'aluno';

  insert into profiles (id, role_id, nome, email, is_avulso, plano)
  values (
    new.id,
    aluno_role_id,
    coalesce(new.raw_user_meta_data->>'nome', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.email,
    true,
    'gratuito'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_handle_new_auth_user on auth.users;
create trigger trg_handle_new_auth_user
  after insert on auth.users
  for each row
  execute function handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Trava is_avulso/plano no mesmo gatilho de campos privilegiados
-- ---------------------------------------------------------------------------
--
-- Redeclaração de protect_profile_privileged_fields (schema_portal_mestre.sql,
-- schema_professor_portal.sql, schema_turmas.sql) acrescentando is_avulso e
-- plano à lista de campos travados pra quem não é admin/service_role. Sem
-- isso, a policy "profiles_update_self" (schema_portal_mestre.sql) deixaria
-- QUALQUER aluno logado dar um client.from("profiles").update({plano:
-- "pago"}) na própria linha e "assinar" de graça — mesmo raciocínio de
-- role_id/ativo/professor_id/turma_id já travados aqui. Mudar o plano de
-- verdade vai exigir service_role (Edge Function de pagamento, feature
-- futura), igual professor_id/turma_id hoje.
create or replace function protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_own_professor boolean := is_professor() and old.professor_id = auth.uid();
begin
  if not is_admin() and coalesce(auth.role(), '') <> 'service_role' then
    new.role_id := old.role_id;
    new.ativo := old.ativo;
    new.professor_id := old.professor_id;
    new.is_avulso := old.is_avulso;
    new.plano := old.plano;
    if not is_own_professor then
      new.turma_id := old.turma_id;
    end if;
  end if;
  return new;
end;
$$;
