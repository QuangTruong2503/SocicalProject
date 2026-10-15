-- Admin quotations: unified list/summary, detail/history, checked writes, trash.
-- Apply AFTER supabase_quotation_v2.sql, supabase_knm_quotations_v2.sql and
-- supabase_admin_profiles_policies.sql. Safe to re-run. No quotation is deleted
-- or modified merely by applying this migration.
-- Do not expose quotation_admin_private through the Supabase Data API.
begin;
create schema if not exists quotation_admin_private;
revoke all on schema quotation_admin_private from public, anon;
grant usage on schema quotation_admin_private to authenticated;

alter table public.quotation_audit_log drop constraint if exists quotation_audit_log_action_check;
alter table public.quotation_audit_log add constraint quotation_audit_log_action_check
  check (action in ('create', 'update', 'status', 'delete', 'restore'));
alter table public.knm_quotation_audit_log drop constraint if exists knm_quotation_audit_log_action_check;
alter table public.knm_quotation_audit_log add constraint knm_quotation_audit_log_action_check
  check (action in ('create', 'update', 'delete', 'restore'));

create index if not exists quotations_admin_trash_idx on public.quotations (deleted_at desc, id) where deleted_at is not null;
create index if not exists knm_quotations_admin_trash_idx on public.knm_quotations (deleted_at desc, id) where deleted_at is not null;

-- Do not let staff bypass the admin trash screen through the Data API.
drop policy if exists quotations_staff_select on public.quotations;
create policy quotations_staff_select on public.quotations for select to authenticated
  using (public.is_active_user() and (deleted_at is null or public.is_admin()));
drop policy if exists quotation_audit_log_select on public.quotation_audit_log;
create policy quotation_audit_log_select on public.quotation_audit_log for select to authenticated
  using (public.is_active_user() and (public.is_admin() or exists (
    select 1 from public.quotations q where q.id = quotation_id and q.deleted_at is null
  )));
drop policy if exists knm_quotation_audit_log_select on public.knm_quotation_audit_log;
create policy knm_quotation_audit_log_select on public.knm_quotation_audit_log for select to authenticated
  using (public.is_active_user() and (public.is_admin() or exists (
    select 1 from public.knm_quotations q where q.id = quotation_id and q.deleted_at is null
  )));

create or replace function quotation_admin_private.require_admin()
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or not coalesce(public.is_active_user(), false) or not coalesce(public.is_admin(), false) then
    raise exception 'Chỉ quản trị viên đang hoạt động được sử dụng chức năng này.' using errcode = '42501';
  end if;
end;
$$;

create or replace function quotation_admin_private.list_quotations(
  p_kind text, p_search text, p_status text, p_from date, p_to date,
  p_creator uuid, p_deleted boolean, p_sort text, p_desc boolean,
  p_limit integer, p_offset integer
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_search text := nullif(lower(btrim(coalesce(p_search, ''))), '');
  v_digits text := case when coalesce(p_search, '') ~ '^[0-9 +().-]+$'
    then nullif(regexp_replace(p_search, '\D', '', 'g'), '') end;
  v_sort text := case when p_sort in ('created_at','quotation_date','quotation_no','customer_name','total','deleted_at') then p_sort else 'created_at' end;
  v_desc boolean := coalesce(p_desc, true);
  v_month date := date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_result jsonb;
begin
  perform quotation_admin_private.require_admin();
  if p_kind is null or p_kind not in ('standard','knm') or (p_from is not null and p_to is not null and p_from > p_to)
    or (p_status is not null and p_status <> '' and (p_kind <> 'standard' or p_status not in ('draft','created','sent','confirmed','cancelled'))) then
    raise exception 'Bộ lọc không hợp lệ.' using errcode = '22023';
  end if;
  if length(v_digits) < 3 then v_digits := null; end if;
  with source as (
    select 'standard'::text as kind, q.id, q.quotation_no, q.quotation_date, q.customer_name,
      q.contact_name, q.phone, q.email, q.tax_code, q.total, q.status::text,
      q.prepared_by as creator_id, q.prepared_by_name as creator_name,
      q.created_at, q.updated_at, q.deleted_at
    from public.quotations q where p_kind = 'standard'
    union all
    select 'knm'::text, k.id, k.quotation_no, k.quotation_date, k.customer_name,
      k.customer_contact, k.customer_phone, k.customer_email, k.customer_tax_code,
      k.total, null::text, k.created_by, k.created_by_name, k.created_at, k.updated_at, k.deleted_at
    from public.knm_quotations k where p_kind = 'knm'
  ), filtered as (
    select * from source q
    where ((coalesce(p_deleted, false) and q.deleted_at is not null) or (not coalesce(p_deleted, false) and q.deleted_at is null))
      and (v_search is null or position(v_search in lower(concat_ws(' ', q.quotation_no, q.customer_name, q.contact_name, q.phone, q.email, q.tax_code, q.creator_name))) > 0
        or (v_digits is not null and (position(v_digits in regexp_replace(coalesce(q.phone,''), '\D','','g')) > 0
          or position(v_digits in regexp_replace(coalesce(q.tax_code,''), '\D','','g')) > 0)))
      and (nullif(p_status,'') is null or q.status = p_status)
      and (p_from is null or q.quotation_date >= p_from)
      and (p_to is null or q.quotation_date <= p_to)
      and (p_creator is null or q.creator_id = p_creator)
  ), ordered as (
    select q.*, row_number() over (order by
      case when v_sort = 'created_at' and v_desc then q.created_at end desc,
      case when v_sort = 'created_at' and not v_desc then q.created_at end asc,
      case when v_sort = 'quotation_date' and v_desc then q.quotation_date end desc,
      case when v_sort = 'quotation_date' and not v_desc then q.quotation_date end asc,
      case when v_sort = 'quotation_no' and v_desc then q.quotation_no end desc,
      case when v_sort = 'quotation_no' and not v_desc then q.quotation_no end asc,
      case when v_sort = 'customer_name' and v_desc then lower(q.customer_name) end desc,
      case when v_sort = 'customer_name' and not v_desc then lower(q.customer_name) end asc,
      case when v_sort = 'total' and v_desc then q.total end desc,
      case when v_sort = 'total' and not v_desc then q.total end asc,
      case when v_sort = 'deleted_at' and v_desc then q.deleted_at end desc,
      case when v_sort = 'deleted_at' and not v_desc then q.deleted_at end asc,
      q.created_at desc, q.id
    ) as ordinal from filtered q
  ), page as (
    select * from ordered order by ordinal
    limit least(greatest(coalesce(p_limit, 50),1),5000) offset greatest(coalesce(p_offset,0),0)
  ), creators as (
    select distinct on (creator_id) creator_id as id, coalesce(nullif(btrim(creator_name),''),'Nhân viên chưa có tên') as name
    from source where creator_id is not null order by creator_id, updated_at desc
  )
  select jsonb_build_object(
    'rows', (select coalesce(jsonb_agg(to_jsonb(p) - 'ordinal' order by p.ordinal), '[]'::jsonb) from page p),
    'total_count', (select count(*) from filtered),
    'summary', (select jsonb_build_object(
      'total', count(*), 'value', coalesce(sum(total) filter (where status is distinct from 'cancelled'),0),
      'draft', count(*) filter (where status = 'draft'), 'confirmed', count(*) filter (where status = 'confirmed'),
      'month', count(*) filter (where quotation_date >= v_month and quotation_date < (v_month + interval '1 month')::date),
      'recent', count(*) filter (where updated_at >= now() - interval '7 days')
    ) from filtered),
    'creators', (select coalesce(jsonb_agg(to_jsonb(c) order by lower(c.name), c.id), '[]'::jsonb) from creators c)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function quotation_admin_private.get_quotation(p_kind text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_record jsonb; v_history jsonb;
begin
  perform quotation_admin_private.require_admin();
  if p_kind = 'standard' then
    select to_jsonb(q) || jsonb_build_object('quotation_items', (
      select coalesce(jsonb_agg(to_jsonb(i) order by i.position), '[]'::jsonb)
      from public.quotation_items i where i.quotation_id = q.id
    )) into v_record from public.quotations q where q.id = p_id;
    select coalesce(jsonb_agg(to_jsonb(h) order by h.created_at desc,h.id desc),'[]'::jsonb) into v_history
    from (select id, actor_name, action, changes, created_at from public.quotation_audit_log
      where quotation_id = p_id order by created_at desc,id desc limit 50) h;
  elsif p_kind = 'knm' then
    select to_jsonb(k) into v_record from public.knm_quotations k where k.id = p_id;
    select coalesce(jsonb_agg(to_jsonb(h) order by h.created_at desc,h.id desc),'[]'::jsonb) into v_history
    from (select id, actor_name, action, changes, created_at from public.knm_quotation_audit_log
      where quotation_id = p_id order by created_at desc,id desc limit 50) h;
  else raise exception 'Loại báo giá không hợp lệ.' using errcode = '22023';
  end if;
  if v_record is null then raise exception 'Không tìm thấy báo giá.' using errcode = 'P0002'; end if;
  return jsonb_build_object('record', v_record, 'history', v_history);
end;
$$;

create or replace function quotation_admin_private.change_quotation(
  p_kind text, p_id uuid, p_action text, p_expected_updated_at timestamptz, p_status text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_standard public.quotations;
  v_knm public.knm_quotations;
  v_updated timestamptz;
  v_deleted timestamptz;
  v_status text;
begin
  perform quotation_admin_private.require_admin();
  if p_kind is null or p_kind not in ('standard','knm') or p_action is null or p_action not in ('delete','status','restore') then
    raise exception 'Thao tác không hợp lệ.' using errcode = '22023';
  end if;
  if p_kind = 'standard' then
    select * into v_standard from public.quotations where id = p_id for update;
    if not found then raise exception 'Không tìm thấy báo giá.' using errcode = 'P0002'; end if;
    v_updated := v_standard.updated_at; v_deleted := v_standard.deleted_at; v_status := v_standard.status::text;
  else
    select * into v_knm from public.knm_quotations where id = p_id for update;
    if not found then raise exception 'Không tìm thấy báo giá.' using errcode = 'P0002'; end if;
    v_updated := v_knm.updated_at; v_deleted := v_knm.deleted_at;
  end if;
  if p_expected_updated_at is null or v_updated is distinct from p_expected_updated_at then
    raise exception 'Báo giá đã thay đổi. Hãy làm mới danh sách trước khi thao tác.' using errcode = '40001';
  end if;
  if (p_action = 'restore' and v_deleted is null) or (p_action <> 'restore' and v_deleted is not null) then
    raise exception 'Báo giá đã được xóa hoặc khôi phục ở phiên khác.' using errcode = '40001';
  end if;
  if p_action = 'restore' then
    if p_kind = 'standard' then
      update public.quotations set deleted_at = null, updated_at = clock_timestamp(), updated_by = auth.uid() where id = p_id;
      insert into public.quotation_audit_log (quotation_id,actor_id,actor_name,action,changes)
      values (p_id,auth.uid(),public.quotation_actor_name(),'restore',jsonb_build_object('deleted_at',jsonb_build_object('from',v_deleted,'to',null)));
    else
      update public.knm_quotations set deleted_at = null, updated_at = clock_timestamp(), updated_by = auth.uid(), updated_by_name = public.knm_actor_name() where id = p_id;
      insert into public.knm_quotation_audit_log (quotation_id,actor_id,actor_name,action,changes)
      values (p_id,auth.uid(),public.knm_actor_name(),'restore',jsonb_build_object('deleted_at',jsonb_build_object('from',v_deleted,'to',null)));
    end if;
  elsif p_action = 'delete' then
    if p_kind = 'standard' then perform public.delete_quotation_draft(p_id);
    else perform public.delete_knm_quotation(p_id); end if;
  else
    if p_kind <> 'standard' or p_status is null or p_status not in ('draft','created','sent','confirmed','cancelled') then
      raise exception 'Trạng thái không hợp lệ.' using errcode = '22023';
    end if;
    if p_status <> v_status then perform public.set_quotation_status(p_id,p_status); end if;
  end if;
  return jsonb_build_object('id', p_id, 'kind', p_kind, 'action', p_action);
end;
$$;

create or replace function public.admin_list_quotations(
  p_kind text default 'standard', p_search text default null, p_status text default null,
  p_from date default null, p_to date default null, p_creator uuid default null,
  p_deleted boolean default false, p_sort text default 'created_at', p_desc boolean default true,
  p_limit integer default 50, p_offset integer default 0
)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select quotation_admin_private.list_quotations(p_kind,p_search,p_status,p_from,p_to,p_creator,p_deleted,p_sort,p_desc,p_limit,p_offset);
$$;
create or replace function public.admin_get_quotation(p_kind text, p_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select quotation_admin_private.get_quotation(p_kind,p_id);
$$;
create or replace function public.admin_change_quotation(
  p_kind text, p_id uuid, p_action text, p_expected_updated_at timestamptz, p_status text default null
)
returns jsonb language sql security invoker set search_path = '' as $$
  select quotation_admin_private.change_quotation(p_kind,p_id,p_action,p_expected_updated_at,p_status);
$$;

revoke all on all functions in schema quotation_admin_private from public,anon,authenticated;
grant execute on function quotation_admin_private.list_quotations(text,text,text,date,date,uuid,boolean,text,boolean,integer,integer),
  quotation_admin_private.get_quotation(text,uuid), quotation_admin_private.change_quotation(text,uuid,text,timestamptz,text) to authenticated;
revoke execute on function public.admin_list_quotations(text,text,text,date,date,uuid,boolean,text,boolean,integer,integer),
  public.admin_get_quotation(text,uuid), public.admin_change_quotation(text,uuid,text,timestamptz,text) from public,anon;
grant execute on function public.admin_list_quotations(text,text,text,date,date,uuid,boolean,text,boolean,integer,integer),
  public.admin_get_quotation(text,uuid), public.admin_change_quotation(text,uuid,text,timestamptz,text) to authenticated;
notify pgrst, 'reload schema';
commit;
