-- Removes the per-user request window (settings.window_seconds /
-- max_requests_per_window / max_images_per_window) for admins and accounts on
-- Pro or a higher plan, so /watermark/auto can name whole product folders.
-- Unchanged for everyone: concurrency limits, plan/user quotas (when
-- quota_enforced), the AI kill switch and idempotency. Free accounts keep the window.
-- Requires 20261017100000_ai_naming_access.sql (public.plan_rank) and
-- 20261018090000_usage_ledger.sql. Safe to re-run.
begin;

-- Same rule as the /watermark/auto page: active admin, or active account with plan >= pro.
create or replace function usage_private.rate_window_exempt(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user
      and coalesce(p.status, 'active') <> 'suspended'
      and (p.role = 'admin' or coalesce(public.plan_rank(p.plan) >= public.plan_rank('pro'), false))
  );
$$;

revoke all on function usage_private.rate_window_exempt(uuid) from public, anon, authenticated;

create or replace function usage_private.ai_begin(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := usage_private.try_uuid(p->>'user_id');
  v_feature text := coalesce(p->>'feature', 'ai_image_naming');
  v_client uuid := usage_private.try_uuid(p->>'client_request_id');
  v_fp text := nullif(p->>'fingerprint', '');
  v_images integer := (p->>'images_requested')::integer;
  s usage_private.settings;
  v_idem usage_private.ai_idempotency;
  v_has_idem boolean := false;
  v_lease timestamptz;
  v_running_user integer;
  v_running_total integer;
  v_window_count integer;
  v_window_images integer;
  v_window_oldest timestamptz;
  v_quota record;
  v_used integer;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'user_id is required' using errcode = '22023';
  end if;
  if v_images is null or v_images < 1 or v_images > 100 then
    raise exception 'images_requested must be 1..100' using errcode = '22023';
  end if;
  if v_client is not null and (v_fp is null or v_fp !~ '^[0-9a-f]{64}$') then
    raise exception 'fingerprint is required with client_request_id' using errcode = '22023';
  end if;

  -- Every instance takes the same lock: no read-then-write race on the limits.
  perform pg_advisory_xact_lock(hashtextextended('usage_private.ai_begin', 0));
  perform usage_private.sweep_expired(100);

  select * into s from usage_private.settings where id = 1;

  if v_client is not null then
    select * into v_idem
    from usage_private.ai_idempotency
    where user_id = v_user and feature = v_feature and client_request_id = v_client
    for update;
    v_has_idem := found;

    if v_has_idem and v_idem.expires_at <= now() then
      delete from usage_private.ai_idempotency
      where user_id = v_user and feature = v_feature and client_request_id = v_client;
      v_has_idem := false;
    end if;

    if v_has_idem then
      if v_idem.fingerprint <> v_fp then
        return usage_private.reject_request(p, 'IDEMPOTENCY_CONFLICT', 409);
      end if;

      if v_idem.state = 'running' then
        select lease_expires_at into v_lease from usage_private.ai_usage_requests where id = v_idem.request_id;
        return jsonb_build_object(
          'decision', 'in_progress', 'code', 'REQUEST_IN_PROGRESS', 'http_status', 409,
          'request_id', v_idem.request_id,
          'retry_after_seconds', greatest(1, ceil(extract(epoch from (coalesce(v_lease, now()) - now())))::integer)
        );
      end if;

      update usage_private.ai_usage_requests set replay_count = replay_count + 1 where id = v_idem.request_id;

      if v_idem.replay is not null and v_idem.replay_expires_at > now() then
        return jsonb_build_object('decision', 'replay', 'request_id', v_idem.request_id, 'replay', v_idem.replay);
      end if;

      -- Same operation already handled (or lost after reaching the provider):
      -- never treated as "not run" for a free second call.
      return jsonb_build_object(
        'decision', 'previous_outcome',
        'code', case when v_idem.state = 'unknown' then 'REQUEST_OUTCOME_UNKNOWN' else 'REQUEST_ALREADY_PROCESSED' end,
        'http_status', 409,
        'request_id', v_idem.request_id
      );
    end if;
  end if;

  if not s.ai_enabled then
    return usage_private.reject_request(p, 'AI_USAGE_PAUSED', 503);
  end if;

  select count(*) filter (where user_id = v_user), count(*)
  into v_running_user, v_running_total
  from usage_private.ai_usage_requests
  where status = 'running' and lease_expires_at > now();

  if v_running_user >= s.max_concurrent_per_user or v_running_total >= s.max_concurrent_total then
    return usage_private.reject_request(p, 'too_many_concurrent', 429, 5);
  end if;

  -- Admins and Pro+ plans are exempt from the per-user window (/watermark/auto
  -- runs whole folders); concurrency, plan/user quota and the kill switch still apply.
  if not usage_private.rate_window_exempt(v_user) then
    select count(*), coalesce(sum(images_requested), 0)::integer, min(created_at)
    into v_window_count, v_window_images, v_window_oldest
    from usage_private.ai_usage_requests
    where user_id = v_user
      and status <> 'rejected'
      and created_at > now() - make_interval(secs => s.window_seconds);

    if v_window_count >= s.max_requests_per_window or v_window_images + v_images > s.max_images_per_window then
      return usage_private.reject_request(p, 'rate_limited', 429, greatest(1, ceil(extract(epoch from (
        coalesce(v_window_oldest, now()) + make_interval(secs => s.window_seconds) - now()
      )))::integer));
    end if;
  end if;

  if s.quota_enforced then
    select * into v_quota from usage_private.effective_quota(v_user);

    if v_quota.daily_limit is not null then
      select coalesce(sum(images_requested), 0)::integer into v_used
      from usage_private.ai_usage_requests
      where user_id = v_user and status <> 'rejected' and created_at >= usage_private.vn_day_start(now());

      if v_used + v_images > v_quota.daily_limit then
        return usage_private.reject_request(p, 'AI_QUOTA_EXCEEDED', 429,
          greatest(1, ceil(extract(epoch from (usage_private.vn_day_start(now()) + interval '1 day' - now())))::integer),
          jsonb_build_object('quota', jsonb_build_object('scope', 'daily', 'limit', v_quota.daily_limit, 'used', v_used)));
      end if;
    end if;

    if v_quota.monthly_limit is not null then
      select coalesce(sum(images_requested), 0)::integer into v_used
      from usage_private.ai_usage_requests
      where user_id = v_user and status <> 'rejected' and created_at >= usage_private.vn_month_start(now());

      if v_used + v_images > v_quota.monthly_limit then
        return usage_private.reject_request(p, 'AI_QUOTA_EXCEEDED', 429,
          greatest(1, ceil(extract(epoch from (
            (date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh') + interval '1 month') at time zone 'Asia/Ho_Chi_Minh' - now()
          )))::integer),
          jsonb_build_object('quota', jsonb_build_object('scope', 'monthly', 'limit', v_quota.monthly_limit, 'used', v_used)));
      end if;
    end if;
  end if;

  insert into usage_private.ai_usage_requests (
    client_request_id, ai_run_id, user_id, feature, provider, endpoint, environment, key_alias,
    requested_model, status, images_requested, lease_expires_at
  )
  values (
    v_client,
    usage_private.try_uuid(p->>'ai_run_id'),
    v_user,
    v_feature,
    coalesce(p->>'provider', 'openai'),
    coalesce(p->>'endpoint', 'responses'),
    coalesce(p->>'environment', 'unknown'),
    nullif(p->>'key_alias', ''),
    nullif(p->>'requested_model', ''),
    'running',
    v_images,
    now() + make_interval(secs => s.lease_ttl_seconds)
  )
  returning id, lease_expires_at into v_id, v_lease;

  if v_client is not null then
    insert into usage_private.ai_idempotency (user_id, feature, client_request_id, fingerprint, request_id, state, expires_at)
    values (v_user, v_feature, v_client, v_fp, v_id, 'running', now() + interval '24 hours');
  end if;

  return jsonb_build_object('decision', 'accepted', 'request_id', v_id, 'lease_expires_at', v_lease);
end;
$$;

commit;
