-- Summary for the signed-in user's /dashboard/overview. Safe to re-run.
-- Run AFTER supabase_profiles_auth_sync.sql. Every feature table is optional
-- (checked with to_regclass), so this works even when a module is not installed.
--
-- Returns counts for the current user only (auth.uid()); security definer is
-- needed because raw watermark rows are not readable from the browser.

create or replace function public.my_dashboard_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb := '{}'::jsonb;
  v_part jsonb;
  v_recent jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'Cần đăng nhập.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'has_password', coalesce(u.encrypted_password, '') <> '',
    'last_login_at', u.last_sign_in_at
  )
  into v_part
  from auth.users u
  where u.id = v_uid;
  v_result := v_result || coalesce(v_part, '{}'::jsonb);

  if to_regclass('public.user_uploads') is not null then
    execute $q$
      select jsonb_build_object('uploads_total', count(*))
      from public.user_uploads where user_id = $1
    $q$ into v_part using v_uid;
    v_result := v_result || v_part;

    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object(
        'kind', 'upload', 'at', created_at, 'file_name', file_name
      )), '[]'::jsonb)
      from (
        select created_at, file_name from public.user_uploads
        where user_id = $1 order by created_at desc limit 3
      ) x
    $q$ into v_part using v_uid;
    v_recent := v_recent || v_part;
  end if;

  if to_regclass('public.watermark_image_counts') is not null then
    execute $q$
      select jsonb_build_object(
        'watermark_images', coalesce(sum(image_count), 0),
        'watermark_images_7d', coalesce(sum(image_count) filter (where created_at >= now() - interval '7 days'), 0),
        'watermark_entries', count(*),
        'watermark_last_at', max(created_at)
      )
      from public.watermark_image_counts where user_id = $1
    $q$ into v_part using v_uid;
    v_result := v_result || v_part;

    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object(
        'kind', 'watermark', 'at', created_at, 'image_count', image_count
      )), '[]'::jsonb)
      from (
        select created_at, image_count from public.watermark_image_counts
        where user_id = $1 order by created_at desc limit 5
      ) x
    $q$ into v_part using v_uid;
    v_recent := v_recent || v_part;
  end if;

  if to_regclass('public.quotations') is not null then
    execute $q$
      select jsonb_build_object(
        'quotations', count(*),
        'quotations_last_at', max(created_at)
      )
      from public.quotations where prepared_by = $1 and deleted_at is null
    $q$ into v_part using v_uid;
    v_result := v_result || v_part;

    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object(
        'kind', 'quotation', 'at', created_at, 'id', id,
        'quotation_no', quotation_no, 'customer_name', customer_name
      )), '[]'::jsonb)
      from (
        select id, created_at, quotation_no, customer_name from public.quotations
        where prepared_by = $1 and deleted_at is null order by created_at desc limit 5
      ) x
    $q$ into v_part using v_uid;
    v_recent := v_recent || v_part;
  end if;

  if to_regprocedure('public.product_links_level()') is not null then
    execute 'select jsonb_build_object(''product_links_level'', public.product_links_level())' into v_part;
    v_result := v_result || v_part;
  end if;

  if to_regclass('public.product_link_items') is not null then
    execute $q$
      select jsonb_build_object('product_links_done', count(*))
      from public.product_link_items where done_by = $1 and is_done
    $q$ into v_part using v_uid;
    v_result := v_result || v_part;
  end if;

  if to_regclass('public.product_link_logs') is not null then
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object(
        'kind', 'product_link', 'at', created_at, 'action', action,
        'item_code', item_code, 'details', details
      )), '[]'::jsonb)
      from (
        select created_at, action, item_code, details from public.product_link_logs
        where user_id = $1 and action <> 'copy' order by id desc limit 5
      ) x
    $q$ into v_part using v_uid;
    v_recent := v_recent || v_part;
  end if;

  select coalesce(jsonb_agg(e order by (e ->> 'at')::timestamptz desc), '[]'::jsonb)
  into v_recent
  from (
    select t.e from jsonb_array_elements(v_recent) as t(e)
    order by (e ->> 'at')::timestamptz desc
    limit 8
  ) recent;

  return v_result || jsonb_build_object('recent', v_recent);
end;
$$;

revoke execute on function public.my_dashboard_summary() from public, anon;
grant execute on function public.my_dashboard_summary() to authenticated;
