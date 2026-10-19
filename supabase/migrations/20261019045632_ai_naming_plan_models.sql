-- Per-plan model permissions for /admin/usage and image naming. Re-runnable.
-- Requires the access, usage ledger and usage admin migrations.
begin;

create table if not exists usage_private.plan_models (
  plan text primary key check (plan in ('free', 'pro', 'enterprise', 'admin')),
  allowed_models text[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint plan_models_valid check (
    allowed_models <@ array['gpt-6-luna', 'gpt-6.1-sol', 'gpt-6-astra']::text[]
    and array_position(allowed_models, null) is null
  )
);
alter table usage_private.plan_models enable row level security;
revoke all on usage_private.plan_models from public, anon, authenticated;

insert into usage_private.plan_models(plan, allowed_models) values
  ('free', '{}'),
  ('pro', array['gpt-6-luna', 'gpt-6.1-sol', 'gpt-6-astra']),
  ('enterprise', array['gpt-6-luna', 'gpt-6.1-sol', 'gpt-6-astra']),
  ('admin', array['gpt-6-luna', 'gpt-6.1-sol', 'gpt-6-astra'])
on conflict (plan) do nothing;

-- No user ID argument: callers can only ask about their own verified JWT.
create or replace function usage_private.caller_ai_naming_models()
returns text[]
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select m.allowed_models
    from public.profiles p
    join usage_private.plan_models m on m.plan = case
      when p.role = 'admin' then 'admin'
      else coalesce(nullif(lower(btrim(p.plan)), ''), 'free') end
    where p.id = auth.uid() and coalesce(p.status, 'active') <> 'suspended'
  ), '{}'::text[]);
$$;

create or replace function public.ai_naming_models()
returns text[]
language sql stable security invoker set search_path = ''
as $$ select usage_private.caller_ai_naming_models(); $$;

-- Older clients still get the same boolean contract, backed by configuration.
create or replace function public.can_use_ai_naming()
returns boolean
language sql stable security invoker set search_path = ''
as $$ select cardinality(usage_private.caller_ai_naming_models()) > 0; $$;

create or replace function usage_private.admin_config_with_models()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform usage_private.require_admin();
  return usage_private.admin_config() || jsonb_build_object('plan_models', (
    select coalesce(jsonb_agg(to_jsonb(m) order by m.plan), '[]'::jsonb)
    from usage_private.plan_models m
  ));
end;
$$;

create or replace function usage_private.admin_config_change_with_models(p_action text, p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_plan text;
  v_models text[];
  v_before jsonb;
  v_after jsonb;
begin
  perform usage_private.require_admin();
  if p_action is distinct from 'plan_models.update' then
    return usage_private.admin_config_change(p_action, p_payload);
  end if;

  v_plan := p_payload->>'plan';
  if v_plan is null or v_plan not in ('free', 'pro', 'enterprise', 'admin') then
    raise exception 'Gói không hợp lệ.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payload->'allowed_models') is distinct from 'array' then
    raise exception 'Danh sách model không hợp lệ.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_payload->'allowed_models') v
    where jsonb_typeof(v) <> 'string'
      or v #>> '{}' not in ('gpt-6-luna', 'gpt-6.1-sol', 'gpt-6-astra')
  ) then
    raise exception 'Model không được hỗ trợ.' using errcode = '22023';
  end if;
  select coalesce(array_agg(m order by ord), '{}'::text[]) into v_models
  from unnest(array['gpt-6-luna', 'gpt-6.1-sol', 'gpt-6-astra']) with ordinality as catalog(m, ord)
  where p_payload->'allowed_models' ? m;

  select jsonb_build_object('allowed_models', allowed_models) into v_before
  from usage_private.plan_models where plan = v_plan for update;
  v_after := jsonb_build_object('allowed_models', v_models);
  if v_before is distinct from v_after then
    update usage_private.plan_models
    set allowed_models = v_models, updated_at = now(), updated_by = auth.uid()
    where plan = v_plan;
    perform usage_private.audit(p_action, 'plan:' || v_plan, v_before, v_after);
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Privileged implementations stay in the private schema; public RPCs forward.
create or replace function public.admin_usage_config()
returns jsonb
language sql stable security invoker set search_path = ''
as $$ select usage_private.admin_config_with_models(); $$;

create or replace function public.admin_usage_config_change(p_action text, p_payload jsonb)
returns jsonb
language sql security invoker set search_path = ''
as $$ select usage_private.admin_config_change_with_models(p_action, p_payload); $$;

grant usage on schema usage_private to authenticated;
revoke all on function usage_private.caller_ai_naming_models() from public, anon, authenticated;
revoke all on function usage_private.admin_config_with_models() from public, anon, authenticated;
revoke all on function usage_private.admin_config_change_with_models(text, jsonb) from public, anon, authenticated;
grant execute on function usage_private.caller_ai_naming_models() to authenticated;
grant execute on function usage_private.admin_config_with_models() to authenticated;
grant execute on function usage_private.admin_config_change_with_models(text, jsonb) to authenticated;
revoke all on function public.ai_naming_models() from public, anon;
revoke all on function public.can_use_ai_naming() from public, anon;
revoke all on function public.admin_usage_config() from public, anon;
revoke all on function public.admin_usage_config_change(text, jsonb) from public, anon;
grant execute on function public.ai_naming_models() to authenticated;
grant execute on function public.can_use_ai_naming() to authenticated;
grant execute on function public.admin_usage_config() to authenticated;
grant execute on function public.admin_usage_config_change(text, jsonb) to authenticated;

commit;
