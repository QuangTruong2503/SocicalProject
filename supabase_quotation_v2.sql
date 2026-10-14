-- Báo giá Minh Triết v2. Safe to re-run.
-- Run AFTER supabase_quotation_management.sql and supabase_admin_profiles_policies.sql
-- (needs public.is_admin() and public.is_active_user()). Replaces the former
-- supabase_quotation_active_user_policies.sql.
--
-- What changes:
--   * Only the person who prepared a quotation, or an admin, can change it.
--     Every active staff member can still view, copy and export all quotations.
--   * The quotation number is assigned on first save (no more numbers burned by
--     just opening the "new" page).
--   * Saves are rejected when someone else saved the quotation in the meantime.
--   * All writes go through the RPCs below and are recorded in quotation_audit_log.
--   * Customers are remembered (quotation_customers) for autocomplete.

alter table public.quotations add column if not exists updated_by uuid references auth.users(id);

-- ─── Permission helper ───────────────────────────────────────────────────────

create or replace function public.can_edit_quotation(p_prepared_by uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user() and (p_prepared_by = auth.uid() or public.is_admin());
$$;

grant execute on function public.can_edit_quotation(uuid) to authenticated;

-- ─── Policies: everyone active can read, only owner/admin can change ─────────

alter table public.quotation_customers enable row level security;
alter table public.quotation_counters enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;

drop policy if exists quotation_customers_staff_select on public.quotation_customers;
drop policy if exists quotation_customers_staff_insert on public.quotation_customers;
drop policy if exists quotation_customers_staff_update on public.quotation_customers;
drop policy if exists quotation_counters_staff_all on public.quotation_counters;
drop policy if exists quotations_staff_select on public.quotations;
drop policy if exists quotations_staff_insert on public.quotations;
drop policy if exists quotations_staff_update on public.quotations;
drop policy if exists quotation_items_staff_all on public.quotation_items;
drop policy if exists quotation_items_staff_select on public.quotation_items;
drop policy if exists quotation_items_owner_write on public.quotation_items;

create policy quotation_customers_staff_select on public.quotation_customers
  for select to authenticated using (public.is_active_user());
create policy quotation_customers_staff_insert on public.quotation_customers
  for insert to authenticated with check (public.is_active_user() and created_by = (select auth.uid()));
create policy quotation_customers_staff_update on public.quotation_customers
  for update to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy quotation_counters_staff_all on public.quotation_counters
  for all to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy quotations_staff_select on public.quotations
  for select to authenticated using (public.is_active_user());
create policy quotations_staff_insert on public.quotations
  for insert to authenticated with check (public.is_active_user() and prepared_by = (select auth.uid()));
create policy quotations_staff_update on public.quotations
  for update to authenticated
  using (public.can_edit_quotation(prepared_by))
  with check (public.can_edit_quotation(prepared_by));
create policy quotation_items_staff_select on public.quotation_items
  for select to authenticated using (
    public.is_active_user() and exists (select 1 from public.quotations q where q.id = quotation_id)
  );
create policy quotation_items_owner_write on public.quotation_items
  for all to authenticated using (
    exists (select 1 from public.quotations q where q.id = quotation_id and public.can_edit_quotation(q.prepared_by))
  ) with check (
    exists (select 1 from public.quotations q where q.id = quotation_id and public.can_edit_quotation(q.prepared_by))
  );

-- Writes only through the RPCs (which check permissions, numbering and conflicts).
revoke insert, update, delete on public.quotations from authenticated;
revoke insert, update, delete on public.quotation_items from authenticated;
grant select on public.quotations, public.quotation_items to authenticated;
revoke execute on function public.save_quotation(jsonb) from public, anon, authenticated;
revoke execute on function public.next_quotation_number(date) from public, anon, authenticated;

-- ─── Audit log ───────────────────────────────────────────────────────────────

create table if not exists public.quotation_audit_log (
  id bigint generated always as identity primary key,
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text,
  action text not null check (action in ('create', 'update', 'status', 'delete')),
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists quotation_audit_log_quotation_idx
on public.quotation_audit_log (quotation_id, created_at desc);

alter table public.quotation_audit_log enable row level security;
revoke insert, update, delete on public.quotation_audit_log from anon, authenticated;
grant select on public.quotation_audit_log to authenticated;
drop policy if exists quotation_audit_log_select on public.quotation_audit_log;
create policy quotation_audit_log_select on public.quotation_audit_log
  for select to authenticated using (public.is_active_user());

create or replace function public.quotation_actor_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(btrim(full_name), ''), nullif(btrim(username), ''), email)
  from public.profiles where id = auth.uid();
$$;

-- Fields worth recording in the history (items are summarized by count).
create or replace function public.quotation_audit_snapshot(q public.quotations, p_item_count integer)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'status', q.status::text,
    'quotation_date', q.quotation_date,
    'customer_name', q.customer_name,
    'contact_name', q.contact_name,
    'phone', q.phone,
    'email', q.email,
    'address', q.address,
    'tax_code', q.tax_code,
    'note', q.note,
    'vat_mode', q.vat_mode,
    'discount_type', q.discount_type,
    'discount_value', q.discount_value,
    'shipping_fee', q.shipping_fee,
    'total', q.total,
    'item_count', p_item_count
  );
$$;

create or replace function public.quotation_audit_diff(p_old jsonb, p_new jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value)), '{}'::jsonb)
  from jsonb_each(p_new) n
  left join jsonb_each(p_old) o on o.key = n.key
  where o.value is distinct from n.value;
$$;

-- ─── Save (create or update) ─────────────────────────────────────────────────
-- p_expected_updated_at: the updated_at the client loaded. If the row changed
-- since, raise 40001 so the client can reload or explicitly overwrite (null).
-- Returns { id, quotation_no, quotation_date, status, updated_at, customer_id }.
create or replace function public.save_quotation_v2(p_payload jsonb, p_expected_updated_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_old public.quotations;
  v_new public.quotations;
  v_old_items integer := 0;
  v_new_items integer;
  v_payload jsonb := p_payload;
  v_date date;
  v_customer uuid;
  v_last_editor text;
  v_changes jsonb;
begin
  if v_uid is null or not public.is_active_user() then
    raise exception 'Tài khoản của bạn không có quyền lưu báo giá.' using errcode = '42501';
  end if;

  if v_id is not null then
    select * into v_old from public.quotations where id = v_id and deleted_at is null for update;
    if not found then
      raise exception 'Không tìm thấy báo giá (có thể đã bị xóa).' using errcode = 'P0002';
    end if;
    if not public.can_edit_quotation(v_old.prepared_by) then
      raise exception 'Bạn chỉ sửa được báo giá do mình lập.' using errcode = '42501';
    end if;
    if p_expected_updated_at is not null and v_old.updated_at is distinct from p_expected_updated_at then
      select actor_name into v_last_editor from public.quotation_audit_log
      where quotation_id = v_id order by created_at desc limit 1;
      raise exception 'Báo giá đã được % cập nhật lúc %.',
        coalesce(v_last_editor, 'người khác'), to_char(v_old.updated_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY')
        using errcode = '40001';
    end if;
    select count(*) into v_old_items from public.quotation_items where quotation_id = v_id;
    -- The number never changes after it is assigned.
    v_payload := v_payload || jsonb_build_object('quotation_no', v_old.quotation_no);
  else
    v_date := coalesce(nullif(p_payload->>'quotation_date', '')::date, current_date);
    v_payload := v_payload || jsonb_build_object(
      'id', '',
      'quotation_date', v_date,
      'quotation_no', public.next_quotation_number(v_date)
    );
  end if;

  -- Remember the customer for autocomplete (match by tax code, else name + phone).
  if nullif(v_payload->>'customer_id', '') is null and nullif(btrim(v_payload->>'customer_name'), '') is not null then
    select c.id into v_customer
    from public.quotation_customers c
    where c.deleted_at is null
      and (
        (nullif(btrim(v_payload->>'tax_code'), '') is not null and c.tax_code = btrim(v_payload->>'tax_code'))
        or (lower(btrim(c.name)) = lower(btrim(v_payload->>'customer_name'))
            and coalesce(c.phone, '') = coalesce(nullif(btrim(v_payload->>'phone'), ''), ''))
      )
    order by c.updated_at desc
    limit 1;

    if v_customer is null then
      insert into public.quotation_customers (name, contact_name, phone, email, address, tax_code, created_by)
      values (
        left(btrim(v_payload->>'customer_name'), 200),
        nullif(btrim(v_payload->>'contact_name'), ''),
        nullif(btrim(v_payload->>'phone'), ''),
        nullif(btrim(v_payload->>'email'), ''),
        nullif(btrim(v_payload->>'address'), ''),
        nullif(btrim(v_payload->>'tax_code'), ''),
        v_uid
      )
      returning id into v_customer;
    end if;

    v_payload := v_payload || jsonb_build_object('customer_id', v_customer);
  end if;

  begin
    v_id := public.save_quotation(v_payload);
  exception when unique_violation then
    raise exception 'Số báo giá % đã tồn tại. Hãy lưu lại để được cấp số mới.', v_payload->>'quotation_no'
      using errcode = '23505';
  end;

  update public.quotations set updated_by = v_uid where id = v_id
  returning * into v_new;
  select count(*) into v_new_items from public.quotation_items where quotation_id = v_id;

  if v_old.id is null then
    insert into public.quotation_audit_log (quotation_id, actor_id, actor_name, action, changes)
    values (v_id, v_uid, public.quotation_actor_name(), 'create',
      jsonb_build_object('quotation_no', v_new.quotation_no, 'status', v_new.status::text, 'total', v_new.total, 'item_count', v_new_items));
  else
    v_changes := public.quotation_audit_diff(
      public.quotation_audit_snapshot(v_old, v_old_items),
      public.quotation_audit_snapshot(v_new, v_new_items)
    );
    if v_changes <> '{}'::jsonb then
      insert into public.quotation_audit_log (quotation_id, actor_id, actor_name, action, changes)
      values (v_id, v_uid, public.quotation_actor_name(), 'update', v_changes);
    end if;
  end if;

  return jsonb_build_object(
    'id', v_new.id,
    'quotation_no', v_new.quotation_no,
    'quotation_date', v_new.quotation_date,
    'status', v_new.status::text,
    'updated_at', v_new.updated_at,
    'customer_id', v_new.customer_id
  );
end;
$$;

revoke execute on function public.save_quotation_v2(jsonb, timestamptz) from public, anon;
grant execute on function public.save_quotation_v2(jsonb, timestamptz) to authenticated;

-- ─── Status change (free transitions, owner/admin only) ──────────────────────

create or replace function public.set_quotation_status(p_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.quotations;
  v_new public.quotations;
begin
  select * into v_old from public.quotations where id = p_id and deleted_at is null for update;
  if not found then
    raise exception 'Không tìm thấy báo giá.' using errcode = 'P0002';
  end if;
  if not public.can_edit_quotation(v_old.prepared_by) then
    raise exception 'Bạn chỉ đổi trạng thái được báo giá do mình lập.' using errcode = '42501';
  end if;
  if p_status not in ('draft', 'created', 'sent', 'confirmed', 'cancelled') then
    raise exception 'Trạng thái không hợp lệ: %', p_status using errcode = '22023';
  end if;

  update public.quotations set
    status = p_status::public.quotation_status,
    cancelled_at = case when p_status = 'cancelled' then coalesce(cancelled_at, now()) else null end,
    cancelled_by = case when p_status = 'cancelled' then coalesce(cancelled_by, auth.uid()) else null end,
    updated_at = now(),
    updated_by = auth.uid()
  where id = p_id
  returning * into v_new;

  if v_old.status is distinct from v_new.status then
    insert into public.quotation_audit_log (quotation_id, actor_id, actor_name, action, changes)
    values (p_id, auth.uid(), public.quotation_actor_name(), 'status',
      jsonb_build_object('status', jsonb_build_object('from', v_old.status::text, 'to', v_new.status::text)));
  end if;

  return jsonb_build_object('id', p_id, 'status', v_new.status::text, 'updated_at', v_new.updated_at);
end;
$$;

revoke execute on function public.set_quotation_status(uuid, text) from public, anon;
grant execute on function public.set_quotation_status(uuid, text) to authenticated;

-- ─── Delete a draft (soft delete) ────────────────────────────────────────────

create or replace function public.delete_quotation_draft(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.quotations;
begin
  select * into v_old from public.quotations where id = p_id and deleted_at is null for update;
  if not found then
    raise exception 'Không tìm thấy báo giá.' using errcode = 'P0002';
  end if;
  if not public.can_edit_quotation(v_old.prepared_by) then
    raise exception 'Bạn chỉ xóa được báo giá do mình lập.' using errcode = '42501';
  end if;
  if v_old.status <> 'draft' then
    raise exception 'Chỉ xóa được bản nháp. Báo giá khác hãy chuyển sang "Đã hủy".' using errcode = '22023';
  end if;

  update public.quotations set deleted_at = now(), updated_at = now(), updated_by = auth.uid() where id = p_id;
  insert into public.quotation_audit_log (quotation_id, actor_id, actor_name, action)
  values (p_id, auth.uid(), public.quotation_actor_name(), 'delete');
end;
$$;

revoke execute on function public.delete_quotation_draft(uuid) from public, anon;
grant execute on function public.delete_quotation_draft(uuid) to authenticated;

-- ─── List with server-side search, filters, sort, paging ─────────────────────
-- p_sort: 'created_at' | 'quotation_date' | 'total' | 'quotation_no'.
create or replace function public.list_quotations(
  p_search text default null,
  p_status text default null,
  p_from date default null,
  p_to date default null,
  p_mine boolean default false,
  p_sort text default 'created_at',
  p_desc boolean default true,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  quotation_no text,
  quotation_date date,
  customer_name text,
  contact_name text,
  phone text,
  total numeric,
  status text,
  prepared_by uuid,
  prepared_by_name text,
  created_at timestamptz,
  updated_at timestamptz,
  can_edit boolean,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_search text := nullif(lower(btrim(coalesce(p_search, ''))), '');
  v_sort text := case when p_sort in ('created_at', 'quotation_date', 'total', 'quotation_no') then p_sort else 'created_at' end;
  v_desc boolean := coalesce(p_desc, true);
  v_admin boolean := public.is_admin();
begin
  if not public.is_active_user() then
    raise exception 'Tài khoản của bạn không có quyền xem báo giá.' using errcode = '42501';
  end if;

  return query
  select
    q.id, q.quotation_no, q.quotation_date, q.customer_name, q.contact_name, q.phone, q.total,
    q.status::text, q.prepared_by, q.prepared_by_name, q.created_at, q.updated_at,
    (q.prepared_by = auth.uid() or v_admin),
    count(*) over ()::bigint
  from public.quotations q
  where q.deleted_at is null
    and (v_search is null or position(v_search in lower(concat_ws(' ',
      q.quotation_no, q.customer_name, q.contact_name, q.phone, q.tax_code, q.prepared_by_name))) > 0)
    and (p_status is null or p_status = '' or q.status::text = p_status)
    and (p_from is null or q.quotation_date >= p_from)
    and (p_to is null or q.quotation_date <= p_to)
    and (not coalesce(p_mine, false) or q.prepared_by = auth.uid())
  order by
    case when v_sort = 'created_at' and v_desc then q.created_at end desc,
    case when v_sort = 'created_at' and not v_desc then q.created_at end asc,
    case when v_sort = 'quotation_date' and v_desc then q.quotation_date end desc,
    case when v_sort = 'quotation_date' and not v_desc then q.quotation_date end asc,
    case when v_sort = 'total' and v_desc then q.total end desc,
    case when v_sort = 'total' and not v_desc then q.total end asc,
    case when v_sort = 'quotation_no' and v_desc then q.quotation_no end desc,
    case when v_sort = 'quotation_no' and not v_desc then q.quotation_no end asc,
    q.created_at desc,
    q.id
  limit least(greatest(coalesce(p_limit, 50), 1), 5000)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.list_quotations(text, text, date, date, boolean, text, boolean, integer, integer) from public, anon;
grant execute on function public.list_quotations(text, text, date, date, boolean, text, boolean, integer, integer) to authenticated;

-- ─── Summary tiles ───────────────────────────────────────────────────────────

create or replace function public.quotation_stats(p_mine boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_month_start date := date_trunc('month', (now() at time zone 'Asia/Ho_Chi_Minh'))::date;
begin
  if not public.is_active_user() then
    raise exception 'Tài khoản của bạn không có quyền xem báo giá.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total', count(*),
    'draft', count(*) filter (where q.status = 'draft'),
    'created', count(*) filter (where q.status = 'created'),
    'sent', count(*) filter (where q.status = 'sent'),
    'confirmed', count(*) filter (where q.status = 'confirmed'),
    'cancelled', count(*) filter (where q.status = 'cancelled'),
    'month_count', count(*) filter (where q.quotation_date >= v_month_start and q.status <> 'cancelled'),
    'month_value', coalesce(sum(q.total) filter (where q.quotation_date >= v_month_start and q.status <> 'cancelled'), 0),
    'month_confirmed_value', coalesce(sum(q.total) filter (where q.quotation_date >= v_month_start and q.status = 'confirmed'), 0)
  )
  into v_result
  from public.quotations q
  where q.deleted_at is null
    and (not coalesce(p_mine, false) or q.prepared_by = auth.uid());

  return v_result;
end;
$$;

revoke execute on function public.quotation_stats(boolean) from public, anon;
grant execute on function public.quotation_stats(boolean) to authenticated;

-- ─── Customer autocomplete ───────────────────────────────────────────────────

create or replace function public.search_quotation_customers(p_search text)
returns table (id uuid, name text, contact_name text, phone text, email text, address text, tax_code text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_search text := nullif(lower(btrim(coalesce(p_search, ''))), '');
begin
  if not public.is_active_user() then
    raise exception 'Tài khoản của bạn không có quyền xem khách hàng.' using errcode = '42501';
  end if;

  if v_search is null or length(v_search) < 2 then
    return;
  end if;

  return query
  select c.id, c.name, c.contact_name, c.phone, c.email, c.address, c.tax_code
  from public.quotation_customers c
  where c.deleted_at is null
    and position(v_search in lower(concat_ws(' ', c.name, c.contact_name, c.phone, c.tax_code))) > 0
  order by (lower(c.name) like v_search || '%') desc, c.updated_at desc
  limit 8;
end;
$$;

revoke execute on function public.search_quotation_customers(text) from public, anon;
grant execute on function public.search_quotation_customers(text) to authenticated;

-- ─── One-time backfill: customers from existing quotations ───────────────────

insert into public.quotation_customers (name, contact_name, phone, email, address, tax_code, created_by)
select distinct on (lower(btrim(q.customer_name)), coalesce(q.phone, ''))
  left(btrim(q.customer_name), 200), q.contact_name, q.phone, q.email, q.address, q.tax_code, q.prepared_by
from public.quotations q
where q.deleted_at is null
  and q.customer_id is null
  and not exists (
    select 1 from public.quotation_customers c
    where lower(btrim(c.name)) = lower(btrim(q.customer_name))
      and coalesce(c.phone, '') = coalesce(q.phone, '')
  )
order by lower(btrim(q.customer_name)), coalesce(q.phone, ''), q.created_at desc;

update public.quotations q
set customer_id = c.id
from public.quotation_customers c
where q.customer_id is null
  and lower(btrim(c.name)) = lower(btrim(q.customer_name))
  and coalesce(c.phone, '') = coalesce(q.phone, '');
