-- Block suspended accounts from the Minh Triết quotation system at the database
-- level, not only in the UI. Safe to re-run.
-- Run AFTER supabase_quotation_management.sql and supabase_admin_profiles_policies.sql
-- (which defines public.is_active_user()).
--
-- save_quotation() and next_quotation_number() are security invoker, so these
-- policies also cover writes made through those RPCs.
-- Báo giá KNM (knm_quotations) is intentionally left open to anon and is not
-- touched here.

drop policy if exists quotation_customers_staff_select on public.quotation_customers;
drop policy if exists quotation_customers_staff_insert on public.quotation_customers;
drop policy if exists quotation_customers_staff_update on public.quotation_customers;
drop policy if exists quotation_counters_staff_all on public.quotation_counters;
drop policy if exists quotations_staff_select on public.quotations;
drop policy if exists quotations_staff_insert on public.quotations;
drop policy if exists quotations_staff_update on public.quotations;
drop policy if exists quotation_items_staff_all on public.quotation_items;

create policy quotation_customers_staff_select on public.quotation_customers
  for select to authenticated using (public.is_active_user());
create policy quotation_customers_staff_insert on public.quotation_customers
  for insert to authenticated with check (public.is_active_user() and created_by = (select auth.uid()));
create policy quotation_customers_staff_update on public.quotation_customers
  for update to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy quotation_counters_staff_all on public.quotation_counters
  for all to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy quotations_staff_select on public.quotations
  for select to authenticated using (public.is_active_user());
create policy quotations_staff_insert on public.quotations
  for insert to authenticated with check (public.is_active_user() and prepared_by = (select auth.uid()));
create policy quotations_staff_update on public.quotations
  for update to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy quotation_items_staff_all on public.quotation_items
  for all to authenticated using (
    public.is_active_user()
    and exists (select 1 from public.quotations q where q.id = quotation_id)
  ) with check (
    public.is_active_user()
    and exists (select 1 from public.quotations q where q.id = quotation_id)
  );
