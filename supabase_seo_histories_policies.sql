alter table public.seo_histories enable row level security;

revoke all on table public.seo_histories from anon;

grant select, insert, delete on table public.seo_histories to authenticated;

drop policy if exists "Users can read their own SEO histories" on public.seo_histories;
create policy "Users can read their own SEO histories"
on public.seo_histories
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own SEO histories" on public.seo_histories;
create policy "Users can create their own SEO histories"
on public.seo_histories
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own SEO histories" on public.seo_histories;
create policy "Users can delete their own SEO histories"
on public.seo_histories
for delete
to authenticated
using ((select auth.uid()) = user_id);
