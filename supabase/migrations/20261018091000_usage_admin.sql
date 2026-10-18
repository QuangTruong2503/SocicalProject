-- Admin dashboard /admin/usage: read RPCs (server-side filters, aggregation,
-- keyset pagination) and audited configuration changes. Safe to re-run.
-- Requires 20261018090000_usage_ledger.sql and public.is_admin().
--
-- Implementation in usage_private; the public wrappers at the end only check
-- public.is_admin() (the project's single admin rule — never user_metadata)
-- and forward. Time ranges are [p_from, p_to); days are cut in Asia/Ho_Chi_Minh.
begin;

create or replace function usage_private.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Chỉ quản trị viên mới xem hoặc thay đổi được dữ liệu sử dụng.' using errcode = '42501';
  end if;
end;
$$;

create or replace function usage_private.check_range(p_from timestamptz, p_to timestamptz)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_from >= p_to then
    raise exception 'Khoảng thời gian không hợp lệ.' using errcode = '22023';
  end if;
  if p_to - p_from > interval '400 days' then
    raise exception 'Khoảng thời gian tối đa 400 ngày.' using errcode = '22023';
  end if;
end;
$$;

-- "user" filter: a user ID, or an exact email. Unknown → matches nothing.
create or replace function usage_private.resolve_user_filter(p_value text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when nullif(btrim(coalesce(p_value, '')), '') is null then null
    when usage_private.try_uuid(btrim(p_value)) is not null then btrim(p_value)::uuid
    else coalesce(
      (select p.id from public.profiles p where lower(p.email) = lower(btrim(p_value)) limit 1),
      '00000000-0000-0000-0000-000000000000'::uuid
    )
  end;
$$;

-- Inlinable (plain SQL, no SET clause) so the planner pushes the filters down.
create or replace function usage_private.filtered_requests(p_from timestamptz, p_to timestamptz, p_user uuid, f jsonb)
returns setof usage_private.ai_usage_requests
language sql
stable
as $$
  select r.*
  from usage_private.ai_usage_requests r
  where r.created_at >= p_from and r.created_at < p_to
    and (p_user is null or r.user_id = p_user)
    and (nullif(f->>'feature', '') is null or r.feature = f->>'feature')
    and (nullif(f->>'status', '') is null or r.status = f->>'status')
    and (nullif(f->>'keyAlias', '') is null or r.key_alias = f->>'keyAlias')
    and (nullif(f->>'environment', '') is null or r.environment = f->>'environment')
    and (nullif(f->>'model', '') is null or r.requested_model = f->>'model'
      or exists (select 1 from usage_private.ai_usage_attempts a where a.request_id = r.id and a.resolved_model = f->>'model'))
$$;

create or replace function usage_private.filtered_events(p_from timestamptz, p_to timestamptz, p_user uuid, f jsonb)
returns setof usage_private.usage_activity_events
language sql
stable
as $$
  select e.*
  from usage_private.usage_activity_events e
  where e.received_at >= p_from and e.received_at < p_to
    and (p_user is null or e.user_id = p_user)
    and (usage_private.try_uuid(f->>'visitor') is null or e.visitor_id = (f->>'visitor')::uuid)
    and (nullif(f->>'feature', '') is null or e.feature = f->>'feature')
    and (nullif(f->>'action', '') is null or e.action = f->>'action')
    and (nullif(f->>'status', '') is null or e.status = f->>'status')
$$;

-- Month-to-date estimated spend per active budget (current Vietnam month).
create or replace function usage_private.budget_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with m as (select usage_private.vn_month_start(now()) as month_start),
  b as (
    select
      bu.*,
      s.spent,
      s.incomplete,
      round(s.spent / bu.monthly_limit_usd * 100, 2) as percent
    from usage_private.budgets bu
    cross join m
    cross join lateral (
      select
        coalesce(sum(a.estimated_cost_usd), 0) as spent,
        count(*) filter (where a.cost_status in ('unknown', 'unpriced')) as incomplete
      from usage_private.ai_usage_attempts a
      join usage_private.ai_usage_requests r on r.id = a.request_id
      where r.created_at >= m.month_start
        and (bu.scope = 'global'
          or (bu.scope = 'key_alias' and r.key_alias = bu.scope_value)
          or (bu.scope = 'user' and r.user_id::text = bu.scope_value))
    ) s
    where bu.active
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id,
    'scope', b.scope,
    'scope_value', b.scope_value,
    'scope_label', case when b.scope = 'user' then (select p.email from public.profiles p where p.id::text = b.scope_value) end,
    'monthly_limit_usd', b.monthly_limit_usd,
    'alert_thresholds', to_jsonb(b.alert_thresholds),
    'spent_usd', b.spent,
    'percent', b.percent,
    'level', (select max(t) from unnest(b.alert_thresholds) t where t <= b.percent),
    'incomplete_attempts', b.incomplete,
    'month_start', (select month_start from m)
  ) order by b.percent desc), '[]'::jsonb)
  from b;
$$;

-- ─── Overview ───────────────────────────────────────────────────────────────

create or replace function usage_private.admin_overview(p_from timestamptz, p_to timestamptz, p_filters jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_user uuid := usage_private.resolve_user_filter(f->>'user');
  v_activity jsonb;
  v_ai jsonb;
  v_series jsonb;
  v_top jsonb;
  v_errors jsonb;
  v_attempt_errors jsonb;
  v_cohort jsonb;
  v_health jsonb;
  v_options jsonb;
  v_legacy bigint;
  s usage_private.settings;
begin
  perform usage_private.check_range(p_from, p_to);
  select * into s from usage_private.settings where id = 1;

  -- Activity (browser-reported). Downloads count images actually handed over,
  -- not images merely prepared or added to an unfinished ZIP.
  select jsonb_build_object(
    'events', count(*),
    'create_operations', count(*) filter (where action = 'image.create'),
    'images_created', coalesce(sum(succeeded_count) filter (where action = 'image.create'), 0),
    'images_create_failed', coalesce(sum(failed_count) filter (where action = 'image.create'), 0),
    'download_operations', count(*) filter (where action = 'image.download' and succeeded_count > 0),
    'download_cancelled', count(*) filter (where action = 'image.download' and status = 'cancelled'),
    'download_failed', count(*) filter (where action = 'image.download' and status = 'failed'),
    'images_downloaded', coalesce(sum(succeeded_count) filter (where action = 'image.download'), 0),
    'images_written', coalesce(sum(succeeded_count) filter (where action = 'image.download' and delivery = 'file_written'), 0),
    'zip_files', coalesce(sum(output_file_count) filter (where action = 'image.download' and download_method = 'zip' and succeeded_count > 0), 0),
    'apply_operations', count(distinct operation_id) filter (where action = 'ai.naming.apply'),
    'names_applied', coalesce(sum(succeeded_count) filter (where action = 'ai.naming.apply'), 0),
    'active_users', count(distinct user_id) filter (where subject_type = 'user'),
    'distinct_visitors', count(distinct visitor_id) filter (where subject_type = 'visitor')
  )
  into v_activity
  from usage_private.filtered_events(p_from, p_to, v_user, f);

  -- AI ledger. Tokens and cost come from attempts only (never request + attempt).
  with r as (select * from usage_private.filtered_requests(p_from, p_to, v_user, f)),
  a as (
    select a.*, r.images_requested as req_images
    from usage_private.ai_usage_attempts a
    join r on r.id = a.request_id
  )
  select jsonb_build_object(
    'runs', (select count(distinct ai_run_id) from r where status <> 'rejected'),
    'requests', (select count(*) from r where status <> 'rejected'),
    'requests_by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) as n from r group by status) x),
    'rejected', (select count(*) from r where status = 'rejected'),
    'images_requested', (select coalesce(sum(images_requested), 0) from r where status <> 'rejected'),
    'images_succeeded', (select coalesce(sum(images_succeeded), 0) from r),
    'images_failed', (select coalesce(sum(images_failed), 0) from r),
    'needs_review', (select coalesce(sum(needs_review_count), 0) from r),
    'replays', (select coalesce(sum(replay_count), 0) from r),
    'requests_with_retry', (select count(distinct request_id) from a where attempt_number > 1),
    'requests_called', (select count(distinct request_id) from a),
    'attempts', (select count(*) from a),
    'provider_image_sends', (select coalesce(sum(req_images), 0) from a),
    'input_tokens', (select coalesce(sum(input_tokens), 0) from a),
    'cached_input_tokens', (select coalesce(sum(cached_input_tokens), 0) from a),
    'cache_write_tokens', (select coalesce(sum(cache_write_tokens), 0) from a),
    'output_tokens', (select coalesce(sum(output_tokens), 0) from a),
    'reasoning_tokens', (select coalesce(sum(reasoning_tokens), 0) from a),
    'total_tokens', (select coalesce(sum(coalesce(total_tokens, input_tokens + output_tokens)), 0) from a),
    'estimated_cost_usd', (select coalesce(sum(estimated_cost_usd), 0) from a),
    'attempts_estimated', (select count(*) from a where cost_status = 'estimated'),
    'attempts_unpriced', (select count(*) from a where cost_status = 'unpriced'),
    'attempts_usage_unknown', (select count(*) from a where usage_status = 'unknown'),
    'attempts_usage_missing', (select count(*) from a where usage_status = 'missing'),
    'attempts_open', (select count(*) from a where status = 'running')
  )
  into v_ai;

  -- One point per Vietnam calendar day in the range.
  with days as (
    select d::date as day
    from generate_series(
      (p_from at time zone 'Asia/Ho_Chi_Minh')::date,
      ((p_to - interval '1 microsecond') at time zone 'Asia/Ho_Chi_Minh')::date,
      interval '1 day'
    ) d
  ),
  r as (select * from usage_private.filtered_requests(p_from, p_to, v_user, f)),
  rq as (
    select (created_at at time zone 'Asia/Ho_Chi_Minh')::date as day,
      count(*) filter (where status <> 'rejected') as requests,
      count(*) filter (where status = 'rejected') as rejected,
      count(*) filter (where status in ('failed', 'unknown')) as failed
    from r group by 1
  ),
  at as (
    select (r.created_at at time zone 'Asia/Ho_Chi_Minh')::date as day,
      count(*) as attempts,
      count(*) filter (where a.attempt_number > 1) as retries,
      coalesce(sum(coalesce(a.total_tokens, a.input_tokens + a.output_tokens)), 0) as tokens,
      coalesce(sum(a.estimated_cost_usd), 0) as cost,
      count(*) filter (where a.cost_status in ('unknown', 'unpriced')) as cost_incomplete
    from usage_private.ai_usage_attempts a join r on r.id = a.request_id
    group by 1
  ),
  ev as (
    select (received_at at time zone 'Asia/Ho_Chi_Minh')::date as day,
      coalesce(sum(succeeded_count) filter (where action = 'image.create'), 0) as images_created,
      coalesce(sum(succeeded_count) filter (where action = 'image.download'), 0) as images_downloaded
    from usage_private.filtered_events(p_from, p_to, v_user, f)
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'day', to_char(d.day, 'YYYY-MM-DD'),
    'requests', coalesce(rq.requests, 0),
    'rejected', coalesce(rq.rejected, 0),
    'failed', coalesce(rq.failed, 0),
    'attempts', coalesce(at.attempts, 0),
    'retries', coalesce(at.retries, 0),
    'tokens', coalesce(at.tokens, 0),
    'cost_usd', coalesce(at.cost, 0),
    'cost_incomplete', coalesce(at.cost_incomplete, 0),
    'images_created', coalesce(ev.images_created, 0),
    'images_downloaded', coalesce(ev.images_downloaded, 0)
  ) order by d.day), '[]'::jsonb)
  into v_series
  from days d
  left join rq on rq.day = d.day
  left join at on at.day = d.day
  left join ev on ev.day = d.day;

  -- Top users by estimated cost. Names are read live from profiles (no snapshot).
  with r as (select * from usage_private.filtered_requests(p_from, p_to, v_user, f) where status <> 'rejected'),
  per_user as (
    select r.user_id,
      count(distinct r.id) as requests,
      count(a.id) as attempts,
      coalesce(sum(r.images_requested) filter (where a.attempt_number = 1 or a.id is null), 0) as images,
      coalesce(sum(coalesce(a.total_tokens, a.input_tokens + a.output_tokens)), 0) as tokens,
      coalesce(sum(a.estimated_cost_usd), 0) as cost,
      count(a.id) filter (where a.cost_status in ('unknown', 'unpriced')) as cost_incomplete
    from r left join usage_private.ai_usage_attempts a on a.request_id = r.id
    group by r.user_id
    order by coalesce(sum(a.estimated_cost_usd), 0) desc, count(distinct r.id) desc
    limit 10
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', u.user_id,
    'email', p.email,
    'name', coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.username), '')),
    'requests', u.requests,
    'attempts', u.attempts,
    'images', u.images,
    'tokens', u.tokens,
    'cost_usd', u.cost,
    'cost_incomplete', u.cost_incomplete
  ) order by u.cost desc, u.requests desc), '[]'::jsonb)
  into v_top
  from per_user u
  left join public.profiles p on p.id = u.user_id;

  select coalesce(jsonb_agg(jsonb_build_object('status', status, 'code', code, 'count', n) order by n desc), '[]'::jsonb)
  into v_errors
  from (
    select status, coalesce(error_code, 'none') as code, count(*) as n
    from usage_private.filtered_requests(p_from, p_to, v_user, f)
    where status in ('failed', 'partial', 'rejected', 'unknown')
    group by status, coalesce(error_code, 'none')
    order by count(*) desc
    limit 15
  ) x;

  with r as (select * from usage_private.filtered_requests(p_from, p_to, v_user, f))
  select coalesce(jsonb_agg(jsonb_build_object('status', status, 'code', code, 'count', n) order by n desc), '[]'::jsonb)
  into v_attempt_errors
  from (
    select a.status, coalesce(a.error_code, 'none') as code, count(*) as n
    from usage_private.ai_usage_attempts a join r on r.id = a.request_id
    where a.status in ('failed', 'unknown')
    group by a.status, coalesce(a.error_code, 'none')
    order by count(*) desc
    limit 15
  ) x;

  -- Cohort: AI runs whose first request falls in the range, followed to the
  -- end (applies made later still count). Apply events are browser-reported.
  with candidate as (
    select distinct ai_run_id from usage_private.filtered_requests(p_from, p_to, v_user, f)
    where ai_run_id is not null and status <> 'rejected'
  ),
  runs as (
    select r.ai_run_id, min(r.created_at) as first_at, coalesce(sum(r.images_succeeded), 0) as suggested,
      bool_or(r.status = 'running') as open
    from usage_private.ai_usage_requests r
    join candidate c on c.ai_run_id = r.ai_run_id
    where r.status <> 'rejected'
    group by r.ai_run_id
    having min(r.created_at) >= p_from
  ),
  applied as (
    select e.ai_run_id,
      coalesce(sum((e.metadata->>'ai_unchanged_count')::integer), 0) as unchanged,
      coalesce(sum(e.succeeded_count), 0) as total
    from usage_private.usage_activity_events e
    join runs on runs.ai_run_id = e.ai_run_id
    where e.action = 'ai.naming.apply'
    group by e.ai_run_id
  )
  select jsonb_build_object(
    'runs', count(*),
    'runs_open', count(*) filter (where runs.open),
    'runs_applied', count(applied.ai_run_id),
    'suggested', coalesce(sum(runs.suggested), 0),
    'applied_unchanged', coalesce(sum(applied.unchanged), 0),
    'applied_total', coalesce(sum(applied.total), 0)
  )
  into v_cohort
  from runs left join applied on applied.ai_run_id = runs.ai_run_id;

  select jsonb_build_object(
    'tracking_started_at', s.tracking_started_at,
    'ai_enabled', s.ai_enabled,
    'paused_reason', s.paused_reason,
    'quota_enforced', s.quota_enforced,
    'running_now', (select count(*) from usage_private.ai_usage_requests where status = 'running' and lease_expires_at > now()),
    'stale_running', (select count(*) from usage_private.ai_usage_requests where status = 'running' and lease_expires_at <= now()),
    'oldest_running_at', (select min(created_at) from usage_private.ai_usage_requests where status = 'running'),
    'unknown_in_range', (select count(*) from usage_private.filtered_requests(p_from, p_to, v_user, f) where status = 'unknown'),
    'swept_in_range', (select count(*) from usage_private.filtered_requests(p_from, p_to, v_user, f) where finish_source = 'sweeper'),
    'first_activity_at', (select min(received_at) from usage_private.usage_activity_events),
    'last_activity_at', (select max(received_at) from usage_private.usage_activity_events),
    'first_request_at', (select min(created_at) from usage_private.ai_usage_requests),
    'last_request_at', (select max(created_at) from usage_private.ai_usage_requests),
    'usd_to_vnd', s.usd_to_vnd,
    'usd_to_vnd_as_of', s.usd_to_vnd_as_of
  )
  into v_health;

  with r as (select * from usage_private.filtered_requests(p_from, p_to, null, '{}'::jsonb))
  select jsonb_build_object(
    'models', coalesce((select jsonb_agg(m order by m) from (
      select requested_model as m from r where requested_model is not null
      union
      select a.resolved_model from usage_private.ai_usage_attempts a join r on r.id = a.request_id where a.resolved_model is not null
    ) x), '[]'::jsonb),
    'key_aliases', coalesce((select jsonb_agg(distinct key_alias) from r where key_alias is not null), '[]'::jsonb),
    'environments', coalesce((select jsonb_agg(distinct environment) from r), '[]'::jsonb)
  )
  into v_options;

  -- Old counter, shown side by side for reference only (never added to the new numbers).
  if to_regclass('public.watermark_image_counts') is not null then
    execute 'select coalesce(sum(image_count), 0) from public.watermark_image_counts
             where created_at >= $1 and created_at < $2 and ($3::uuid is null or user_id = $3)'
    into v_legacy using p_from, p_to, v_user;
  end if;

  return jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to, 'timezone', 'Asia/Ho_Chi_Minh'),
    'activity', v_activity,
    'ai', v_ai,
    'series', v_series,
    'top_users', v_top,
    'request_errors', v_errors,
    'attempt_errors', v_attempt_errors,
    'apply_cohort', v_cohort,
    'health', v_health,
    'budgets', usage_private.budget_status(),
    'options', v_options,
    'legacy_watermark_images', v_legacy
  );
end;
$$;

-- ─── Lists (keyset pagination on (time, id) descending) ────────────────────

create or replace function usage_private.admin_activity(
  p_from timestamptz,
  p_to timestamptz,
  p_filters jsonb,
  p_cursor jsonb,
  p_limit integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 5000);
  v_cursor_at timestamptz := (p_cursor->>'at')::timestamptz;
  v_cursor_id uuid := usage_private.try_uuid(p_cursor->>'id');
  v_operation uuid := usage_private.try_uuid(f->>'operation');
  v_rows jsonb;
  v_has_more boolean;
  v_last jsonb;
begin
  perform usage_private.check_range(p_from, p_to);

  select coalesce(jsonb_agg(to_jsonb(x) order by x.received_at desc, x.event_id desc), '[]'::jsonb)
  into v_rows
  from (
    select e.event_id, e.operation_id, e.image_batch_id, e.ai_run_id, e.subject_type, e.user_id, e.visitor_id,
      p.email as user_email, coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.username), '')) as user_name,
      e.feature, e.action, e.source_page, e.status,
      e.requested_count, e.succeeded_count, e.failed_count, e.skipped_count, e.cancelled_count, e.prepared_count,
      e.duration_ms, e.error_code, e.download_method, e.image_size, e.delivery, e.output_file_count, e.images_in_files,
      e.occurred_at, e.received_at, e.metadata, e.legacy
    from usage_private.filtered_events(p_from, p_to, usage_private.resolve_user_filter(f->>'user'), f) e
    left join public.profiles p on p.id = e.user_id
    where (v_cursor_at is null or (e.received_at, e.event_id) < (v_cursor_at, v_cursor_id))
      and (v_operation is null or e.operation_id = v_operation or e.image_batch_id = v_operation or e.ai_run_id = v_operation)
    order by e.received_at desc, e.event_id desc
    limit v_limit + 1
  ) x;

  v_has_more := jsonb_array_length(v_rows) > v_limit;
  if v_has_more then
    v_rows := v_rows - v_limit;
  end if;
  v_last := v_rows->(jsonb_array_length(v_rows) - 1);

  return jsonb_build_object(
    'rows', v_rows,
    'has_more', v_has_more,
    'next_cursor', case when v_has_more then jsonb_build_object('at', v_last->>'received_at', 'id', v_last->>'event_id') end
  );
end;
$$;

create or replace function usage_private.admin_requests(
  p_from timestamptz,
  p_to timestamptz,
  p_filters jsonb,
  p_cursor jsonb,
  p_limit integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 5000);
  v_cursor_at timestamptz := (p_cursor->>'at')::timestamptz;
  v_cursor_id uuid := usage_private.try_uuid(p_cursor->>'id');
  v_lookup text := nullif(btrim(coalesce(f->>'requestId', '')), '');
  v_rows jsonb;
  v_has_more boolean;
  v_last jsonb;
begin
  -- A request/provider ID lookup ignores the time range and other filters.
  if v_lookup is null then
    perform usage_private.check_range(p_from, p_to);
  elsif char_length(v_lookup) > 128 then
    raise exception 'Mã tra cứu không hợp lệ.' using errcode = '22023';
  end if;

  with r as (
    select * from usage_private.filtered_requests(p_from, p_to, usage_private.resolve_user_filter(f->>'user'), f)
    where v_lookup is null
    union all
    select r2.* from usage_private.ai_usage_requests r2
    where v_lookup is not null and (
      r2.id = usage_private.try_uuid(v_lookup)
      or r2.client_request_id = usage_private.try_uuid(v_lookup)
      or r2.ai_run_id = usage_private.try_uuid(v_lookup)
      or exists (select 1 from usage_private.ai_usage_attempts a
                 where a.request_id = r2.id and (a.provider_request_id = v_lookup or a.provider_response_id = v_lookup))
    )
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id desc), '[]'::jsonb)
  into v_rows
  from (
    select r.id, r.client_request_id, r.ai_run_id, r.user_id,
      p.email as user_email, coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.username), '')) as user_name,
      r.feature, r.provider, r.endpoint, r.environment, r.key_alias, r.requested_model, r.status, r.error_code, r.http_status,
      r.images_requested, r.images_succeeded, r.images_failed, r.needs_review_count, r.replay_count,
      r.created_at, r.finished_at, r.finish_source,
      agg.attempts, agg.resolved_model, agg.latency_ms, agg.input_tokens, agg.cached_input_tokens, agg.output_tokens,
      agg.total_tokens, agg.estimated_cost_usd, agg.attempts_estimated, agg.usage_unknown
    from r
    left join public.profiles p on p.id = r.user_id
    cross join lateral (
      select count(*) as attempts,
        (array_agg(a.resolved_model order by a.attempt_number desc) filter (where a.resolved_model is not null))[1] as resolved_model,
        sum(a.latency_ms) as latency_ms,
        sum(a.input_tokens) as input_tokens,
        sum(a.cached_input_tokens) as cached_input_tokens,
        sum(a.output_tokens) as output_tokens,
        sum(coalesce(a.total_tokens, a.input_tokens + a.output_tokens)) as total_tokens,
        sum(a.estimated_cost_usd) as estimated_cost_usd,
        count(*) filter (where a.cost_status = 'estimated') as attempts_estimated,
        count(*) filter (where a.usage_status in ('unknown', 'missing')) as usage_unknown
      from usage_private.ai_usage_attempts a
      where a.request_id = r.id
    ) agg
    where v_cursor_at is null or (r.created_at, r.id) < (v_cursor_at, v_cursor_id)
    order by r.created_at desc, r.id desc
    limit v_limit + 1
  ) x;

  v_has_more := jsonb_array_length(v_rows) > v_limit;
  if v_has_more then
    v_rows := v_rows - v_limit;
  end if;
  v_last := v_rows->(jsonb_array_length(v_rows) - 1);

  return jsonb_build_object(
    'rows', v_rows,
    'has_more', v_has_more,
    'next_cursor', case when v_has_more then jsonb_build_object('at', v_last->>'created_at', 'id', v_last->>'id') end
  );
end;
$$;

create or replace function usage_private.admin_request_detail(p_request_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'request', to_jsonb(r) || jsonb_build_object(
      'user_email', p.email,
      'user_name', coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.username), ''))
    ),
    'attempts', coalesce((
      select jsonb_agg(to_jsonb(a) - 'request_id' order by a.attempt_number)
      from usage_private.ai_usage_attempts a where a.request_id = r.id
    ), '[]'::jsonb)
  )
  from usage_private.ai_usage_requests r
  left join public.profiles p on p.id = r.user_id
  where r.id = p_request_id;
$$;

-- Everything that shares an operation, image batch or AI run ID.
create or replace function usage_private.admin_operation(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'events', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.received_at, e.event_id)
      from (
        select * from usage_private.usage_activity_events
        where operation_id = p_id or image_batch_id = p_id or ai_run_id = p_id
        order by received_at, event_id
        limit 200
      ) e
    ), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'status', r.status, 'error_code', r.error_code, 'images_requested', r.images_requested,
        'images_succeeded', r.images_succeeded, 'created_at', r.created_at,
        'attempts', (select count(*) from usage_private.ai_usage_attempts a where a.request_id = r.id),
        'estimated_cost_usd', (select sum(a.estimated_cost_usd) from usage_private.ai_usage_attempts a where a.request_id = r.id)
      ) order by r.created_at)
      from (select * from usage_private.ai_usage_requests where ai_run_id = p_id order by created_at limit 200) r
    ), '[]'::jsonb)
  );
$$;

-- ─── Configuration ──────────────────────────────────────────────────────────

create or replace function usage_private.admin_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'settings', (select to_jsonb(s) from usage_private.settings s where s.id = 1),
    'plan_quotas', coalesce((select jsonb_agg(to_jsonb(q) order by q.plan) from usage_private.plan_quotas q), '[]'::jsonb),
    'user_quotas', coalesce((
      select jsonb_agg(to_jsonb(o) || jsonb_build_object('email', p.email) order by p.email)
      from usage_private.user_quota_overrides o left join public.profiles p on p.id = o.user_id
    ), '[]'::jsonb),
    'budgets', coalesce((select jsonb_agg(to_jsonb(b) order by b.scope, b.scope_value) from usage_private.budgets b), '[]'::jsonb),
    'budget_status', usage_private.budget_status(),
    'prices', coalesce((
      select jsonb_agg(to_jsonb(mp) order by mp.provider, mp.model, mp.service_tier, mp.max_input_tokens nulls last, mp.effective_from desc)
      from usage_private.model_prices mp
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select c.id, c.action, c.target, c.before_value, c.after_value, c.created_at, c.actor_id, p.email as actor_email
        from usage_private.config_audit c left join public.profiles p on p.id = c.actor_id
        order by c.created_at desc
        limit 50
      ) x
    ), '[]'::jsonb)
  );
$$;

create or replace function usage_private.audit(p_action text, p_target text, p_before jsonb, p_after jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into usage_private.config_audit (actor_id, action, target, before_value, after_value)
  values (auth.uid(), p_action, p_target, p_before, p_after);
$$;

/**
 * Every admin change goes through here and is audited (before/after values).
 * Actions: settings.update, plan_quota.upsert, user_quota.upsert,
 * user_quota.delete, budget.upsert, budget.delete, price.add.
 */
create or replace function usage_private.admin_config_change(p_action text, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb := coalesce(p, '{}'::jsonb);
  v_allowed text[] := array[
    'ai_enabled', 'paused_reason', 'window_seconds', 'max_requests_per_window', 'max_images_per_window',
    'max_concurrent_per_user', 'max_concurrent_total', 'lease_ttl_seconds', 'quota_enforced',
    'activity_max_events_per_minute', 'usd_to_vnd', 'usd_to_vnd_as_of'
  ];
  v_key text;
  v_old_settings usage_private.settings;
  v_new_settings usage_private.settings;
  v_before jsonb;
  v_after jsonb;
  v_user uuid;
  v_plan text;
  v_budget_id uuid;
  v_price usage_private.model_prices;
  v_from timestamptz;
  v_backfilled integer := 0;
  v_attempt record;
  v_match usage_private.model_prices;
  v_cost numeric;
begin
  if p_action = 'settings.update' then
    for v_key in select jsonb_object_keys(v_payload) loop
      if not v_key = any(v_allowed) then
        raise exception 'Không thể đổi thiết lập "%".', v_key using errcode = '22023';
      end if;
    end loop;

    select * into v_old_settings from usage_private.settings where id = 1 for update;
    v_new_settings := jsonb_populate_record(v_old_settings, v_payload);

    update usage_private.settings set
      ai_enabled = v_new_settings.ai_enabled,
      paused_reason = nullif(btrim(coalesce(v_new_settings.paused_reason, '')), ''),
      window_seconds = v_new_settings.window_seconds,
      max_requests_per_window = v_new_settings.max_requests_per_window,
      max_images_per_window = v_new_settings.max_images_per_window,
      max_concurrent_per_user = v_new_settings.max_concurrent_per_user,
      max_concurrent_total = v_new_settings.max_concurrent_total,
      lease_ttl_seconds = v_new_settings.lease_ttl_seconds,
      quota_enforced = v_new_settings.quota_enforced,
      activity_max_events_per_minute = v_new_settings.activity_max_events_per_minute,
      usd_to_vnd = v_new_settings.usd_to_vnd,
      usd_to_vnd_as_of = v_new_settings.usd_to_vnd_as_of,
      updated_at = now(),
      updated_by = auth.uid()
    where id = 1
    returning * into v_new_settings;

    select jsonb_object_agg(k, to_jsonb(v_old_settings)->k) into v_before from unnest(v_allowed) k;
    select jsonb_object_agg(k, to_jsonb(v_new_settings)->k) into v_after from unnest(v_allowed) k;
    perform usage_private.audit(p_action, 'settings', v_before, v_after);
    return jsonb_build_object('ok', true);

  elsif p_action = 'plan_quota.upsert' then
    v_plan := v_payload->>'plan';
    select to_jsonb(q) into v_before from usage_private.plan_quotas q where plan = v_plan;
    if v_payload->'daily_image_limit' is null or jsonb_typeof(v_payload->'daily_image_limit') = 'null' then
      if v_payload->'monthly_image_limit' is null or jsonb_typeof(v_payload->'monthly_image_limit') = 'null' then
        delete from usage_private.plan_quotas where plan = v_plan;
        perform usage_private.audit(p_action, 'plan:' || coalesce(v_plan, ''), v_before, null);
        return jsonb_build_object('ok', true);
      end if;
    end if;
    insert into usage_private.plan_quotas (plan, daily_image_limit, monthly_image_limit, updated_at, updated_by)
    values (v_plan, (v_payload->>'daily_image_limit')::integer, (v_payload->>'monthly_image_limit')::integer, now(), auth.uid())
    on conflict (plan) do update set
      daily_image_limit = excluded.daily_image_limit,
      monthly_image_limit = excluded.monthly_image_limit,
      updated_at = now(),
      updated_by = auth.uid();
    select to_jsonb(q) - 'updated_at' - 'updated_by' into v_after from usage_private.plan_quotas q where plan = v_plan;
    perform usage_private.audit(p_action, 'plan:' || v_plan, v_before - 'updated_at' - 'updated_by', v_after);
    return jsonb_build_object('ok', true);

  elsif p_action in ('user_quota.upsert', 'user_quota.delete') then
    v_user := usage_private.resolve_user_filter(v_payload->>'user');
    if v_user is null or not exists (select 1 from public.profiles where id = v_user) then
      raise exception 'Không tìm thấy người dùng.' using errcode = 'P0002';
    end if;
    select to_jsonb(o) - 'updated_at' - 'updated_by' into v_before from usage_private.user_quota_overrides o where user_id = v_user;
    if p_action = 'user_quota.delete' then
      delete from usage_private.user_quota_overrides where user_id = v_user;
      v_after := null;
    else
      insert into usage_private.user_quota_overrides (user_id, daily_image_limit, monthly_image_limit, unlimited, note, updated_at, updated_by)
      values (v_user, (v_payload->>'daily_image_limit')::integer, (v_payload->>'monthly_image_limit')::integer,
        coalesce((v_payload->>'unlimited')::boolean, false), nullif(btrim(coalesce(v_payload->>'note', '')), ''), now(), auth.uid())
      on conflict (user_id) do update set
        daily_image_limit = excluded.daily_image_limit,
        monthly_image_limit = excluded.monthly_image_limit,
        unlimited = excluded.unlimited,
        note = excluded.note,
        updated_at = now(),
        updated_by = auth.uid();
      select to_jsonb(o) - 'updated_at' - 'updated_by' into v_after from usage_private.user_quota_overrides o where user_id = v_user;
    end if;
    perform usage_private.audit(p_action, 'user:' || v_user, v_before, v_after);
    return jsonb_build_object('ok', true);

  elsif p_action in ('budget.upsert', 'budget.delete') then
    v_budget_id := usage_private.try_uuid(v_payload->>'id');
    if v_budget_id is not null then
      select to_jsonb(b) - 'updated_at' - 'updated_by' - 'created_at' into v_before from usage_private.budgets b where id = v_budget_id;
      if v_before is null then
        raise exception 'Không tìm thấy ngân sách.' using errcode = 'P0002';
      end if;
    end if;

    if p_action = 'budget.delete' then
      delete from usage_private.budgets where id = v_budget_id;
      perform usage_private.audit(p_action, 'budget:' || v_budget_id, v_before, null);
      return jsonb_build_object('ok', true);
    end if;

    if v_payload->>'scope' = 'user' then
      v_user := usage_private.resolve_user_filter(v_payload->>'scope_value');
      if v_user is null or not exists (select 1 from public.profiles where id = v_user) then
        raise exception 'Không tìm thấy người dùng.' using errcode = 'P0002';
      end if;
      v_payload := v_payload || jsonb_build_object('scope_value', v_user::text);
    end if;

    if v_budget_id is null then
      insert into usage_private.budgets (scope, scope_value, monthly_limit_usd, alert_thresholds, active, note, updated_by)
      values (
        v_payload->>'scope',
        case when v_payload->>'scope' = 'global' then null else nullif(btrim(coalesce(v_payload->>'scope_value', '')), '') end,
        (v_payload->>'monthly_limit_usd')::numeric,
        coalesce((select array_agg(t::integer order by t::integer) from jsonb_array_elements_text(v_payload->'alert_thresholds') t), '{70,90,100}'),
        coalesce((v_payload->>'active')::boolean, true),
        nullif(btrim(coalesce(v_payload->>'note', '')), ''),
        auth.uid()
      )
      returning id into v_budget_id;
    else
      update usage_private.budgets set
        monthly_limit_usd = coalesce((v_payload->>'monthly_limit_usd')::numeric, monthly_limit_usd),
        alert_thresholds = coalesce((select array_agg(t::integer order by t::integer) from jsonb_array_elements_text(v_payload->'alert_thresholds') t), alert_thresholds),
        active = coalesce((v_payload->>'active')::boolean, active),
        note = case when v_payload ? 'note' then nullif(btrim(coalesce(v_payload->>'note', '')), '') else note end,
        updated_at = now(),
        updated_by = auth.uid()
      where id = v_budget_id;
    end if;

    select to_jsonb(b) - 'updated_at' - 'updated_by' - 'created_at' into v_after from usage_private.budgets b where id = v_budget_id;
    perform usage_private.audit(p_action, 'budget:' || v_budget_id, v_before, v_after);
    return jsonb_build_object('ok', true, 'id', v_budget_id);

  elsif p_action = 'price.add' then
    v_from := coalesce((v_payload->>'effective_from')::timestamptz, now());

    -- History is append-only: a new price cannot start before the current one.
    if exists (
      select 1 from usage_private.model_prices mp
      where mp.provider = coalesce(v_payload->>'provider', 'openai')
        and mp.model = v_payload->>'model'
        and mp.service_tier = coalesce(nullif(v_payload->>'service_tier', ''), 'default')
        and coalesce(mp.max_input_tokens, 0) = coalesce((v_payload->>'max_input_tokens')::integer, 0)
        and mp.effective_from >= v_from
    ) then
      raise exception 'Đã có giá bắt đầu từ thời điểm này hoặc muộn hơn; chỉ thêm được giá mới cho tương lai.' using errcode = '22023';
    end if;

    update usage_private.model_prices mp set effective_to = v_from
    where mp.provider = coalesce(v_payload->>'provider', 'openai')
      and mp.model = v_payload->>'model'
      and mp.service_tier = coalesce(nullif(v_payload->>'service_tier', ''), 'default')
      and coalesce(mp.max_input_tokens, 0) = coalesce((v_payload->>'max_input_tokens')::integer, 0)
      and mp.effective_to is null;

    insert into usage_private.model_prices (
      provider, model, match_snapshots, service_tier, max_input_tokens,
      input_usd_per_mtok, cached_input_usd_per_mtok, cache_write_usd_per_mtok, output_usd_per_mtok,
      effective_from, version, source_url, created_by
    )
    values (
      coalesce(v_payload->>'provider', 'openai'),
      v_payload->>'model',
      coalesce((v_payload->>'match_snapshots')::boolean, true),
      coalesce(nullif(v_payload->>'service_tier', ''), 'default'),
      (v_payload->>'max_input_tokens')::integer,
      (v_payload->>'input_usd_per_mtok')::numeric,
      (v_payload->>'cached_input_usd_per_mtok')::numeric,
      (v_payload->>'cache_write_usd_per_mtok')::numeric,
      (v_payload->>'output_usd_per_mtok')::numeric,
      v_from,
      v_payload->>'version',
      nullif(v_payload->>'source_url', ''),
      auth.uid()
    )
    returning * into v_price;

    -- Optional: price attempts that were stored without a price ("unpriced").
    -- Attempts that already have an estimate are never changed.
    if coalesce((v_payload->>'backfill_unpriced')::boolean, false) then
      for v_attempt in
        select a.id, a.started_at, a.input_tokens, a.cached_input_tokens, a.cache_write_tokens, a.output_tokens,
          coalesce(a.resolved_model, r.requested_model) as model, usage_private.normalize_tier(a.service_tier) as tier, r.provider
        from usage_private.ai_usage_attempts a
        join usage_private.ai_usage_requests r on r.id = a.request_id
        where a.cost_status = 'unpriced' and a.started_at >= v_price.effective_from
        for update of a
      loop
        select * into v_match from usage_private.find_price(v_attempt.provider, v_attempt.model, v_attempt.tier, v_attempt.started_at, v_attempt.input_tokens);
        continue when v_match.id is distinct from v_price.id;
        v_cost := usage_private.estimate_cost_usd(v_attempt.input_tokens, v_attempt.cached_input_tokens, v_attempt.cache_write_tokens, v_attempt.output_tokens,
          v_match.input_usd_per_mtok, v_match.cached_input_usd_per_mtok, v_match.cache_write_usd_per_mtok, v_match.output_usd_per_mtok);
        continue when v_cost is null;
        update usage_private.ai_usage_attempts set
          cost_status = 'estimated', estimated_cost_usd = v_cost, price_id = v_match.id, price_version = v_match.version,
          price_input_usd_per_mtok = v_match.input_usd_per_mtok,
          price_cached_input_usd_per_mtok = v_match.cached_input_usd_per_mtok,
          price_cache_write_usd_per_mtok = v_match.cache_write_usd_per_mtok,
          price_output_usd_per_mtok = v_match.output_usd_per_mtok,
          updated_at = now()
        where id = v_attempt.id;
        v_backfilled := v_backfilled + 1;
      end loop;
    end if;

    perform usage_private.audit(p_action, 'price:' || v_price.model || ':' || v_price.service_tier, null,
      to_jsonb(v_price) - 'created_at' - 'created_by' || jsonb_build_object('backfilled_attempts', v_backfilled));
    return jsonb_build_object('ok', true, 'id', v_price.id, 'backfilled', v_backfilled);
  end if;

  raise exception 'Thao tác không hợp lệ: %', p_action using errcode = '22023';
end;
$$;

-- ─── Public wrappers (admin only) ───────────────────────────────────────────

create or replace function public.admin_usage_overview(p_from timestamptz, p_to timestamptz, p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform usage_private.require_admin();
  return usage_private.admin_overview(p_from, p_to, p_filters);
end;
$$;

create or replace function public.admin_usage_activity(
  p_from timestamptz,
  p_to timestamptz,
  p_filters jsonb default '{}'::jsonb,
  p_cursor jsonb default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform usage_private.require_admin();
  return usage_private.admin_activity(p_from, p_to, p_filters, p_cursor, p_limit);
end;
$$;

create or replace function public.admin_usage_requests(
  p_from timestamptz,
  p_to timestamptz,
  p_filters jsonb default '{}'::jsonb,
  p_cursor jsonb default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform usage_private.require_admin();
  return usage_private.admin_requests(p_from, p_to, p_filters, p_cursor, p_limit);
end;
$$;

create or replace function public.admin_usage_request_detail(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform usage_private.require_admin();
  return usage_private.admin_request_detail(p_request_id);
end;
$$;

create or replace function public.admin_usage_operation(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform usage_private.require_admin();
  return usage_private.admin_operation(p_id);
end;
$$;

create or replace function public.admin_usage_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform usage_private.require_admin();
  return usage_private.admin_config();
end;
$$;

create or replace function public.admin_usage_config_change(p_action text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform usage_private.require_admin();
  return usage_private.admin_config_change(p_action, p_payload);
end;
$$;

-- Marks requests whose lease expired as unknown now (ai_usage_begin also does it).
create or replace function public.admin_usage_sweep()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform usage_private.require_admin();
  return usage_private.sweep_expired(1000);
end;
$$;

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.admin_usage_overview(timestamptz, timestamptz, jsonb)',
    'public.admin_usage_activity(timestamptz, timestamptz, jsonb, jsonb, integer)',
    'public.admin_usage_requests(timestamptz, timestamptz, jsonb, jsonb, integer)',
    'public.admin_usage_request_detail(uuid)',
    'public.admin_usage_operation(uuid)',
    'public.admin_usage_config()',
    'public.admin_usage_config_change(text, jsonb)',
    'public.admin_usage_sweep()'
  ] loop
    execute format('revoke execute on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end;
$$;

revoke execute on all functions in schema usage_private from public, anon, authenticated;

commit;
