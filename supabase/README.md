# Supabase setup, Auth, and migrations

The project owner confirmed that the initial schema migration ran successfully via GitHub Actions. The storefront's full data provider is **not** connected yet: Auth can be enabled independently, while catalog/CMS/cart/orders/stock still use the Demo LocalStorage provider. Checkout now uses the server-side ZarinPal API v4 integration in Sandbox only; production payment requests are explicitly rejected until order, price and inventory are backed by a persistent server-side source of truth.

## Supabase Auth: email and password

### 1. Configure Vercel's public Supabase settings

In Vercel → project → **Settings → Environment Variables**, add these to **Production** (and Preview only if you intentionally test there):

- `SUPABASE_URL` — Project URL from Supabase → Project Settings → API.
- `SUPABASE_PUBLISHABLE_KEY` — the public/publishable key from the same page. If the project only exposes the legacy anon key, use `SUPABASE_ANON_KEY` instead.

These are the only Supabase values used by the browser Auth client. `/api/supabase-config` returns only this URL and public key. **Never add `SUPABASE_SERVICE_ROLE_KEY`, the database password, or the GitHub PAT to Vercel for this Auth flow, browser code, or this repository.** Save the variables and redeploy Vercel. The Auth SDK uses PKCE and Supabase's own session handling.

### 2. Set Supabase Auth email/redirect options

In Supabase → **Authentication → Providers → Email**:

- Ensure Email provider is enabled.
- Keep email confirmation enabled for Production.
- Set a production-grade password policy in the Auth settings (the UI requires at least 12 characters).

In **Authentication → URL Configuration**:

- Set **Site URL** to `https://toubashoes.vercel.app` until a custom production domain is configured.
- Add the allowed redirect URLs `https://toubashoes.vercel.app/login?verified=1` and `https://toubashoes.vercel.app/reset-password`. Add the equivalent URLs for the chosen final domain before changing Site URL.

Configure a verified sender and a custom SMTP provider for reliable production delivery of signup confirmations and password-reset emails. Test delivery to more than one mailbox, including Spam. Supabase's default mail sender is not a production email-delivery plan.

### 3. Test signup and recovery

1. Open `/login?mode=signup` on the deployed site.
2. Register using an email address you control, a display name, and a password of at least 12 characters.
3. Open the confirmation link from email; it should return to `/login?verified=1`.
4. Sign in at `/login`, then confirm that `/account` shows the authenticated email/profile.
5. Test **Forgot password** and the `/reset-password` flow before public launch.
6. Confirm sign-out returns the visitor to the unauthenticated state.

The database trigger creates a `profiles` row with the default `customer` role. Registration never accepts a role from the browser. The profile's role is read from the RLS-protected table; inactive accounts are denied a working app session. A client-side role check is not the security boundary—the table/function RLS policies are.

### Create the first administrator

After registering and confirming the intended owner account, inspect the email in Supabase Auth → Users and then run this SQL as a trusted project owner in SQL Editor, replacing the placeholder with that exact email:

```sql
update public.profiles p
set role = 'super_admin'
from auth.users u
where p.id = u.id
  and lower(u.email) = lower('OWNER_EMAIL_HERE');
```

Inspect the affected row count and `profiles.role` afterwards. Do not expose a promotion endpoint or allow the frontend to write `profiles.role`. A read-only admin dashboard/list view for products, orders, and profiles is available to active admins and remains subject to RLS. CMS/Admin CRUD is **not** connected to the production database; writes and checkout stay disabled in Supabase Auth mode.

## Automatic database migrations

`.github/workflows/supabase-db-push.yml` applies migration files on pushes to `main` that change `supabase/migrations/**`. It serializes pushes, runs a dry-run first, then applies pending migrations. Manual runs require `confirm=true`.

For every schema change, add a new timestamped `.sql` migration; never edit a migration already applied remotely. Direct edits in the SQL Editor are not synchronized to Git and can create migration-history drift.

The initial migration `202609280001_initial_schema.sql` is reported by the owner as successfully applied. Follow-up migration `202609280002_active_profile_rls.sql` hardens owner RLS against deactivated accounts. Migration `202610020001_zarinpal_payment_provider.sql` removes the legacy mock provider default and adds a fail-closed check that accepts only `zarinpal`. Once these files are pushed to `main`, Actions applies them in order. Verify the workflow run is green before depending on the new policies or provider constraint.

Required repository Actions **Secrets** (not Actions Variables):

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_DB_PASSWORD`

Keep all three in GitHub Actions Secrets only. These are distinct from the public Vercel Auth settings above.

## ZarinPal Sandbox configuration

Set these only in Vercel → Settings → Environment Variables (or in an untracked local `.env` file):

- `ZARINPAL_MODE=sandbox`
- `ZARINPAL_MERCHANT_ID` — valid 36-character merchant identifier from the provider/sandbox.
- `ZARINPAL_STATE_SECRET` — random secret of at least 32 bytes (for example, generate locally with `openssl rand -hex 32`).

The Admin → Payments panel is status/read-only; secrets are never entered or stored there. The callback URL is `/api/payment/zarinpal/callback`. Production gateway endpoints are present, but the request endpoint returns 503 for production mode until the server owns persistent orders and inventory. Do not switch to production or accept real money based only on a configured merchant ID.

## Remaining production blockers

- `services/data-provider.js` and all store repositories still use local Demo data; products, carts, addresses, CMS, customer lists, orders and stock do not yet persist through Supabase.
- The frontend cannot create a secure order by inserting rows directly. Before enabling checkout, implement a server-controlled/RPC transaction that verifies current product prices/coupons, reserves stock atomically, writes order/items/payment intent idempotently, and prevents clients from choosing totals or payment state. Add tests for concurrent stock checkout and retries.
- ZarinPal API v4 is implemented server-side (`request`, `callback` verification, signed receipt) and Sandbox is available for testing. Production requests are hard-disabled in `lib/zarinpal.js` while order totals and inventory remain browser-local. Before enabling real payments, move order creation, authoritative price/coupon calculation and atomic inventory changes into a persistent server-side transaction; then run the complete official Sandbox E2E flow.
- Configure and verify SMTP, custom-domain redirect allow-list, account recovery, privacy/terms, and a backup/restore runbook.
- The image-generation API still lacks real admin authentication and durable global rate limiting. It is not production-safe merely because email Auth now works; admin AI access remains a separate server-side authorization task.

Do not describe the shop as ready to accept real orders or payments until the remaining blockers are implemented and end-to-end tested.
