create or replace view public.watermark_visitor_stats as
select
  visitor_id,
  (array_agg(user_id order by created_at desc) filter (where user_id is not null))[1] as user_id,
  (array_agg(display_name order by created_at desc) filter (where display_name is not null and btrim(display_name) <> ''))[1] as display_name,
  sum(image_count)::integer as total_images,
  count(*)::integer as entry_count,
  array_agg(distinct coalesce(source_page, 'watermark')) as source_pages,
  max(created_at) as last_seen_at
from public.watermark_image_counts
where visitor_id is not null
group by visitor_id;

grant select on table public.watermark_visitor_stats to anon, authenticated;
