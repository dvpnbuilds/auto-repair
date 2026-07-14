# AutoShop Assistant — Plan (approved 2026-07-07)

## Vision
A hosted demo web app to pitch to Philippine auto repair shops. A car owner describes a problem in Taglish, gets an AI-triaged probable diagnosis, urgency, and peso estimate range grounded in the shop's price list, books a slot, and tracks the repair. The shop owner works a kanban job board where AI drafts every customer update, completion report, reminder, and review request. One link you send to prospects, seeded with believable PH data.

## Core features (v1)
- AI issue intake chat — Taglish, asks 2-3 follow-ups, outputs structured probable issue + urgency + estimate range from the price list.
- Booking — pick service + slot on a simple calendar, creates a job.
- Status tracker — public lookup by plate + phone, shows a status timeline.
- Admin job board — kanban (booked -> in progress -> waiting parts -> ready -> done), passcode-gated.
- AI-drafted customer messages — editable draft on every status change; "send" marks sent and surfaces in the customer tracker.
- AI completion report — job notes summarized into a customer-friendly report.
- Reminder + review previews — AI-drafted, shown in admin as "scheduled" (not actually sent).

## Deferred (not v1)
- Real SMS/Messenger sending — demo fakes the send; integration is post-sale.
- Payments, inventory, multi-shop tenancy, user accounts, photo-based diagnosis — out of scope for a pitch demo.

## Stack
Next.js (App Router) on Vercel + Supabase Postgres + OpenRouter. One repo, one free shareable deploy; API routes keep the OpenRouter key and service-role key server-side. Cheap OpenRouter model keeps live-demo cost at centavos.

## Phases

### Phase 1: Scaffold + data layer
- Scope: Next.js + Tailwind app, Supabase schema (services, jobs, status_history, messages), seed script with RapidFix demo data, basic layout/nav.
- Done when: `npm run seed` populates the DB and a plain list page renders the seeded services and jobs.

### Phase 2: Customer intake + estimate (the hero)
- Scope: chat UI + `app/api/triage` route calling OpenRouter with a price-list-grounded prompt returning structured JSON (probable issue, urgency, estimate range). Taglish tested.
- Done when: 5 sample Taglish complaints each return a sane probable issue and an estimate range drawn from the seeded price list, labeled "initial estimate, subject to inspection."

### Phase 3: Booking + status tracker
- Scope: slot picker that creates a job from an estimate or fresh; public tracker page looking up by plate + phone with a status timeline.
- Done when: a booking flow creates a job in the DB and that job is retrievable and shows its timeline on the tracker page.

### Phase 4: Admin board + AI messaging
- Scope: passcode gate, kanban board with status moves, AI-drafted editable update per status change, completion report, reminder/review previews.
- Done when: full loop works — a customer booking appears on the board, a status change produces an AI draft, "send" surfaces it in the customer tracker.

### Phase 5: Polish + deploy
- Scope: mobile responsiveness, empty/error/loading states, demo reset button (re-runs seed), Vercel deploy, env docs in README.
- Done when: a clean walkthrough of the pitch script works on a phone-sized screen against the deployed URL, and reset restores seed data.

## Risks / open decisions
- Triage prompt quality is the whole demo — Phase 2 gets the most iteration time.
- Estimate ranges must be clearly labeled "initial estimate, subject to inspection" so shop owners don't object to being held to a number.
- Demo reset button matters more than it looks — it lets you re-pitch cleanly to the next prospect.
- If `google/gemini-2.5-flash-lite` triage quality is weak in Taglish, swap `OPENROUTER_MODEL` to a stronger cheap model (e.g. `anthropic/claude-haiku`).
