# AutoShop Assistant

Shop-configurable demo for auto repair shops: AI issue intake and grounded estimates, booking, repair status tracking, and an admin job board where AI drafts every customer message.

## Stack
Next.js (App Router) + Supabase (Postgres) + OpenRouter, deployed on Vercel.

## Local setup
1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the values (see below).
3. Install the Supabase CLI and run `supabase start`. The CLI applies the uniquely versioned files in `supabase/migrations/`; do not apply them manually through the production SQL editor.
4. Add `auto_repair` to Supabase **Project Settings → Data API → Exposed schemas**. If the project already has a manual `pgrst.db_schemas` role override, append `auto_repair` without removing its existing schemas and reload the PostgREST config.
5. `npm run seed` — restores both regional service catalogs and all ten demo jobs, with the US shop active by default. Pass `ph` or `us` to choose a different active shop.
6. `npm run dev` — http://localhost:3000

## Database migrations

Migration filenames use unique 14-digit versions and are applied in timestamp order by the Supabase CLI. `npm run verify:migrations` rejects duplicate or malformed versions. `npm run verify:migrations:clean` destroys only the local disposable database and reapplies every migration from scratch. The same clean reset runs in `.github/workflows/migration-check.yml`.

The production project predates migration tracking: its historical SQL was applied manually and its migration-history table was confirmed absent on 2026-07-31. Follow [supabase/BASELINE.md](supabase/BASELINE.md) for the one-time verified `migration repair` baseline and the subsequent normal `db push`. Do not rerun the historical migration set against that live database.

## Environment variables
| Var | Where used | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client (read-only) | Public anon key, RLS-restricted |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Never exposed to the client; used by API routes and the seed script |
| `OPENROUTER_API_KEY` | server only | OpenRouter key for triage + message drafting |
| `OPENROUTER_MODEL` | server only | Model id, e.g. `google/gemini-2.5-flash-lite`. Never hardcode a model elsewhere. |
| `ADMIN_PASSCODE` | server only | Gates `/admin`; checked server-side, never sent to the client |
| `ADMIN_SESSION_SECRET` | server only | At least 32 random characters; signs admin sessions and tracker rate-limit keys. Rotate it to invalidate every admin cookie. |
| `APP_BASE_URL` | server only | Public HTTPS app origin used by n8n status callbacks; no trailing slash |
| `EMAIL_TRANSPORT` | server only | `n8n` for the primary workflow or `resend` for direct fallback |
| `EMAIL_DEMO_RECIPIENT` | server only | Optional safe inbox override; required when sending seeded `.example` addresses |
| `EMAIL_DEMO_SEND_CAP` | server only | Maximum pending/sent deliveries per shop in a rolling 24-hour window; defaults to `10` |
| `N8N_WEBHOOK_URL` | server only | Production URL of the imported authenticated email workflow |
| `N8N_WEBHOOK_SECRET` | server only | Shared secret used in both directions between the app and n8n |
| `RESEND_API_KEY` | server only | Resend API key for the direct fallback and n8n Resend credential |

## Demo reset
- CLI: `npm run seed` (idempotent — restores both shop records, 20 services, and 10 jobs with the US shop active). Use `npm run seed -- ph` to reset with the Philippines shop active instead.
- In-app: the admin market switcher changes the active shop without reseeding. "Reset demo data" calls the passcode-gated reset route, restores both regional demos, and returns to the US default.

## Locales

The app ships English at `/en`; visiting `/` redirects there. To add a locale,
add only its valid `messages/<locale>.json` bundle. The pre-development and
pre-build locale generator discovers bundles and refreshes routing
automatically; application and routing source files require no manual edit.

## Email automation

Import both JSON files from `n8n/workflows/` and follow `n8n/README.md`. The delivery workflow accepts only the shared-secret header, renders one of the four supported templates, sends through its Resend node, and calls the app back with the final status. The reminder workflow supports both its hourly schedule and an on-demand manual trigger.

All application features call `sendEmail()`. Set `EMAIL_TRANSPORT=n8n` for normal operation or change only that variable to `resend` for the direct fallback. Delivery attempts are private, idempotent, recorded in `auto_repair.autoshop_email_deliveries`, and limited by the demo send cap. Ambiguous provider results remain `reconciling`; the authenticated hourly reminder run safely retries them with the same provider idempotency key for up to 23 hours.

Before a real send, replace each seeded `.example` `email_sender_address` in `auto_repair.autoshop_shops` with an address on the domain verified in Resend. Seeded customer `.example` addresses are never sent unless `EMAIL_DEMO_RECIPIENT` points to a safe real inbox.

## Deploy (Vercel)
1. `vercel login` (one-time).
2. From the project root: `vercel link` to connect this repo to a Vercel project.
3. Set the environment variables above in the Vercel project settings (Production + Preview).
4. `vercel --prod` to deploy, or push to the connected Git branch.
5. After deploy, run `npm run seed` locally (pointed at the same Supabase project) to ensure demo data is fresh before a pitch.

Current production URL: https://auto-repair-ten.vercel.app

The public tracker accepts plate number plus phone through a rate-limited server endpoint. Booking, triage, and administrator login also enforce endpoint-specific database quotas and bounded request bodies. Anonymous Supabase users can read shop/service catalogs only; customer jobs, histories, messages, email deliveries, and rate-limit attempts are private.

## Testing
`npm test` runs `tests/*.test.ts` against the live Supabase + OpenRouter config in `.env.local`. `npm run verify:migrations:clean` uses the local Supabase stack to prove every migration applies to an empty database. Email fault tests cover lost responses, ambiguous `reconciling` outcomes, callback replay, and late callbacks while reusing one delivery identity. Real-provider and n8n activation checks remain a separate live-QA step.

See `RELEASE-v2.md` for the immutable V2 lineage and rollback rules.
