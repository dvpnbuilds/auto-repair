# AutoShop Assistant — Plan v3 (approved 2026-07-31)

## Vision
v3 stops being a lifecycle demo and starts being how a shop runs a day. Jobs get assigned to named technicians. Extra work found mid-repair gets approved by the customer from an email link instead of a voicemail that never gets returned. Damage gets read from a photo at intake. The owner gets a dashboard of the numbers that matter. And the whole thing gets a branded front door the shop can put in their Facebook bio.

## Changes from v2
- Adds technician assignment — jobs belong to a named person, not just a queue.
- Adds the extra-work approval flow — the first customer-facing decision the app asks for, delivered over the v2 email rails.
- Adds photo intake with AI vision, extending the Phase 2 triage hero rather than adding a competing one.
- Adds an owner metrics dashboard over data already being stored.
- Replaces the generic home route with a shop-branded landing page driven entirely by `shops` config.
- Closes out the v2 bookkeeping: phases 6-9 statuses are corrected to reflect the independent audit and P0-P3 remediation that already happened.

## Prerequisite gate (not a phase)
Phase 11 delivers approvals by email and cannot be verified until email is actually live. Before starting Phase 11, configure in `.env.local` and Vercel: `EMAIL_TRANSPORT`, the n8n webhook URL and shared secret, `APP_BASE_URL`, `EMAIL_DEMO_RECIPIENT`, `EMAIL_DEMO_SEND_CAP`, and `RESEND_API_KEY` as fallback. Replace the active shop's seeded `.example` sender with an address on a verified sending domain (DKIM/SPF), connect n8n credentials, and activate both exported workflows. Phases 10, 12, 13, and 14 do not depend on this gate and can proceed without it.

## Core features (v3)
- Per-shop technician records, job assignment, and board filtering by technician.
- Extra-work approval requests: AI-drafted customer explanation grounded in the shop price list, emailed with a signed single-use expiring approve/decline link, public decision page with no login, write-back to job status, history, and board.
- Photo intake: up to 3 private images per intake, vision-model triage via a separate model env var, graceful degradation to text-only.
- Owner dashboard: jobs by status, booked value, average ticket, intake-to-booking conversion, approval acceptance rate, technician workload, reminders sent, with a 7/30/90-day filter.
- Shop-branded landing page rendered from config, replacing the generic home route.

## Deferred (not v3)
- Spanish locale (`messages/es.json`) — still the cheapest remaining win since the Phase 7 extraction is already paid for; deferred by choice, not by cost.
- Payments and deposits — compliance surface with no pitch payoff.
- SMS as a channel, inbound email parsing, self-serve shop signup.

## Stack changes
No new runtime dependencies. Dashboard charts are CSS/SVG bars specifically to avoid adding a charting library. Adds Supabase Storage (private bucket) for intake photos, a vision-capable OpenRouter model behind `OPENROUTER_VISION_MODEL`, and `APPROVAL_TOKEN_SECRET` for signing public approval links.

## Phases

### Phase 10: Technician assignment
- Scope: `auto_repair.autoshop_technicians` scoped per shop and seeded with 3-4 technicians for each market; nullable assignee on jobs; assign/reassign control on the admin board; filter-by-technician. Foundational — Phases 11 and 13 both reference the assignee.
- Done when: any seeded job can be assigned and reassigned from the board, the filter narrows the board to a single technician, assignments survive `npm run seed` and the in-app reset, and both shops seed their own technician list.

### Phase 11: Extra-work approval flow
- Scope: `auto_repair.autoshop_approval_requests` (job, description, line items, amount, status, token hash, expiry, decided_at). Admin drafts extra work against the active shop price list; the model produces a structured customer-facing explanation covering what is wrong, what it costs, and the consequence of declining. Delivery through the existing `sendEmail()` abstraction with a signed, single-use, expiring approve/decline link. Public `/approve/[token]` page requires no login and is rate limited. Decisions write back to job status, status history, and a pending badge on the board card.
- Done when: drafting extra work on a real seeded job delivers a real email; approving from that email records the decision and updates the board on next load; declining records correctly; a reused, tampered, or expired token is rejected; rate limiting holds under repeated requests; and amounts render in the correct currency for both shops.

### Phase 12: Photo intake with AI vision
- Scope: private Supabase Storage bucket with signed-URL access only; up to 3 images per intake with hard size and MIME allowlist caps; triage passes images to `OPENROUTER_VISION_MODEL` leaving the text model path untouched; structured output keeps the existing grounded shape plus visual findings; photos attach to the job on booking and are viewable in admin.
- Done when: a dashboard-warning-light photo returns triage that references what is visible; estimates still map to a real service or `needs_inspection` and carry the disclaimer; oversized and non-image uploads are rejected; stored photos are not publicly listable or guessable; and a vision failure degrades to text-only triage rather than inventing findings.

### Phase 13: Owner dashboard
- Scope: `/admin/dashboard` behind the existing admin gate — jobs by status, booked value, average ticket, intake-to-booking conversion, approval acceptance rate, technician workload, reminders sent; 7/30/90-day range filter; all money labeled as estimated because it derives from estimate ranges; charts as CSS/SVG bars.
- Done when: every figure matches an independently run database query; the shop switcher changes currency and locale throughout; the date filter changes results; empty states render for a shop with no data in range; and `package.json` is unchanged.

### Phase 14: Branded landing page and close-out
- Scope: `/[locale]/` becomes a shop-branded landing rendered from config (name, tagline, address, phone, hours, services preview with live prices, CTAs into intake, booking, and tracking), adding only the brand fields `shops` currently lacks. Mobile pass at 390px, production deploy, and correction of every phase status in PROGRESS.md to reflect reality.
- Done when: both shops render their own brand from config with no code change; every CTA lands on the right route with locale preserved; 390px has no horizontal overflow; the deployed URL serves the branded landing; and PROGRESS.md phase statuses match the actual audited state of the build.

## Risks / open decisions
- The approval token is the project's first public, unauthenticated, state-changing endpoint. Audit effort belongs here disproportionately, not spread evenly across phases. Signed, single-use, expiring, rate limited, and never trusting a raw token from the URL without verification.
- Intake photos may contain plates, faces, and interiors. Decide retention and deletion policy before the bucket goes live, not after.
- Vision calls cost meaningfully more per request than text. The 3-image cap is a cost control as much as a UX one; keep the text model as the default path.
- Dashboard revenue is derived from estimate ranges, not invoices. If it is not labeled estimated, a shop owner will catch it in the first demo and it will cost credibility.
- Nothing in this plan has been validated against a real shop owner. Pitch the live demo during the v3 build and let real feedback reorder these phases.
