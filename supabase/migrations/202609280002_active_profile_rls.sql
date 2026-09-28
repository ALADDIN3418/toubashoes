-- Enforce active-account status at the database boundary, not only in the UI.
-- Role changes remain restricted to a trusted SQL/admin path.

create or replace function public.current_user_is_active()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active = true
  );
$$;
revoke all on function public.current_user_is_active() from public, anon;
grant execute on function public.current_user_is_active() to authenticated;

-- Re-create owner policies so deactivated accounts cannot continue using old JWTs.
drop policy if exists profiles_read_self_or_admin on public.profiles;
create policy profiles_read_self_or_admin on public.profiles for select to authenticated
  using (((id = (select auth.uid())) and (select public.current_user_is_active()))
    or (select public.current_user_is_admin()));

drop policy if exists profiles_update_self_or_admin on public.profiles;
create policy profiles_update_self_or_admin on public.profiles for update to authenticated
  using (((id = (select auth.uid())) and (select public.current_user_is_active()))
    or (select public.current_user_is_admin()))
  with check (((id = (select auth.uid())) and (select public.current_user_is_active()))
    or (select public.current_user_is_admin()));

drop policy if exists addresses_owner_access on public.addresses;
create policy addresses_owner_access on public.addresses for all to authenticated
  using (((user_id = (select auth.uid())) and (select public.current_user_is_active()))
    or (select public.current_user_is_admin()))
  with check (((user_id = (select auth.uid())) and (select public.current_user_is_active()))
    or (select public.current_user_is_admin()));

drop policy if exists orders_owner_read on public.orders;
create policy orders_owner_read on public.orders for select to authenticated
  using (((user_id = (select auth.uid())) and (select public.current_user_is_active()))
    or (select public.current_user_is_admin()));

drop policy if exists order_items_owner_read on public.order_items;
create policy order_items_owner_read on public.order_items for select to authenticated
  using (
    (exists (
      select 1 from public.orders o
      where o.id = order_id and o.user_id = (select auth.uid())
    ) and (select public.current_user_is_active()))
    or (select public.current_user_is_admin())
  );

drop policy if exists payments_owner_read on public.payments;
create policy payments_owner_read on public.payments for select to authenticated
  using (
    (exists (
      select 1 from public.orders o
      where o.id = order_id and o.user_id = (select auth.uid())
    ) and (select public.current_user_is_active()))
    or (select public.current_user_is_admin())
  );

drop policy if exists carts_owner_access on public.carts;
create policy carts_owner_access on public.carts for all to authenticated
  using (((user_id = (select auth.uid())) and (select public.current_user_is_active()))
    or (select public.current_user_is_admin()))
  with check (((user_id = (select auth.uid())) and (select public.current_user_is_active()))
    or (select public.current_user_is_admin()));

drop policy if exists cart_items_owner_access on public.cart_items;
create policy cart_items_owner_access on public.cart_items for all to authenticated
  using (
    (exists (
      select 1 from public.carts c
      where c.id = cart_id and c.user_id = (select auth.uid())
    ) and (select public.current_user_is_active()))
    or (select public.current_user_is_admin())
  )
  with check (
    (exists (
      select 1 from public.carts c
      where c.id = cart_id and c.user_id = (select auth.uid())
    ) and (select public.current_user_is_active()))
    or (select public.current_user_is_admin())
  );

drop policy if exists reviews_customer_submit on public.reviews;
create policy reviews_customer_submit on public.reviews for insert to authenticated
  with check (user_id = (select auth.uid())
    and (select public.current_user_is_active())
    and status = 'pending');

drop policy if exists reviews_owner_update_pending on public.reviews;
create policy reviews_owner_update_pending on public.reviews for update to authenticated
  using (user_id = (select auth.uid())
    and (select public.current_user_is_active())
    and status = 'pending')
  with check (user_id = (select auth.uid())
    and (select public.current_user_is_active())
    and status = 'pending');
