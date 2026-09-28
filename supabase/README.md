# Supabase foundation and migration deployment

`migrations/202609280001_initial_schema.sql` is the first-pass schema/RLS migration for the project, which was reported as newly created and empty. It has not been executed or validated against the remote database from this workspace. The storefront still uses its mock LocalStorage provider; this schema and workflow do not connect the app to Supabase.

## Automatic migrations via GitHub Actions

The workflow at `.github/workflows/supabase-db-push.yml` is designed to:

- run on a push to `main` that changes `supabase/migrations/**`;
- serialize deployments so concurrent runs cannot push schema changes at the same time;
- preview pending migrations with `supabase db push --dry-run`, then apply them;
- allow manual dispatch only after the operator explicitly checks the `confirm` input.

Changes apply after they are committed and pushed to `main`, not while editing files locally. Create schema changes as new, timestamped SQL files under `supabase/migrations/`. Never edit an already-applied migration; add a later migration to alter or remove objects. Direct SQL changes in the Dashboard are not captured by Git and can cause migration-history drift.

Before the first run, add these repository secrets at **GitHub → Settings → Secrets and variables → Actions**:

- `SUPABASE_ACCESS_TOKEN` — a Supabase personal access token with access to the project;
- `SUPABASE_PROJECT_REF` — the project ref (not its display name or URL);
- `SUPABASE_DB_PASSWORD` — the database password.

Keep these credentials only in GitHub Actions Secrets. Do not put them in chat, committed files, browser code, or Vercel environment variables for this migration workflow. The workflow file and `supabase/config.toml` contain no credentials. After adding secrets, open **Actions → Apply Supabase database migrations → Run workflow**, select the `main` branch, and set `confirm` to `true` for the initial run. Future migration commits to `main` are applied automatically.

### Important: verify the initial database state before first run

The initial migration may already have been applied manually. Do not run it blindly against a database where its tables or policies already exist. First inspect the remote schema and `supabase_migrations.schema_migrations` history in the Supabase Dashboard. If the exact objects from `202609280001_initial_schema.sql` already exist but the migration is absent from history, have a database administrator compare the remote schema with the file in full, back up the database, and only then mark the migration as applied (for example, via `supabase migration repair --status applied 202609280001`). Do not use migration repair to conceal differences. If the schema is empty and history is empty, the confirmed initial workflow run can apply the migration normally. If either state is uncertain, pause and reconcile it before dispatching.

The workflow's dry-run lists pending migrations but is not a human review or backup. Review every SQL change, especially destructive statements, before pushing it to `main`.

## Remaining production setup

1. Review and validate the migration against the actual project before first application. Keep a backup.
2. In Supabase Auth, enable email/password, require email confirmation, configure a verified custom SMTP sender, and set the production Site URL and redirect allow-list.
3. Create the owner account through Auth, confirm its email, then promote only that account to `super_admin` in a controlled database session, e.g.:

```sql
update public.profiles p
set role = 'super_admin'
from auth.users u
where p.id = u.id
  and lower(u.email) = lower('OWNER_EMAIL_HERE');
```

Never expose `service_role` in browser code, `.env.example`, Git, or chat. The schema migration and CI workflow do not implement the actual storefront integration, server-side auth/RBAC, transactional stock/order operations, object storage integration, SMTP setup, or verified payment processing. Checkout and payment remain mock until the gateway is identified and integrated with server-side verification.
