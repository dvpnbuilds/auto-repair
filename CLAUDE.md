# AutoShop Assistant

Shop-configurable auto repair demo: English AI issue intake with photo vision and grounded estimates, booking, repair status tracking, technician assignment, customer-approved extra work, an owner metrics dashboard, and an admin job board where AI drafts every customer message.

## Stack
- Next.js 14+ (App Router, TypeScript) — one repo, deploys to Vercel
- Supabase (Postgres) — persistent data via `@supabase/supabase-js`
- OpenRouter — LLM calls, server-side only, model in `OPENROUTER_MODEL` env (default `google/gemini-2.5-flash-lite`)
- next-intl — i18n routing and message bundles discovered from `messages/*.json`; `en` is the only shipped locale
- n8n (self-hosted) — email delivery and maintenance reminder scheduling, called over an authenticated webhook
- Resend — fallback email transport, selected via `EMAIL_TRANSPORT`
- Supabase Storage — private bucket for intake photos, signed-URL access only
- Vision triage runs on a separate model in `OPENROUTER_VISION_MODEL`, leaving the text model in `OPENROUTER_MODEL` untouched
- Tailwind CSS for UI

## Commands
- `dev`: `npm run dev`
- `test`: `npm test`
- `build`: `npm run build`
- `seed`: `npm run seed` — accepts a shop key (`us` | `ph`); with no argument it reseeds both and activates the US shop

## Conventions
- App Router with route handlers under `app/api/*` for all LLM, email, and DB writes. Never call OpenRouter, n8n, or use the service-role key from a client component.
- Two DB clients: anon (browser reads) and service-role (server writes only). Keep the service key server-side.
- All app tables live in the dedicated `auto_repair` PostgreSQL schema. Never place this app's tables in `public`.
- All LLM triage/message outputs are structured JSON, parsed and validated before use — never render raw model text into estimates.
- No hardcoded currency, timezone, locale, or date format anywhere. All of it reads from the active `shops` record.
- No user-facing literal strings in components. Everything goes through the i18n bundle.
- Currency, dates, and numbers format via `Intl` using the active shop's locale and currency.
- All email goes through the single `sendEmail()` abstraction, never a direct provider call.
- Public, unauthenticated, state-changing routes must verify a signed, scoped, expiring capability server-side and be rate limited. Approval decisions are single-use; photo capabilities are bound to one intake and one upload or delete action. Never trust a raw client token.
- Uploaded media is private by default. Access only through signed URLs, with size and MIME caps enforced server-side before storage.
- Monetary figures derived from estimate ranges are labeled as estimated wherever displayed. Only invoice-backed numbers may be presented as revenue.
- Dashboard visualizations use CSS/SVG bars. No charting dependency.

## Workflow
- Read PLAN.md for scope and phases; PROGRESS.md for current state; RULES.md before writing code.
- Work strictly one phase at a time. For v2 phases 6-9, build each phase in order and run the independent audit once all of v2 is finished, per the user's 2026-07-30 override.

## Key context
- No user auth. Admin lives at `/admin` behind a single passcode (`ADMIN_PASSCODE` env), checked server-side.
- Customer status tracker is a rate-limited server lookup by plate number + phone. Anonymous clients cannot read jobs, histories, or messages directly.
- The `shops` table is the config backbone: name, country, locale, currency, timezone, language, email sender name/address, address, and price list. Everything else reads from the active shop.
- Two seeded shops: a US shop in USD (default — F-150, Camry, Silverado) and a PH shop in PHP (RapidFix Auto Care, Quezon City). An admin switcher picks which one the demo runs as.
- Estimates must always be labeled "initial estimate, subject to inspection." Triage is grounded in the active shop's `services` price list, not the model's guess.
- English only. Language is a `shops` field passed into triage and message-drafting prompts. Adding a complete `messages/<locale>.json` bundle is enough for the build-time locale generator to add routing; no application source edit is required.
- Email is really sent, not previewed. `EMAIL_TRANSPORT=n8n|resend` selects the transport; n8n is primary and also runs the maintenance reminder schedule trigger.
- The n8n webhook requires a shared-secret header. An unauthenticated webhook that sends email is an open relay.
- A demo send cap prevents a live pitch from spamming. n8n workflow JSON lives in `n8n/workflows/` so it is version-controlled and reproducible for client handoff.
- `autoshop_technicians` scopes technicians per shop; jobs carry a nullable assignee used by the board filter and the dashboard workload metric.
- `autoshop_approval_requests` drives the extra-work flow: AI drafts the customer explanation grounded in the active shop's price list, delivery goes through `sendEmail()`, and the customer decides from `/approve/[token]` with no login.
- Intake photos live in the private `auto-repair-intake-photos` Supabase Storage bucket, capped at 3 files and 4 MB each. Unbooked files expire after 24 hours; booked files follow the job lifetime and are shown to admins only through five-minute signed URLs. If the vision model fails or cannot read an image, triage degrades to text-only rather than inventing findings.
- The landing page at `/[locale]/` renders entirely from the active `shops` record. Adding a shop must never require a code change.
- Email is built but not yet activated. Phase 11's code was built under an explicit prerequisite override, but the phase cannot be called complete until a real-inbox approval email is delivered and exercised. Phases 10, 12, 13, and 14 do not depend on activation.
