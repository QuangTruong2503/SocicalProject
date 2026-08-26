-- Server-side aggregate for the watermark image count total.
--
-- The web client used to fetch every `image_count` row and sum them in
-- JavaScript. Supabase/PostgREST caps a plain select at its configured
-- "Max Rows" setting (1000 by default), so once the table grew past that
-- many rows the client only ever summed a partial slice of the data,
-- showing a much smaller total than `select coalesce(sum(image_count), 0)
-- from watermark_image_counts` run directly in the SQL editor.
--
-- This RPC computes the sum in Postgres and returns a single row, so it is
-- not subject to the row cap.
create or replace function public.watermark_image_count_total(
  p_source_page text default null,
  p_visitor_id uuid default null
)
returns bigint
language sql
stable
as $$
  select coalesce(sum(image_count), 0)::bigint
  from public.watermark_image_counts
  where (p_source_page is null or source_page = p_source_page)
    and (p_visitor_id is null or visitor_id = p_visitor_id);
$$;

grant execute on function public.watermark_image_count_total(text, uuid) to anon, authenticated;
