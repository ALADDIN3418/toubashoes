-- Repair the durable image-quota RPC after older function signatures or stale
-- PostgREST schema caches caused PGRST202 for p_limit. The cap is fixed at 50
-- in SQL (not caller-controlled), and argument-free RPC calls work with PostgREST.

drop function if exists public.reserve_ai_image_quota(integer);

create or replace function public.reserve_ai_image_quota()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (pg_catalog.clock_timestamp() at time zone 'UTC')::date;
  v_reservation uuid;
  v_has_capacity boolean;
begin
  if auth.uid() is null or not public.current_user_is_admin() then
    raise exception 'Active admin session required' using errcode = '42501';
  end if;

  -- Recover capacity if a serverless request died before finalizing a reservation.
  with expired as (
    delete from private.ai_image_quota_reservations
    where created_at < pg_catalog.clock_timestamp() - interval '10 minutes'
    returning quota_date
  ), expired_counts as (
    select quota_date, count(*) as amount from expired group by quota_date
  )
  update private.ai_image_quota_daily d
  set reserved_count = greatest(0, d.reserved_count - expired_counts.amount::integer)
  from expired_counts
  where d.quota_date = expired_counts.quota_date;

  insert into private.ai_image_quota_daily (quota_date, successful_count, reserved_count)
  values (v_day, 0, 0)
  on conflict (quota_date) do nothing;

  -- Conditional UPDATE atomically serializes reservations; never allow caller
  -- supplied parameters to raise the daily success limit above 50.
  update private.ai_image_quota_daily
  set reserved_count = reserved_count + 1
  where quota_date = v_day
    and successful_count + reserved_count < 50
  returning true into v_has_capacity;

  if not coalesce(v_has_capacity, false) then
    return null;
  end if;

  insert into private.ai_image_quota_reservations (quota_date)
  values (v_day)
  returning id into v_reservation;
  return v_reservation;
end;
$$;

revoke all on function public.reserve_ai_image_quota() from public, anon;
grant execute on function public.reserve_ai_image_quota() to authenticated;

-- PostgREST otherwise can continue resolving the old signature from its cache.
notify pgrst, 'reload schema';
