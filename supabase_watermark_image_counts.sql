-- Watermark image count log.
-- Safe to re-run. Run order for the watermark stats feature:
--   1. supabase_admin_profiles_policies.sql   (defines public.is_admin())
--   2. supabase_watermark_image_counts.sql     (this file)
--   3. supabase_watermark_stats_rpc.sql        (public total + admin dashboard RPCs)
--   4. supabase_watermark_image_counts_realtime.sql (live counter via Broadcast)

create table if not exists public.watermark_image_counts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  visitor_id uuid,
  display_name text,
  user_color text,
  source_page text not null default 'watermark',
  image_count integer not null check (image_count > 0),
  created_at timestamptz not null default now()
);

alter table public.watermark_image_counts
  add column if not exists source_page text;

alter table public.watermark_image_counts
  add column if not exists visitor_id uuid;

alter table public.watermark_image_counts
  add column if not exists display_name text;

alter table public.watermark_image_counts
  add column if not exists user_color text;

alter table public.watermark_image_counts
  alter column source_page set default 'watermark';

-- Older rows may have a null source_page; the stats RPCs treat source_page as
-- always present, so backfill once and lock it in.
update public.watermark_image_counts set source_page = 'watermark' where source_page is null;

alter table public.watermark_image_counts
  alter column source_page set not null;

-- Inserts come straight from anonymous browsers, so cap a single batch to stop
-- one request from inflating the stats. NOT VALID keeps existing rows untouched.
alter table public.watermark_image_counts
  drop constraint if exists watermark_image_counts_image_count_max;

alter table public.watermark_image_counts
  add constraint watermark_image_counts_image_count_max check (image_count <= 1000) not valid;

create index if not exists watermark_image_counts_user_created_idx
on public.watermark_image_counts (user_id, created_at desc);

create index if not exists watermark_image_counts_visitor_created_idx
on public.watermark_image_counts (visitor_id, source_page, created_at desc);

create index if not exists watermark_image_counts_source_created_idx
on public.watermark_image_counts (source_page, created_at desc);

create index if not exists watermark_image_counts_created_idx
on public.watermark_image_counts (created_at desc);

alter table public.watermark_image_counts enable row level security;

grant insert on table public.watermark_image_counts to anon, authenticated;

-- Raw rows (user_id, display_name, visitor_id) are never readable from the
-- browser. Public totals go through public.watermark_image_count_total() and
-- the admin dashboard through the admin-only RPCs, all security definer.
revoke select, update, delete on table public.watermark_image_counts from anon, authenticated;
-- A table-level revoke leaves column-level grants in place; drop the old ones too.
revoke select (image_count, visitor_id, display_name, user_color, source_page, user_id, created_at)
  on table public.watermark_image_counts from anon, authenticated;

drop policy if exists "Web clients can create watermark image counts" on public.watermark_image_counts;
create policy "Web clients can create watermark image counts"
on public.watermark_image_counts
for insert
to anon, authenticated
with check (
  visitor_id is not null
  and (user_id is null or (select auth.uid()) = user_id)
);

drop policy if exists "Web clients can read watermark image count totals" on public.watermark_image_counts;
