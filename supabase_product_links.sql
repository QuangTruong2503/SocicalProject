-- "Link ảnh sản phẩm" tool (/link-anh-san-pham).
-- Apply in Supabase SQL Editor AFTER supabase_admin_profiles_policies.sql
-- (needs public.is_admin() and profiles.role/status).
--
-- Access model (per user, managed by admins in /admin/product-links):
--   viewer  (1) xem + copy link
--   checker (2) + đánh dấu hoàn thành, sửa ghi chú, ghim sản phẩm
--   editor  (3) + nhập dữ liệu, thêm/sửa/xóa sản phẩm
-- profiles.role = 'admin' always gets level 3; suspended accounts get 0.
-- Every write to items is logged by trigger, so logs cannot be skipped or forged.
-- Safe to re-run: later additions (e.g. pinning) are applied as ALTERs.

-- ── Access ───────────────────────────────────────────────────────────
create table if not exists public.product_link_access (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  level text not null check (level in ('viewer', 'checker', 'editor')),
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.product_links_level()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((
    select case
      when p.status = 'suspended' then 0
      when p.role = 'admin' then 3
      else coalesce((
        select case a.level when 'editor' then 3 when 'checker' then 2 when 'viewer' then 1 else 0 end
        from public.product_link_access a
        where a.user_id = p.id
      ), 0)
    end
    from public.profiles p
    where p.id = auth.uid()
  ), 0);
$$;

grant execute on function public.product_links_level() to authenticated;

-- auth.uid() only if that profile still exists (null while it is being deleted),
-- so log inserts never violate the user_id foreign key.
create or replace function public.product_links_actor_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from public.profiles where id = auth.uid();
$$;

create or replace function public.product_links_actor_name()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(nullif(trim(full_name), ''), nullif(trim(username), ''), email, 'Không rõ')
  from public.profiles
  where id = auth.uid();
$$;

alter table public.product_link_access enable row level security;

drop policy if exists product_link_access_select on public.product_link_access;
drop policy if exists product_link_access_admin_insert on public.product_link_access;
drop policy if exists product_link_access_admin_update on public.product_link_access;
drop policy if exists product_link_access_admin_delete on public.product_link_access;

create policy product_link_access_select on public.product_link_access
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy product_link_access_admin_insert on public.product_link_access
  for insert to authenticated with check (public.is_admin());
create policy product_link_access_admin_update on public.product_link_access
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy product_link_access_admin_delete on public.product_link_access
  for delete to authenticated using (public.is_admin());

grant select, insert, update, delete on public.product_link_access to authenticated;

-- ── Items ────────────────────────────────────────────────────────────
create table if not exists public.product_link_items (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  code text not null check (length(trim(code)) > 0),
  links text[] not null default '{}',
  note text,
  is_done boolean not null default false,
  done_by uuid references public.profiles(id) on delete set null,
  done_by_name text,
  done_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Pinning: important unfinished items stay on top for everyone.
alter table public.product_link_items
  add column if not exists is_pinned boolean not null default false,
  add column if not exists pinned_by uuid references public.profiles(id) on delete set null,
  add column if not exists pinned_by_name text,
  add column if not exists pinned_at timestamptz;

create unique index if not exists product_link_items_code_key on public.product_link_items (lower(code));
create index if not exists product_link_items_seq_idx on public.product_link_items (seq);

-- ── Logs ─────────────────────────────────────────────────────────────
create table if not exists public.product_link_logs (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid() references public.profiles(id) on delete set null,
  actor_name text,
  action text not null check (action in (
    'create', 'update', 'delete', 'check', 'uncheck', 'pin', 'unpin', 'note', 'import', 'copy', 'grant', 'revoke'
  )),
  item_id uuid,
  item_code text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.product_link_logs drop constraint if exists product_link_logs_action_check;
alter table public.product_link_logs add constraint product_link_logs_action_check check (action in (
  'create', 'update', 'delete', 'check', 'uncheck', 'pin', 'unpin', 'note', 'import', 'copy', 'grant', 'revoke'
));

create index if not exists product_link_logs_created_idx on public.product_link_logs (created_at desc);
create index if not exists product_link_logs_user_idx on public.product_link_logs (user_id, created_at desc);

-- Server-side bookkeeping: done_by/done_at and pinned_by/pinned_at come from the
-- caller's JWT, never from the client, and checkers cannot touch code/links.
-- Finishing an item unpins it.
create or replace function public.product_link_items_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_done_changed boolean;
  v_pin_changed boolean;
begin
  new.code := trim(new.code);

  if new.is_done then
    new.is_pinned := false;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := public.product_links_actor_id();
    new.created_at := now();
    v_done_changed := true;
    v_pin_changed := true;
  else
    if public.product_links_level() < 3 and (
      new.code is distinct from old.code
      or new.links is distinct from old.links
    ) then
      raise exception 'Bạn chỉ có quyền đánh dấu hoàn thành và ghi chú.' using errcode = '42501';
    end if;
    -- Clients may not rewrite these, but the FK "on delete set null" cascade may clear them.
    new.created_by := case when new.created_by is null then null else old.created_by end;
    new.created_at := old.created_at;
    v_done_changed := new.is_done is distinct from old.is_done;

    if not v_done_changed then
      new.done_by := case when new.done_by is null then null else old.done_by end;
      new.done_by_name := old.done_by_name;
      new.done_at := old.done_at;
    end if;

    v_pin_changed := new.is_pinned is distinct from old.is_pinned;

    if not v_pin_changed then
      new.pinned_by := case when new.pinned_by is null then null else old.pinned_by end;
      new.pinned_by_name := old.pinned_by_name;
      new.pinned_at := old.pinned_at;
    end if;
  end if;

  if v_done_changed then
    if new.is_done then
      new.done_by := public.product_links_actor_id();
      new.done_by_name := public.product_links_actor_name();
      new.done_at := now();
    else
      new.done_by := null;
      new.done_by_name := null;
      new.done_at := null;
    end if;
  end if;

  if v_pin_changed then
    if new.is_pinned then
      new.pinned_by := public.product_links_actor_id();
      new.pinned_by_name := public.product_links_actor_name();
      new.pinned_at := now();
    else
      new.pinned_by := null;
      new.pinned_by_name := null;
      new.pinned_at := null;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists product_link_items_before_write on public.product_link_items;
create trigger product_link_items_before_write
  before insert or update on public.product_link_items
  for each row execute function public.product_link_items_before_write();

create or replace function public.product_link_items_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_id uuid;
  v_code text;
  v_details jsonb := '{}'::jsonb;
begin
  -- product_links_import() writes a single summary entry instead.
  if coalesce(current_setting('product_links.skip_log', true), '') = 'on' then
    return null;
  end if;

  if tg_op = 'INSERT' then
    v_action := 'create';
    v_id := new.id;
    v_code := new.code;
    v_details := jsonb_build_object('link_count', cardinality(new.links));
  elsif tg_op = 'DELETE' then
    v_action := 'delete';
    v_id := old.id;
    v_code := old.code;
    v_details := jsonb_build_object('link_count', cardinality(old.links), 'was_done', old.is_done);
  else
    v_id := new.id;
    v_code := new.code;
    if new.is_done is distinct from old.is_done then
      v_action := case when new.is_done then 'check' else 'uncheck' end;
    elsif new.is_pinned is distinct from old.is_pinned then
      v_action := case when new.is_pinned then 'pin' else 'unpin' end;
    elsif new.code is distinct from old.code or new.links is distinct from old.links then
      v_action := 'update';
      v_details := jsonb_build_object(
        'old_code', case when new.code is distinct from old.code then old.code end,
        'link_count_before', cardinality(old.links),
        'link_count_after', cardinality(new.links),
        'note_changed', new.note is distinct from old.note
      );
    elsif new.note is distinct from old.note then
      v_action := 'note';
      v_details := jsonb_build_object('note', left(coalesce(new.note, ''), 200));
    else
      return null;
    end if;
  end if;

  insert into public.product_link_logs (user_id, actor_name, action, item_id, item_code, details)
  values (public.product_links_actor_id(), public.product_links_actor_name(), v_action, v_id, v_code, v_details);

  return null;
end;
$$;

drop trigger if exists product_link_items_log on public.product_link_items;
create trigger product_link_items_log
  after insert or update or delete on public.product_link_items
  for each row execute function public.product_link_items_log();

alter table public.product_link_items enable row level security;

drop policy if exists product_link_items_select on public.product_link_items;
drop policy if exists product_link_items_insert on public.product_link_items;
drop policy if exists product_link_items_update on public.product_link_items;
drop policy if exists product_link_items_delete on public.product_link_items;

create policy product_link_items_select on public.product_link_items
  for select to authenticated using (public.product_links_level() >= 1);
create policy product_link_items_insert on public.product_link_items
  for insert to authenticated with check (public.product_links_level() >= 3);
create policy product_link_items_update on public.product_link_items
  for update to authenticated using (public.product_links_level() >= 2) with check (public.product_links_level() >= 2);
create policy product_link_items_delete on public.product_link_items
  for delete to authenticated using (public.product_links_level() >= 3);

grant select, insert, update, delete on public.product_link_items to authenticated;

alter table public.product_link_logs enable row level security;

drop policy if exists product_link_logs_select on public.product_link_logs;
drop policy if exists product_link_logs_insert_copy on public.product_link_logs;

-- Permission changes are only visible to admins.
create policy product_link_logs_select on public.product_link_logs
  for select to authenticated using (
    public.product_links_level() >= 1
    and (action not in ('grant', 'revoke') or public.is_admin())
  );
-- Clients may only write their own "copy" entries; everything else comes from triggers/RPC.
create policy product_link_logs_insert_copy on public.product_link_logs
  for insert to authenticated with check (
    action = 'copy'
    and user_id = auth.uid()
    and public.product_links_level() >= 1
  );

grant select, insert on public.product_link_logs to authenticated;

-- ── Import (one transaction, one summary log entry) ─────────────────
-- p_items: [{ "code": "KINGTONY 653532M", "links": ["https://..."] }, ...]
-- p_mode:  merge   = thêm link mới vào sản phẩm đã có
--          replace = thay toàn bộ link của sản phẩm đã có
--          skip    = bỏ qua sản phẩm đã có
create or replace function public.product_links_import(p_items jsonb, p_mode text default 'merge')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_code text;
  v_links text[];
  v_existing public.product_link_items;
  v_added text[];
  v_created integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_links_added integer := 0;
  v_codes text[] := '{}';
  v_result jsonb;
begin
  if public.product_links_level() < 3 then
    raise exception 'Bạn không có quyền nhập dữ liệu.' using errcode = '42501';
  end if;

  if p_mode not in ('merge', 'replace', 'skip') then
    raise exception 'Chế độ nhập không hợp lệ: %', p_mode using errcode = '22023';
  end if;

  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'Dữ liệu nhập phải là một mảng.' using errcode = '22023';
  end if;

  perform set_config('product_links.skip_log', 'on', true);

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_code := trim(coalesce(v_item->>'code', ''));
    continue when v_code = '';

    -- Trimmed, non-empty, de-duplicated, original order preserved.
    select coalesce(array_agg(link order by first_pos), '{}')
    into v_links
    from (
      select trim(value) as link, min(ordinality) as first_pos
      from jsonb_array_elements_text(coalesce(v_item->'links', '[]'::jsonb)) with ordinality
      where trim(value) <> ''
      group by trim(value)
    ) deduped;

    select * into v_existing
    from public.product_link_items
    where lower(code) = lower(v_code)
    for update;

    if not found then
      insert into public.product_link_items (code, links) values (v_code, v_links);
      v_created := v_created + 1;
      v_links_added := v_links_added + cardinality(v_links);
      v_codes := v_codes || v_code;
    elsif p_mode = 'skip' then
      v_skipped := v_skipped + 1;
    elsif p_mode = 'replace' then
      if v_existing.links is distinct from v_links then
        update public.product_link_items set links = v_links where id = v_existing.id;
        v_updated := v_updated + 1;
        v_codes := v_codes || v_existing.code;
      else
        v_skipped := v_skipped + 1;
      end if;
    else
      select coalesce(array_agg(link order by pos), '{}')
      into v_added
      from unnest(v_links) with ordinality as t(link, pos)
      where not (link = any(v_existing.links));

      if cardinality(v_added) > 0 then
        update public.product_link_items set links = links || v_added where id = v_existing.id;
        v_updated := v_updated + 1;
        v_links_added := v_links_added + cardinality(v_added);
        v_codes := v_codes || v_existing.code;
      else
        v_skipped := v_skipped + 1;
      end if;
    end if;
  end loop;

  perform set_config('product_links.skip_log', 'off', true);

  v_result := jsonb_build_object(
    'mode', p_mode,
    'created', v_created,
    'updated', v_updated,
    'skipped', v_skipped,
    'links_added', v_links_added,
    'codes', to_jsonb(v_codes[1:30]),
    'codes_total', cardinality(v_codes)
  );

  insert into public.product_link_logs (user_id, actor_name, action, details)
  values (public.product_links_actor_id(), public.product_links_actor_name(), 'import', v_result);

  return v_result;
end;
$$;

grant execute on function public.product_links_import(jsonb, text) to authenticated;

-- ── Permission change log ───────────────────────────────────────────
create or replace function public.product_link_access_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target uuid;
  v_level text;
  v_previous text;
  v_target_name text;
begin
  if tg_op = 'INSERT' then
    v_target := new.user_id;
    v_level := new.level;
  elsif tg_op = 'UPDATE' then
    if new.level is not distinct from old.level then
      return null;
    end if;
    v_target := new.user_id;
    v_level := new.level;
    v_previous := old.level;
  else
    v_target := old.user_id;
    v_previous := old.level;
  end if;

  select coalesce(nullif(trim(full_name), ''), nullif(trim(username), ''), email)
  into v_target_name
  from public.profiles
  where id = v_target;

  -- Access row removed because the account itself was deleted: nothing to report.
  if not found then
    return null;
  end if;

  insert into public.product_link_logs (user_id, actor_name, action, details)
  values (
    public.product_links_actor_id(),
    public.product_links_actor_name(),
    case when tg_op = 'DELETE' then 'revoke' else 'grant' end,
    jsonb_build_object(
      'target_user_id', v_target,
      'target_name', v_target_name,
      'level', v_level,
      'previous_level', v_previous
    )
  );

  return null;
end;
$$;

drop trigger if exists product_link_access_log on public.product_link_access;
create trigger product_link_access_log
  after insert or update or delete on public.product_link_access
  for each row execute function public.product_link_access_log();

-- ── Realtime ─────────────────────────────────────────────────────────
-- Realtime respects the select policies above, so users without access get nothing.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'product_link_items'
  ) then
    alter publication supabase_realtime add table public.product_link_items;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'product_link_logs'
  ) then
    alter publication supabase_realtime add table public.product_link_logs;
  end if;
end;
$$;
