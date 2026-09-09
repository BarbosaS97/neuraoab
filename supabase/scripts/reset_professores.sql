-- NeuraOAB — reset das contas do Portal do Professor, mantendo só
-- explicandoexatas@gmail.com como professor. Rode no SQL Editor do projeto
-- Supabase (não é uma migration de schema — é uma limpeza de dados pontual,
-- por isso mora em scripts/, não junto dos schema_*.sql).
--
-- IRREVERSÍVEL. Exclui a conta de auth de qualquer professor com e-mail
-- diferente de explicandoexatas@gmail.com — isso cascateia (ver "on delete
-- cascade" em schema_portal_mestre.sql/schema_turmas.sql/schema_convites_
-- turma.sql) pra: profiles do professor, todas as turmas dele e todos os
-- convites que ele gerou. Alunos que esse professor tinha convidado NÃO são
-- excluídos — a conta deles continua existindo, só fica sem professor/turma
-- (profiles.professor_id/turma_id viram null, passo 1 abaixo, que também
-- evita a exclusão falhar por causa da foreign key profiles.professor_id).
--
-- Rode o SELECT do passo 0 primeiro pra conferir exatamente quem vai ser
-- afetado antes de rodar o resto.

-- ---------------------------------------------------------------------------
-- Passo 0 — conferência (só leitura, rode sozinho antes do resto)
-- ---------------------------------------------------------------------------

-- Professores que serão excluídos:
select id, nome, email, cursinho, created_at
from profiles
where role_id = (select id from roles where name = 'professor')
  and coalesce(lower(email), '') <> 'explicandoexatas@gmail.com';

-- Alunos que serão desvinculados (não excluídos) desses professores:
select id, nome, email, professor_id, turma_id
from profiles
where professor_id in (
  select id from profiles
  where role_id = (select id from roles where name = 'professor')
    and coalesce(lower(email), '') <> 'explicandoexatas@gmail.com'
);

-- ---------------------------------------------------------------------------
-- Passo 1 — desvincula os alunos desses professores (preserva a conta deles)
-- ---------------------------------------------------------------------------

begin;

update profiles
set professor_id = null,
    turma_id = null
where professor_id in (
  select id from profiles
  where role_id = (select id from roles where name = 'professor')
    and coalesce(lower(email), '') <> 'explicandoexatas@gmail.com'
);

-- ---------------------------------------------------------------------------
-- Passo 2 — exclui a conta de auth de cada professor (menos
-- explicandoexatas@gmail.com) — cascateia pra profiles/turmas/convites
-- ---------------------------------------------------------------------------

delete from auth.users
where id in (
  select id from profiles
  where role_id = (select id from roles where name = 'professor')
    and coalesce(lower(email), '') <> 'explicandoexatas@gmail.com'
);

commit;

-- ---------------------------------------------------------------------------
-- Passo 3 — conferência final: deve sobrar só explicandoexatas@gmail.com
-- ---------------------------------------------------------------------------

select id, nome, email, ativo, created_at
from profiles
where role_id = (select id from roles where name = 'professor');
