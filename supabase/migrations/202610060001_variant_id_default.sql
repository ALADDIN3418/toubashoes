-- دفاع در برابر «null value in column "id" of relation "product_variants"»:
-- به id جدول کلید‌واژۀ خودکار می‌دهد تا درج از هر مسیری (حتی بیلدهای قدیمی) کار کند.
create extension if not exists pgcrypto with schema extensions;
alter table if exists public.product_variants
  alter column id set default extensions.gen_random_uuid();
