-- Standalone storage for the "Báo giá KNM" tool (/bao-gia-knm).
-- Deliberately isolated from the public.quotations system (different company,
-- no login required) — apply this in the Supabase SQL editor.

create table if not exists public.knm_quotations (
  id uuid primary key default gen_random_uuid(),
  quotation_no text not null,
  quotation_date date not null default current_date,
  customer_name text not null check (length(trim(customer_name)) > 0),
  customer_contact text,
  customer_phone text,
  customer_email text,
  customer_tax_code text,
  customer_address text,
  subtotal numeric(18,2) not null default 0,
  vat_rate numeric(5,2) not null default 0,
  vat_amount numeric(18,2) not null default 0,
  total numeric(18,2) not null default 0,
  company jsonb not null default '{}'::jsonb,
  quotation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists knm_quotations_search_idx on public.knm_quotations
  using gin (to_tsvector('simple',
    coalesce(customer_name,'') || ' ' || coalesce(customer_phone,'') || ' ' ||
    coalesce(customer_tax_code,'') || ' ' || coalesce(quotation_no,'')
  ));
create index if not exists knm_quotations_created_idx on public.knm_quotations (created_at desc);

alter table public.knm_quotations enable row level security;

drop policy if exists knm_quotations_public_select on public.knm_quotations;
drop policy if exists knm_quotations_public_insert on public.knm_quotations;
drop policy if exists knm_quotations_public_update on public.knm_quotations;
drop policy if exists knm_quotations_public_delete on public.knm_quotations;

-- This tool has no login (see src/pages/QuotationKnm) so access is open to the
-- anon key, matching the existing public.watermark_image_counts pattern.
create policy knm_quotations_public_select on public.knm_quotations
  for select to anon, authenticated using (true);
create policy knm_quotations_public_insert on public.knm_quotations
  for insert to anon, authenticated with check (true);
create policy knm_quotations_public_update on public.knm_quotations
  for update to anon, authenticated using (true) with check (true);
create policy knm_quotations_public_delete on public.knm_quotations
  for delete to anon, authenticated using (true);

grant select, insert, update, delete on public.knm_quotations to anon, authenticated;

create or replace function public.set_knm_quotation_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists knm_quotations_set_updated_at on public.knm_quotations;
create trigger knm_quotations_set_updated_at
  before update on public.knm_quotations
  for each row execute function public.set_knm_quotation_updated_at();
