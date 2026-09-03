-- NeuraOAB — limites dos planos (Grátis/Básico/Pro) + uso mensal/diário
-- Execute este script uma vez no projeto Supabase (SQL Editor), depois de
-- todos os outros schema_*.sql (precisa de profiles.plano, is_admin() etc.,
-- de schema_aluno_avulso.sql / schema_portal_mestre.sql). Aditivo e
-- idempotente — seguro re-rodar.
--
-- CONTEXTO: profiles.plano (schema_aluno_avulso.sql) já existe e já é
-- gravado como 'gratuito' pra todo aluno avulso novo, mas nada ainda olhava
-- pra essa coluna — este arquivo é o que dá SIGNIFICADO a ela: quantas
-- questões/dia, simulados/mês e mensagens de chat/mês cada plano permite, e
-- se ele libera análise de estatística por IA e a 2ª fase. Preço em R$ NÃO
-- mora aqui — isso é copy estática da landing page (ver index.html, seção
-- #planos) até o dia em que a cobrança de verdade (Asaas) existir; esta
-- tabela é só sobre limites de USO, e é isso que os planos pagos "compram"
-- (acesso ilimitado) até lá.
--
-- ROTEIRO:
--   1. Rode este arquivo inteiro no SQL Editor.
--   2. Nada mais é necessário — os limites já ficam editáveis pelo Portal
--      Mestre (painel "Planos", ver portal-mestre/dashboard.html) sem
--      precisar mexer em código nem redeployar nada.

-- ---------------------------------------------------------------------------
-- plan_limits — um limite por plano, editável só por admin
-- ---------------------------------------------------------------------------
--
-- Cada limite numérico é NULL = ilimitado (não "zero", que bloquearia tudo).
-- questoes_por_dia e simulados_por_mes/chat_mensagens_por_mes têm
-- granularidades diferentes de propósito (dia vs. mês civil) — ver
-- increment_plan_usage() abaixo, que já sabe qual usar pra cada "kind".

create table if not exists plan_limits (
  plano text primary key,
  questoes_por_dia integer,
  simulados_por_mes integer,
  chat_mensagens_por_mes integer,
  estatisticas_ia boolean not null default true,
  segunda_fase boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into plan_limits (plano, questoes_por_dia, simulados_por_mes, chat_mensagens_por_mes, estatisticas_ia, segunda_fase)
values
  ('gratuito', 10, null, 5, false, false),
  ('basico', null, null, null, true, false),
  ('pro', null, null, null, true, true)
on conflict (plano) do nothing;

-- "1 simulado por mês" nunca foi um recurso de verdade — "simulado" é só
-- um atalho de navegação sobre a MESMA 1ª fase (ver startSimulado em
-- estudos/estudos.js), já coberta pelo limite de questoes_por_dia; não faz
-- sentido cobrar separado por ele. simulados_por_mes fica na tabela (e em
-- plan_usage_monthly/increment_plan_usage, que continuam sabendo lidar com
-- kind='simulado') só como um mecanismo genérico já pronto, caso um dia
-- exista um recurso de verdade que precise dele — mas nada no produto
-- chama isso hoje, e o valor abaixo garante que nenhum ambiente antigo
-- (que já tinha rodado a versão anterior deste arquivo, com limite de 1)
-- fique com essa trava fantasma.
update plan_limits set simulados_por_mes = null where plano = 'gratuito';

alter table plan_limits enable row level security;

-- Todo autenticado precisa LER os limites (pra saber "quantos restam hoje",
-- se a 2ª fase está liberada etc.) — ver get_my_plan_status() abaixo, chamada
-- por estudos/estudos.js. Só admin EDITA (Portal Mestre).
drop policy if exists "plan_limits_select" on plan_limits;
create policy "plan_limits_select" on plan_limits
  for select to authenticated using (true);

drop policy if exists "plan_limits_update_admin" on plan_limits;
create policy "plan_limits_update_admin" on plan_limits
  for update to authenticated
  using (is_admin())
  with check (is_admin());

-- Sem policy de insert/delete de propósito: os 3 planos (gratuito/basico/
-- pro) são fixos pro produto atual — um 4º plano, se um dia existir, entra
-- por um novo schema_*.sql (mesmo padrão do resto do projeto), não por uma
-- tela de "criar plano".

create or replace function touch_plan_limits_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_plan_limits_updated_at on plan_limits;
create trigger trg_touch_plan_limits_updated_at
  before update on plan_limits
  for each row
  execute function touch_plan_limits_updated_at();

-- ---------------------------------------------------------------------------
-- plan_usage_monthly — contador de uso por aluno, nunca tocado pelo cliente
-- ---------------------------------------------------------------------------
--
-- "period" é 'YYYY-MM-DD' pra kind='questoes' (limite diário) e 'YYYY-MM'
-- pra kind='simulado'/'chat' (limite mensal, mês CIVIL — reseta todo dia 1,
-- não é uma janela rolante de 30 dias) — increment_plan_usage() escolhe o
-- formato certo pra cada kind. Mesmo espírito de edge_rate_limits
-- (schema_security_hardening.sql), mas com granularidade de calendário em
-- vez de janela deslizante: faz mais sentido pra um limite de plano ("5
-- mensagens por mês") que pro rate-limit de abuso por IP daquele outro caso.

create table if not exists plan_usage_monthly (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  period text not null,
  count integer not null default 0,
  primary key (user_id, kind, period)
);

alter table plan_usage_monthly enable row level security;
-- Sem policy nenhuma pra anon/authenticated de propósito: só é lido/gravado
-- via increment_plan_usage()/get_my_plan_status() (SECURITY DEFINER),
-- nunca direto pelo cliente — mesmo modelo de edge_rate_limits.

-- ---------------------------------------------------------------------------
-- increment_plan_usage — consome 1 unidade de cota, ou recusa se já esgotou
-- ---------------------------------------------------------------------------
--
-- p_kind: 'questoes' | 'simulado' | 'chat'. Resolve o plano do usuário
-- (p_user_id) e o limite correspondente em plan_limits — nunca confia num
-- "plano" ou "limite" vindo do cliente. Se o limite for NULL (ilimitado),
-- nem grava nada em plan_usage_monthly, só devolve "permitido". Se já tiver
-- estourado, desfaz o incremento que acabou de fazer (não "gasta" uma
-- tentativa bloqueada) e devolve "não permitido".
--
-- Implementação interna compartilhada por duas entradas públicas logo
-- abaixo: increment_plan_usage(p_kind), que usa auth.uid() (chamada pelo
-- próprio front-end, ver estudos/estudos.js) e
-- increment_plan_usage_for(p_user_id, p_kind), que aceita um id explícito
-- (chamada só por Edge Functions com a service_role key, ex.: dr-laureano,
-- que já verificou esse id via auth.getUser(jwt) antes de chegar aqui).
create or replace function _increment_plan_usage_impl(p_user_id uuid, p_kind text)
returns table (allowed boolean, used_count integer, max_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plano text;
  v_max integer;
  v_period text;
  v_count integer;
begin
  if p_kind not in ('questoes', 'simulado', 'chat') then
    raise exception 'kind desconhecido: %', p_kind;
  end if;

  select coalesce(p.plano, 'gratuito') into v_plano from profiles p where p.id = p_user_id;
  if v_plano is null then
    v_plano := 'gratuito';
  end if;

  if p_kind = 'questoes' then
    select pl.questoes_por_dia into v_max from plan_limits pl where pl.plano = v_plano;
    v_period := to_char(now(), 'YYYY-MM-DD');
  elsif p_kind = 'simulado' then
    select pl.simulados_por_mes into v_max from plan_limits pl where pl.plano = v_plano;
    v_period := to_char(now(), 'YYYY-MM');
  else
    select pl.chat_mensagens_por_mes into v_max from plan_limits pl where pl.plano = v_plano;
    v_period := to_char(now(), 'YYYY-MM');
  end if;

  if v_max is null then
    return query select true, 0, null::integer;
    return;
  end if;

  insert into plan_usage_monthly (user_id, kind, period, count)
    values (p_user_id, p_kind, v_period, 1)
    on conflict (user_id, kind, period) do update set count = plan_usage_monthly.count + 1
    returning plan_usage_monthly.count into v_count;

  if v_count > v_max then
    update plan_usage_monthly set count = v_max
      where user_id = p_user_id and kind = p_kind and period = v_period;
    return query select false, v_max, v_max;
    return;
  end if;

  return query select true, v_count, v_max;
end;
$$;

revoke all on function _increment_plan_usage_impl(uuid, text) from public;

create or replace function increment_plan_usage(p_kind text)
returns table (allowed boolean, used_count integer, max_count integer)
language sql
security definer
set search_path = public
as $$
  select * from _increment_plan_usage_impl(auth.uid(), p_kind);
$$;

revoke all on function increment_plan_usage(text) from public;
grant execute on function increment_plan_usage(text) to authenticated;

create or replace function increment_plan_usage_for(p_user_id uuid, p_kind text)
returns table (allowed boolean, used_count integer, max_count integer)
language sql
security definer
set search_path = public
as $$
  select * from _increment_plan_usage_impl(p_user_id, p_kind);
$$;

revoke all on function increment_plan_usage_for(uuid, text) from public;
grant execute on function increment_plan_usage_for(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- get_my_plan_status — o que o front-end lê pra mostrar "quanto resta hoje"
-- ---------------------------------------------------------------------------
--
-- Só LEITURA (não consome cota nenhuma) — usada por estudos/estudos.js pra
-- decidir o que mostrar (barra "7/10 hoje", cadeado na 2ª fase, aviso no
-- chat) antes mesmo de qualquer ação, sem gastar uma tentativa só de olhar.
create or replace function get_my_plan_status()
returns table (
  plano text,
  questoes_por_dia integer,
  questoes_hoje integer,
  simulados_por_mes integer,
  simulados_mes_atual integer,
  chat_mensagens_por_mes integer,
  chat_mes_atual integer,
  estatisticas_ia boolean,
  segunda_fase boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_plano text;
begin
  select coalesce(p.plano, 'gratuito') into v_plano from profiles p where p.id = auth.uid();
  if v_plano is null then
    v_plano := 'gratuito';
  end if;

  return query
  select
    v_plano,
    pl.questoes_por_dia,
    coalesce((
      select u.count from plan_usage_monthly u
      where u.user_id = auth.uid() and u.kind = 'questoes' and u.period = to_char(now(), 'YYYY-MM-DD')
    ), 0),
    pl.simulados_por_mes,
    coalesce((
      select u.count from plan_usage_monthly u
      where u.user_id = auth.uid() and u.kind = 'simulado' and u.period = to_char(now(), 'YYYY-MM')
    ), 0),
    pl.chat_mensagens_por_mes,
    coalesce((
      select u.count from plan_usage_monthly u
      where u.user_id = auth.uid() and u.kind = 'chat' and u.period = to_char(now(), 'YYYY-MM')
    ), 0),
    pl.estatisticas_ia,
    pl.segunda_fase
  from plan_limits pl
  where pl.plano = v_plano;
end;
$$;

revoke all on function get_my_plan_status() from public;
grant execute on function get_my_plan_status() to authenticated;

-- ---------------------------------------------------------------------------
-- get_plan_status_for(uuid) — mesma consulta, mas pra uso SERVER-SIDE
-- ---------------------------------------------------------------------------
--
-- dr-laureano, estatisticas-ia e corretor-2fase (Edge Functions) precisam
-- checar o plano de QUEM CHAMOU antes de gastar dinheiro numa chamada de IA
-- — get_my_plan_status() não serve pra elas porque roda como o usuário
-- (auth.uid()), e essas functions às vezes chamam com um client que já foi
-- resolvido pra um user id específico via auth.getUser(jwt), não
-- necessariamente com esse JWT propagado pra dentro do Postgres. Esta
-- variante aceita o id explícito — SECURITY DEFINER, EXECUTE só pra
-- service_role (ver grant abaixo): com um uuid arbitrário como parâmetro e
-- sem checar quem está chamando, liberar isso pra anon/authenticated
-- vazaria "em qual plano está o usuário X" pra qualquer um com a anon key.
-- As Edge Functions que precisam disso (dr-laureano, estatisticas-ia) já
-- resolveram e verificaram o id de quem chamou via auth.getUser(jwt) ANTES
-- de chegar aqui — usam um client próprio com a service_role key só pra
-- esta checagem pontual, mantendo o resto de cada function com o mesmo
-- privilégio mínimo de antes.
create or replace function get_plan_status_for(p_user_id uuid)
returns table (
  plano text,
  questoes_por_dia integer,
  simulados_por_mes integer,
  chat_mensagens_por_mes integer,
  estatisticas_ia boolean,
  segunda_fase boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_plano text;
begin
  select coalesce(p.plano, 'gratuito') into v_plano from profiles p where p.id = p_user_id;
  if v_plano is null then
    v_plano := 'gratuito';
  end if;

  return query
  select v_plano, pl.questoes_por_dia, pl.simulados_por_mes, pl.chat_mensagens_por_mes, pl.estatisticas_ia, pl.segunda_fase
  from plan_limits pl
  where pl.plano = v_plano;
end;
$$;

revoke all on function get_plan_status_for(uuid) from public;
grant execute on function get_plan_status_for(uuid) to service_role;
