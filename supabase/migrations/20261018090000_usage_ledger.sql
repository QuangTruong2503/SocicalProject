-- Usage tracking for /watermark (activity telemetry) and "Đặt tên ảnh bằng AI"
-- (API usage ledger), plus the shared quota/rate limit used by the Edge Function.
-- See docs/usage-logging.md. Safe to re-run.
--
-- Requires public.is_admin() (supabase_admin_profiles_policies.sql) and
-- profiles.plan (20261017090000_profiles_plan_check.sql). Admin read/config RPCs
-- are in 20261018091000_usage_admin.sql.
--
-- Two trust levels, kept in separate tables:
--   * usage_activity_events — what the browser reports (create/download/apply).
--     Product analytics only: can be missing or forged, never used for billing.
--   * ai_usage_requests / ai_usage_attempts — written only by the Edge Function
--     with server privileges (service_role), from the verified JWT, the server
--     configuration and the provider response. Browsers (admins included) can
--     never insert or update them.
--
-- Everything lives in the unexposed schema usage_private. The browser reaches it
-- only through the narrow public wrappers at the end of this file (and the
-- admin ones), each with fixed search_path and explicit EXECUTE grants.
begin;

create schema if not exists usage_private;
revoke all on schema usage_private from public, anon, authenticated;

-- ─── Configuration ──────────────────────────────────────────────────────────

-- Single row. Defaults reproduce the limits the Edge Function enforced in memory
-- before this migration; plan/user quotas stay off until an admin enables them.
create table if not exists usage_private.settings (
  id smallint primary key default 1 check (id = 1),
  ai_enabled boolean not null default true,
  paused_reason text check (char_length(paused_reason) <= 200),
  window_seconds integer not null default 600 check (window_seconds between 60 and 86400),
  max_requests_per_window integer not null default 40 check (max_requests_per_window between 1 and 10000),
  max_images_per_window integer not null default 150 check (max_images_per_window between 1 and 100000),
  max_concurrent_per_user integer not null default 2 check (max_concurrent_per_user between 1 and 50),
  max_concurrent_total integer not null default 8 check (max_concurrent_total between 1 and 1000),
  -- A request still "running" after this is treated as lost (process killed…).
  -- Must exceed the handler's worst case: 3 attempts × 45 s + backoff.
  lease_ttl_seconds integer not null default 240 check (lease_ttl_seconds between 60 and 3600),
  quota_enforced boolean not null default false,
  activity_max_events_per_minute integer not null default 120 check (activity_max_events_per_minute between 10 and 10000),
  usd_to_vnd numeric(14, 2) check (usd_to_vnd > 0),
  usd_to_vnd_as_of date,
  tracking_started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into usage_private.settings (id) values (1) on conflict (id) do nothing;

-- Daily / monthly limit of images sent to the provider, per plan (NULL = no
-- limit). Applied only while settings.quota_enforced is true. 'admin' is used
-- for active admins regardless of their plan.
create table if not exists usage_private.plan_quotas (
  plan text primary key check (plan in ('free', 'pro', 'enterprise', 'admin')),
  daily_image_limit integer check (daily_image_limit >= 0),
  monthly_image_limit integer check (monthly_image_limit >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

-- Per-user exceptions: NULL fields inherit the plan value; unlimited ignores both.
create table if not exists usage_private.user_quota_overrides (
  user_id uuid primary key references auth.users(id) on delete cascade,
  daily_image_limit integer check (daily_image_limit >= 0),
  monthly_image_limit integer check (monthly_image_limit >= 0),
  unlimited boolean not null default false,
  note text check (char_length(note) <= 200),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

-- Versioned unit prices (USD per 1M tokens). Never updated in place: a new
-- price is a new row and the previous one gets effective_to. Each attempt keeps
-- a snapshot of the prices it was estimated with.
create table if not exists usage_private.model_prices (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'openai' check (provider ~ '^[a-z0-9_-]{1,32}$'),
  model text not null check (model ~ '^[A-Za-z0-9._:-]{1,100}$'),
  -- Also matches dated snapshots "<model>-YYYY-MM-DD" returned by the provider.
  match_snapshots boolean not null default true,
  service_tier text not null default 'default' check (service_tier ~ '^[a-z0-9_-]{1,32}$'),
  -- Context-size band: the row applies when input_tokens <= max_input_tokens (NULL = any).
  max_input_tokens integer check (max_input_tokens > 0),
  input_usd_per_mtok numeric(14, 6) not null check (input_usd_per_mtok >= 0),
  cached_input_usd_per_mtok numeric(14, 6) check (cached_input_usd_per_mtok >= 0),
  cache_write_usd_per_mtok numeric(14, 6) check (cache_write_usd_per_mtok >= 0),
  output_usd_per_mtok numeric(14, 6) not null check (output_usd_per_mtok >= 0),
  effective_from timestamptz not null,
  effective_to timestamptz,
  version text not null check (char_length(version) between 1 and 64),
  source_url text check (source_url ~ '^https://' and char_length(source_url) <= 500),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  check (effective_to is null or effective_to > effective_from)
);

create unique index if not exists model_prices_version_key
on usage_private.model_prices (provider, model, service_tier, (coalesce(max_input_tokens, 0)), effective_from);

-- Soft monthly budgets on the estimated cost. Alerts only, never a hard cap.
create table if not exists usage_private.budgets (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('global', 'key_alias', 'user')),
  scope_value text check (char_length(scope_value) <= 100),
  monthly_limit_usd numeric(14, 4) not null check (monthly_limit_usd > 0),
  alert_thresholds integer[] not null default '{70,90,100}',
  active boolean not null default true,
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  check ((scope = 'global') = (scope_value is null)),
  check (cardinality(alert_thresholds) between 1 and 5),
  check (1 <= all(alert_thresholds) and 200 >= all(alert_thresholds))
);

create unique index if not exists budgets_scope_key
on usage_private.budgets (scope, (coalesce(scope_value, '')));

-- Every admin change to settings / quotas / budgets / prices. Values only (no
-- secrets exist in these tables); the actor is resolved to a name at read time.
create table if not exists usage_private.config_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target text,
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists config_audit_created_idx on usage_private.config_audit (created_at desc);

-- ─── API usage ledger (server-written only) ────────────────────────────────

-- One row per batch the backend handled: accepted (running → succeeded /
-- partial / failed / unknown) or rejected before any provider call.
create table if not exists usage_private.ai_usage_requests (
  id uuid primary key default gen_random_uuid(),
  -- Operation ID sent by the browser for idempotent resends. Not an identity.
  client_request_id uuid,
  -- Groups the batches of one click in the AI dialog (browser-supplied, analytics only).
  ai_run_id uuid,
  -- From the verified JWT. Deleting the account keeps the usage, anonymized.
  user_id uuid references auth.users(id) on delete set null,
  feature text not null check (feature in ('ai_image_naming')),
  provider text not null default 'openai' check (provider ~ '^[a-z0-9_-]{1,32}$'),
  endpoint text not null default 'responses' check (endpoint ~ '^[a-z0-9_./-]{1,64}$'),
  environment text not null check (environment ~ '^[a-z0-9_-]{1,32}$'),
  -- Logical key label configured on the server (e.g. image-naming-prod-v1), never the key.
  key_alias text check (key_alias ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  requested_model text check (requested_model ~ '^[A-Za-z0-9._:-]{1,100}$'),
  status text not null check (status in ('running', 'succeeded', 'partial', 'failed', 'rejected', 'unknown')),
  error_code text check (error_code ~ '^[A-Za-z0-9_.-]{1,64}$'),
  http_status smallint check (http_status between 100 and 599),
  images_requested integer not null default 0 check (images_requested between 0 and 100),
  images_succeeded integer check (images_succeeded >= 0),
  images_failed integer check (images_failed >= 0),
  needs_review_count integer check (needs_review_count >= 0),
  replay_count integer not null default 0 check (replay_count >= 0),
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  finish_source text check (finish_source in ('handler', 'sweeper')),
  check (coalesce(images_succeeded, 0) + coalesce(images_failed, 0) <= images_requested),
  check (coalesce(needs_review_count, 0) <= coalesce(images_succeeded, 0)),
  check (status <> 'running' or lease_expires_at is not null)
);

create index if not exists ai_usage_requests_created_idx on usage_private.ai_usage_requests (created_at desc, id desc);
create index if not exists ai_usage_requests_user_created_idx on usage_private.ai_usage_requests (user_id, created_at desc);
create index if not exists ai_usage_requests_key_created_idx on usage_private.ai_usage_requests (key_alias, created_at desc);
create index if not exists ai_usage_requests_running_idx on usage_private.ai_usage_requests (lease_expires_at) where status = 'running';
create index if not exists ai_usage_requests_run_idx on usage_private.ai_usage_requests (ai_run_id) where ai_run_id is not null;
create index if not exists ai_usage_requests_client_idx on usage_private.ai_usage_requests (client_request_id) where client_request_id is not null;

-- One row per call that may have reached the provider (retries included).
create table if not exists usage_private.ai_usage_attempts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references usage_private.ai_usage_requests(id) on delete cascade,
  attempt_number smallint not null check (attempt_number between 1 and 10),
  -- succeeded = provider answered 200; failed = provider answered an error;
  -- unknown = no answer (timeout, network, lost process) or still open.
  status text not null check (status in ('running', 'succeeded', 'failed', 'unknown')),
  error_code text check (error_code ~ '^[A-Za-z0-9_.-]{1,64}$'),
  provider_error_code text check (provider_error_code ~ '^[A-Za-z0-9_.-]{1,64}$'),
  http_status smallint check (http_status between 100 and 599),
  will_retry boolean not null default false,
  retry_reason text check (retry_reason in ('rate_limited', 'server_error', 'timeout', 'network')),
  -- x-request-id header and the Response object id: two different IDs.
  provider_request_id text check (provider_request_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  provider_response_id text check (provider_response_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  resolved_model text check (resolved_model ~ '^[A-Za-z0-9._:-]{1,100}$'),
  service_tier text check (service_tier ~ '^[a-z0-9_-]{1,32}$'),
  response_status text check (response_status in ('completed', 'incomplete', 'failed', 'cancelled', 'queued', 'in_progress')),
  started_at timestamptz not null,
  ended_at timestamptz,
  latency_ms integer check (latency_ms >= 0),
  -- reported = usage object received; missing = provider answered without usage;
  -- unknown = no answer, the provider may still have processed (and billed) it.
  usage_status text not null check (usage_status in ('reported', 'missing', 'unknown', 'not_called')),
  input_tokens bigint check (input_tokens >= 0),
  cached_input_tokens bigint check (cached_input_tokens >= 0),
  cache_write_tokens bigint check (cache_write_tokens >= 0),
  output_tokens bigint check (output_tokens >= 0),
  reasoning_tokens bigint check (reasoning_tokens >= 0),
  total_tokens bigint check (total_tokens >= 0),
  cost_status text not null check (cost_status in ('estimated', 'unpriced', 'unknown', 'not_applicable')),
  estimated_cost_usd numeric(20, 10) check (estimated_cost_usd >= 0),
  price_id uuid references usage_private.model_prices(id) on delete set null,
  price_version text,
  price_input_usd_per_mtok numeric(14, 6),
  price_cached_input_usd_per_mtok numeric(14, 6),
  price_cache_write_usd_per_mtok numeric(14, 6),
  price_output_usd_per_mtok numeric(14, 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, attempt_number),
  check (usage_status <> 'reported' or (input_tokens is not null and output_tokens is not null)),
  check (usage_status = 'reported' or (input_tokens is null and cached_input_tokens is null and cache_write_tokens is null
    and output_tokens is null and reasoning_tokens is null and total_tokens is null)),
  check (coalesce(cached_input_tokens, 0) + coalesce(cache_write_tokens, 0) <= coalesce(input_tokens, 0)),
  check (coalesce(reasoning_tokens, 0) <= coalesce(output_tokens, 0)),
  check ((cost_status = 'estimated') = (estimated_cost_usd is not null))
);

-- Idempotency keys for browser resends. Separate from the logs, short-lived,
-- and the only place a minimal normalized result is kept (for replay).
create table if not exists usage_private.ai_idempotency (
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null,
  client_request_id uuid not null,
  -- HMAC-SHA256 of the payload, computed by the Edge Function with a server secret.
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  request_id uuid not null references usage_private.ai_usage_requests(id) on delete cascade,
  state text not null check (state in ('running', 'completed', 'failed', 'unknown')),
  replay jsonb check (pg_column_size(replay) <= 16384),
  replay_expires_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (user_id, feature, client_request_id)
);

create index if not exists ai_idempotency_expires_idx on usage_private.ai_idempotency (expires_at);
create index if not exists ai_idempotency_request_idx on usage_private.ai_idempotency (request_id);

-- ─── Activity telemetry (browser-reported) ──────────────────────────────────

create table if not exists usage_private.usage_activity_events (
  -- Generated by the browser per action; a resend reuses it, so it dedupes.
  event_id uuid primary key,
  operation_id uuid not null,
  image_batch_id uuid,
  ai_run_id uuid,
  -- subject 'user': user_id = auth.uid() at ingestion (NULL once the account is
  -- deleted), no visitor ID (guest history is never linked to the account).
  -- subject 'visitor': random browser ID, not an identity nor a unique person.
  subject_type text not null check (subject_type in ('user', 'visitor')),
  user_id uuid references auth.users(id) on delete set null,
  visitor_id uuid,
  feature text not null check (feature in ('watermark', 'ai_image_naming')),
  action text not null check (action in ('image.create', 'image.download', 'ai.naming.apply')),
  source_page text not null check (source_page ~ '^[a-z0-9][a-z0-9/_-]{0,63}$'),
  status text not null check (status in ('succeeded', 'partial', 'failed', 'cancelled')),
  -- requested = succeeded + failed + skipped + cancelled (see docs/usage-logging.md).
  requested_count integer check (requested_count between 0 and 100000),
  succeeded_count integer check (succeeded_count between 0 and 100000),
  failed_count integer check (failed_count between 0 and 100000),
  skipped_count integer check (skipped_count between 0 and 100000),
  cancelled_count integer check (cancelled_count between 0 and 100000),
  -- Downloads: images resized/added to the ZIP; succeeded = handed to the browser / written.
  prepared_count integer check (prepared_count between 0 and 100000),
  duration_ms integer check (duration_ms between 0 and 86400000),
  error_code text check (error_code ~ '^[a-z0-9_]{1,64}$'),
  download_method text check (download_method in ('single', 'direct', 'zip')),
  image_size text check (image_size in ('original', '800x600')),
  delivery text check (delivery in ('browser_handoff', 'file_written')),
  output_file_count integer check (output_file_count between 0 and 100000),
  images_in_files integer check (images_in_files between 0 and 100000),
  occurred_at timestamptz,
  received_at timestamptz not null default now(),
  schema_version smallint not null check (schema_version = 1),
  app_version text check (app_version ~ '^[A-Za-z0-9._+-]{1,32}$'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 512),
  legacy boolean not null default false,
  check ((subject_type = 'visitor') = (visitor_id is not null)),
  check (subject_type = 'user' or user_id is null),
  check ((action = 'ai.naming.apply') = (feature = 'ai_image_naming')),
  check (action = 'image.download' or (download_method is null and image_size is null and delivery is null and prepared_count is null)),
  check (action <> 'image.download' or download_method is not null),
  check (requested_count is null
    or coalesce(succeeded_count, 0) + coalesce(failed_count, 0) + coalesce(skipped_count, 0) + coalesce(cancelled_count, 0) <= requested_count)
);

create index if not exists usage_activity_events_received_idx on usage_private.usage_activity_events (received_at desc, event_id desc);
create index if not exists usage_activity_events_user_idx on usage_private.usage_activity_events (user_id, received_at desc) where user_id is not null;
create index if not exists usage_activity_events_visitor_idx on usage_private.usage_activity_events (visitor_id, received_at desc) where visitor_id is not null;
create index if not exists usage_activity_events_operation_idx on usage_private.usage_activity_events (operation_id);
create index if not exists usage_activity_events_batch_idx on usage_private.usage_activity_events (image_batch_id) where image_batch_id is not null;
create index if not exists usage_activity_events_run_idx on usage_private.usage_activity_events (ai_run_id) where ai_run_id is not null;

alter table usage_private.settings enable row level security;
alter table usage_private.plan_quotas enable row level security;
alter table usage_private.user_quota_overrides enable row level security;
alter table usage_private.model_prices enable row level security;
alter table usage_private.budgets enable row level security;
alter table usage_private.config_audit enable row level security;
alter table usage_private.ai_usage_requests enable row level security;
alter table usage_private.ai_usage_attempts enable row level security;
alter table usage_private.ai_idempotency enable row level security;
alter table usage_private.usage_activity_events enable row level security;

-- ─── Helpers ────────────────────────────────────────────────────────────────

create or replace function usage_private.try_uuid(p_value text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when p_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_value::uuid end;
$$;

-- Day/month boundaries are cut in Asia/Ho_Chi_Minh, never in the server's zone.
create or replace function usage_private.vn_day_start(p_at timestamptz)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc('day', p_at at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh';
$$;

create or replace function usage_private.vn_month_start(p_at timestamptz)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc('month', p_at at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh';
$$;

create or replace function usage_private.normalize_tier(p_tier text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_tier is null or lower(btrim(p_tier)) in ('', 'auto', 'default') then 'default'
    when lower(btrim(p_tier)) ~ '^[a-z0-9_-]{1,32}$' then lower(btrim(p_tier))
    else 'unrecognized'
  end;
$$;

/**
 * Estimated USD for one attempt. NULL when a token class present in the usage
 * has no price. Reasoning tokens are part of output_tokens and are not added
 * again; cached and cache-write tokens are parts of input_tokens.
 * Exact numeric arithmetic, rounded only for display.
 */
create or replace function usage_private.estimate_cost_usd(
  p_input bigint,
  p_cached bigint,
  p_cache_write bigint,
  p_output bigint,
  p_input_price numeric,
  p_cached_price numeric,
  p_cache_write_price numeric,
  p_output_price numeric
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_input is null or p_output is null or p_input_price is null or p_output_price is null then null
    when coalesce(p_cached, 0) > 0 and p_cached_price is null then null
    when coalesce(p_cache_write, 0) > 0 and p_cache_write_price is null then null
    else (
      (p_input - coalesce(p_cached, 0) - coalesce(p_cache_write, 0)) * p_input_price
      + coalesce(p_cached, 0) * coalesce(p_cached_price, 0)
      + coalesce(p_cache_write, 0) * coalesce(p_cache_write_price, 0)
      + p_output * p_output_price
    ) / 1000000
  end;
$$;

-- Price in effect at p_at for the model actually used. Exact model wins over a
-- dated snapshot match; the narrowest context band that fits wins.
create or replace function usage_private.find_price(
  p_provider text,
  p_model text,
  p_tier text,
  p_at timestamptz,
  p_input bigint
)
returns setof usage_private.model_prices
language sql
stable
set search_path = ''
as $$
  select mp.*
  from usage_private.model_prices mp
  where mp.provider = p_provider
    and p_model is not null
    and (
      mp.model = p_model
      or (mp.match_snapshots
        and left(p_model, length(mp.model) + 1) = mp.model || '-'
        and substr(p_model, length(mp.model) + 2) ~ '^\d{4}-\d{2}-\d{2}$')
    )
    and mp.service_tier = p_tier
    and mp.effective_from <= p_at
    and (mp.effective_to is null or mp.effective_to > p_at)
    and (mp.max_input_tokens is null or p_input is null or p_input <= mp.max_input_tokens)
  order by (mp.model = p_model) desc, mp.max_input_tokens asc nulls last, mp.effective_from desc
  limit 1;
$$;

-- Limits of images sent to the provider that apply to this user right now.
create or replace function usage_private.effective_quota(p_user uuid)
returns table (plan_key text, daily_limit integer, monthly_limit integer, source text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin boolean;
  v_plan text;
  q usage_private.plan_quotas;
  o usage_private.user_quota_overrides;
begin
  select p.role = 'admin' and coalesce(p.status, 'active') <> 'suspended',
         coalesce(nullif(lower(btrim(p.plan)), ''), 'free')
  into v_admin, v_plan
  from public.profiles p
  where p.id = p_user;

  plan_key := case when coalesce(v_admin, false) then 'admin' else coalesce(v_plan, 'free') end;
  select * into q from usage_private.plan_quotas where plan = plan_key;
  select * into o from usage_private.user_quota_overrides where user_id = p_user;

  if o.user_id is not null and o.unlimited then
    daily_limit := null;
    monthly_limit := null;
    source := 'override_unlimited';
  else
    daily_limit := coalesce(o.daily_image_limit, q.daily_image_limit);
    monthly_limit := coalesce(o.monthly_image_limit, q.monthly_image_limit);
    source := case when o.user_id is not null then 'override' when q.plan is not null then 'plan' else 'none' end;
  end if;

  return next;
end;
$$;

/**
 * Marks requests whose lease expired as 'unknown' (the handler died or lost the
 * database): their usage stays unknown, never 0, and the slot is freed. Also
 * drops expired idempotency keys and replay payloads. Bounded per call.
 */
create or replace function usage_private.sweep_expired(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  select array_agg(r.id)
  into v_ids
  from (
    select id
    from usage_private.ai_usage_requests
    where status = 'running' and lease_expires_at < now()
    order by lease_expires_at
    limit greatest(coalesce(p_limit, 200), 1)
    for update skip locked
  ) r;

  if v_ids is not null then
    update usage_private.ai_usage_requests
    set status = 'unknown', error_code = 'lease_expired', finished_at = now(), finish_source = 'sweeper'
    where id = any(v_ids);

    update usage_private.ai_usage_attempts
    set status = 'unknown', updated_at = now()
    where request_id = any(v_ids) and status = 'running';

    update usage_private.ai_idempotency
    set state = 'unknown'
    where request_id = any(v_ids) and state = 'running';
  end if;

  delete from usage_private.ai_idempotency
  where ctid in (select ctid from usage_private.ai_idempotency where expires_at < now() limit 500);

  update usage_private.ai_idempotency
  set replay = null, replay_expires_at = null
  where ctid in (
    select ctid from usage_private.ai_idempotency
    where replay is not null and replay_expires_at < now()
    limit 500
  );

  return coalesce(array_length(v_ids, 1), 0);
end;
$$;

-- Records a request refused before any provider call (no attempt rows).
-- Capped per user so a client hammering a refusal cannot flood the ledger.
create or replace function usage_private.reject_request(
  p jsonb,
  p_code text,
  p_http integer,
  p_retry_after integer default null,
  p_extra jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := usage_private.try_uuid(p->>'user_id');
  v_id uuid;
begin
  if v_user is not null and (
    select count(*) from usage_private.ai_usage_requests
    where user_id = v_user and status = 'rejected' and created_at > now() - interval '1 hour'
  ) < 200 then
    insert into usage_private.ai_usage_requests (
      client_request_id, ai_run_id, user_id, feature, provider, endpoint, environment, key_alias,
      requested_model, status, error_code, http_status, images_requested, finished_at, finish_source
    )
    values (
      usage_private.try_uuid(p->>'client_request_id'),
      usage_private.try_uuid(p->>'ai_run_id'),
      v_user,
      coalesce(p->>'feature', 'ai_image_naming'),
      coalesce(p->>'provider', 'openai'),
      coalesce(p->>'endpoint', 'responses'),
      coalesce(p->>'environment', 'unknown'),
      nullif(p->>'key_alias', ''),
      nullif(p->>'requested_model', ''),
      'rejected',
      p_code,
      p_http,
      least(greatest(coalesce((p->>'images_requested')::integer, 0), 0), 100),
      now(),
      'handler'
    )
    returning id into v_id;
  end if;

  return jsonb_build_object('decision', 'rejected', 'code', p_code, 'http_status', p_http, 'request_id', v_id)
    || case when p_retry_after is not null then jsonb_build_object('retry_after_seconds', p_retry_after) else '{}'::jsonb end
    || coalesce(p_extra, '{}'::jsonb);
end;
$$;

-- ─── Backend: one logical request ───────────────────────────────────────────

/**
 * Called by the Edge Function after authentication and validation, before the
 * provider is called. In one transaction, serialized across every instance by
 * an advisory lock: idempotency claim, kill switch, concurrency, rate window,
 * plan/user quota, then the "running" request row with a lease.
 * Decisions: accepted | replay | in_progress | previous_outcome | rejected.
 */
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

-- Opens an attempt row right before the provider call, so a process killed
-- mid-call still leaves a trace (swept to unknown later).
create or replace function usage_private.ai_attempt_start(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into usage_private.ai_usage_attempts (request_id, attempt_number, status, started_at, usage_status, cost_status)
  select r.id, (p->>'attempt_number')::smallint, 'running', coalesce((p->>'started_at')::timestamptz, now()), 'unknown', 'unknown'
  from usage_private.ai_usage_requests r
  where r.id = usage_private.try_uuid(p->>'request_id') and r.status <> 'rejected'
  on conflict (request_id, attempt_number) do nothing;

  return jsonb_build_object('ok', found);
end;
$$;

/**
 * Closes an attempt with what the provider returned (or did not). Idempotent:
 * a resend after a lost acknowledgement does not create a row or change a
 * closed one. The cost is estimated here, from the price in effect when the
 * attempt started, and the unit prices are copied into the row.
 */
create or replace function usage_private.ai_attempt_finish(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req usage_private.ai_usage_requests;
  v_usage_status text := coalesce(p->>'usage_status', 'unknown');
  v_usage jsonb := case when jsonb_typeof(p->'usage') = 'object' then p->'usage' else '{}'::jsonb end;
  v_started timestamptz := coalesce((p->>'started_at')::timestamptz, now());
  v_model text;
  v_tier text := usage_private.normalize_tier(p->>'service_tier');
  v_price usage_private.model_prices;
  v_input bigint;
  v_cached bigint;
  v_cache_write bigint;
  v_output bigint;
  v_cost numeric;
  v_cost_status text;
begin
  select * into v_req from usage_private.ai_usage_requests where id = usage_private.try_uuid(p->>'request_id');
  if not found or v_req.status = 'rejected' then
    raise exception 'unknown request' using errcode = 'P0002';
  end if;

  if v_usage_status not in ('reported', 'missing', 'unknown', 'not_called') then
    raise exception 'invalid usage_status' using errcode = '22023';
  end if;

  v_model := coalesce(nullif(p->>'resolved_model', ''), v_req.requested_model);

  if v_usage_status = 'reported' then
    v_input := (v_usage->>'input_tokens')::bigint;
    v_cached := (v_usage->>'cached_input_tokens')::bigint;
    v_cache_write := (v_usage->>'cache_write_tokens')::bigint;
    v_output := (v_usage->>'output_tokens')::bigint;
    if v_input is null or v_output is null then
      v_usage_status := 'missing';
    end if;
  end if;

  if v_usage_status = 'reported' then
    select * into v_price from usage_private.find_price(v_req.provider, v_model, v_tier, v_started, v_input);
    if v_price.id is not null then
      v_cost := usage_private.estimate_cost_usd(v_input, v_cached, v_cache_write, v_output,
        v_price.input_usd_per_mtok, v_price.cached_input_usd_per_mtok, v_price.cache_write_usd_per_mtok, v_price.output_usd_per_mtok);
    end if;
    v_cost_status := case when v_cost is not null then 'estimated' else 'unpriced' end;
  elsif v_usage_status = 'not_called' then
    v_cost_status := 'not_applicable';
  else
    v_cost_status := 'unknown';
  end if;

  insert into usage_private.ai_usage_attempts as a (
    request_id, attempt_number, status, error_code, provider_error_code, http_status, will_retry, retry_reason,
    provider_request_id, provider_response_id, resolved_model, service_tier, response_status,
    started_at, ended_at, latency_ms, usage_status,
    input_tokens, cached_input_tokens, cache_write_tokens, output_tokens, reasoning_tokens, total_tokens,
    cost_status, estimated_cost_usd, price_id, price_version,
    price_input_usd_per_mtok, price_cached_input_usd_per_mtok, price_cache_write_usd_per_mtok, price_output_usd_per_mtok
  )
  values (
    v_req.id,
    (p->>'attempt_number')::smallint,
    p->>'status',
    nullif(p->>'error_code', ''),
    nullif(p->>'provider_error_code', ''),
    (p->>'http_status')::smallint,
    coalesce((p->>'will_retry')::boolean, false),
    nullif(p->>'retry_reason', ''),
    nullif(p->>'provider_request_id', ''),
    nullif(p->>'provider_response_id', ''),
    nullif(p->>'resolved_model', ''),
    case when nullif(p->>'service_tier', '') is null then null else v_tier end,
    nullif(p->>'response_status', ''),
    v_started,
    coalesce((p->>'ended_at')::timestamptz, now()),
    (p->>'latency_ms')::integer,
    v_usage_status,
    case when v_usage_status = 'reported' then v_input end,
    case when v_usage_status = 'reported' then v_cached end,
    case when v_usage_status = 'reported' then v_cache_write end,
    case when v_usage_status = 'reported' then v_output end,
    case when v_usage_status = 'reported' then (v_usage->>'reasoning_tokens')::bigint end,
    case when v_usage_status = 'reported' then (v_usage->>'total_tokens')::bigint end,
    v_cost_status,
    v_cost,
    case when v_cost is not null then v_price.id end,
    case when v_cost is not null then v_price.version end,
    case when v_cost is not null then v_price.input_usd_per_mtok end,
    case when v_cost is not null then v_price.cached_input_usd_per_mtok end,
    case when v_cost is not null then v_price.cache_write_usd_per_mtok end,
    case when v_cost is not null then v_price.output_usd_per_mtok end
  )
  on conflict (request_id, attempt_number) do update set
    status = excluded.status,
    error_code = excluded.error_code,
    provider_error_code = excluded.provider_error_code,
    http_status = excluded.http_status,
    will_retry = excluded.will_retry,
    retry_reason = excluded.retry_reason,
    provider_request_id = excluded.provider_request_id,
    provider_response_id = excluded.provider_response_id,
    resolved_model = excluded.resolved_model,
    service_tier = excluded.service_tier,
    response_status = excluded.response_status,
    started_at = excluded.started_at,
    ended_at = excluded.ended_at,
    latency_ms = excluded.latency_ms,
    usage_status = excluded.usage_status,
    input_tokens = excluded.input_tokens,
    cached_input_tokens = excluded.cached_input_tokens,
    cache_write_tokens = excluded.cache_write_tokens,
    output_tokens = excluded.output_tokens,
    reasoning_tokens = excluded.reasoning_tokens,
    total_tokens = excluded.total_tokens,
    cost_status = excluded.cost_status,
    estimated_cost_usd = excluded.estimated_cost_usd,
    price_id = excluded.price_id,
    price_version = excluded.price_version,
    price_input_usd_per_mtok = excluded.price_input_usd_per_mtok,
    price_cached_input_usd_per_mtok = excluded.price_cached_input_usd_per_mtok,
    price_cache_write_usd_per_mtok = excluded.price_cache_write_usd_per_mtok,
    price_output_usd_per_mtok = excluded.price_output_usd_per_mtok,
    updated_at = now()
  -- Only an open row (or one the sweeper closed without data) is filled in.
  where a.ended_at is null;

  return jsonb_build_object('ok', true, 'cost_status', v_cost_status);
end;
$$;

/**
 * Business outcome of the request (what the user got), separate from the
 * provider outcome of each attempt. Stores the minimal normalized result for
 * idempotent replay. A late finish may correct a row the sweeper marked unknown.
 */
create or replace function usage_private.ai_finish(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := usage_private.try_uuid(p->>'request_id');
  v_status text := p->>'status';
  v_replay jsonb := case when jsonb_typeof(p->'replay') = 'object' then p->'replay' end;
begin
  if v_status is null or v_status not in ('succeeded', 'partial', 'failed') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  if v_replay is not null and pg_column_size(v_replay) > 16384 then
    v_replay := null;
  end if;

  update usage_private.ai_usage_requests
  set status = v_status,
      error_code = nullif(p->>'error_code', ''),
      http_status = (p->>'http_status')::smallint,
      images_succeeded = (p->>'images_succeeded')::integer,
      images_failed = (p->>'images_failed')::integer,
      needs_review_count = (p->>'needs_review_count')::integer,
      finished_at = now(),
      finish_source = 'handler',
      lease_expires_at = null
  where id = v_id
    and (status = 'running' or (status = 'unknown' and finish_source = 'sweeper'));

  if not found then
    return jsonb_build_object('ok', true, 'updated', false);
  end if;

  -- An attempt still open here never reported back: its usage stays unknown.
  update usage_private.ai_usage_attempts
  set status = 'unknown', updated_at = now()
  where request_id = v_id and status = 'running';

  update usage_private.ai_idempotency
  set state = case when v_status = 'failed' then 'failed' else 'completed' end,
      replay = v_replay,
      replay_expires_at = case when v_replay is not null then now() + interval '1 hour' end,
      expires_at = now() + interval '24 hours'
  where request_id = v_id;

  return jsonb_build_object('ok', true, 'updated', true);
end;
$$;

-- ─── Browser: activity telemetry ────────────────────────────────────────────

/**
 * Validates and stores one browser event. The subject is decided here:
 * subjectUserId must equal the caller's JWT user (a task started under another
 * account, or before logout, is refused), guest tasks are stored as visitor
 * events even if the person signed in meanwhile. Metadata is reduced to an
 * allowlist. Returns false for a duplicate event_id.
 */
create or replace function usage_private.insert_activity_event(e jsonb, p_uid uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject_user uuid;
  v_visitor uuid;
  v_subject text;
  v_meta jsonb := '{}'::jsonb;
  v_key text;
  v_occurred timestamptz;
  v_count integer;
begin
  if jsonb_typeof(e) is distinct from 'object' then
    raise exception 'invalid_event' using errcode = '22023';
  end if;
  if e->>'schemaVersion' is distinct from '1' then
    raise exception 'unsupported_schema' using errcode = '22023';
  end if;

  if nullif(e->>'subjectUserId', '') is not null then
    v_subject_user := usage_private.try_uuid(e->>'subjectUserId');
    if v_subject_user is null or p_uid is null or v_subject_user <> p_uid then
      raise exception 'subject_mismatch' using errcode = '22023';
    end if;
    v_subject := 'user';
  else
    v_visitor := usage_private.try_uuid(e->>'visitorId');
    if v_visitor is null then
      raise exception 'visitor_required' using errcode = '22023';
    end if;
    v_subject := 'visitor';
  end if;

  if usage_private.try_uuid(e->>'eventId') is null or usage_private.try_uuid(e->>'operationId') is null then
    raise exception 'invalid_id' using errcode = '22023';
  end if;
  if (nullif(e->>'imageBatchId', '') is not null and usage_private.try_uuid(e->>'imageBatchId') is null)
    or (nullif(e->>'aiRunId', '') is not null and usage_private.try_uuid(e->>'aiRunId') is null) then
    raise exception 'invalid_id' using errcode = '22023';
  end if;

  if jsonb_typeof(e->'metadata') = 'object' then
    for v_key in select jsonb_object_keys(e->'metadata') loop
      if v_key in ('ai_unchanged_count', 'edited_count', 'batch_count') and jsonb_typeof(e->'metadata'->v_key) = 'number' then
        v_meta := v_meta || jsonb_build_object(v_key, least(greatest(trunc((e->'metadata'->>v_key)::numeric), 0), 100000)::integer);
      elsif v_key = 'stage' and (e->'metadata'->>'stage') ~ '^[a-z_]{1,32}$' then
        v_meta := v_meta || jsonb_build_object('stage', e->'metadata'->>'stage');
      end if;
    end loop;
  end if;

  begin
    v_occurred := (e->>'occurredAt')::timestamptz;
  exception when others then
    v_occurred := null;
  end;
  if v_occurred < now() - interval '30 days' or v_occurred > now() + interval '1 day' then
    v_occurred := null;
  end if;

  insert into usage_private.usage_activity_events (
    event_id, operation_id, image_batch_id, ai_run_id, subject_type, user_id, visitor_id,
    feature, action, source_page, status,
    requested_count, succeeded_count, failed_count, skipped_count, cancelled_count, prepared_count,
    duration_ms, error_code, download_method, image_size, delivery, output_file_count, images_in_files,
    occurred_at, schema_version, app_version, metadata
  )
  values (
    (e->>'eventId')::uuid,
    (e->>'operationId')::uuid,
    usage_private.try_uuid(e->>'imageBatchId'),
    usage_private.try_uuid(e->>'aiRunId'),
    v_subject,
    case when v_subject = 'user' then p_uid end,
    v_visitor,
    e->>'feature',
    e->>'action',
    coalesce(nullif(e->>'sourcePage', ''), 'watermark'),
    e->>'status',
    (e->>'requestedCount')::integer,
    (e->>'succeededCount')::integer,
    (e->>'failedCount')::integer,
    (e->>'skippedCount')::integer,
    (e->>'cancelledCount')::integer,
    (e->>'preparedCount')::integer,
    (e->>'durationMs')::integer,
    nullif(e->>'errorCode', ''),
    nullif(e->>'downloadMethod', ''),
    nullif(e->>'imageSize', ''),
    nullif(e->>'delivery', ''),
    (e->>'outputFileCount')::integer,
    (e->>'imagesInFiles')::integer,
    v_occurred,
    1,
    nullif(e->>'appVersion', ''),
    v_meta
  )
  on conflict (event_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

create or replace function usage_private.log_activity(p_events jsonb, p_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e jsonb;
  v_total integer;
  v_accepted integer := 0;
  v_duplicates integer := 0;
  v_rejected jsonb := '[]'::jsonb;
  v_reason text;
  v_state text;
  v_visitors uuid[];
  v_recent integer;
  v_max integer;
begin
  if jsonb_typeof(p_events) is distinct from 'array' or jsonb_array_length(p_events) = 0 then
    raise exception 'events must be a non-empty array' using errcode = '22023';
  end if;
  v_total := jsonb_array_length(p_events);
  if v_total > 50 or pg_column_size(p_events) > 32768 then
    raise exception 'too many events in one call' using errcode = '54000';
  end if;

  -- Suspended accounts: nothing is recorded under them.
  if p_uid is not null and exists (
    select 1 from public.profiles where id = p_uid and status = 'suspended'
  ) then
    return jsonb_build_object('accepted', 0, 'duplicates', 0, 'rejected',
      (select jsonb_agg(jsonb_build_object('eventId', x->>'eventId', 'reason', 'account_suspended'))
       from jsonb_array_elements(p_events) x));
  end if;

  -- Volume cap per caller per minute. The visitor ID is random and can be
  -- rotated, so a global cap on guest events backs it up.
  select activity_max_events_per_minute into v_max from usage_private.settings where id = 1;
  select array_agg(distinct usage_private.try_uuid(x->>'visitorId'))
    filter (where usage_private.try_uuid(x->>'visitorId') is not null)
  into v_visitors
  from jsonb_array_elements(p_events) x;

  select count(*) into v_recent
  from usage_private.usage_activity_events
  where received_at > now() - interval '1 minute'
    and ((p_uid is not null and user_id = p_uid) or visitor_id = any(coalesce(v_visitors, '{}'::uuid[])));

  if v_recent + v_total > coalesce(v_max, 120) or (p_uid is null and (
    select count(*) from usage_private.usage_activity_events
    where received_at > now() - interval '1 minute' and subject_type = 'visitor'
  ) > 50 * coalesce(v_max, 120)) then
    return jsonb_build_object('accepted', 0, 'duplicates', 0, 'rejected', '[]'::jsonb,
      'rate_limited', true, 'retry_after_seconds', 60);
  end if;

  for e in select value from jsonb_array_elements(p_events) loop
    begin
      if usage_private.insert_activity_event(e, p_uid) then
        v_accepted := v_accepted + 1;
      else
        v_duplicates := v_duplicates + 1;
      end if;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_reason = message_text;
      v_rejected := v_rejected || jsonb_build_object(
        'eventId', left(coalesce(e->>'eventId', ''), 36),
        'reason', case when v_state = '22023' and v_reason ~ '^[a-z_]{1,32}$' then v_reason else 'invalid' end
      );
    end;
  end loop;

  return jsonb_build_object('accepted', v_accepted, 'duplicates', v_duplicates, 'rejected', v_rejected);
end;
$$;

-- ─── Seed: prices verified on 2026-10-18 ────────────────────────────────────
-- Source: https://developers.openai.com/api/docs/pricing (Standard and Flex,
-- gpt-6-luna, the model configured by default in suggest-image-names). Other
-- tiers/models stay unpriced (cost "unknown") until an admin adds them. The
-- 10% data-residency uplift is not included. Re-check before relying on it.
insert into usage_private.model_prices (
  provider, model, service_tier, max_input_tokens,
  input_usd_per_mtok, cached_input_usd_per_mtok, cache_write_usd_per_mtok, output_usd_per_mtok,
  effective_from, version, source_url
)
values
  ('openai', 'gpt-6-luna', 'default', 272000, 0.10, 0.01, 0.125, 0.50,
    '2026-10-18 00:00:00+07', 'openai-pricing-2026-10-18', 'https://developers.openai.com/api/docs/pricing'),
  ('openai', 'gpt-6-luna', 'default', null, 0.20, 0.02, 0.25, 0.75,
    '2026-10-18 00:00:00+07', 'openai-pricing-2026-10-18', 'https://developers.openai.com/api/docs/pricing'),
  ('openai', 'gpt-6-luna', 'flex', 272000, 0.05, 0.005, 0.0625, 0.25,
    '2026-10-18 00:00:00+07', 'openai-pricing-2026-10-18', 'https://developers.openai.com/api/docs/pricing'),
  ('openai', 'gpt-6-luna', 'flex', null, 0.10, 0.01, 0.125, 0.375,
    '2026-10-18 00:00:00+07', 'openai-pricing-2026-10-18', 'https://developers.openai.com/api/docs/pricing')
on conflict (provider, model, service_tier, (coalesce(max_input_tokens, 0)), effective_from) do nothing;

-- ─── Public wrappers ────────────────────────────────────────────────────────

-- Browser (guests and signed-in users): activity events only.
create or replace function public.usage_log_activity(p_events jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select usage_private.log_activity(p_events, auth.uid());
$$;

revoke execute on function public.usage_log_activity(jsonb) from public;
grant execute on function public.usage_log_activity(jsonb) to anon, authenticated;

-- Edge Function only (service_role). Browsers, admins included, cannot call these.
create or replace function public.ai_usage_begin(p_payload jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select usage_private.ai_begin(p_payload);
$$;

create or replace function public.ai_usage_attempt_start(p_payload jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select usage_private.ai_attempt_start(p_payload);
$$;

create or replace function public.ai_usage_attempt_finish(p_payload jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select usage_private.ai_attempt_finish(p_payload);
$$;

create or replace function public.ai_usage_finish(p_payload jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select usage_private.ai_finish(p_payload);
$$;

create or replace function public.ai_usage_record_rejection(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(p_payload->>'code', '') !~ '^[A-Za-z0-9_.-]{1,64}$' then
    raise exception 'invalid code' using errcode = '22023';
  end if;
  return usage_private.reject_request(p_payload, p_payload->>'code', (p_payload->>'http_status')::integer);
end;
$$;

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.ai_usage_begin(jsonb)',
    'public.ai_usage_attempt_start(jsonb)',
    'public.ai_usage_attempt_finish(jsonb)',
    'public.ai_usage_finish(jsonb)',
    'public.ai_usage_record_rejection(jsonb)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', v_fn);
    execute format('grant execute on function %s to service_role', v_fn);
  end loop;
end;
$$;

-- Functions are executable by PUBLIC by default (a per-schema default privilege
-- cannot remove that), so revoke explicitly. Schema USAGE is not granted either.
revoke execute on all functions in schema usage_private from public, anon, authenticated;

commit;
