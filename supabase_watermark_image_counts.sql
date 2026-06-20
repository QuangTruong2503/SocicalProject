create table if not exists public.watermark_image_counts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  visitor_id uuid,
  display_name text,
  source_page text default 'watermark',
  image_count integer not null check (image_count > 0),
  created_at timestamptz not null default now()
);

create index if not exists watermark_image_counts_user_created_idx
on public.watermark_image_counts (user_id, created_at desc);

create index if not exists watermark_image_counts_visitor_created_idx
on public.watermark_image_counts (visitor_id, source_page, created_at desc);

create index if not exists watermark_image_counts_source_created_idx
on public.watermark_image_counts (source_page, created_at desc);

alter table public.watermark_image_counts
  add column if not exists source_page text;

alter table public.watermark_image_counts
  add column if not exists visitor_id uuid;

alter table public.watermark_image_counts
  add column if not exists display_name text;

alter table public.watermark_image_counts
  alter column source_page set default 'watermark';

alter table public.watermark_image_counts enable row level security;

grant insert on table public.watermark_image_counts to anon, authenticated;

revoke select, update, delete on table public.watermark_image_counts from anon, authenticated;
grant select (image_count, visitor_id, display_name, source_page, user_id, created_at) on table public.watermark_image_counts to anon, authenticated;

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
create policy "Web clients can read watermark image count totals"
on public.watermark_image_counts
for select
to anon, authenticated
using (true);
