# AutoShop Assistant

Demo web app for PH auto repair shops: AI Taglish issue intake + peso estimate, booking, repair status tracking, and an admin job board where AI drafts every customer message. One shareable link, seeded with believable PH data.

## Stack
- Next.js 14+ (App Router, TypeScript) — one repo, deploys to Vercel
- Supabase (Postgres) — persistent data via `@supabase/supabase-js`
- OpenRouter — LLM calls, server-side only, model in `OPENROUTER_MODEL` env (default `google/gemini-2.5-flash-lite`)
- Tailwind CSS for UI

## Commands
- `dev`: `npm run dev`
- `test`: `npm test`
- `build`: `npm run build`
- `seed`: `npm run seed` (restores RapidFix demo data — the demo reset button calls this path too)

## Conventions
- App Router with route handlers under `app/api/*` for all LLM and DB writes. Never call OpenRouter or use the service-role key from a client component.
- Two DB clients: anon (browser reads) and service-role (server writes only). Keep the service key server-side.
- All LLM triage/message outputs are structured JSON, parsed and validated before use — never render raw model text into estimates.
- Currency is PHP; format as the peso sign followed by the amount, e.g. 1,234.

## Workflow
- Read PLAN.md for scope and phases; PROGRESS.md for current state; RULES.md before writing code.
- Work strictly one phase at a time. After finishing a phase, run the audit-phase skill and do not proceed until it is audited-pass.

## Key context
- No user auth. Admin lives at `/admin` behind a single passcode (`ADMIN_PASSCODE` env), checked server-side.
- Customer status tracker is a public lookup by plate number + phone — no login.
- Estimates must always be labeled "initial estimate, subject to inspection." Triage is grounded in the shop's `services` price list, not the model's guess.
- Reminder + review-request messages are AI-drafted previews shown in admin only — nothing is actually sent in the demo.
