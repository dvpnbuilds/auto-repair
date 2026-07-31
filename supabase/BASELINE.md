# Supabase migration baseline

The production project originally received V2 SQL through the Dashboard, so
those changes existed in PostgreSQL without Supabase migration history.

Status: completed on 2026-07-31 for project `lhpyghawypoqogerkysa`. A read-only
schema dump matched the checks below before versions `20260730080000` through
`20260730140000` were recorded as applied. A subsequent dry run listed only
`20260731120000` through `20260731170000` as pending. Do not repeat the repair
steps unless restoring a fresh production database from the same historical
state.

On 2026-07-31, the production project was inspected before any filename change:

```sql
select version, name
from supabase_migrations.schema_migrations
order by version;
```

PostgreSQL returned `42P01`: the migration-history table did not exist. The
pre-V2 schema and six historical upgrades can therefore be baselined under
their new unique versions. Do not execute their SQL again on that production
database.

## One-time production baseline

1. Back up the database and schedule a maintenance window.
2. Install and authenticate the Supabase CLI, then link the intended project:

   ```sh
   supabase login
   supabase link --project-ref <project-ref>
   supabase migration list
   ```

3. Set `SUPABASE_DB_URL` to a direct PostgreSQL connection for that same
   project and prove the expected historical objects exist:

   ```sh
   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/baseline-check.sql
   ```

   Stop if this does not print `BASELINE_OK`.

4. Mark only the seven verified historical versions as applied:

   ```sh
   supabase migration repair --status applied 20260730080000
   supabase migration repair --status applied 20260730090000
   supabase migration repair --status applied 20260730100000
   supabase migration repair --status applied 20260730110000
   supabase migration repair --status applied 20260730120000
   supabase migration repair --status applied 20260730130000
   supabase migration repair --status applied 20260730140000
   supabase migration list
   ```

   `migration repair` changes only the migration ledger; it does not execute
   migration SQL.

5. Apply the new booking/reminder safety migration through the normal runner:

   ```sh
   supabase db push
   supabase migration list
   ```

   The only newly executed version should be `20260731120000`.

Never run `supabase db reset --linked` against production. Clean resets are for
the local disposable database and CI only.
