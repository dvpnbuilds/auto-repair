# AutoShop Assistant

Shop-configurable auto repair demo: English AI issue intake with grounded estimates, booking, repair status tracking, and an admin job board where AI drafts every customer message.

## Stack
- Next.js 14+ (App Router, TypeScript) — one repo, deploys to Vercel
- Supabase (Postgres) — persistent data via `@supabase/supabase-js`
- OpenRouter — LLM calls, server-side only, model in `OPENROUTER_MODEL` env (default `google/gemini-2.5-flash-lite`)
- next-intl — i18n routing and message bundles (`messages/en.json`); `en` is the only shipped locale
- n8n (self-hosted) — email delivery and maintenance reminder scheduling, called over an authenticated webhook
- Resend — fallback email transport, selected via `EMAIL_TRANSPORT`
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

## Workflow
- Read PLAN.md for scope and phases; PROGRESS.md for current state; RULES.md before writing code.
- Work strictly one phase at a time. For v2 phases 6-9, build each phase in order and run the independent audit once all of v2 is finished, per the user's 2026-07-30 override.

## Key context
- No user auth. Admin lives at `/admin` behind a single passcode (`ADMIN_PASSCODE` env), checked server-side.
- Customer status tracker is a public lookup by plate number + phone — no login.
- The `shops` table is the config backbone: name, country, locale, currency, timezone, language, email sender name/address, address, and price list. Everything else reads from the active shop.
- Two seeded shops: a US shop in USD (default — F-150, Camry, Silverado) and a PH shop in PHP (RapidFix Auto Care, Quezon City). An admin switcher picks which one the demo runs as.
- Estimates must always be labeled "initial estimate, subject to inspection." Triage is grounded in the active shop's `services` price list, not the model's guess.
- English only. Language is a `shops` field passed into triage and message-drafting prompts, so adding a language later is config plus a bundle, not a rebuild.
- Email is really sent, not previewed. `EMAIL_TRANSPORT=n8n|resend` selects the transport; n8n is primary and also runs the maintenance reminder schedule trigger.
- The n8n webhook requires a shared-secret header. An unauthenticated webhook that sends email is an open relay.
- A demo send cap prevents a live pitch from spamming. n8n workflow JSON lives in `n8n/workflows/` so it is version-controlled and reproducible for client handoff.
