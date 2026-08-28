-- NeuraOAB — schema para a 2ª fase da OAB (peça + questões discursivas)
-- Execute este script uma vez no projeto Supabase (SQL Editor), depois do schema.sql da 1ª fase.
-- Requer a extensão uuid-ossp (já criada pelo schema.sql da 1ª fase).

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Conteúdo oficial (importado do JSON gerado por py/extract_oab2.py)
-- ---------------------------------------------------------------------------

-- Um "caderno" da 2ª fase: um exame + uma área do Direito.
create table if not exists oab2_provas (
  id uuid primary key default uuid_generate_v4(),
  exam_number integer not null,
  area text not null,
  valor_total numeric(4,2) not null default 10.00,
  source_provas_file text,
  source_resposta_file text,
  created_at timestamptz default now(),
  unique (exam_number, area)
);

-- A peça profissional e cada uma das 4 questões discursivas de um caderno.
create table if not exists oab2_itens (
  id uuid primary key default uuid_generate_v4(),
  prova_id uuid not null references oab2_provas(id) on delete cascade,
  tipo text not null check (tipo in ('peca', 'questao')),
  numero integer,                    -- null para a peça; 1 a 4 para questão
  ordem integer not null,            -- ordem de exibição no caderno (0 = peça, 1..4 = questões)
  enunciado text not null,
  observacao text,                   -- ex.: "a mera citação do dispositivo legal não confere pontuação"
  valor_total numeric(4,2) not null,
  gabarito_comentado text,
  criterios_texto_bruto text,        -- texto oficial completo da "distribuição dos pontos",
                                      -- usado pela Edge Function como contexto de correção mesmo
                                      -- quando o parsing estruturado (oab2_criterios) for incompleto
  created_at timestamptz default now(),
  unique (prova_id, tipo, numero),
  constraint oab2_itens_numero_check check (
    (tipo = 'peca' and numero is null) or (tipo = 'questao' and numero between 1 and 4)
  )
);

-- Sub-itens lettered (A, B, ...) de uma questão discursiva. A peça não tem.
create table if not exists oab2_subitens (
  id uuid primary key default uuid_generate_v4(),
  item_id uuid not null references oab2_itens(id) on delete cascade,
  letra text not null,
  enunciado text not null,
  valor numeric(4,2),
  ordem integer not null,
  unique (item_id, letra)
);

-- Distribuição dos pontos: critério de correção item a item do gabarito oficial.
create table if not exists oab2_criterios (
  id uuid primary key default uuid_generate_v4(),
  item_id uuid not null references oab2_itens(id) on delete cascade,
  rotulo text,                       -- "1", "7.1", "A" etc. (pode ser nulo se não reconhecido)
  categoria text,                    -- agrupamento do gabarito, ex.: "Endereçamento", "Mérito recursal"
  descricao text not null,
  pontuacao_maxima numeric(4,2),
  faixas_possiveis jsonb,            -- ex.: [0.00, 0.10, 0.20]
  ordem integer not null
);

create index if not exists idx_oab2_itens_prova on oab2_itens (prova_id);
create index if not exists idx_oab2_subitens_item on oab2_subitens (item_id);
create index if not exists idx_oab2_criterios_item on oab2_criterios (item_id);

-- ---------------------------------------------------------------------------
-- Progresso do aluno: tentativas e respostas corrigidas pela IA
-- ---------------------------------------------------------------------------
--
-- O NeuraOAB inteiro roda sem sistema de login (só a anon key do Supabase no
-- navegador — ver estudos/estudos.js e admin/import.html). Por isso, em vez
-- de auth.uid()/auth.users, identificamos o aluno por um UUID anônimo gerado
-- e guardado no localStorage do navegador na primeira visita (ver
-- estudos/simulado2fase.js, ANONYMOUS_ID_KEY) — o mesmo modelo de segurança
-- já aceito no resto do app: sem contas, sem dados sensíveis, e a anon key já
-- é pública no HTML de qualquer forma. Isso NÃO protege as respostas de um
-- aluno de outro que tenha a anon key (qualquer um pode ler/gravar qualquer
-- linha) — é apenas uma identidade de conveniência para "lembrar" o
-- progresso no mesmo navegador. Se isso deixar de ser aceitável, é preciso
-- adicionar Supabase Auth de verdade e trocar aluno_id por user_id (auth.uid()).

-- Se você rodou uma versão anterior deste schema (baseada em auth.users)
-- antes do recurso de simulado existir de fato, este drop garante que a
-- recriação abaixo não colida com a estrutura antiga.
drop table if exists oab2_respostas cascade;
drop table if exists oab2_tentativas cascade;

-- Uma tentativa do aluno num caderno completo (peça + 4 questões).
create table oab2_tentativas (
  id uuid primary key default uuid_generate_v4(),
  aluno_id text not null,
  prova_id uuid not null references oab2_provas(id) on delete cascade,
  status text not null default 'em_andamento' check (status in ('em_andamento', 'corrigindo', 'corrigida')),
  nota_total numeric(4,2),
  started_at timestamptz default now(),
  finished_at timestamptz,
  corrected_at timestamptz
);

-- Resposta do aluno para cada item (peça ou questão) dentro de uma tentativa,
-- junto com a nota e o feedback devolvidos pela Edge Function de correção.
create table oab2_respostas (
  id uuid primary key default uuid_generate_v4(),
  tentativa_id uuid not null references oab2_tentativas(id) on delete cascade,
  item_id uuid not null references oab2_itens(id) on delete cascade,
  texto_resposta text not null default '',
  nota numeric(4,2),
  feedback_geral text,
  feedback_criterios jsonb,          -- [{ rotulo, pontuacao_maxima, pontuacao_obtida, justificativa }]
  corrected_at timestamptz,
  updated_at timestamptz default now(),
  unique (tentativa_id, item_id)
);

create index idx_oab2_tentativas_aluno on oab2_tentativas (aluno_id);
create index idx_oab2_respostas_tentativa on oab2_respostas (tentativa_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

-- Conteúdo oficial (oab2_provas/itens/subitens/criterios): leitura pública,
-- igual à tabela oab_questions da 1ª fase. A importação (admin/import2fase.html)
-- usa a anon key no navegador, seguindo o mesmo padrão já adotado pelo
-- admin/import.html da 1ª fase — apropriado para conteúdo público de questões,
-- mas deixa as tabelas graváveis por quem tiver a anon key. Se isso não for
-- aceitável, restrinja as policies de insert/update a um papel autenticado
-- com claim de admin, ou rode a importação com a service role key.
alter table oab2_provas enable row level security;
alter table oab2_itens enable row level security;
alter table oab2_subitens enable row level security;
alter table oab2_criterios enable row level security;

drop policy if exists "oab2_provas_select" on oab2_provas;
create policy "oab2_provas_select" on oab2_provas for select to anon, authenticated using (true);
drop policy if exists "oab2_provas_insert" on oab2_provas;
create policy "oab2_provas_insert" on oab2_provas for insert to anon, authenticated with check (true);
drop policy if exists "oab2_provas_update" on oab2_provas;
create policy "oab2_provas_update" on oab2_provas for update to anon, authenticated using (true) with check (true);

drop policy if exists "oab2_itens_select" on oab2_itens;
create policy "oab2_itens_select" on oab2_itens for select to anon, authenticated using (true);
drop policy if exists "oab2_itens_insert" on oab2_itens;
create policy "oab2_itens_insert" on oab2_itens for insert to anon, authenticated with check (true);
drop policy if exists "oab2_itens_update" on oab2_itens;
create policy "oab2_itens_update" on oab2_itens for update to anon, authenticated using (true) with check (true);

drop policy if exists "oab2_subitens_select" on oab2_subitens;
create policy "oab2_subitens_select" on oab2_subitens for select to anon, authenticated using (true);
drop policy if exists "oab2_subitens_insert" on oab2_subitens;
create policy "oab2_subitens_insert" on oab2_subitens for insert to anon, authenticated with check (true);

drop policy if exists "oab2_criterios_select" on oab2_criterios;
create policy "oab2_criterios_select" on oab2_criterios for select to anon, authenticated using (true);
drop policy if exists "oab2_criterios_insert" on oab2_criterios;
create policy "oab2_criterios_insert" on oab2_criterios for insert to anon, authenticated with check (true);

-- Tentativas e respostas: sem login, então sem isolamento real por aluno no
-- banco (ver nota grande acima da criação das tabelas) — liberado para
-- anon/authenticated, mesmo padrão de oab2_provas/itens acima. O isolamento
-- "por aluno" é só o filtro por aluno_id que o próprio cliente aplica nas
-- queries (estudos/simulado2fase.js), não uma barreira de segurança real.
alter table oab2_tentativas enable row level security;
alter table oab2_respostas enable row level security;

create policy "oab2_tentativas_select" on oab2_tentativas for select to anon, authenticated using (true);
create policy "oab2_tentativas_insert" on oab2_tentativas for insert to anon, authenticated with check (true);
create policy "oab2_tentativas_update" on oab2_tentativas for update to anon, authenticated using (true) with check (true);

create policy "oab2_respostas_select" on oab2_respostas for select to anon, authenticated using (true);
create policy "oab2_respostas_insert" on oab2_respostas for insert to anon, authenticated with check (true);
create policy "oab2_respostas_update" on oab2_respostas for update to anon, authenticated using (true) with check (true);
