# Progress

Current phase: 2

## Phase 1: Scaffold + data layer — audited-pass
Notes: Next.js+Tailwind scaffold, Supabase schema (autoshop_services, autoshop_jobs, autoshop_status_history, autoshop_messages — prefixed, see decision log), idempotent seed script w/ RapidFix data (10 services, 5 jobs), nav + /services + /jobs list pages. Build, seed, and live render all verified. Added tests/seed.test.ts (node:test) asserting seeded services/jobs are queryable; wired to `npm test`.
Audit: 2026-07-14 — re-audit: audited-pass. tests/seed.test.ts wired via npm test, npm test passes 2/2 against live Supabase; npm run seed and npm run build re-verified clean. All Phase 1 "Done when" criteria and RULES.md rule 5 satisfied.

## Phase 2: Customer intake + estimate — audited-pass
Notes: Chat UI at /intake (Taglish), app/api/triage route calling OpenRouter (OPENROUTER_MODEL). Model only picks probable_issue/urgency/service_name; server grounds estimate_min/max by matching service_name against live autoshop_services rows (rule 9 — no invented numbers), returns needs_inspection if no match. Every result carries "Initial estimate, subject to inspection." disclaimer. callWithRetry() wraps the OpenRouter fetch. "Get my estimate now" forces a final answer for deterministic testing. tests/triage.test.ts runs all 5 sample Taglish complaints from PLAN.md through runTriage() with forceFinal, all pass against live OpenRouter + Supabase (7/7 npm test). Verified live in browser: sample complaint returned correct Engine Diagnostic match with real seeded price range.
Audit: 2026-07-14 — audited-pass. All 5 PLAN.md Taglish complaints (tests/triage.test.ts) return grounded probable_issue/urgency/estimate mapped to live autoshop_services or needs_inspection, all carry the exact disclaimer string; npm test 7/7 and npm run build pass live against Supabase+OpenRouter; model read from OPENROUTER_MODEL (no hardcode); no service-role/OpenRouter key in client code (/intake only calls fetch("/api/triage")); no undeclared new deps vs decision log.

## Phase 3: Booking + status tracker — pending
Notes:
Audit:

## Phase 4: Admin board + AI messaging — pending
Notes:
Audit:

## Phase 5: Polish + deploy — pending
Notes:
Audit:

## Decision log
- 2026-07-07: Plan approved. Stack: Next.js + Supabase + OpenRouter, hosted on Vercel.
- 2026-07-07: OpenRouter default model google/gemini-2.5-flash-lite, set via OPENROUTER_MODEL env.
- 2026-07-07: No auth; admin gated by ADMIN_PASSCODE. Messages faked (previewed, not sent) for the demo.
- 2026-07-14: Tables prefixed autoshop_ (services/jobs/status_history/messages) — the Supabase project is shared with another app that already owns a `jobs` table.
- 2026-07-14: Added deps: @supabase/supabase-js (client), tsx + server-only (dev, seed script + server-only guard on service-role client). Seed reads .env.local via `node --env-file`, no dotenv dep needed.
- 2026-07-14: /services and /jobs are plain Server Components fetching via anon client — fine for phase 1 read-only lists; will need dynamic rendering once Phase 3/4 make jobs mutate.
