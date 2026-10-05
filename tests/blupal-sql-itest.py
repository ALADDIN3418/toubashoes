"""بلوپال — اجرای واقعی SQL روی Postgres (integration test).

تست‌های `tests/blupal.js` پاسخ درگاه و پاسخ RPC را جعل می‌کنند؛ این اسکریپت همان SQL را روی یک
Postgres واقعی می‌نواند تا اشتباهاتی گرفته شود که فقط در پارس/اجرای واقعی می‌سوزند: عضو نبودن یک
مقدار در enum، قفل dollar-quote باز، ترتیب statement‌ها، یا قفل CHECK که با ردیف‌های قدیمی می‌جنگد.

دو مسیر آزموده می‌شود:
  ۱) شش فایل supabase/manual/*.sql — همان چیزی که در Supabase SQL Editor چسبانده می‌شود؛
  ۲) خودِ supabase/migrations/202610050001_blupal_provider.sql (مسیر `supabase db push`).

در هر دو، شکل دادهٔ واقعی فروشگاه ساخته می‌شود: یک پرداخت تأییدشدهٔ درگاه قبلی (تاریخچه که باید
بماند) و یک چک‌اوت رهاشدهٔ درگاه قبلی (که باید بسته و موجودی آزاد شود).

اجرا:  node tests/blupal-sql.js            (بی‌صدا رد می‌شود اگر pgserver نصب نباشد)
      python3 tests/blupal-sql-itest.py
نیاز: pip install "pgserver" "psycopg[binary]"
"""

import json
import os
import re
import sys
import tempfile
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIGRATIONS = os.path.join(ROOT, 'supabase', 'migrations')
MANUAL = os.path.join(ROOT, 'supabase', 'manual')
BLUPAL_SQL = os.path.join(MIGRATIONS, '202610050001_blupal_provider.sql')
GENERATOR = os.path.join(ROOT, 'scripts', 'blupal-sql-chunks.js')
BASELINE = ['202609280001_initial_schema.sql', '202609280002_active_profile_rls.sql',
            '202610020001_zarinpal_payment_provider.sql', '202610030001_live_commerce.sql']
LEGACY = ('zarinpal', 'balepay', 'bluepal')
PLANS = ('chunks', 'migration')

try:
    import pgserver  # type: ignore
    import psycopg  # type: ignore
except Exception as missing:  # pragma: no cover - depends on the machine, not on the repo
    print(f'SKIP: python packages missing ({missing.__class__.__name__}: {missing})')
    print('SKIP: pip install "pgserver" "psycopg[binary]" enables the real-Postgres SQL test')
    sys.exit(0)

PROBLEMS = []


def expect(condition, message):
    print(('  ok   ' if condition else '  FAIL ') + message)
    if not condition:
        PROBLEMS.append(message)


def read_sql(path):
    """فایل عیناً خوانده می‌شود؛ فقط نصب اکستنشن حذف می‌شود چون در Postgres ادغام‌شده نیست."""
    body = open(path, encoding='utf-8').read()
    return body.replace('create extension if not exists pgcrypto;', '')


class Database:
    """یک دیتابیس تازه برای هر مسیر؛ statement‌ها مثل SQL Editor، پشت سر هم و autocommit."""

    def __init__(self, conn, notices, plan):
        self.conn = conn
        self.notices = notices
        self.plan = plan

    def run(self, label, script, expect_fail=None):
        del self.notices[:]
        try:
            self.conn.execute(script)
        except Exception as exc:
            message = str(exc).splitlines()[0]
            if expect_fail and expect_fail.lower() in message.lower():
                print(f'  ok   {self.plan}/{label} → refused as designed')
                return True
            print(f'  FAIL {self.plan}/{label}: {message}')
            return False
        for note in self.notices:
            print(f'       notice: {note}')
        if expect_fail:
            print(f'  FAIL {self.plan}/{label}: expected "{expect_fail}" but it succeeded')
            return False
        print(f'  ok   {self.plan}/{label}')
        return True

    def query(self, script):
        with self.conn.cursor() as cur:
            cur.execute(script)
            rows = cur.fetchall()
            cols = [d.name for d in cur.description] if cur.description else []
        return [dict(zip(cols, row)) for row in rows]

    def one(self, script):
        rows = self.query(script)
        return rows[0] if rows else {}

    def as_role(self, role, label, script):
        return self.run(label, f"set role {role}; set request.jwt.claim.role = '{role}'; {script}; reset role;")

    def fetch_as(self, role, script):
        with self.conn.cursor() as cur:
            cur.execute(f"set role {role}; set request.jwt.claim.role = '{role}'")
            try:
                cur.execute(script)
                value = cur.fetchone()[0]
            finally:
                cur.execute('reset role; reset request.jwt.claim.role')
        return value

    def rpc(self, user, script):
        """فراخوانی RPC با نقش کاربر واردشده، همان کاری که storefront می‌کند."""
        with self.conn.cursor() as cur:
            cur.execute("set role authenticated; "
                        f"set request.jwt.claim.sub = '{user}'; set request.jwt.claim.role = 'authenticated'")
            try:
                cur.execute(script)
                value = cur.fetchone()[0]
            finally:
                cur.execute('reset role; reset request.jwt.claim.sub; reset request.jwt.claim.role')
        return value

    def checkout(self, user, variant_id, quantity, key):
        return json.loads(self.rpc(user, f"""select public.create_order_with_payment(
          '[{{"variantId":"{variant_id}","quantity":{quantity}}}]'::jsonb, '{ADDRESS}'::jsonb,
          'normal', null, '{key}')::text"""))

    def stock(self):
        return int(self.one("select stock from public.product_variants where sku = 'ITEST-42'")['stock'])


ADDRESS = json.dumps({'recipient': 'خریدار آزمون', 'phone': '09121234567', 'province': 'تهران',
                      'city': 'تهران', 'address': 'خیابان آزمون کوچهٔ تست پلاک ۱۲', 'postal_code': '1234567890'},
                     ensure_ascii=False)


def stub_sql(user):
    """حداقلِ معادلِ محیط Supabase (نقش‌ها، auth, storage) تا مهاجرت‌ها کلمه‌به‌کلمه اجرا شوند."""
    return f"""
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(), email text unique, instance_id uuid, role text, aud text,
  raw_app_meta_data jsonb default '{{}}', raw_user_meta_data jsonb default '{{}}', is_sso_user boolean default false,
  created_at timestamptz default now(), updated_at timestamptz default now());
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{{}}'::jsonb $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[], avif_autodetection boolean default false,
  shard_count integer default 0, type text, created_at timestamptz default now(), updated_at timestamptz default now(),
  owner text, owner_id text);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id) on delete cascade, name text, owner text, owner_id text,
  created_at timestamptz default now(), updated_at timestamptz default now(), last_accessed_at timestamptz,
  metadata jsonb default '{{}}'::jsonb, user_metadata jsonb default '{{}}'::jsonb, version text default '1',
  path_tokens text[] generated always as (string_to_array(name, '/')) stored);
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;
grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant all on all tables in schema storage to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
insert into auth.users(id, email) values ('{user}', 'itest@example.com') on conflict do nothing;
"""


def seed_sql(user):
    return f"""
insert into public.profiles(id, email, display_name, role, is_active)
  values ('{user}', 'itest@example.com', 'آزمون', 'customer', true) on conflict (id) do nothing;
insert into public.categories(slug, name, is_active) values ('itest-cat', 'دستهٔ آزمون', true) on conflict (slug) do nothing;
insert into public.products(slug, name, sku, price_toman, is_active, description, category_id)
  select 'itest-sneaker', 'کتانی آزمون', 'ITEST-SNEAKER', 250000, true, 'توضیح آزمون', c.id
  from public.categories c where c.slug = 'itest-cat'
    and not exists (select 1 from public.products where slug = 'itest-sneaker');
insert into public.product_variants(product_id, size, color, sku, price_toman, stock)
  select p.id, '42', 'black', 'ITEST-42', 250000, 10 from public.products p
   where p.slug = 'itest-sneaker' and not exists (select 1 from public.product_variants v where v.sku = 'ITEST-42');
insert into public.products(slug, name, sku, price_toman, is_active, description, category_id)
  select 'itest-sock', 'جوراب آزمون', 'ITEST-SOCK-P', 5000, true, 'توضیح آزمون', c.id
  from public.categories c where c.slug = 'itest-cat'
    and not exists (select 1 from public.products where slug = 'itest-sock');
insert into public.product_variants(product_id, size, color, sku, price_toman, stock)
  select p.id, 'F', 'black', 'ITEST-SOCK', 5000, 5 from public.products p
   where p.slug = 'itest-sock' and not exists (select 1 from public.product_variants v where v.sku = 'ITEST-SOCK');
"""


def apply_blupal(database):
    """مسیر قطعه‌ها دقیقاً همان چیزی است که کاربر در SQL Editor اجرا می‌کند."""
    if database.plan == 'chunks':
        # the chunk list must be exactly what the generator declares, in run order
        generator = open(GENERATOR, encoding='utf-8').read()
        declared = re.findall(r"file: '([^']+\.sql)'", generator)
        files = sorted(os.path.join(MANUAL, entry) for entry in os.listdir(MANUAL) if entry.endswith('.sql'))
        expect(len(declared) >= 6 and [os.path.basename(entry) for entry in files] == declared,
               f'the manual files match the generator chunk list ({len(files)} files, {len(declared)} declared)')
        ok = True
        for path in files:
            ok = database.run(os.path.basename(path), read_sql(path)) and ok
        return database.run('01_schema_and_legacy.sql again', read_sql(files[0])) and ok
    return database.run('blupal_provider.sql', read_sql(BLUPAL_SQL)) and \
        database.run('blupal_provider.sql again', read_sql(BLUPAL_SQL))


def verify(database, user, stuck_id, paid_id, stock_before_switch):
    plan = database.plan
    after = database.one(f"""select
      (select status from public.payments where order_id = '{stuck_id}') as stuck_status,
      (select provider from public.payments where order_id = '{stuck_id}') as stuck_provider,
      (select provider_code from public.payments where order_id = '{stuck_id}') as stuck_code,
      (select status::text from public.orders where id = '{stuck_id}') as stuck_order,
      (select status from public.payments where order_id = '{paid_id}') as paid_status,
      (select provider from public.payments where order_id = '{paid_id}') as paid_provider""")
    expect(after['stuck_status'] == 'failed' and after['stuck_code'] == 'GATEWAY_RETIRED',
           f"the abandoned legacy checkout was closed out ({after['stuck_status']}/{after['stuck_code']})")
    expect(after['stuck_provider'] in LEGACY,
           f"the closed-out row keeps the provider it was created under ({after['stuck_provider']})")
    expect(after['stuck_order'] == 'cancelled', f"its order was cancelled ({after['stuck_order']})")
    expect(database.stock() == stock_before_switch + 2,
           f"the two abandoned-checkout units went back to stock ({database.stock()} of {stock_before_switch + 2})")
    expect(after['paid_status'] == 'verified' and after['paid_provider'] in LEGACY,
           f"settled history is untouched ({after['paid_provider']}/{after['paid_status']})")

    check = database.one("select pg_get_constraintdef(oid) as def from pg_constraint "
                         "where conname = 'payments_provider_blupal_check'").get('def', '')
    expect('blupal' in check and all(name in check for name in LEGACY),
           f'the provider check admits blupal and keeps history ({check or "MISSING"})')
    guard = database.one("select count(*) as n from pg_trigger t join pg_class c on c.oid = t.tgrelid "
                         "where c.relname = 'payments' and t.tgname = 'payments_enforce_blupal_provider' "
                         "and not t.tgisinternal")
    expect(int(guard['n']) == 1, 'the guard trigger is installed')
    expect(database.run('a new payment on a retired gateway',
                        f"insert into public.payments(order_id, provider, status, amount_toman) "
                        f"values ('{paid_id}','zarinpal','pending',10)",
                        expect_fail='new payments must use the blupal provider'),
           'a new payment cannot be created on a retired gateway')

    order = database.checkout(user, database.variant_id, 1, f'blupal-live-{plan}-0001')
    order_id = order['orderId']
    payment = database.one(f"select provider, status, amount_toman from public.payments where order_id = '{order_id}'")
    expect(payment['provider'] == 'blupal' and payment['status'] == 'pending',
           f"new orders are blupal/pending ({payment['provider']}/{payment['status']})")
    rial = int(payment['amount_toman']) * 10
    card = '6037701173873414'
    database.as_role('service_role', 'attach_blupal_payment',
                     f"""select public.attach_blupal_payment('{order_id}','123',
                       'https://blupal.top/payment/token','{card}',{rial},{rial + 421},'PENDING')""")
    attached = database.one(f"select authority, provider_code, callback_payload->>'cardNumber' as card, amount_irr "
                            f"from public.payments where order_id = '{order_id}'")
    expect(attached['authority'] == '123', f"the short invoice id is stored ({attached['authority']})")
    expect(attached['card'] == card, f"the destination card is recorded ({attached['card']})")
    expect(int(attached['amount_irr']) == rial, f"the rial amount is derived, not sent ({attached['amount_irr']})")
    expect(attached['provider_code'] == 'PENDING', f"the last gateway status is recorded ({attached['provider_code']})")

    amount_toman = payment['amount_toman']
    before = database.stock()
    database.as_role('service_role', 'settle_blupal_payment',
                     f"""select public.settle_blupal_payment('{order_id}','123','paid',
                       {amount_toman},'tx-9','PAID','{{}}'::jsonb)""")
    settled = database.one(f"""select o.status::text as order_status, p.status as pay_status, p.provider_reference,
      p.verified_at is not null as verified_at
      from public.orders o join public.payments p on p.order_id = o.id where o.id = '{order_id}'""")
    expect(settled['order_status'] == 'paid' and settled['pay_status'] == 'verified',
           f"invoice → paid order works in real SQL ({settled['order_status']}/{settled['pay_status']})")
    expect(settled['provider_reference'] == 'tx-9' and settled['verified_at'],
           f"the transaction id and verification time are recorded ({settled['provider_reference']})")
    database.as_role('service_role', 'settle_blupal_payment twice',
                     f"""select public.settle_blupal_payment('{order_id}','123','paid',
                       {amount_toman},'tx-9','PAID','{{}}'::jsonb)""")
    expect(database.stock() == before, 'a repeated settlement never touches stock again')
    expect(database.one(f"select status::text as st from public.orders where id = '{order_id}'")['st'] == 'paid',
           'a repeated settlement leaves the order paid')

    # کف ۱۰٬۰۰۰ تومان: فروشگاهِ seed شده هزینهٔ ارسال دارد، پس اول ارسال را صفر می‌کنیم
    database.run('zero the shipping so the floor is reachable',
                 "update public.site_settings set value = '{\"normal\":0,\"express\":0,\"freeFrom\":0}'::jsonb "
                 "where key = 'shippingOptions'; update public.site_settings set value = '0'::jsonb where key = 'shipping';")
    refused = None
    try:
        database.checkout(user, database.sock_id, 1, f'blupal-small-{plan}-00001')
    except Exception as exc:  # noqa: BLE001 - the failure is the point
        refused = str(exc).splitlines()[0]
    expect(refused is not None and 'below the payment provider minimum' in refused,
           f'the 10,000-toman floor fires in SQL ({refused})')
    expect(not database.query(f"select 1 from public.orders where idempotency_key = 'blupal-small-{plan}-00001'"),
           'the refused order left no row behind')

    sweep = json.loads(database.fetch_as('service_role', 'select public.expire_stale_blupal_checkouts(60)::text'))
    expect(sweep.get('success') is True, f'the expiry sweep runs ({json.dumps(sweep, ensure_ascii=False)[:90]})')
    health = database.one('select to_jsonb(t) as body from (select * from public.commerce_health()) t')
    expect('payments' in str(health.get('body')), f"commerce_health() still answers ({str(health.get('body'))[:70]})")


def case(uri, plan, user):
    """دیتابیس تازه: مهاجرت‌های قبلی، دادهٔ درگاه قدیمی، سپس مسیر بلوپال."""
    name = f'blupal_{plan}'
    with psycopg.connect(uri, autocommit=True) as admin:
        admin.execute(f'drop database if exists {name}')
        admin.execute(f'create database {name}')
    notices = []
    conn = psycopg.connect(uri, dbname=name, autocommit=True)
    if hasattr(conn, 'add_notice_handler'):
        conn.add_notice_handler(lambda diag: notices.append(diag.message_primary))
    database = Database(conn, notices, plan)
    print(f'── plan {plan}: settled legacy row + abandoned legacy checkout, then the switch ──')
    try:
        if not database.run('supabase stubs', stub_sql(user)):
            raise SystemExit(f'{plan}: could not prepare the Supabase-shaped stubs')
        for filename in BASELINE:
            if not database.run(filename, read_sql(os.path.join(MIGRATIONS, filename))):
                raise SystemExit(f'{plan}: baseline migration {filename} failed')
        if not database.run('seed', seed_sql(user)):
            raise SystemExit(f'{plan}: seed failed')
        database.variant_id = str(database.one("select id from public.product_variants where sku = 'ITEST-42'")['id'])
        database.sock_id = str(database.one("select id from public.product_variants where sku = 'ITEST-SOCK'")['id'])
        paid = database.checkout(user, database.variant_id, 1, f'legacy-paid-{plan}')
        paid_id = paid['orderId']
        database.as_role('service_role', 'the old gateway verified its payment',
                         f"""select public.attach_zarinpal_authority('{paid_id}','aaaaaaaa1111');
                           select public.settle_zarinpal_payment('{paid_id}','aaaaaaaa1111','paid',
                             {paid['totalToman']},'ref-1','100','{{}}'::jsonb)""")
        stuck = database.checkout(user, database.variant_id, 2, f'legacy-stuck-{plan}')
        stuck_id = stuck['orderId']
        stock_before_switch = database.stock()
        if not apply_blupal(database):
            PROBLEMS.append(f'{plan}: the BluPal SQL did not apply cleanly')
            return
        verify(database, user, stuck_id, paid_id, stock_before_switch)
    finally:
        conn.close()
        with psycopg.connect(uri, autocommit=True) as admin:
            admin.execute(f'drop database if exists {name}')


def main():
    data_dir = tempfile.mkdtemp(prefix='touba-blupal-itest-')
    server = pgserver.get_server(data_dir, cleanup_mode='delete')
    uri = server.get_uri()
    user = str(uuid.uuid4())
    with psycopg.connect(uri, autocommit=True) as admin:
        admin.execute("""do $$ begin
          if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
          if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
          if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
        end $$;""")
    for plan in PLANS:
        case(uri, plan, user)
    print('\n' + ('ALL ASSERTIONS PASSED' if not PROBLEMS else 'PROBLEMS:\n  ' + '\n  '.join(PROBLEMS)))
    return 1 if PROBLEMS else 0


if __name__ == '__main__':
    sys.exit(main())
