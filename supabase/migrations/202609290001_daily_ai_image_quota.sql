-- Durable UTC-day quota for successful AI shoe image generations.
-- API handlers reserve atomically before inference and finalize only after success.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists private.ai_image_quota_daily (
  quota_date date primary key,
  successful_count integer not null default 0 check (successful_count >= 0),
  reserved_count integer not null default 0 check (reserved_count >= 0),
  created_at timestamptz not null default now()
);

create table if not exists private.ai_image_quota_reservations (
  id uuid primary key default gen_random_uuid(),
  quota_date date not null references private.ai_image_quota_daily(quota_date) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists ai_image_quota_reservations_day_created_idx
  on private.ai_image_quota_reservations(quota_date, created_at);

revoke all on all tables in schema private from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema private to service_role;

create or replace function public.reserve_ai_image_quota(p_limit integer default 50)
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
  if p_limit < 1 or p_limit > 1000 then
    raise exception 'Invalid image quota limit';
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

  -- Conditional UPDATE is atomic and serializes simultaneous reservations.
  update private.ai_image_quota_daily
  set reserved_count = reserved_count + 1
  where quota_date = v_day
    and successful_count + reserved_count < p_limit
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

create or replace function public.finish_ai_image_quota(p_reservation_id uuid, p_succeeded boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date;
begin
  if auth.uid() is null or not public.current_user_is_admin() then
    raise exception 'Active admin session required' using errcode = '42501';
  end if;

  select quota_date into v_day
  from private.ai_image_quota_reservations
  where id = p_reservation_id
  for update;

  if not found then
    return false;
  end if;

  update private.ai_image_quota_daily
  set reserved_count = greatest(0, reserved_count - 1),
      successful_count = successful_count + case when p_succeeded then 1 else 0 end
  where quota_date = v_day;

  delete from private.ai_image_quota_reservations
  where id = p_reservation_id;
  return true;
end;
$$;

revoke all on function public.reserve_ai_image_quota(integer) from public, anon;
revoke all on function public.finish_ai_image_quota(uuid, boolean) from public, anon;
grant execute on function public.reserve_ai_image_quota(integer) to authenticated;
grant execute on function public.finish_ai_image_quota(uuid, boolean) to authenticated;
