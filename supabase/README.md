# Supabase foundation (not yet connected to the storefront)

`migrations/202609280001_initial_schema.sql` is a first-pass schema/RLS migration for the owner-confirmed empty Supabase project. It creates the product/catalog, profiles, addresses, cart, order/payment, coupon, review, CMS and media tables; adds RLS; and creates a public product-image bucket with admin-only upload policies. It intentionally inserts no sample records and creates no admin user.

## Apply only after review

1. Keep a backup even though the project was reported empty.
2. Review the SQL. It has **not** been run against the remote Supabase project from this workspace.
3. Apply once via Supabase SQL Editor, or link the CLI to the correct project and run the migration through your normal deployment workflow.
4. In Supabase Auth, enable email/password, require email confirmation, configure a verified custom SMTP sender, and set the correct production Site URL and redirect allow-list.
5. Create the owner account through Auth, confirm its email, then promote only that account to `super_admin` in the SQL Editor, for example:

```sql
update public.profiles p
set role = 'super_admin'
from auth.users u
where p.id = u.id
  and lower(u.email) = lower('OWNER_EMAIL_HERE');
```

Do not expose `service_role` in browser code, `.env.example`, Git or chat. Add credentials to Vercel Environment Variables only after the matching server-side Supabase integration is implemented. The current frontend still uses the mock LocalStorage provider; this migration alone does not make catalog or orders persistent. Checkout and the payment provider remain mock until the gateway is identified and integrated with server-side verification.
