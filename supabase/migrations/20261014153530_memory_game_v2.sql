-- Memory Game v2. Safe to re-run in the Supabase SQL editor.
-- Prerequisite: supabase_admin_profiles_policies.sql (public.is_active_user()).
-- Keep memory_game_private OUT of the Data API's exposed schemas.
-- Ordinary history is private, client-reported data. Only server-owned daily
-- sessions qualify for the leaderboard. No client score/timer is accepted there.
begin;

create schema if not exists memory_game_private;
revoke all on schema memory_game_private from public, anon;
grant usage on schema memory_game_private to authenticated;

create table if not exists memory_game_private.account_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  document jsonb not null,
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  constraint memory_game_document_size check (octet_length(document::text) <= 131072)
);

create table if not exists memory_game_private.daily_challenges (
  challenge_day date primary key,
  board integer[] not null check (cardinality(board) = 12)
);

create table if not exists memory_game_private.daily_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_day date not null,
  board integer[] not null check (cardinality(board) = 12),
  matched integer[] not null default '{}',
  first_index integer,
  last_pair integer[] not null default '{}',
  lock_until timestamptz,
  last_revealed_at timestamptz,
  turns integer not null default 0 check (turns >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  elapsed_ms bigint not null default 0 check (elapsed_ms >= 0),
  unique (user_id, challenge_day)
);

create index if not exists memory_game_daily_ranking_idx
  on memory_game_private.daily_sessions (challenge_day, turns, elapsed_ms, completed_at, id)
  where completed_at is not null;

alter table memory_game_private.account_state enable row level security;
alter table memory_game_private.daily_challenges enable row level security;
alter table memory_game_private.daily_sessions enable row level security;
-- There are intentionally no direct-access policies; all access uses checked RPCs.
revoke all on all tables in schema memory_game_private from public, anon, authenticated;

-- Preserve any existing daily board when this script is re-run/upgraded.
insert into memory_game_private.daily_challenges (challenge_day, board)
select distinct on (challenge_day) challenge_day, board
from memory_game_private.daily_sessions order by challenge_day, id
on conflict (challenge_day) do nothing;

create or replace function memory_game_private.require_user()
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.is_active_user() then
    raise exception 'Tài khoản không có quyền chơi.' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

create or replace function memory_game_private.load_account()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := memory_game_private.require_user();
  v_result jsonb;
begin
  select jsonb_build_object('document', s.document, 'version', s.version)
  into v_result from memory_game_private.account_state s where s.user_id = v_uid;
  return coalesce(v_result, jsonb_build_object('document', null, 'version', 0));
end;
$$;

create or replace function memory_game_private.save_account(p_document jsonb, p_expected_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := memory_game_private.require_user();
  v_version bigint;
begin
  if p_expected_version is null or p_expected_version < 0
    or p_document is null or jsonb_typeof(p_document) is distinct from 'object'
    or p_document->>'version' is distinct from '2'
    or octet_length(p_document::text) > 131072
    or jsonb_typeof(p_document->'history') is distinct from 'array'
    or jsonb_typeof(p_document->'records') is distinct from 'object'
    or coalesce(jsonb_typeof(p_document->'active'), 'missing') not in ('object', 'null') then
    raise exception 'Tiến trình không hợp lệ.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_document->'history') > 50 then
    raise exception 'Lịch sử quá dài.' using errcode = '22023';
  end if;
  if p_expected_version = 0 then
    insert into memory_game_private.account_state (user_id, document)
    values (v_uid, p_document) on conflict (user_id) do nothing
    returning version into v_version;
  else
    update memory_game_private.account_state set
      document = p_document, version = version + 1, updated_at = clock_timestamp()
    where user_id = v_uid and version = p_expected_version
    returning version into v_version;
  end if;
  if v_version is null then
    raise exception 'Một thiết bị khác đã lưu tiến trình mới.' using errcode = '40001';
  end if;
  return jsonb_build_object('version', v_version);
end;
$$;

create or replace function memory_game_private.daily_payload(
  p_session memory_game_private.daily_sessions, p_outcome text default null
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_visible integer[] := p_session.matched;
  v_first integer := p_session.first_index;
  v_second integer;
  v_revealed jsonb;
  v_elapsed bigint;
begin
  if v_first is not null then v_visible := array_append(v_visible, v_first); end if;
  if p_session.lock_until > v_now then
    v_visible := v_visible || p_session.last_pair;
    v_first := p_session.last_pair[1];
    v_second := p_session.last_pair[2];
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('index', n, 'symbol_id', p_session.board[n + 1]) order by n), '[]'::jsonb)
  into v_revealed from (select distinct unnest(v_visible) as n) visible;
  v_elapsed := case when p_session.completed_at is not null then p_session.elapsed_ms
    when p_session.started_at is not null then greatest(0, floor(extract(epoch from (v_now - p_session.started_at)) * 1000))::bigint
    else 0 end;
  return jsonb_build_object(
    'id', p_session.id, 'day', p_session.challenge_day, 'pair_count', 6,
    'status', case when p_session.completed_at is not null then 'won' when p_session.started_at is null then 'ready' else 'playing' end,
    'turns', p_session.turns, 'matched', to_jsonb(p_session.matched),
    'revealed', v_revealed, 'first', v_first, 'second', v_second,
    'lock_ms', greatest(0, ceil(extract(epoch from (p_session.lock_until - v_now)) * 1000)),
    'elapsed_ms', v_elapsed, 'started_at', p_session.started_at,
    'completed_at', p_session.completed_at, 'outcome', p_outcome
  );
end;
$$;

create or replace function memory_game_private.start_daily()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := memory_game_private.require_user();
  v_day date := (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_board integer[];
  v_session memory_game_private.daily_sessions;
begin
  -- Generate once per date on the server. A public date/seed must not let the
  -- browser derive hidden identities. Concurrent starts share the winning row.
  if not exists (select 1 from memory_game_private.daily_challenges where challenge_day = v_day) then
    select array_agg(symbol_id order by random()) into v_board
    from (
      select n as symbol_id from generate_series(0, 15) n order by random() limit 6
    ) chosen cross join generate_series(0, 1) copy;
    insert into memory_game_private.daily_challenges (challenge_day, board)
    values (v_day, v_board) on conflict (challenge_day) do nothing;
  end if;
  select board into v_board from memory_game_private.daily_challenges where challenge_day = v_day;
  insert into memory_game_private.daily_sessions (user_id, challenge_day, board)
  values (v_uid, v_day, v_board) on conflict (user_id, challenge_day) do nothing;
  select * into v_session from memory_game_private.daily_sessions
  where user_id = v_uid and challenge_day = v_day;
  return memory_game_private.daily_payload(v_session);
end;
$$;

create or replace function memory_game_private.reveal_daily(p_id uuid, p_index integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := memory_game_private.require_user();
  v_session memory_game_private.daily_sessions;
  v_now timestamptz;
  v_first integer;
  v_matched boolean;
  v_outcome text;
begin
  select * into v_session from memory_game_private.daily_sessions
  where id = p_id and user_id = v_uid for update;
  if not found then raise exception 'Không tìm thấy ván chơi.' using errcode = '42501'; end if;
  v_now := clock_timestamp();
  if v_session.challenge_day <> (v_now at time zone 'Asia/Ho_Chi_Minh')::date
    or p_index is null or p_index < 0 or p_index >= 12 then
    raise exception 'Ván chơi hết hạn hoặc vị trí không hợp lệ.' using errcode = '22023';
  end if;
  if v_session.completed_at is not null then return memory_game_private.daily_payload(v_session); end if;
  if v_session.lock_until > v_now
    or v_session.last_revealed_at > v_now - interval '100 milliseconds' then
    raise exception 'Hãy đợi thẻ úp lại.' using errcode = '55000';
  end if;
  if p_index = any(v_session.matched) or p_index = v_session.first_index then
    raise exception 'Thẻ đã mở.' using errcode = '22023';
  end if;
  if v_session.first_index is null then
    update memory_game_private.daily_sessions set
      first_index = p_index, last_pair = '{}', lock_until = null,
      started_at = coalesce(started_at, v_now), last_revealed_at = v_now
    where id = p_id returning * into v_session;
  else
    v_first := v_session.first_index;
    v_matched := v_session.board[v_first + 1] = v_session.board[p_index + 1];
    update memory_game_private.daily_sessions set
      turns = turns + 1, first_index = null, last_revealed_at = v_now,
      matched = case when v_matched then matched || array[v_first, p_index] else matched end,
      last_pair = case when v_matched then '{}'::integer[] else array[v_first, p_index] end,
      lock_until = case when v_matched then null else v_now + interval '850 milliseconds' end,
      completed_at = case when v_matched and cardinality(matched) = 10 then v_now else null end,
      elapsed_ms = case when v_matched and cardinality(matched) = 10
        then greatest(0, floor(extract(epoch from (v_now - started_at)) * 1000))::bigint else 0 end
    where id = p_id returning * into v_session;
    v_outcome := case when v_session.completed_at is not null then 'win' when v_matched then 'match' else 'mismatch' end;
  end if;
  return memory_game_private.daily_payload(v_session, v_outcome);
end;
$$;

create or replace function memory_game_private.leaderboard(p_day date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := memory_game_private.require_user(); v_result jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(ranked) order by ranked.rank), '[]'::jsonb) into v_result
  from (
    select row_number() over (order by s.turns, s.elapsed_ms, s.completed_at, s.id) as rank,
      'Người chơi ' || upper(left(md5(s.user_id::text), 6)) as display_name,
      s.turns, s.elapsed_ms, (s.user_id = v_uid) as is_mine
    from memory_game_private.daily_sessions s
    where s.challenge_day = coalesce(p_day, (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date)
      and s.completed_at is not null
    order by s.turns, s.elapsed_ms, s.completed_at, s.id limit 20
  ) ranked;
  return v_result;
end;
$$;

-- Thin invoker wrappers are the only functions exposed through the Data API.
create or replace function public.memory_game_load()
returns jsonb language sql security invoker set search_path = ''
as $$ select memory_game_private.load_account(); $$;
create or replace function public.memory_game_save(p_document jsonb, p_expected_version bigint)
returns jsonb language sql security invoker set search_path = ''
as $$ select memory_game_private.save_account(p_document, p_expected_version); $$;
create or replace function public.memory_game_daily_start()
returns jsonb language sql security invoker set search_path = ''
as $$ select memory_game_private.start_daily(); $$;
create or replace function public.memory_game_daily_reveal(p_id uuid, p_index integer)
returns jsonb language sql security invoker set search_path = ''
as $$ select memory_game_private.reveal_daily(p_id, p_index); $$;
create or replace function public.memory_game_leaderboard(p_day date default null)
returns jsonb language sql security invoker set search_path = ''
as $$ select memory_game_private.leaderboard(p_day); $$;

revoke all on all functions in schema memory_game_private from public, anon, authenticated;
grant execute on function memory_game_private.load_account(),
  memory_game_private.save_account(jsonb, bigint), memory_game_private.start_daily(),
  memory_game_private.reveal_daily(uuid, integer), memory_game_private.leaderboard(date) to authenticated;

revoke execute on function public.memory_game_load(), public.memory_game_save(jsonb, bigint),
  public.memory_game_daily_start(), public.memory_game_daily_reveal(uuid, integer),
  public.memory_game_leaderboard(date) from public, anon;
grant execute on function public.memory_game_load(), public.memory_game_save(jsonb, bigint),
  public.memory_game_daily_start(), public.memory_game_daily_reveal(uuid, integer),
  public.memory_game_leaderboard(date) to authenticated;

notify pgrst, 'reload schema';
commit;
