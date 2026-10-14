-- Báo giá KNM v2 (/bao-gia-knm). Safe to re-run.
-- Run AFTER supabase_knm_quotations.sql and supabase_admin_profiles_policies.sql
-- (needs public.is_admin() and public.is_active_user()). Still fully separate
-- from the Minh Triết quotation tables.
--
-- What changes:
--   * The table is no longer open to the anon key. Every active staff member can
--     view all KNM quotations; only the person who created one, or an admin, can
--     change or delete it. Quotations saved before v2 have no creator, so only
--     admins can change those.
--   * The number (BG-YYYYMMDD-NNN) is assigned by the server on first save and is
--     unique. Older duplicate numbers are kept as they are and flagged
--     legacy_number.
--   * Saves are rejected when someone else saved the quotation in the meantime.
--   * Deletes are soft (deleted_at) and every write is recorded in
--     knm_quotation_audit_log.
--   * Logo, company stamp and bank QR are shared company assets in the private
--     Storage bucket "knm-assets": every active staff member sees them, only
--     admins can change them.

-- ─── Columns ─────────────────────────────────────────────────────────────────

alter table public.knm_quotations add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.knm_quotations add column if not exists created_by_name text;
alter table public.knm_quotations add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.knm_quotations add column if not exists updated_by_name text;
alter table public.knm_quotations add column if not exists deleted_at timestamptz;
alter table public.knm_quotations add column if not exists legacy_number boolean not null default false;

-- Numbers used to be generated per device, so duplicates may exist. Keep the
-- oldest one as the "real" owner of the number and flag the later copies.
update public.knm_quotations k
set legacy_number = true
where not k.legacy_number
  and exists (
    select 1 from public.knm_quotations o
    where o.quotation_no = k.quotation_no
      and not o.legacy_number
      and (o.created_at, o.id) < (k.created_at, k.id)
  );

create unique index if not exists knm_quotations_no_unique
on public.knm_quotations (quotation_no) where not legacy_number;

create index if not exists knm_quotations_active_created_idx
on public.knm_quotations (created_at desc) where deleted_at is null;

-- ─── Numbering ───────────────────────────────────────────────────────────────

create table if not exists public.knm_quotation_counters (
  day text primary key check (day ~ '^\d{8}$'),
  last_no integer not null default 0 check (last_no >= 0)
);

alter table public.knm_quotation_counters enable row level security;
revoke all on public.knm_quotation_counters from anon, authenticated;

-- Continue after the highest number already used on each day.
insert into public.knm_quotation_counters (day, last_no)
select substring(quotation_no from '^BG-(\d{8})-\d{1,9}$'),
       max(substring(quotation_no from '^BG-\d{8}-(\d{1,9})$')::integer)
from public.knm_quotations
where quotation_no ~ '^BG-\d{8}-\d{1,9}$'
group by 1
on conflict (day) do update set last_no = greatest(public.knm_quotation_counters.last_no, excluded.last_no);

create or replace function public.next_knm_quotation_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day text := to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYYMMDD');
  v_seq integer;
  v_no text;
begin
  loop
    insert into public.knm_quotation_counters (day, last_no) values (v_day, 1)
    on conflict (day) do update set last_no = public.knm_quotation_counters.last_no + 1
    returning last_no into v_seq;
    v_no := 'BG-' || v_day || '-' || lpad(v_seq::text, 3, '0');
    -- Skip numbers someone typed by hand before v2.
    exit when not exists (select 1 from public.knm_quotations where quotation_no = v_no);
  end loop;
  return v_no;
end;
$$;

revoke execute on function public.next_knm_quotation_number() from public, anon, authenticated;

-- ─── Permissions ─────────────────────────────────────────────────────────────

create or replace function public.can_edit_knm_quotation(p_created_by uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_user() and ((p_created_by is not null and p_created_by = auth.uid()) or public.is_admin());
$$;

grant execute on function public.can_edit_knm_quotation(uuid) to authenticated;

create or replace function public.knm_actor_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(btrim(full_name), ''), nullif(btrim(username), ''), email)
  from public.profiles where id = auth.uid();
$$;

revoke execute on function public.knm_actor_name() from public, anon;

alter table public.knm_quotations enable row level security;

drop policy if exists knm_quotations_public_select on public.knm_quotations;
drop policy if exists knm_quotations_public_insert on public.knm_quotations;
drop policy if exists knm_quotations_public_update on public.knm_quotations;
drop policy if exists knm_quotations_public_delete on public.knm_quotations;
drop policy if exists knm_quotations_staff_select on public.knm_quotations;

create policy knm_quotations_staff_select on public.knm_quotations
  for select to authenticated using (public.is_active_user() and deleted_at is null);

-- Reads for active staff only; writes only through the RPCs below.
revoke all on public.knm_quotations from anon;
revoke insert, update, delete on public.knm_quotations from authenticated;
grant select on public.knm_quotations to authenticated;

-- ─── Audit log ───────────────────────────────────────────────────────────────

create table if not exists public.knm_quotation_audit_log (
  id bigint generated always as identity primary key,
  quotation_id uuid not null references public.knm_quotations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text,
  action text not null check (action in ('create', 'update', 'delete')),
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists knm_quotation_audit_log_quotation_idx
on public.knm_quotation_audit_log (quotation_id, created_at desc);

alter table public.knm_quotation_audit_log enable row level security;
revoke all on public.knm_quotation_audit_log from anon;
revoke insert, update, delete on public.knm_quotation_audit_log from authenticated;
grant select on public.knm_quotation_audit_log to authenticated;
drop policy if exists knm_quotation_audit_log_select on public.knm_quotation_audit_log;
create policy knm_quotation_audit_log_select on public.knm_quotation_audit_log
  for select to authenticated using (public.is_active_user());

create or replace function public.knm_quotation_audit_snapshot(q public.knm_quotations)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'quotation_date', q.quotation_date,
    'customer_name', q.customer_name,
    'customer_contact', q.customer_contact,
    'customer_phone', q.customer_phone,
    'customer_email', q.customer_email,
    'customer_tax_code', q.customer_tax_code,
    'customer_address', q.customer_address,
    'total', q.total,
    'item_count', jsonb_array_length(coalesce(q.quotation->'items', '[]'::jsonb))
  );
$$;

-- ─── Save (create or update) ─────────────────────────────────────────────────
-- p_payload: { id?, quotation_date, customer_name, customer_contact, customer_phone,
--   customer_email, customer_tax_code, customer_address, subtotal, vat_rate,
--   vat_amount, total, company, quotation }.
-- p_expected_updated_at: the updated_at the client loaded. If the row changed
-- since, raise 40001 so the client can reload or explicitly overwrite (null).
create or replace function public.save_knm_quotation(p_payload jsonb, p_expected_updated_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_name text := left(btrim(coalesce(p_payload->>'customer_name', '')), 300);
  v_old public.knm_quotations;
  v_new public.knm_quotations;
  v_no text;
  v_actor text := public.knm_actor_name();
  v_last_editor text;
  v_changes jsonb;
begin
  if v_uid is null or not public.is_active_user() then
    raise exception 'Tài khoản của bạn không có quyền lưu báo giá.' using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'Tên khách hàng là bắt buộc.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payload->'quotation') is distinct from 'object' or jsonb_typeof(p_payload->'company') is distinct from 'object' then
    raise exception 'Dữ liệu báo giá không hợp lệ.' using errcode = '22023';
  end if;

  if v_id is not null then
    select * into v_old from public.knm_quotations where id = v_id and deleted_at is null for update;
    if not found then
      raise exception 'Không tìm thấy báo giá (có thể đã bị xóa).' using errcode = 'P0002';
    end if;
    if not public.can_edit_knm_quotation(v_old.created_by) then
      raise exception 'Bạn chỉ sửa được báo giá do mình lập.' using errcode = '42501';
    end if;
    if p_expected_updated_at is not null and v_old.updated_at is distinct from p_expected_updated_at then
      raise exception 'Báo giá đã được % cập nhật lúc %.',
        coalesce(v_old.updated_by_name, 'người khác'),
        to_char(v_old.updated_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY')
        using errcode = '40001';
    end if;
    -- The number never changes after it is assigned.
    v_no := v_old.quotation_no;
  else
    v_no := public.next_knm_quotation_number();
  end if;

  if v_old.id is null then
    insert into public.knm_quotations (
      quotation_no, quotation_date, customer_name, customer_contact, customer_phone, customer_email,
      customer_tax_code, customer_address, subtotal, vat_rate, vat_amount, total, company, quotation,
      created_by, created_by_name, updated_by, updated_by_name
    ) values (
      v_no,
      coalesce(nullif(p_payload->>'quotation_date', '')::date, (now() at time zone 'Asia/Ho_Chi_Minh')::date),
      v_name,
      nullif(btrim(p_payload->>'customer_contact'), ''),
      nullif(btrim(p_payload->>'customer_phone'), ''),
      nullif(btrim(p_payload->>'customer_email'), ''),
      nullif(btrim(p_payload->>'customer_tax_code'), ''),
      nullif(btrim(p_payload->>'customer_address'), ''),
      greatest(coalesce((p_payload->>'subtotal')::numeric, 0), 0),
      greatest(coalesce((p_payload->>'vat_rate')::numeric, 0), 0),
      greatest(coalesce((p_payload->>'vat_amount')::numeric, 0), 0),
      greatest(coalesce((p_payload->>'total')::numeric, 0), 0),
      p_payload->'company',
      (p_payload->'quotation') || jsonb_build_object('quotationNo', v_no),
      v_uid, v_actor, v_uid, v_actor
    )
    returning * into v_new;

    insert into public.knm_quotation_audit_log (quotation_id, actor_id, actor_name, action, changes)
    values (v_new.id, v_uid, v_actor, 'create',
      jsonb_build_object('quotation_no', v_new.quotation_no, 'total', v_new.total));
  else
    update public.knm_quotations set
      quotation_date = coalesce(nullif(p_payload->>'quotation_date', '')::date, v_old.quotation_date),
      customer_name = v_name,
      customer_contact = nullif(btrim(p_payload->>'customer_contact'), ''),
      customer_phone = nullif(btrim(p_payload->>'customer_phone'), ''),
      customer_email = nullif(btrim(p_payload->>'customer_email'), ''),
      customer_tax_code = nullif(btrim(p_payload->>'customer_tax_code'), ''),
      customer_address = nullif(btrim(p_payload->>'customer_address'), ''),
      subtotal = greatest(coalesce((p_payload->>'subtotal')::numeric, 0), 0),
      vat_rate = greatest(coalesce((p_payload->>'vat_rate')::numeric, 0), 0),
      vat_amount = greatest(coalesce((p_payload->>'vat_amount')::numeric, 0), 0),
      total = greatest(coalesce((p_payload->>'total')::numeric, 0), 0),
      company = p_payload->'company',
      quotation = (p_payload->'quotation') || jsonb_build_object('quotationNo', v_no),
      updated_by = v_uid,
      updated_by_name = v_actor
    where id = v_id
    returning * into v_new;

    select coalesce(jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value)), '{}'::jsonb)
    into v_changes
    from jsonb_each(public.knm_quotation_audit_snapshot(v_new)) n
    left join jsonb_each(public.knm_quotation_audit_snapshot(v_old)) o on o.key = n.key
    where o.value is distinct from n.value;

    insert into public.knm_quotation_audit_log (quotation_id, actor_id, actor_name, action, changes)
    values (v_id, v_uid, v_actor, 'update', v_changes);
  end if;

  return jsonb_build_object(
    'id', v_new.id,
    'quotation_no', v_new.quotation_no,
    'quotation_date', v_new.quotation_date,
    'created_by', v_new.created_by,
    'created_by_name', v_new.created_by_name,
    'updated_by_name', v_new.updated_by_name,
    'created_at', v_new.created_at,
    'updated_at', v_new.updated_at
  );
end;
$$;

revoke execute on function public.save_knm_quotation(jsonb, timestamptz) from public, anon;
grant execute on function public.save_knm_quotation(jsonb, timestamptz) to authenticated;

-- ─── Delete (soft) ───────────────────────────────────────────────────────────

create or replace function public.delete_knm_quotation(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.knm_quotations;
begin
  select * into v_old from public.knm_quotations where id = p_id and deleted_at is null for update;
  if not found then
    raise exception 'Không tìm thấy báo giá.' using errcode = 'P0002';
  end if;
  if not public.can_edit_knm_quotation(v_old.created_by) then
    raise exception 'Bạn chỉ xóa được báo giá do mình lập.' using errcode = '42501';
  end if;

  update public.knm_quotations
  set deleted_at = now(), updated_by = auth.uid(), updated_by_name = public.knm_actor_name()
  where id = p_id;
  insert into public.knm_quotation_audit_log (quotation_id, actor_id, actor_name, action, changes)
  values (p_id, auth.uid(), public.knm_actor_name(), 'delete',
    jsonb_build_object('quotation_no', v_old.quotation_no, 'customer_name', v_old.customer_name, 'total', v_old.total));
end;
$$;

revoke execute on function public.delete_knm_quotation(uuid) from public, anon;
grant execute on function public.delete_knm_quotation(uuid) to authenticated;

-- ─── List with server-side search, filters, sort, paging ─────────────────────
-- p_sort: 'created_at' | 'quotation_date' | 'total' | 'quotation_no' | 'customer_name'.
-- Digits in the search also match phone numbers / tax codes written with dots or spaces.
create or replace function public.list_knm_quotations(
  p_search text default null,
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
  customer_contact text,
  customer_phone text,
  customer_tax_code text,
  total numeric,
  created_by uuid,
  created_by_name text,
  created_at timestamptz,
  updated_at timestamptz,
  updated_by_name text,
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
  v_digits text := nullif(regexp_replace(coalesce(p_search, ''), '\D', '', 'g'), '');
  v_sort text := case when p_sort in ('created_at', 'quotation_date', 'total', 'quotation_no', 'customer_name') then p_sort else 'created_at' end;
  v_desc boolean := coalesce(p_desc, true);
  v_admin boolean := public.is_admin();
begin
  if not public.is_active_user() then
    raise exception 'Tài khoản của bạn không có quyền xem báo giá.' using errcode = '42501';
  end if;
  if v_digits is not null and length(v_digits) < 3 then
    v_digits := null;
  end if;

  return query
  select
    k.id, k.quotation_no, k.quotation_date, k.customer_name, k.customer_contact, k.customer_phone,
    k.customer_tax_code, k.total, k.created_by, k.created_by_name, k.created_at, k.updated_at, k.updated_by_name,
    ((k.created_by is not null and k.created_by = auth.uid()) or v_admin),
    count(*) over ()::bigint
  from public.knm_quotations k
  where k.deleted_at is null
    and (
      v_search is null
      or position(v_search in lower(concat_ws(' ',
        k.quotation_no, k.customer_name, k.customer_contact, k.customer_phone, k.customer_email,
        k.customer_tax_code, k.created_by_name))) > 0
      or (v_digits is not null and (
        position(v_digits in regexp_replace(coalesce(k.customer_phone, ''), '\D', '', 'g')) > 0
        or position(v_digits in regexp_replace(coalesce(k.customer_tax_code, ''), '\D', '', 'g')) > 0
      ))
    )
    and (p_from is null or k.quotation_date >= p_from)
    and (p_to is null or k.quotation_date <= p_to)
    and (not coalesce(p_mine, false) or k.created_by = auth.uid())
  order by
    case when v_sort = 'created_at' and v_desc then k.created_at end desc,
    case when v_sort = 'created_at' and not v_desc then k.created_at end asc,
    case when v_sort = 'quotation_date' and v_desc then k.quotation_date end desc,
    case when v_sort = 'quotation_date' and not v_desc then k.quotation_date end asc,
    case when v_sort = 'total' and v_desc then k.total end desc,
    case when v_sort = 'total' and not v_desc then k.total end asc,
    case when v_sort = 'quotation_no' and v_desc then k.quotation_no end desc,
    case when v_sort = 'quotation_no' and not v_desc then k.quotation_no end asc,
    case when v_sort = 'customer_name' and v_desc then lower(k.customer_name) end desc,
    case when v_sort = 'customer_name' and not v_desc then lower(k.customer_name) end asc,
    k.created_at desc,
    k.id
  limit least(greatest(coalesce(p_limit, 50), 1), 5000)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.list_knm_quotations(text, date, date, boolean, text, boolean, integer, integer) from public, anon;
grant execute on function public.list_knm_quotations(text, date, date, boolean, text, boolean, integer, integer) to authenticated;

-- ─── Summary tiles ───────────────────────────────────────────────────────────

create or replace function public.knm_quotation_stats()
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
    'mine', count(*) filter (where k.created_by = auth.uid()),
    'month_count', count(*) filter (where k.quotation_date >= v_month_start),
    'month_value', coalesce(sum(k.total) filter (where k.quotation_date >= v_month_start), 0)
  )
  into v_result
  from public.knm_quotations k
  where k.deleted_at is null;

  return v_result;
end;
$$;

revoke execute on function public.knm_quotation_stats() from public, anon;
grant execute on function public.knm_quotation_stats() to authenticated;

-- ─── Shared company assets (logo, stamp, bank QR) ────────────────────────────

create table if not exists public.knm_company_assets (
  kind text primary key check (kind in ('logo', 'stamp', 'bank_qr')),
  path text not null,
  file_name text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.knm_company_assets enable row level security;
revoke all on public.knm_company_assets from anon;
revoke insert, update, delete on public.knm_company_assets from authenticated;
grant select on public.knm_company_assets to authenticated;
drop policy if exists knm_company_assets_select on public.knm_company_assets;
create policy knm_company_assets_select on public.knm_company_assets
  for select to authenticated using (public.is_active_user());

-- Point an asset at a freshly uploaded object (or clear it with p_path = null).
-- Returns the previous object path so the client can remove that file.
create or replace function public.set_knm_company_asset(p_kind text, p_path text, p_file_name text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text;
begin
  if not (public.is_active_user() and public.is_admin()) then
    raise exception 'Chỉ quản trị viên được đổi logo, dấu mộc và QR ngân hàng.' using errcode = '42501';
  end if;
  if p_kind not in ('logo', 'stamp', 'bank_qr') then
    raise exception 'Loại ảnh không hợp lệ: %', p_kind using errcode = '22023';
  end if;
  if p_path is not null and p_path not like p_kind || '/%' then
    raise exception 'Đường dẫn ảnh không hợp lệ.' using errcode = '22023';
  end if;

  select path into v_old from public.knm_company_assets where kind = p_kind for update;

  if p_path is null then
    delete from public.knm_company_assets where kind = p_kind;
  else
    insert into public.knm_company_assets (kind, path, file_name, updated_by, updated_at)
    values (p_kind, p_path, left(p_file_name, 200), auth.uid(), now())
    on conflict (kind) do update set
      path = excluded.path, file_name = excluded.file_name, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  end if;

  return case when v_old is distinct from p_path then v_old end;
end;
$$;

revoke execute on function public.set_knm_company_asset(text, text, text) from public, anon;
grant execute on function public.set_knm_company_asset(text, text, text) to authenticated;

-- Private bucket: images are downloaded with the user's session, never public URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('knm-assets', 'knm-assets', false, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists knm_assets_staff_select on storage.objects;
create policy knm_assets_staff_select on storage.objects
  for select to authenticated
  using (bucket_id = 'knm-assets' and public.is_active_user());

drop policy if exists knm_assets_admin_insert on storage.objects;
create policy knm_assets_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'knm-assets' and public.is_active_user() and public.is_admin());

drop policy if exists knm_assets_admin_update on storage.objects;
create policy knm_assets_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'knm-assets' and public.is_active_user() and public.is_admin())
  with check (bucket_id = 'knm-assets' and public.is_active_user() and public.is_admin());

drop policy if exists knm_assets_admin_delete on storage.objects;
create policy knm_assets_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'knm-assets' and public.is_active_user() and public.is_admin());
