-- Refresh the shared image/folder naming catalog while retaining per-plan selections.
begin;

alter table usage_private.plan_models drop constraint if exists plan_models_valid;

with mapped as (
  select plan, allowed_models as previous, array(
    select model
    from (values
      (1, 'gpt-6-luna', 'gpt-6-luna'),
      (2, 'gpt-6.1-terra', 'gpt-6-astra'),
      (3, 'gpt-6.2-sol', 'gpt-6.1-sol')
    ) as replacements(position, model, previous_model)
    where model = any(allowed_models) or previous_model = any(allowed_models)
    order by position
  ) as next
  from usage_private.plan_models
), changed as (
  update usage_private.plan_models as plans
  set allowed_models = mapped.next, updated_at = now(), updated_by = null
  from mapped
  where plans.plan = mapped.plan and plans.allowed_models is distinct from mapped.next
  returning plans.plan, mapped.previous, plans.allowed_models
)
insert into usage_private.config_audit(action, target, before_value, after_value)
select 'plan_models.catalog_replace', 'plan:' || plan,
  jsonb_build_object('allowed_models', previous), jsonb_build_object('allowed_models', allowed_models)
from changed;

alter table usage_private.plan_models add constraint plan_models_valid check (
  allowed_models <@ array['gpt-6-luna', 'gpt-6.1-terra', 'gpt-6.2-sol']::text[]
  and array_position(allowed_models, null) is null
);

create or replace function usage_private.admin_config_change_with_models(p_action text, p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_catalog constant text[] := array['gpt-6-luna', 'gpt-6.1-terra', 'gpt-6.2-sol'];
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
    where jsonb_typeof(v) <> 'string' or not ((v #>> '{}') = any(v_catalog))
  ) then
    raise exception 'Model không được hỗ trợ.' using errcode = '22023';
  end if;
  select coalesce(array_agg(model order by ord), '{}'::text[]) into v_models
  from unnest(v_catalog) with ordinality as catalog(model, ord)
  where p_payload->'allowed_models' ? model;

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

-- Standard USD / 1M tokens, with 30-minute cache writes. Existing open price bands win.
insert into usage_private.model_prices (
  provider, model, service_tier, max_input_tokens,
  input_usd_per_mtok, cached_input_usd_per_mtok, cache_write_usd_per_mtok, output_usd_per_mtok,
  effective_from, version, source_url
)
select 'openai', model, 'default', input_limit, input_rate, cached_rate, write_rate, output_rate,
  '2026-11-19 00:00:00+07'::timestamptz, 'openai-pricing-2026-11-19',
  'https://developers.openai.com/api/docs/models/' || model
from (values
  ('gpt-6.1-terra', 272000, 1.00, 0.05, 1.25, 5.00),
  ('gpt-6.1-terra', null, 2.00, 0.10, 2.50, 7.50),
  ('gpt-6.2-sol', 272000, 2.00, 0.10, 2.50, 10.00),
  ('gpt-6.2-sol', null, 4.00, 0.20, 5.00, 15.00)
) as rates(model, input_limit, input_rate, cached_rate, write_rate, output_rate)
where not exists (
  select 1 from usage_private.model_prices p
  where p.provider = 'openai' and p.model = rates.model and p.service_tier = 'default'
    and p.max_input_tokens is not distinct from rates.input_limit and p.effective_to is null
)
on conflict (provider, model, service_tier, (coalesce(max_input_tokens, 0)), effective_from) do nothing;

commit;
