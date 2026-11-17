-- Unified user administration. Requires profiles/admin setup, product links
-- (including companies), usage ledger/admin, and user_last_activity migrations.
-- Additive only: no account, permission, quota, usage or historical event is reset.
begin;
create schema if not exists user_admin_private;
revoke all on schema user_admin_private from public, anon, authenticated;
grant usage on schema user_admin_private to authenticated;

alter table public.admin_audit_log add column if not exists note text;
alter table public.admin_audit_log add column if not exists batch_id uuid;
create index if not exists product_link_logs_target_user_idx
  on public.product_link_logs ((details->>'target_user_id'), id desc)
  where action in ('grant', 'revoke');
create index if not exists config_audit_target_created_idx
  on usage_private.config_audit (target, created_at desc, id desc);

create or replace function user_admin_private.account_audit_context()
returns trigger language plpgsql set search_path='' as $$
begin
  new.batch_id:=coalesce(new.batch_id,nullif(current_setting('user_admin.account_batch_id',true),'')::uuid);
  return new;
end; $$;
drop trigger if exists user_admin_audit_context on public.admin_audit_log;
create trigger user_admin_audit_context before insert on public.admin_audit_log
  for each row execute function user_admin_private.account_audit_context();

-- One joined account/permission source for BOTH directory modes, without N+1.
create or replace function user_admin_private.directory_rows()
returns table (profile jsonb, direct_level text, effective_level text, permission_source text,
  access_updated_at timestamptz, granted_by uuid, granted_by_name text, granted_by_email text,
  has_quota_override boolean)
language sql stable security invoker as $$
  select to_jsonb(p), a.level,
    case when p.status = 'suspended' then null when p.role = 'admin' then 'admin' else a.level end,
    case when p.status = 'suspended' then 'blocked' when p.role = 'admin' then 'admin'
      when a.level is not null then 'direct' else 'none' end,
    a.updated_at, a.granted_by,
    coalesce(nullif(g.full_name,''), nullif(g.username,''), g.email), g.email,
    o.user_id is not null
  from public.profiles p
  left join public.product_link_access a on a.user_id = p.id
  left join public.profiles g on g.id = a.granted_by
  left join usage_private.user_quota_overrides o on o.user_id = p.id;
$$;

create or replace function user_admin_private.directory(f jsonb, p_limit integer, p_offset integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb; v_sort text := coalesce(f->>'sort', 'created_at');
  v_desc boolean := coalesce((f->>'desc')::boolean, true);
begin
  perform usage_private.require_admin();
  with filtered as materialized (
    select d.*, d.profile->>'id' uid,
      lower(coalesce(nullif(d.profile->>'full_name',''), d.profile->>'username', d.profile->>'email')) sort_name
    from user_admin_private.directory_rows() d
    where (nullif(f->>'user','') is null or d.profile->>'id' = f->>'user')
      and (nullif(btrim(f->>'search'),'') is null or position(lower(btrim(f->>'search')) in
        lower(concat_ws(' ',d.profile->>'full_name',d.profile->>'username',d.profile->>'email',d.profile->>'id'))) > 0)
      and (nullif(f->>'role','') is null or coalesce(d.profile->>'role','user') = f->>'role')
      and (nullif(f->>'status','') is null or coalesce(d.profile->>'status','active') = f->>'status')
      and (nullif(f->>'plan','') is null or coalesce(d.profile->>'plan','free') = f->>'plan')
      and (nullif(f->>'verified','') is null or coalesce(d.profile->>'is_verified','false') = f->>'verified')
      and (nullif(f->>'quota','') is null or d.has_quota_override = (f->>'quota' = 'override'))
      and (nullif(f->>'level','') is null
        or (f->>'level' = 'granted' and d.effective_level is not null)
        or (f->>'level' = 'none' and d.effective_level is null)
        or (f->>'level' = 'admin' and d.permission_source = 'admin')
        or (f->>'level' in ('viewer','checker','editor') and d.effective_level = f->>'level'))
  ), page as (
    select b.* from filtered b order by
      case when v_sort='name' and v_desc then sort_name end desc nulls last,
      case when v_sort='name' and not v_desc then sort_name end asc nulls last,
      case when v_sort='last_active_at' and v_desc then (profile->>'last_active_at')::timestamptz end desc nulls last,
      case when v_sort='last_active_at' and not v_desc then (profile->>'last_active_at')::timestamptz end asc nulls last,
      case when v_sort='level' and v_desc then effective_level end desc nulls last,
      case when v_sort='level' and not v_desc then effective_level end asc nulls last,
      case when v_sort='created_at' and v_desc then (profile->>'created_at')::timestamptz end desc nulls last,
      case when v_sort='created_at' and not v_desc then (profile->>'created_at')::timestamptz end asc nulls last,
      sort_name, uid
    limit least(greatest(coalesce(p_limit,50),1),5000) offset greatest(coalesce(p_offset,0),0)
  ) select jsonb_build_object('rows', coalesce((select jsonb_agg(profile || (to_jsonb(page)-'profile'-'sort_name'-'uid')) from page),'[]'::jsonb),
    'totalCount', (select count(*) from filtered)) into v_result;
  return v_result;
end; $$;

create or replace function user_admin_private.stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform usage_private.require_admin();
  select jsonb_build_object('total',count(*),
    'active',count(*) filter(where coalesce(profile->>'status','active') <> 'suspended'),
    'suspended',count(*) filter(where profile->>'status' = 'suspended'),
    'effective_access',count(*) filter(where effective_level is not null),
    'direct_access',count(*) filter(where permission_source='direct'),
    'admin_access',count(*) filter(where permission_source='admin'),
    'quota_overrides',count(*) filter(where has_quota_override),
    'suspended_with_access',count(*) filter(where permission_source='blocked' and (direct_level is not null or profile->>'role'='admin')))
  into v from user_admin_private.directory_rows();
  return v;
end; $$;

create or replace function user_admin_private.detail(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb; q jsonb; o jsonb; defaults jsonb; used jsonb;
begin
  perform usage_private.require_admin();
  select profile || (to_jsonb(d)-'profile') into v from user_admin_private.directory_rows() d
    where profile->>'id'=p_user::text;
  if v is null then raise exception 'Không tìm thấy người dùng hoặc tài khoản đã bị xóa.' using errcode='P0002'; end if;
  select to_jsonb(e) into q from usage_private.effective_quota(p_user) e;
  select to_jsonb(t) into defaults from usage_private.plan_quotas t where plan=q->>'plan_key';
  select to_jsonb(t) into o from usage_private.user_quota_overrides t where user_id=p_user;
  select jsonb_build_object('daily',coalesce(sum(images_requested) filter(where created_at>=usage_private.vn_day_start(now())),0),
    'monthly',coalesce(sum(images_requested),0)) into used
  from usage_private.ai_usage_requests where user_id=p_user and status<>'rejected'
    and created_at>=usage_private.vn_month_start(now()) and created_at<=now();
  v:=v||jsonb_build_object('access_note',(select details->>'note' from public.product_link_logs
    where details->>'target_user_id'=p_user::text and action in ('grant','revoke') order by id desc limit 1));
  return jsonb_build_object('profile',v,'activity',public.admin_user_activity(p_user),'quota',jsonb_build_object('effective',q,'defaults',defaults,'override',o,
    'enforced',(select quota_enforced from usage_private.settings where id=1),'used',used,
    'period_day',to_char(now() at time zone 'Asia/Ho_Chi_Minh','YYYY-MM-DD'),
    'period_month',to_char(now() at time zone 'Asia/Ho_Chi_Minh','YYYY-MM')));
end; $$;

-- Extend the existing permission audit trigger; old rows stay untouched.
create or replace function user_admin_private.access_log()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_id uuid; old_level text; new_level text; target_name text;
begin
  if tg_op='UPDATE' and new.level is not distinct from old.level then return null; end if;
  if tg_op <> 'DELETE' then target_id:=new.user_id; new_level:=new.level; end if;
  if tg_op <> 'INSERT' then target_id:=old.user_id; old_level:=old.level; end if;
  select coalesce(nullif(full_name,''),nullif(username,''),email) into target_name from public.profiles where id=target_id;
  if not found then return null; end if;
  insert into public.product_link_logs(user_id,actor_name,action,details) values (
    public.product_links_actor_id(),public.product_links_actor_name(),case when tg_op='DELETE' then 'revoke' else 'grant' end,
    jsonb_build_object('target_user_id',target_id,'target_name',target_name,'level',new_level,'previous_level',old_level,
      'note',nullif(current_setting('user_admin.note',true),''),
      'batch_id',nullif(current_setting('user_admin.batch_id',true),'')));
  return null;
end; $$;
drop trigger if exists product_link_access_log on public.product_link_access;
create trigger product_link_access_log after insert or update or delete on public.product_link_access
  for each row execute function user_admin_private.access_log();

-- An expected snapshot is mandatory for every target. All are checked BEFORE
-- any write; errors roll back the whole batch including its trigger audits.
create or replace function user_admin_private.set_access(p_targets jsonb, p_level text, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t jsonb; p public.profiles; a public.product_link_access;
  v_level text:=nullif(btrim(p_level),''); v_batch uuid:=gen_random_uuid(); v_updated integer:=0; v_unchanged integer:=0;
begin
  perform pg_advisory_xact_lock(hashtext('public.admin_update_profile'));
  perform usage_private.require_admin();
  if jsonb_typeof(p_targets) is distinct from 'array' or jsonb_array_length(p_targets) not between 1 and 500 then
    raise exception 'Chọn từ 1 đến 500 tài khoản.' using errcode='22023'; end if;
  if v_level is not null and v_level not in ('viewer','checker','editor') then
    raise exception 'Quyền không hợp lệ.' using errcode='22023'; end if;
  if char_length(coalesce(p_note,''))>200 then raise exception 'Ghi chú tối đa 200 ký tự.' using errcode='22023'; end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_targets)) <> jsonb_array_length(p_targets) then
    raise exception 'Danh sách tài khoản bị trùng hoặc thiếu ID.' using errcode='22023'; end if;
  for t in select value from jsonb_array_elements(p_targets) order by value->>'id' loop
    select * into p from public.profiles where id=(t->>'id')::uuid for update;
    if not found then raise exception 'Tài khoản % không còn tồn tại.',t->>'id' using errcode='P0002'; end if;
    if p.role='admin' then raise exception 'Tài khoản % kế thừa quyền admin; hãy quản lý vai trò hệ thống.',p.email using errcode='22023'; end if;
    select * into a from public.product_link_access where user_id=p.id for update;
    if not (t ?& array['role','status','direct_level','access_updated_at'])
      or (t->>'role') is distinct from coalesce(p.role,'user')
      or (t->>'status') is distinct from coalesce(p.status,'active')
      or (t->>'direct_level') is distinct from a.level
      or (t->>'access_updated_at')::timestamptz is distinct from a.updated_at then
      raise exception 'Quyền hoặc tài khoản % vừa thay đổi. Tải lại dữ liệu trước khi lưu.',p.email using errcode='40001';
    end if;
  end loop;
  perform set_config('user_admin.note',coalesce(btrim(p_note),''),true);
  perform set_config('user_admin.batch_id',v_batch::text,true);
  for t in select value from jsonb_array_elements(p_targets) loop
    select * into a from public.product_link_access where user_id=(t->>'id')::uuid;
    if a.level is not distinct from v_level then v_unchanged:=v_unchanged+1; continue; end if;
    if v_level is null then delete from public.product_link_access where user_id=(t->>'id')::uuid;
    else insert into public.product_link_access(user_id,level) values((t->>'id')::uuid,v_level)
      on conflict(user_id) do update set level=excluded.level; end if;
    v_updated:=v_updated+1;
  end loop;
  perform set_config('user_admin.note','',true);
  perform set_config('user_admin.batch_id','',true);
  return jsonb_build_object('updated_count',v_updated,'unchanged_count',v_unchanged,'batch_id',v_batch);
end; $$;

create or replace function user_admin_private.set_quota(p_user uuid,p_expected jsonb,p_value jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_current jsonb; v_payload jsonb; v_result jsonb;
begin
  perform usage_private.require_admin();
  perform 1 from public.profiles where id=p_user for update;
  if not found then raise exception 'Không tìm thấy người dùng.' using errcode='P0002'; end if;
  select to_jsonb(o) into v_current from usage_private.user_quota_overrides o where user_id=p_user for update;
  if coalesce(p_expected,'null'::jsonb) is distinct from coalesce(v_current,'null'::jsonb) then
    raise exception 'Ngoại lệ vừa thay đổi. Tải lại dữ liệu trước khi lưu.' using errcode='40001'; end if;
  v_payload:=(case when p_value is null or p_value='null'::jsonb then '{}'::jsonb else p_value end)
    ||jsonb_build_object('user',p_user);
  -- Reuse existing validation, quota storage and audit transaction.
  v_result:=usage_private.admin_config_change(case when p_value is null or p_value='null'::jsonb
    then 'user_quota.delete' else 'user_quota.upsert' end,v_payload);
  return v_result;
end; $$;

create or replace function user_admin_private.set_profile(p_user uuid,p_expected jsonb,p_updates jsonb)
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare p public.profiles; k text; v_result public.profiles; a public.product_link_access;
begin
  perform pg_advisory_xact_lock(hashtext('public.admin_update_profile'));
  perform usage_private.require_admin();
  select * into p from public.profiles where id=p_user for update;
  if not found then raise exception 'Không tìm thấy người dùng.' using errcode='P0002'; end if;
  foreach k in array array['role','status','is_verified','plan','credits'] loop
    if not (p_expected ? k) or p_expected->k is distinct from to_jsonb(p)->k then
      raise exception 'Tài khoản vừa thay đổi. Tải lại dữ liệu trước khi lưu.' using errcode='40001'; end if;
  end loop;
  if p.role='admin' and p_updates->>'role'='user' then
    select * into a from public.product_link_access where user_id=p_user for update;
    if not (p_expected ?& array['direct_level','access_updated_at'])
      or p_expected->>'direct_level' is distinct from a.level
      or (p_expected->>'access_updated_at')::timestamptz is distinct from a.updated_at then
      raise exception 'Quyền trực tiếp vừa thay đổi. Tải lại để xem đúng quyền còn lại khi hạ vai trò.' using errcode='40001';
    end if;
  end if;
  for k in select jsonb_object_keys(p_updates) loop
    if k not in ('role','status','is_verified','plan','credits') then
      raise exception 'Không thể thay đổi trường %.',k using errcode='22023'; end if;
  end loop;
  v_result:=public.admin_update_profile(p_user,p_updates->>'role',p_updates->>'status',
    (p_updates->>'is_verified')::boolean,p_updates->>'plan',(p_updates->>'credits')::integer);
  return v_result;
end; $$;

create or replace function user_admin_private.bulk_status(p_targets jsonb,p_status text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t jsonb; p public.profiles; v_count integer:=0; v_batch uuid:=gen_random_uuid();
begin
  perform pg_advisory_xact_lock(hashtext('public.admin_update_profile'));
  perform usage_private.require_admin();
  if p_status not in ('active','suspended') or p_status is null or jsonb_typeof(p_targets) is distinct from 'array'
    or jsonb_array_length(p_targets) not between 1 and 500 then raise exception 'Lô cập nhật trạng thái không hợp lệ.' using errcode='22023'; end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_targets))<>jsonb_array_length(p_targets) then
    raise exception 'Tài khoản trong lô bị trùng hoặc thiếu ID.' using errcode='22023'; end if;
  perform set_config('user_admin.account_batch_id',v_batch::text,true);
  for t in select value from jsonb_array_elements(p_targets) order by value->>'id' loop
    p:=user_admin_private.set_profile((t->>'id')::uuid,t,jsonb_build_object('status',p_status));
    v_count:=v_count+1;
  end loop;
  perform set_config('user_admin.account_batch_id','',true);
  return jsonb_build_object('updated_count',v_count,'batch_id',v_batch);
end; $$;

-- The two row helpers are invokers without SET clauses so the planner can
-- inline them and push filters into the original indexed tables. They are
-- revoked from browser roles and called only inside checked definer functions.
-- Read history from the existing stores, not a parallel copy. Legacy fields
-- that were never recorded stay NULL, and event IDs include their source.
create or replace function user_admin_private.history_rows()
returns table(event_id text,kind text,actor_id uuid,target_id uuid,action text,tool text,
  before_value jsonb,after_value jsonb,details jsonb,note text,batch_id text,created_at timestamptz)
language sql stable security invoker as $$
  select 'account:'||a.id,'admin',a.actor_id,a.target_id,a.action,'account',
    (select jsonb_object_agg(key,value->'from') from jsonb_each(a.changes)),
    (select jsonb_object_agg(key,value->'to') from jsonb_each(a.changes)),
    a.changes||jsonb_build_object('recorded_actor_email',a.actor_email),a.note,a.batch_id::text,a.created_at from public.admin_audit_log a
  union all
  select 'links:'||l.id,case when l.action in ('grant','revoke') then 'admin' else 'work' end,
    l.user_id,case when l.action in ('grant','revoke') then (l.details->>'target_user_id')::uuid else l.user_id end,
    l.action,'product-links',
    case when l.details ? 'previous_level' then jsonb_build_object('level',l.details->'previous_level') end,
    case when l.action in ('grant','revoke') then jsonb_build_object('level',l.details->'level') end,
    l.details||jsonb_build_object('item_code',l.item_code),l.details->>'note',l.details->>'batch_id',l.created_at
  from public.product_link_logs l
  union all
  select 'quota:'||c.id,'admin',c.actor_id,substring(c.target from 6)::uuid,c.action,'ai',
    c.before_value,c.after_value,'{}'::jsonb,c.after_value->>'note',null,c.created_at
  from usage_private.config_audit c where c.action in ('user_quota.upsert','user_quota.delete') and c.target like 'user:%'
  union all
  select 'usage:'||e.event_id,'work',e.user_id,e.user_id,e.action,e.feature,null,null,
    jsonb_build_object('status',e.status),null,null,e.received_at
  from usage_private.usage_activity_events e where e.user_id is not null;
$$;

create or replace function user_admin_private.history(f jsonb,p_limit integer,p_offset integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform usage_private.require_admin();
  with filtered as materialized (
    select h.*,coalesce(a.email,h.details->>'recorded_actor_email') actor_email,coalesce(nullif(a.full_name,''),a.username,a.email) actor_name,
      t.email target_email,coalesce(nullif(t.full_name,''),t.username,t.email,h.details->>'target_name') target_name
    from user_admin_private.history_rows() h
    left join public.profiles a on a.id=h.actor_id left join public.profiles t on t.id=h.target_id
    where (coalesce(f->>'kind','admin')='all' or h.kind=coalesce(f->>'kind','admin'))
      and (nullif(f->>'user','') is null or h.actor_id::text=f->>'user' or h.target_id::text=f->>'user')
      and (nullif(f->>'actor','') is null or h.actor_id::text=f->>'actor')
      and (nullif(f->>'target','') is null or h.target_id::text=f->>'target')
      and (nullif(f->>'tool','') is null or h.tool=f->>'tool')
      and (nullif(f->>'search','') is null or position(lower(btrim(f->>'search')) in lower(concat_ws(' ',
        a.email,a.full_name,a.username,h.actor_id::text,t.email,t.full_name,t.username,h.target_id::text,h.action,h.batch_id,h.note,h.details->>'target_name'))) > 0)
  ), page as (select * from filtered order by created_at desc,event_id desc
    limit least(greatest(coalesce(p_limit,50),1),500) offset greatest(coalesce(p_offset,0),0))
  select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,event_id desc) from page),'[]'::jsonb),
    'totalCount',(select count(*) from filtered)) into v;
  return v;
end; $$;

-- Restrict all private functions; only checked implementations are callable by
-- invoker public RPC wrappers. directory_rows/history_rows are never granted.
revoke all on all functions in schema user_admin_private from public,anon,authenticated;
grant execute on function user_admin_private.directory(jsonb,integer,integer),user_admin_private.stats(),
  user_admin_private.detail(uuid),user_admin_private.set_access(jsonb,text,text),
  user_admin_private.set_quota(uuid,jsonb,jsonb),user_admin_private.set_profile(uuid,jsonb,jsonb),
  user_admin_private.bulk_status(jsonb,text),
  user_admin_private.history(jsonb,integer,integer) to authenticated;

create or replace function public.admin_user_directory(p_filters jsonb default '{}',p_limit integer default 50,p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$
  select user_admin_private.directory(coalesce(p_filters,'{}'),p_limit,p_offset); $$;
create or replace function public.admin_user_center_stats()
returns jsonb language sql stable security invoker set search_path='' as $$ select user_admin_private.stats(); $$;
create or replace function public.admin_user_detail(p_user_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$ select user_admin_private.detail(p_user_id); $$;
create or replace function public.admin_user_set_access(p_targets jsonb,p_level text,p_note text default null)
returns jsonb language sql security invoker set search_path='' as $$ select user_admin_private.set_access(p_targets,p_level,p_note); $$;
create or replace function public.admin_user_set_quota(p_user_id uuid,p_expected jsonb,p_value jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select user_admin_private.set_quota(p_user_id,p_expected,p_value); $$;
create or replace function public.admin_user_update_profile(p_user_id uuid,p_expected jsonb,p_updates jsonb)
returns public.profiles language sql security invoker set search_path='' as $$ select user_admin_private.set_profile(p_user_id,p_expected,p_updates); $$;
create or replace function public.admin_user_bulk_status(p_targets jsonb,p_status text)
returns jsonb language sql security invoker set search_path='' as $$ select user_admin_private.bulk_status(p_targets,p_status); $$;
create or replace function public.admin_user_history(p_filters jsonb default '{}',p_limit integer default 50,p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$
  select user_admin_private.history(coalesce(p_filters,'{}'),p_limit,p_offset); $$;
revoke all on function public.admin_user_directory(jsonb,integer,integer),public.admin_user_center_stats(),
  public.admin_user_detail(uuid),public.admin_user_set_access(jsonb,text,text),
  public.admin_user_set_quota(uuid,jsonb,jsonb),public.admin_user_update_profile(uuid,jsonb,jsonb),
  public.admin_user_bulk_status(jsonb,text),
  public.admin_user_history(jsonb,integer,integer) from public,anon;
grant execute on function public.admin_user_directory(jsonb,integer,integer),public.admin_user_center_stats(),
  public.admin_user_detail(uuid),public.admin_user_set_access(jsonb,text,text),
  public.admin_user_set_quota(uuid,jsonb,jsonb),public.admin_user_update_profile(uuid,jsonb,jsonb),
  public.admin_user_bulk_status(jsonb,text),
  public.admin_user_history(jsonb,integer,integer) to authenticated;
-- All UI changes go through audited RPCs. Existing privileged RPCs remain
-- compatible for rollback; ordinary users cannot mutate their access row.
revoke insert,update,delete on public.product_link_access from authenticated;

create or replace function user_admin_private.work_logs(
  p_search text,p_action text,p_user_id uuid,p_from timestamptz,p_hide_copy boolean,p_before_id bigint,p_limit integer)
returns setof public.product_link_logs language plpgsql stable security definer set search_path='' as $$
begin
  perform usage_private.require_admin();
  return query select l.* from public.product_link_logs l
  where l.action not in ('grant','revoke')
    and (p_before_id is null or l.id<p_before_id)
    and (nullif(p_action,'') is null or l.action=p_action)
    and (p_user_id is null or l.user_id=p_user_id)
    and (p_from is null or l.created_at>=p_from)
    and (not coalesce(p_hide_copy,false) or l.action<>'copy')
    and (nullif(btrim(p_search),'') is null or position(lower(btrim(p_search)) in lower(concat_ws(' ',l.item_code,l.actor_name)))>0)
  order by l.id desc limit least(greatest(coalesce(p_limit,50),1),5000);
end; $$;
revoke all on function user_admin_private.work_logs(text,text,uuid,timestamptz,boolean,bigint,integer) from public,anon;
grant execute on function user_admin_private.work_logs(text,text,uuid,timestamptz,boolean,bigint,integer) to authenticated;
create or replace function public.admin_product_link_work_logs(
  p_search text default null,p_action text default null,p_user_id uuid default null,p_from timestamptz default null,
  p_hide_copy boolean default false,p_before_id bigint default null,p_limit integer default 50)
returns setof public.product_link_logs language sql stable security invoker set search_path='' as $$
  select * from user_admin_private.work_logs(p_search,p_action,p_user_id,p_from,p_hide_copy,p_before_id,p_limit); $$;
revoke all on function public.admin_product_link_work_logs(text,text,uuid,timestamptz,boolean,bigint,integer) from public,anon;
grant execute on function public.admin_product_link_work_logs(text,text,uuid,timestamptz,boolean,bigint,integer) to authenticated;
notify pgrst,'reload schema';
commit;
