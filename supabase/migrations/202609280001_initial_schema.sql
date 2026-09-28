-- Touba Shoes production foundation for Supabase/PostgreSQL.
-- Safe to apply only to the confirmed-empty project. This migration does NOT
-- import mock seed data and does NOT create a payment gateway or admin user.

create extension if not exists pgcrypto;

do $$ begin
  create type public.app_role as enum ('customer', 'admin', 'super_admin');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.order_status as enum ('pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.payment_status as enum ('pending', 'verified', 'failed', 'refunded');
exception when duplicate_object then null; end $$;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text not null default '',
  phone text,
  role public.app_role not null default 'customer',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_phone_length check (phone is null or length(phone) between 7 and 20)
);
create unique index if not exists profiles_phone_unique on public.profiles(phone) where phone is not null;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  image_url text,
  icon text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  short_description text,
  description text not null default '',
  brand text,
  sku text not null unique,
  price_toman bigint not null check (price_toman >= 0),
  compare_at_price_toman bigint check (compare_at_price_toman is null or compare_at_price_toman >= 0),
  is_active boolean not null default false,
  is_featured boolean not null default false,
  is_best_seller boolean not null default false,
  features jsonb not null default '[]'::jsonb,
  specifications jsonb not null default '{}'::jsonb,
  category_id uuid not null references public.categories(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_category_active_idx on public.products(category_id, is_active, created_at desc);
create index if not exists products_sku_idx on public.products(sku);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  size text not null,
  color text not null,
  sku text unique,
  stock integer not null default 0 check (stock >= 0),
  price_toman bigint check (price_toman is null or price_toman >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_id, size, color)
);
create index if not exists product_variants_product_idx on public.product_variants(product_id);

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  url text not null,
  alt text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists product_images_order_idx on public.product_images(product_id, sort_order);

create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  recipient text not null,
  phone text not null,
  province text not null,
  city text not null,
  address text not null,
  postal_code text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists addresses_user_idx on public.addresses(user_id);

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null check (discount_type in ('fixed_toman', 'percent')),
  amount integer not null check (amount > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  minimum_order_toman bigint not null default 0 check (minimum_order_toman >= 0),
  usage_limit integer check (usage_limit is null or usage_limit >= 0),
  usage_count integer not null default 0 check (usage_count >= 0),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  user_id uuid not null references public.profiles(id) on delete restrict,
  status public.order_status not null default 'pending_payment',
  currency char(3) not null default 'IRR' check (currency = 'IRR'),
  subtotal_toman bigint not null check (subtotal_toman >= 0),
  shipping_toman bigint not null default 0 check (shipping_toman >= 0),
  discount_toman bigint not null default 0 check (discount_toman >= 0),
  total_toman bigint not null check (total_toman >= 0),
  address_snapshot jsonb not null,
  coupon_id uuid references public.coupons(id) on delete set null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, idempotency_key),
  constraint order_total_matches check (
    discount_toman <= subtotal_toman + shipping_toman
    and total_toman = subtotal_toman + shipping_toman - discount_toman
  )
);
create index if not exists orders_user_created_idx on public.orders(user_id, created_at desc);
create index if not exists orders_status_created_idx on public.orders(status, created_at desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  product_name_snapshot text not null,
  variant_label_snapshot text not null,
  sku_snapshot text,
  unit_price_toman bigint not null check (unit_price_toman >= 0),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now()
);
create index if not exists order_items_order_idx on public.order_items(order_id);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  provider text not null default 'mock',
  provider_reference text,
  status public.payment_status not null default 'pending',
  amount_toman bigint not null check (amount_toman >= 0),
  amount_irr bigint generated always as (amount_toman * 10) stored,
  verified_at timestamptz,
  callback_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  updated_at timestamptz not null default now()
);
create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(cart_id, variant_id)
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  body text not null check (length(body) between 5 and 5000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, product_id)
);
create index if not exists reviews_product_status_idx on public.reviews(product_id, status, created_at desc);

create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  image_url text not null,
  link_url text,
  placement text not null default 'home-promo',
  sort_order integer not null default 0,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.page_contents (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  title text,
  body text not null default '',
  is_published boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  alt text,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.current_user_is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active = true
      and p.role in ('admin'::public.app_role, 'super_admin'::public.app_role)
  );
$$;
revoke all on function public.current_user_is_admin() from public;
grant execute on function public.current_user_is_admin() to anon, authenticated;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles(id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Basic updated_at maintenance.
do $$
declare t text;
begin
  foreach t in array array['profiles','categories','products','product_variants','addresses','coupons','orders','payments','carts','cart_items','reviews','banners','page_contents','site_settings'] loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', t, t);
    execute format('create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- Least-privilege table grants; all direct data access remains subject to RLS.
revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant usage on type public.app_role, public.order_status, public.payment_status to anon, authenticated;
grant select on public.categories, public.products, public.product_variants, public.product_images, public.banners, public.page_contents, public.site_settings, public.reviews to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
revoke update on public.profiles from authenticated;
grant update(display_name, phone) on public.profiles to authenticated;
grant select, insert, update, delete on public.categories, public.products, public.product_variants, public.product_images, public.addresses, public.coupons, public.orders, public.order_items, public.payments, public.carts, public.cart_items, public.reviews, public.banners, public.page_contents, public.site_settings, public.media to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_images enable row level security;
alter table public.addresses enable row level security;
alter table public.coupons enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.reviews enable row level security;
alter table public.banners enable row level security;
alter table public.page_contents enable row level security;
alter table public.site_settings enable row level security;
alter table public.media enable row level security;

create policy profiles_read_self_or_admin on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.current_user_is_admin()));
create policy profiles_update_self_or_admin on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select public.current_user_is_admin()))
  with check (id = (select auth.uid()) or (select public.current_user_is_admin()));

create policy categories_public_read on public.categories for select to anon, authenticated
  using (is_active or (select public.current_user_is_admin()));
create policy categories_admin_write on public.categories for all to authenticated
  using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));

create policy products_public_read on public.products for select to anon, authenticated
  using (is_active or (select public.current_user_is_admin()));
create policy products_admin_write on public.products for all to authenticated
  using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));

create policy variants_public_read on public.product_variants for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.is_active) or (select public.current_user_is_admin()));
create policy variants_admin_write on public.product_variants for all to authenticated
  using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));

create policy images_public_read on public.product_images for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.is_active) or (select public.current_user_is_admin()));
create policy images_admin_write on public.product_images for all to authenticated
  using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));

create policy addresses_owner_access on public.addresses for all to authenticated
  using (user_id = (select auth.uid()) or (select public.current_user_is_admin()))
  with check (user_id = (select auth.uid()) or (select public.current_user_is_admin()));

create policy coupons_admin_only on public.coupons for all to authenticated
  using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));

create policy orders_owner_read on public.orders for select to authenticated
  using (user_id = (select auth.uid()) or (select public.current_user_is_admin()));
create policy orders_admin_update on public.orders for update to authenticated
  using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));
create policy order_items_owner_read on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = (select auth.uid()) or (select public.current_user_is_admin()))));
create policy order_items_admin_write on public.order_items for all to authenticated
  using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));
create policy payments_owner_read on public.payments for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = (select auth.uid()) or (select public.current_user_is_admin()))));
create policy payments_admin_read on public.payments for select to authenticated
  using ((select public.current_user_is_admin()));

create policy carts_owner_access on public.carts for all to authenticated
  using (user_id = (select auth.uid()) or (select public.current_user_is_admin()))
  with check (user_id = (select auth.uid()) or (select public.current_user_is_admin()));
create policy cart_items_owner_access on public.cart_items for all to authenticated
  using (exists (select 1 from public.carts c where c.id = cart_id and (c.user_id = (select auth.uid()) or (select public.current_user_is_admin()))))
  with check (exists (select 1 from public.carts c where c.id = cart_id and (c.user_id = (select auth.uid()) or (select public.current_user_is_admin()))));

create policy reviews_public_approved on public.reviews for select to anon, authenticated
  using (status = 'approved' or user_id = (select auth.uid()) or (select public.current_user_is_admin()));
create policy reviews_customer_submit on public.reviews for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending');
create policy reviews_owner_update_pending on public.reviews for update to authenticated
  using (user_id = (select auth.uid()) and status = 'pending')
  with check (user_id = (select auth.uid()) and status = 'pending');
create policy reviews_admin_write on public.reviews for all to authenticated
  using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));

create policy banners_public_read on public.banners for select to anon, authenticated
  using (is_active or (select public.current_user_is_admin()));
create policy banners_admin_write on public.banners for all to authenticated
  using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));
create policy pages_public_read on public.page_contents for select to anon, authenticated
  using (is_published or (select public.current_user_is_admin()));
create policy pages_admin_write on public.page_contents for all to authenticated
  using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));
create policy settings_public_read on public.site_settings for select to anon, authenticated
  using (is_public or (select public.current_user_is_admin()));
create policy settings_admin_write on public.site_settings for all to authenticated
  using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));
create policy media_public_read on public.media for select to anon, authenticated
  using (true);
create policy media_admin_write on public.media for all to authenticated
  using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));

-- Public product images only. Admin uploads require a verified admin JWT.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];
create policy product_images_public_download on storage.objects for select to anon, authenticated
  using (bucket_id = 'product-images');
create policy product_images_admin_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (select public.current_user_is_admin()));
create policy product_images_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (select public.current_user_is_admin()))
  with check (bucket_id = 'product-images' and (select public.current_user_is_admin()));
create policy product_images_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (select public.current_user_is_admin()));

-- No demo customers, products, admin roles, payment keys, or mock orders are seeded.
