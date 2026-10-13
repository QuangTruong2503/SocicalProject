-- Watermark stats RPCs. Safe to re-run.
-- Requires public.is_admin() (supabase_admin_profiles_policies.sql) and the
-- updated supabase_watermark_image_counts.sql (raw SELECT closed, source_page not null).
--
-- All aggregation happens in Postgres, so the browser never downloads raw rows
-- and results are not capped by PostgREST's "Max Rows" setting.

-- Superseded by watermark_visitor_stats() below; the view was readable by anon.
drop view if exists public.watermark_visitor_stats;

-- ─── Public: total images (whole site, or one visitor) ────────────────────────
create or replace function public.watermark_image_count_total(
  p_source_page text default null,
  p_visitor_id uuid default null
)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(image_count), 0)::bigint
  from public.watermark_image_counts
  where (p_source_page is null or source_page = p_source_page)
    and (p_visitor_id is null or visitor_id = p_visitor_id);
$$;

revoke execute on function public.watermark_image_count_total(text, uuid) from public;
grant execute on function public.watermark_image_count_total(text, uuid) to anon, authenticated;

-- ─── Signed-in user: images created by this account (any device, any source) ─
-- Same number as /dashboard/overview, so "Ảnh của bạn" on /watermark agrees with it.
create or replace function public.my_watermark_image_total()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(image_count), 0)::bigint
  from public.watermark_image_counts
  where auth.uid() is not null
    and user_id = auth.uid();
$$;

revoke execute on function public.my_watermark_image_total() from public, anon;
grant execute on function public.my_watermark_image_total() to authenticated;

-- ─── Admin: summary tiles, time series and source list ───────────────────────
-- p_from / p_to bound created_at as [p_from, p_to); null means unbounded.
-- p_bucket is 'day' | 'week' | 'month'; buckets are cut in p_tz.
create or replace function public.watermark_admin_overview(
  p_source_page text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_bucket text default 'day',
  p_tz text default 'Asia/Ho_Chi_Minh'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_to timestamptz := coalesce(p_to, now());
  v_from timestamptz;
  v_bucket text := case when p_bucket in ('day', 'week', 'month') then p_bucket else 'day' end;
  v_step interval;
  v_summary jsonb;
  v_previous jsonb := null;
  v_series jsonb;
  v_sources jsonb;
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới xem được thống kê watermark.' using errcode = '42501';
  end if;

  v_from := coalesce(
    p_from,
    (select min(w.created_at) from public.watermark_image_counts w
      where p_source_page is null or w.source_page = p_source_page),
    v_to
  );

  -- Keep the series to a sane number of points for long ranges.
  if v_bucket = 'day' and v_to - v_from > interval '400 days' then
    v_bucket := 'month';
  end if;

  v_step := case v_bucket when 'week' then interval '1 week' when 'month' then interval '1 month' else interval '1 day' end;

  select jsonb_build_object(
    'total_images', coalesce(sum(w.image_count), 0),
    'total_entries', count(*),
    'unique_visitors', count(distinct w.visitor_id),
    'unique_users', count(distinct w.user_id)
  )
  into v_summary
  from public.watermark_image_counts w
  where (p_source_page is null or w.source_page = p_source_page)
    and (p_from is null or w.created_at >= p_from)
    and (p_to is null or w.created_at < p_to);

  -- Same-length window right before p_from, for the "vs previous period" deltas.
  if p_from is not null then
    select jsonb_build_object(
      'total_images', coalesce(sum(w.image_count), 0),
      'total_entries', count(*),
      'unique_visitors', count(distinct w.visitor_id),
      'unique_users', count(distinct w.user_id)
    )
    into v_previous
    from public.watermark_image_counts w
    where (p_source_page is null or w.source_page = p_source_page)
      and w.created_at >= p_from - (v_to - p_from)
      and w.created_at < p_from;
  end if;

  with buckets as (
    select generate_series(
      date_trunc(v_bucket, v_from at time zone p_tz),
      date_trunc(v_bucket, v_to at time zone p_tz),
      v_step
    ) as bucket_start
  ),
  agg as (
    select
      date_trunc(v_bucket, w.created_at at time zone p_tz) as bucket_start,
      sum(w.image_count) as images,
      count(*) as entries
    from public.watermark_image_counts w
    where (p_source_page is null or w.source_page = p_source_page)
      and (p_from is null or w.created_at >= p_from)
      and (p_to is null or w.created_at < p_to)
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'bucket', to_char(b.bucket_start, 'YYYY-MM-DD'),
    'images', coalesce(a.images, 0),
    'entries', coalesce(a.entries, 0)
  ) order by b.bucket_start), '[]'::jsonb)
  into v_series
  from buckets b
  left join agg a on a.bucket_start = b.bucket_start;

  -- Every source seen in the date range (ignores p_source_page) so the filter
  -- can list them with counts.
  select coalesce(jsonb_agg(jsonb_build_object(
    'source_page', s.source_page,
    'images', s.images,
    'entries', s.entries
  ) order by s.images desc), '[]'::jsonb)
  into v_sources
  from (
    select w.source_page, sum(w.image_count) as images, count(*) as entries
    from public.watermark_image_counts w
    where (p_from is null or w.created_at >= p_from)
      and (p_to is null or w.created_at < p_to)
    group by w.source_page
  ) s;

  return jsonb_build_object(
    'bucket', v_bucket,
    'summary', v_summary,
    'previous', v_previous,
    'series', v_series,
    'sources', v_sources
  );
end;
$$;

revoke execute on function public.watermark_admin_overview(text, timestamptz, timestamptz, text, text) from public, anon;
grant execute on function public.watermark_admin_overview(text, timestamptz, timestamptz, text, text) to authenticated;

-- ─── Admin: one row per visitor (or per signed-in account) ───────────────────
-- p_group_by 'user' merges every visitor_id of the same account; anonymous
-- visitors stay one row each. p_sort is whitelisted below.
-- total_count is the number of matching groups before limit/offset.
create or replace function public.watermark_visitor_stats(
  p_source_page text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_search text default null,
  p_group_by text default 'visitor',
  p_sort text default 'total_images',
  p_desc boolean default true,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  group_key text,
  visitor_id uuid,
  visitor_count integer,
  user_id uuid,
  display_name text,
  user_email text,
  user_name text,
  total_images bigint,
  entry_count bigint,
  source_pages text[],
  first_seen_at timestamptz,
  last_seen_at timestamptz,
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
  v_by_user boolean := coalesce(p_group_by, 'visitor') = 'user';
  v_sort text := case
    when p_sort in ('total_images', 'entry_count', 'last_seen_at', 'first_seen_at', 'name') then p_sort
    else 'total_images'
  end;
  v_desc boolean := coalesce(p_desc, true);
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới xem được thống kê watermark.' using errcode = '42501';
  end if;

  return query
  with filtered as (
    select
      w.visitor_id,
      w.user_id,
      w.display_name,
      w.source_page,
      w.image_count,
      w.created_at,
      case
        when v_by_user and w.user_id is not null then 'user:' || w.user_id::text
        else 'visitor:' || w.visitor_id::text
      end as gkey
    from public.watermark_image_counts w
    where w.visitor_id is not null
      and (p_source_page is null or w.source_page = p_source_page)
      and (p_from is null or w.created_at >= p_from)
      and (p_to is null or w.created_at < p_to)
  ),
  grouped as (
    select
      f.gkey,
      (array_agg(f.visitor_id order by f.created_at desc))[1] as g_visitor_id,
      count(distinct f.visitor_id)::integer as g_visitor_count,
      (array_agg(f.user_id order by f.created_at desc) filter (where f.user_id is not null))[1] as g_user_id,
      (array_agg(btrim(f.display_name) order by f.created_at desc)
        filter (where nullif(btrim(f.display_name), '') is not null))[1] as g_display_name,
      sum(f.image_count)::bigint as g_total_images,
      count(*)::bigint as g_entry_count,
      array_agg(distinct f.source_page order by f.source_page) as g_source_pages,
      min(f.created_at) as g_first_seen_at,
      max(f.created_at) as g_last_seen_at
    from filtered f
    group by f.gkey
  ),
  enriched as (
    select
      g.*,
      p.email::text as g_user_email,
      coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.username), ''))::text as g_user_name
    from grouped g
    left join public.profiles p on p.id = g.g_user_id
  ),
  searched as (
    select e.*
    from enriched e
    where v_search is null
      or position(v_search in lower(concat_ws(' ',
        e.g_visitor_id::text, e.g_user_id::text, e.g_display_name, e.g_user_email, e.g_user_name
      ))) > 0
  )
  select
    s.gkey,
    s.g_visitor_id,
    s.g_visitor_count,
    s.g_user_id,
    s.g_display_name,
    s.g_user_email,
    s.g_user_name,
    s.g_total_images,
    s.g_entry_count,
    s.g_source_pages,
    s.g_first_seen_at,
    s.g_last_seen_at,
    count(*) over ()::bigint
  from searched s
  order by
    case when v_sort = 'total_images' and v_desc then s.g_total_images end desc nulls last,
    case when v_sort = 'total_images' and not v_desc then s.g_total_images end asc nulls last,
    case when v_sort = 'entry_count' and v_desc then s.g_entry_count end desc nulls last,
    case when v_sort = 'entry_count' and not v_desc then s.g_entry_count end asc nulls last,
    case when v_sort = 'last_seen_at' and v_desc then s.g_last_seen_at end desc nulls last,
    case when v_sort = 'last_seen_at' and not v_desc then s.g_last_seen_at end asc nulls last,
    case when v_sort = 'first_seen_at' and v_desc then s.g_first_seen_at end desc nulls last,
    case when v_sort = 'first_seen_at' and not v_desc then s.g_first_seen_at end asc nulls last,
    case when v_sort = 'name' and v_desc then lower(coalesce(s.g_user_name, s.g_display_name, s.g_user_email)) end desc nulls last,
    case when v_sort = 'name' and not v_desc then lower(coalesce(s.g_user_name, s.g_display_name, s.g_user_email)) end asc nulls last,
    s.g_last_seen_at desc,
    s.gkey
  limit least(greatest(coalesce(p_limit, 50), 1), 10000)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.watermark_visitor_stats(text, timestamptz, timestamptz, text, text, text, boolean, integer, integer) from public, anon;
grant execute on function public.watermark_visitor_stats(text, timestamptz, timestamptz, text, text, text, boolean, integer, integer) to authenticated;
