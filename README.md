# AutoShop Assistant

Shop-configurable demo for auto repair shops: AI issue intake and grounded
estimates, booking, repair status tracking, technician assignment, and
customer approval for additional work.

## Stack
Next.js (App Router) + Supabase (Postgres) + OpenRouter, deployed on Vercel.

## Local setup
1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the values (see below).
3. Install the Supabase CLI and run `supabase start`. The CLI applies the uniquely versioned files in `supabase/migrations/`; do not apply them manually through the production SQL editor.
4. Add `auto_repair` to Supabase **Project Settings → Data API → Exposed schemas**. If the project already has a manual `pgrst.db_schemas` role override, append `auto_repair` without removing its existing schemas and reload the PostgREST config.
5. `npm run seed` — restores both regional service catalogs, eight technicians, and all ten demo jobs, with the US shop active by default. Existing valid assignments for seeded plates are preserved. Pass `ph` or `us` to choose a different active shop.
6. `npm run dev` — http://localhost:3000

## Database migrations

Migration filenames use unique 14-digit versions and are applied in timestamp order by the Supabase CLI. `npm run verify:migrations` rejects duplicate or malformed versions. `npm run verify:migrations:clean` destroys only the local disposable database and reapplies every migration from scratch. The same clean reset runs in `.github/workflows/migration-check.yml`.

The production project predates migration tracking: its historical SQL was applied manually and its migration-history table was confirmed absent on 2026-07-31. The one-time verified `migration repair` baseline described in [supabase/BASELINE.md](supabase/BASELINE.md) has now been completed; future releases use a normal reviewed `db push`. Do not rerun the historical migration set against that live database.

## Environment variables
| Var | Where used | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client (read-only) | Public anon key, RLS-restricted |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Never exposed to the client; used by API routes and the seed script |
| `OPENROUTER_API_KEY` | server only | OpenRouter key for triage + message drafting |
| `OPENROUTER_MODEL` | server only | Model id, e.g. `google/gemini-2.5-flash-lite`. Never hardcode a model elsewhere. |
| `OPENROUTER_VISION_MODEL` | server only | Vision-capable model for photo triage; kept separate from the text model. If unset or unavailable, photo intake falls back to text-only triage. |
| `ADMIN_PASSCODE` | server only | Gates `/admin`; checked server-side, never sent to the client |
| `ADMIN_SESSION_SECRET` | server only | At least 32 random characters; signs admin sessions and tracker rate-limit keys. Rotate it to invalidate every admin cookie. |
| `APPROVAL_TOKEN_SECRET` | server only | At least 32 random characters; signs one-time approval links and must be distinct from the admin session secret. |
| `INTAKE_PHOTO_BUCKET` | server only | Private intake-photo bucket; defaults to the project-specific `auto-repair-intake-photos`. |
| `APP_BASE_URL` | server only | Public HTTPS app origin used by n8n status callbacks; no trailing slash |
| `EMAIL_TRANSPORT` | server only | `n8n` for the primary workflow or `resend` for direct fallback |
| `EMAIL_DEMO_RECIPIENT` | server only | Optional safe inbox override; required when sending seeded `.example` addresses |
| `EMAIL_DEMO_SEND_CAP` | server only | Maximum pending/sent deliveries per shop in a rolling 24-hour window; defaults to `10` |
| `N8N_WEBHOOK_URL` | server only | Production URL of the imported authenticated email workflow |
| `N8N_WEBHOOK_SECRET` | server only | Shared secret used in both directions between the app and n8n |
| `RESEND_API_KEY` | server only | Resend API key for the direct fallback and n8n Resend credential |

## Demo reset
- CLI: `npm run seed` (idempotent — restores both shop records, eight technicians, 20 services, and 10 jobs with the US shop active while preserving valid assignments for seeded plates). Use `npm run seed -- ph` to reset with the Philippines shop active instead.
- In-app: the admin market switcher changes the active shop without reseeding. "Reset demo data" calls the passcode-gated reset route, restores both regional teams and demos, preserves valid technician assignments, and returns to the US default.

## Shop-branded landing page

The public `/en` landing page is shared by every configured shop. It reads the
active shop's name, tagline, address, phone, hours, locale, and currency from
`auto_repair.autoshop_shops`, then previews three services and their current
starting ranges directly from that shop's service catalog. Switching the active
shop changes the complete landing experience without a code or deployment
change. Calls to action preserve the locale and lead to intake, service-specific
booking, the full service list, and repair tracking.

## Technician assignment

Each shop has its own four-person technician list. The passcode-gated admin board can assign, reassign, or clear a technician directly on a job card and filter the board to one technician or unassigned work. Assignment writes are transactional and reject technicians from another shop.

## Extra-work approvals

For a repair in progress or waiting for parts, staff can select an item from
the active shop's price list, enter an amount inside that service's range, and
describe the technician's finding. The server drafts a plain-language
explanation, then saves the request, message, and email delivery as one
transaction. The customer receives a signed private link that expires after
72 hours and accepts exactly one approve or decline decision. Decisions are
rate limited and recorded in the job history.

The approved Phase 11 prerequisite was explicitly deferred for this code build.
Until a verified sender, provider credentials, and a real recipient are
configured, the admin route fails safely before creating a request. A real
inbox send and click-through remain required before Phase 11 can be called
complete.

## Photo intake

Customers can add up to three JPEG, PNG, or WebP photos while describing a
vehicle problem. Each file is limited to 4 MB. The server checks both the
declared MIME type and the file signature before writing to the private
`auto-repair-intake-photos` bucket. Upload and delete actions use short-lived,
signed capabilities and database-backed rate limits.

Photo triage uses only `OPENROUTER_VISION_MODEL`; the existing text model path
is unchanged. Visual findings are validated and estimates are still grounded
in the active shop's service catalog. If the vision request fails, the app
returns the normal text-only result and does not show invented visual
findings.

Unbooked photos expire after 24 hours and are purged opportunistically when a
new photo session starts. Booked photos remain private for the life of their
job and are exposed to the admin board only through five-minute signed URLs.
Both CLI and in-app demo reset remove Storage objects before their metadata.

## Owner dashboard

The passcode-gated `/admin/dashboard` view summarizes the active shop over the
last 7, 30, or 90 shop-local calendar days. Booking counts and status mix use
jobs created in that period. Booked value and average ticket are estimate
ranges from the original service estimate, never invoice or revenue figures.
Intake conversion counts completed intake sessions started in the period that
later became a booking. Approval acceptance uses approved and declined
decisions made in the period, while reminders use confirmed send time.
Technician workload is deliberately current rather than period-bound so the
owner sees the work on the floor now. Switching shops also switches the
currency, locale, timezone, team, and underlying metrics.

## Locales

The app ships English at `/en`; visiting `/` redirects there. To add a locale,
add only its valid `messages/<locale>.json` bundle. The pre-development and
pre-build locale generator discovers bundles and refreshes routing
automatically; application and routing source files require no manual edit.

## Email automation

Import both JSON files from `n8n/workflows/` and follow `n8n/README.md`. The delivery workflow accepts only the shared-secret header, renders one of the five supported templates, sends through its Resend node, and calls the app back with the final status. The reminder workflow supports both its hourly schedule and an on-demand manual trigger.

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
