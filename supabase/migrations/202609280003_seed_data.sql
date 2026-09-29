-- Touba Shoes Seed Data Migration
-- Seeds initial catalog, categories, products, variants, and admin profile into PostgreSQL / Supabase

DO $$
DECLARE
  cat_men uuid := '00000000-0000-0000-0001-000000000001'::uuid;
  cat_women uuid := '00000000-0000-0000-0001-000000000002'::uuid;
  cat_sport uuid := '00000000-0000-0000-0001-000000000003'::uuid;
  cat_formal uuid := '00000000-0000-0000-0001-000000000004'::uuid;
  cat_sandal uuid := '00000000-0000-0000-0001-000000000005'::uuid;
  cat_slipper uuid := '00000000-0000-0000-0001-000000000006'::uuid;
  cat_accessories uuid := '00000000-0000-0000-0001-000000000007'::uuid;
  cat_sale uuid := '00000000-0000-0000-0001-000000000008'::uuid;

  prod_1 uuid := '00000000-0000-0000-0002-000000000001'::uuid;
  prod_2 uuid := '00000000-0000-0000-0002-000000000002'::uuid;
  prod_3 uuid := '00000000-0000-0000-0002-000000000003'::uuid;
  prod_4 uuid := '00000000-0000-0000-0002-000000000004'::uuid;
  prod_5 uuid := '00000000-0000-0000-0002-000000000005'::uuid;
  prod_6 uuid := '00000000-0000-0000-0002-000000000006'::uuid;
  prod_7 uuid := '00000000-0000-0000-0002-000000000007'::uuid;
  prod_8 uuid := '00000000-0000-0000-0002-000000000008'::uuid;
  prod_9 uuid := '00000000-0000-0000-0002-000000000009'::uuid;
  prod_10 uuid := '00000000-0000-0000-0002-000000000010'::uuid;
  prod_11 uuid := '00000000-0000-0000-0002-000000000011'::uuid;
  prod_12 uuid := '00000000-0000-0000-0002-000000000012'::uuid;
BEGIN
  -- 1. Categories
  INSERT INTO public.categories (id, slug, name, icon, is_active, sort_order)
  VALUES
    (cat_men, 'men', 'کفش مردانه', '👞', true, 1),
    (cat_women, 'women', 'کفش زنانه', '👠', true, 2),
    (cat_sport, 'sport', 'کفش اسپرت', '👟', true, 3),
    (cat_formal, 'formal', 'کفش مجلسی', '✨', true, 4),
    (cat_sandal, 'sandal', 'صندل', '🩴', true, 5),
    (cat_slipper, 'slipper', 'دمپایی', '🥿', true, 6),
    (cat_accessories, 'accessories', 'کیف و اکسسوری', '👜', true, 7),
    (cat_sale, 'sale', 'تخفیف‌ها', '٪', true, 8)
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    is_active = EXCLUDED.is_active;

  -- 2. Products
  INSERT INTO public.products (id, slug, name, sku, brand, price_toman, compare_at_price_toman, category_id, is_active, is_featured, description)
  VALUES
    (prod_1, 'tb-101', 'کفش اسپرت مردانه مدل موج', 'TB-101', 'طوبی', 1250000, 1490000, cat_sport, true, true, 'کفش روزمره سبک و راحت با رویه تنفس‌پذیر و زیره مقاوم؛ مناسب استفاده روزانه.'),
    (prod_2, 'tb-102', 'کفش مردانه چرم طبیعی', 'TB-102', 'طوبی', 1890000, 0, cat_men, true, true, 'دوخته‌شده از چرم طبیعی با آستر نرم و کفی راحت؛ انتخابی ماندگار برای استایل رسمی.'),
    (prod_3, 'tb-103', 'کفش زنانه مجلسی پاشنه‌دار', 'TB-103', 'طوبی', 1620000, 1850000, cat_women, true, true, 'طراحی ظریف و خوش‌فرم برای مهمانی‌ها، با پاشنه متعادل و کفی نرم.'),
    (prod_4, 'tb-104', 'صندل تابستانی مردانه', 'TB-104', 'طوبی', 980000, 0, cat_sandal, true, true, 'صندل سبک با بندهای قابل تنظیم و کفی منعطف برای روزهای گرم.'),
    (prod_5, 'tb-105', 'کفش اسپرت مردانه رانینگ', 'TB-105', 'طوبی', 1150000, 1290000, cat_sport, true, true, 'زیره جذب‌کننده ضربه و طراحی ارگونومیک برای پیاده‌روی و فعالیت روزانه.'),
    (prod_6, 'tb-106', 'کفش کالج چرم مردانه', 'TB-106', 'طوبی', 1490000, 0, cat_men, true, false, 'کالج کلاسیک با دوخت تمیز و رویه چرم طبیعی.'),
    (prod_7, 'tb-107', 'کفش روزمره زنانه آوید', 'TB-107', 'طوبی', 1320000, 1490000, cat_women, true, false, 'همراه راحت هر روز شما، با وزن سبک و طراحی ساده و شیک.'),
    (prod_8, 'tb-108', 'کفش رسمی مردانه کلاسیک', 'TB-108', 'طوبی', 2150000, 0, cat_formal, true, false, 'مدل کلاسیک و شیک برای جلسات و مراسم رسمی.'),
    (prod_9, 'tb-109', 'دمپایی طبی راحتی', 'TB-109', 'طوبی', 590000, 690000, cat_slipper, true, false, 'کفی طبی نرم و سبک برای آسایش پا در خانه.'),
    (prod_10, 'tb-110', 'صندل زنانه بندی نسترن', 'TB-110', 'طوبی', 870000, 0, cat_sandal, true, false, 'صندل بندی ظریف با کفی نرم و طراحی تابستانی.'),
    (prod_11, 'tb-111', 'کیف دوشی مینیمال', 'TB-111', 'طوبی', 1240000, 1390000, cat_accessories, true, false, 'کیف سبک و کاربردی با طراحی مینیمال برای همراهی روزانه.'),
    (prod_12, 'tb-112', 'کفش پیاده‌روی زنانه', 'TB-112', 'طوبی', 1380000, 0, cat_sport, true, false, 'کفش پیاده‌روی با تهویه مناسب و زیره انعطاف‌پذیر.')
  ON CONFLICT (sku) DO UPDATE SET
    name = EXCLUDED.name,
    price_toman = EXCLUDED.price_toman,
    compare_at_price_toman = EXCLUDED.compare_at_price_toman,
    is_active = EXCLUDED.is_active;

  -- 3. Product Variants
  INSERT INTO public.product_variants (product_id, size, color, sku, stock)
  VALUES
    (prod_1, '۴۰', 'مشکی', 'TB-101-1', 5),
    (prod_1, '۴۱', 'مشکی', 'TB-101-2', 5),
    (prod_1, '۴۲', 'سفید', 'TB-101-3', 4),
    (prod_1, '۴۳', 'سفید', 'TB-101-4', 4),
    (prod_2, '۴۰', 'مشکی', 'TB-102-1', 4),
    (prod_2, '۴۱', 'قهوه‌ای', 'TB-102-2', 4),
    (prod_2, '۴۲', 'قهوه‌ای', 'TB-102-3', 4),
    (prod_3, '۳۷', 'مشکی', 'TB-103-1', 3),
    (prod_3, '۳۸', 'زرشکی', 'TB-103-2', 3),
    (prod_3, '۳۹', 'مشکی', 'TB-103-3', 3),
    (prod_4, '۴۰', 'قهوه‌ای', 'TB-104-1', 5),
    (prod_4, '۴۱', 'مشکی', 'TB-104-2', 5),
    (prod_5, '۴۰', 'مشکی', 'TB-105-1', 6),
    (prod_5, '۴۱', 'طوسی', 'TB-105-2', 7),
    (prod_5, '۴۲', 'مشکی', 'TB-105-3', 8),
    (prod_6, '۴۱', 'قهوه‌ای', 'TB-106-1', 4),
    (prod_6, '۴۲', 'سرمه‌ای', 'TB-106-2', 4),
    (prod_7, '۳۷', 'سفید', 'TB-107-1', 8),
    (prod_7, '۳۸', 'کرم', 'TB-107-2', 8),
    (prod_8, '۴۱', 'مشکی', 'TB-108-1', 3),
    (prod_8, '۴۲', 'مشکی', 'TB-108-2', 3),
    (prod_9, '۳۹', 'کرم', 'TB-109-1', 12),
    (prod_9, '۴۰', 'مشکی', 'TB-109-2', 11),
    (prod_10, '۳۸', 'کرم', 'TB-110-1', 6),
    (prod_10, '۳۹', 'قهوه‌ای', 'TB-110-2', 5),
    (prod_11, 'فری‌سایز', 'مشکی', 'TB-111-1', 3),
    (prod_11, 'فری‌سایز', 'قهوه‌ای', 'TB-111-2', 2),
    (prod_12, '۳۸', 'سبز', 'TB-112-1', 2),
    (prod_12, '۳۹', 'مشکی', 'TB-112-2', 1)
  ON CONFLICT (product_id, size, color) DO UPDATE SET
    stock = EXCLUDED.stock;

  -- 4. Coupons
  INSERT INTO public.coupons (code, discount_type, amount, minimum_order_toman, is_active)
  VALUES
    ('TOUBA10', 'percent', 10, 1000000, true),
    ('WELCOME150', 'fixed_toman', 150000, 800000, true)
  ON CONFLICT (code) DO UPDATE SET
    amount = EXCLUDED.amount,
    is_active = EXCLUDED.is_active;

  -- 5. Banners
  INSERT INTO public.banners (title, subtitle, image_url, is_active)
  VALUES
    ('راحتی، با امضای طوبی', 'کالکشن تازه کفش‌های طوبی را ببینید', '/hero-shoe.jpg', true),
    ('تخفیف ویژه فصل', 'تا ۳۰٪ تخفیف برای سفارش‌های بالای ۱ میلیون تومان', '/product-shoes.jpg', true)
  ON CONFLICT DO NOTHING;
END $$;
