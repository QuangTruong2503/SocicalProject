-- Quotation management for Supabase/Postgres.
-- Apply in Supabase SQL Editor. The rollback section is in docs/QUOTATION.md.

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'quotation_status'
  ) then
    create type public.quotation_status as enum (
      'draft', 'created', 'sent', 'confirmed', 'cancelled'
    );
  end if;
end
$$;

create table if not exists public.quotation_customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 200),
  contact_name text,
  phone text,
  email text,
  address text,
  tax_code text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.quotation_counters (
  counter_date date primary key,
  last_value integer not null default 0 check (last_value > 0)
);

create table if not exists public.quotations (
  id uuid primary key default gen_random_uuid(),
  quotation_no text not null unique check (quotation_no ~ '^BG-[0-9]{8}-[0-9]{4,}$'),
  quotation_date date not null default current_date,
  customer_id uuid references public.quotation_customers(id),
  customer_name text not null check (length(trim(customer_name)) between 1 and 200),
  contact_name text,
  phone text,
  email text,
  address text,
  tax_code text,
  note text,
  currency text not null default 'VND' check (currency = 'VND'),
  discount_type text not null default 'amount' check (discount_type in ('amount', 'percent')),
  discount_value numeric(18,2) not null default 0 check (discount_value >= 0),
  shipping_fee numeric(18,2) not null default 0 check (shipping_fee >= 0),
  vat_mode text not null default 'included' check (vat_mode in ('none', '5', '8', '10', 'included', 'per_item')),
  subtotal numeric(18,2) not null default 0 check (subtotal >= 0),
  discount_amount numeric(18,2) not null default 0 check (discount_amount >= 0),
  vat_amount numeric(18,2) not null default 0 check (vat_amount >= 0),
  total numeric(18,2) not null default 0 check (total >= 0),
  terms jsonb not null default '{}'::jsonb,
  prepared_by uuid not null references auth.users(id),
  prepared_by_name text,
  prepared_by_phone text,
  prepared_by_email text,
  status public.quotation_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id)
);

create table if not exists public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  position integer not null check (position > 0),
  product_id uuid,
  product_code text,
  product_name text not null check (length(trim(product_name)) > 0),
  description text,
  brand text,
  quantity numeric(18,3) not null check (quantity > 0),
  unit text not null,
  unit_price numeric(18,2) not null check (unit_price >= 0),
  line_total numeric(18,2) generated always as (round(quantity * unit_price, 2)) stored,
  created_at timestamptz not null default now(),
  unique (quotation_id, position)
);

-- Upgrade an existing v1 installation without deleting quotation data.
alter table public.quotation_items
  add column if not exists product_name text;
update public.quotation_items
set product_name = coalesce(nullif(trim(product_name), ''), nullif(trim(description), ''), 'Sản phẩm')
where product_name is null or trim(product_name) = '';
alter table public.quotation_items
  alter column product_name set not null,
  alter column description drop not null,
  drop constraint if exists quotation_items_description_check,
  drop constraint if exists quotation_items_product_name_check;
alter table public.quotation_items
  add constraint quotation_items_product_name_check
  check (length(trim(product_name)) > 0);

alter table public.quotations
  drop constraint if exists quotations_vat_mode_check;
alter table public.quotations
  alter column vat_mode set default 'included';
update public.quotations
set vat_mode = 'included'
where vat_mode is distinct from 'included';
alter table public.quotations
  add constraint quotations_vat_mode_check
  check (vat_mode in ('none', '5', '8', '10', 'included', 'per_item'));

alter table public.quotation_items
  drop column if exists vat_amount,
  drop column if exists line_total,
  drop column if exists vat_rate;
alter table public.quotation_items
  add column line_total numeric(18,2)
    generated always as (round(quantity * unit_price, 2)) stored;

create index if not exists quotation_customers_search_idx on public.quotation_customers
  using gin (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(phone,'') || ' ' || coalesce(tax_code,'')))
  where deleted_at is null;
create index if not exists quotations_date_idx on public.quotations (quotation_date desc) where deleted_at is null;
create index if not exists quotations_staff_idx on public.quotations (prepared_by, created_at desc) where deleted_at is null;
create index if not exists quotations_status_idx on public.quotations (status, created_at desc) where deleted_at is null;
create index if not exists quotation_items_quotation_idx on public.quotation_items (quotation_id, position);

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

create policy quotation_customers_staff_select on public.quotation_customers
  for select to authenticated using (true);
create policy quotation_customers_staff_insert on public.quotation_customers
  for insert to authenticated with check (created_by = (select auth.uid()));
create policy quotation_customers_staff_update on public.quotation_customers
  for update to authenticated using (true) with check (true);
create policy quotation_counters_staff_all on public.quotation_counters
  for all to authenticated using (true) with check (true);
create policy quotations_staff_select on public.quotations
  for select to authenticated using (true);
create policy quotations_staff_insert on public.quotations
  for insert to authenticated with check (prepared_by = (select auth.uid()));
create policy quotations_staff_update on public.quotations
  for update to authenticated using (true) with check (true);
create policy quotation_items_staff_all on public.quotation_items
  for all to authenticated using (
    exists (
      select 1 from public.quotations q where q.id = quotation_id
    )
  ) with check (
    exists (
      select 1 from public.quotations q where q.id = quotation_id
    )
  );

grant select, insert, update, delete on public.quotation_customers to authenticated;
grant select, insert, update on public.quotation_counters to authenticated;
grant select, insert, update on public.quotations to authenticated;
grant select, insert, update, delete on public.quotation_items to authenticated;

create or replace function public.next_quotation_number(p_date date default current_date)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  next_value integer;
begin
  insert into public.quotation_counters(counter_date, last_value)
  values (p_date, 1)
  on conflict (counter_date) do update
    set last_value = public.quotation_counters.last_value + 1
  returning last_value into next_value;

  return 'BG-' || to_char(p_date, 'YYYYMMDD') || '-' || lpad(next_value::text, 4, '0');
end;
$$;
grant execute on function public.next_quotation_number(date) to authenticated;

create or replace function public.save_quotation(p_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  q_id uuid;
  row_item jsonb;
  calc_subtotal numeric(18,2) := 0;
  calc_discount numeric(18,2);
  calc_vat numeric(18,2) := 0;
  calc_total numeric(18,2);
  discount_type_value text := coalesce(p_payload->>'discount_type', 'amount');
  discount_value_value numeric := greatest(coalesce((p_payload->>'discount_value')::numeric, 0), 0);
  shipping_value numeric := greatest(coalesce((p_payload->>'shipping_fee')::numeric, 0), 0);
  vat_value text := 'included';
begin
  if (select auth.uid()) is null then raise exception 'Cần đăng nhập' using errcode = '42501'; end if;
  if nullif(trim(p_payload->>'customer_name'), '') is null then raise exception 'Thiếu tên khách hàng'; end if;
  if jsonb_array_length(coalesce(p_payload->'items', '[]'::jsonb)) = 0
     and coalesce(p_payload->>'status', 'draft') <> 'draft' then
    raise exception 'Báo giá chính thức phải có sản phẩm';
  end if;

  for row_item in select value from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb))
  loop
    if nullif(trim(row_item->>'product_name'), '') is null then raise exception 'Thiếu tên sản phẩm'; end if;
    if (row_item->>'quantity')::numeric <= 0 then raise exception 'Số lượng phải lớn hơn 0'; end if;
    if (row_item->>'unit_price')::numeric < 0 then raise exception 'Đơn giá không được âm'; end if;
    calc_subtotal := calc_subtotal + round((row_item->>'quantity')::numeric * (row_item->>'unit_price')::numeric, 2);
  end loop;

  calc_discount := least(calc_subtotal,
    case when discount_type_value = 'percent'
      then round(calc_subtotal * least(discount_value_value, 100) / 100, 2)
      else discount_value_value end);
  calc_total := greatest(calc_subtotal - calc_discount + shipping_value, 0);

  q_id := nullif(p_payload->>'id', '')::uuid;
  if q_id is null then
    insert into public.quotations (
      quotation_no, quotation_date, customer_id, customer_name, contact_name, phone, email,
      address, tax_code, note, discount_type, discount_value, shipping_fee, vat_mode,
      subtotal, discount_amount, vat_amount, total, terms, prepared_by, prepared_by_name,
      prepared_by_phone, prepared_by_email, status
    ) values (
      p_payload->>'quotation_no', (p_payload->>'quotation_date')::date,
      nullif(p_payload->>'customer_id','')::uuid, trim(p_payload->>'customer_name'),
      nullif(trim(p_payload->>'contact_name'),''), nullif(trim(p_payload->>'phone'),''),
      nullif(trim(p_payload->>'email'),''), nullif(trim(p_payload->>'address'),''),
      nullif(trim(p_payload->>'tax_code'),''), nullif(trim(p_payload->>'note'),''),
      discount_type_value, discount_value_value, shipping_value, vat_value,
      calc_subtotal, calc_discount, calc_vat, calc_total, coalesce(p_payload->'terms','{}'::jsonb),
      (select auth.uid()), nullif(trim(p_payload->>'prepared_by_name'),''),
      nullif(trim(p_payload->>'prepared_by_phone'),''), nullif(trim(p_payload->>'prepared_by_email'),''),
      coalesce((p_payload->>'status')::public.quotation_status, 'draft')
    ) returning id into q_id;
  else
    update public.quotations set
      quotation_no=p_payload->>'quotation_no', quotation_date=(p_payload->>'quotation_date')::date,
      customer_id=nullif(p_payload->>'customer_id','')::uuid, customer_name=trim(p_payload->>'customer_name'),
      contact_name=nullif(trim(p_payload->>'contact_name'),''), phone=nullif(trim(p_payload->>'phone'),''),
      email=nullif(trim(p_payload->>'email'),''), address=nullif(trim(p_payload->>'address'),''),
      tax_code=nullif(trim(p_payload->>'tax_code'),''), note=nullif(trim(p_payload->>'note'),''),
      discount_type=discount_type_value, discount_value=discount_value_value,
      shipping_fee=shipping_value, vat_mode=vat_value, subtotal=calc_subtotal,
      discount_amount=calc_discount, vat_amount=calc_vat, total=calc_total,
      terms=coalesce(p_payload->'terms','{}'::jsonb),
      prepared_by_name=nullif(trim(p_payload->>'prepared_by_name'),''),
      prepared_by_phone=nullif(trim(p_payload->>'prepared_by_phone'),''),
      prepared_by_email=nullif(trim(p_payload->>'prepared_by_email'),''),
      status=(p_payload->>'status')::public.quotation_status,
      updated_at=now()
    where id=q_id;
    delete from public.quotation_items where quotation_id=q_id;
  end if;

  for row_item in select value from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb))
  loop
    insert into public.quotation_items (
      quotation_id, position, product_id, product_code, product_name, description, brand, quantity, unit, unit_price
    ) values (
      q_id, (row_item->>'position')::integer, nullif(row_item->>'product_id','')::uuid,
      nullif(trim(row_item->>'product_code'),''), trim(row_item->>'product_name'),
      nullif(trim(row_item->>'description'),''),
      nullif(trim(row_item->>'brand'),''), (row_item->>'quantity')::numeric,
      coalesce(nullif(trim(row_item->>'unit'),''),'Cái'), (row_item->>'unit_price')::numeric
    );
  end loop;
  return q_id;
end;
$$;
grant execute on function public.save_quotation(jsonb) to authenticated;
