-- Live updates for the /watermark total counter and the admin dashboard.
-- Safe to re-run. Run AFTER supabase_watermark_image_counts.sql.
--
-- Postgres Changes only delivers rows the subscriber may SELECT, and raw rows
-- are no longer readable from the browser. Instead, a trigger publishes a
-- minimal payload (no user_id / display_name) on the public Realtime Broadcast
-- topic "watermark-image-counts" via realtime.send().
-- Requires "Allow public access" for Realtime channels in the project settings
-- (Project Settings → Realtime), which is the default for existing projects.

create or replace function public.watermark_image_counts_broadcast()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform realtime.send(
      jsonb_build_object(
        'visitor_id', new.visitor_id,
        'image_count', new.image_count,
        'source_page', new.source_page
      ),
      'insert',
      'watermark-image-counts',
      false
    );
  exception when others then
    -- Never block the insert because Realtime is unavailable.
    raise warning 'watermark_image_counts_broadcast failed: %', sqlerrm;
  end;

  return null;
end;
$$;

drop trigger if exists watermark_image_counts_broadcast on public.watermark_image_counts;
create trigger watermark_image_counts_broadcast
after insert on public.watermark_image_counts
for each row execute function public.watermark_image_counts_broadcast();

-- The table used to be in the Postgres Changes publication; it is not needed anymore.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'watermark_image_counts'
  ) then
    alter publication supabase_realtime drop table public.watermark_image_counts;
  end if;
end;
$$;
