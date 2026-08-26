-- Enable Supabase Realtime (Postgres Changes over websocket) for the
-- watermark image count table, so the /watermark page's total counter can
-- update live when another visitor creates images, without polling.
--
-- Realtime respects the table's existing RLS select policy
-- ("Web clients can read watermark image count totals", using (true)),
-- so anon/authenticated clients already allowed to select rows will also
-- receive INSERT broadcasts for them.
alter publication supabase_realtime add table public.watermark_image_counts;
