# AutoShop Assistant — Plan v2 (approved 2026-07-30)

## Vision
v2 turns a Philippines-specific demo into a shop-configurable one you can pitch anywhere. Currency, timezone, date format, language, and sender identity move out of the code and into a `shops` config record; every hardcoded peso, Manila timezone, and inline English string gets extracted. Faked SMS is replaced by real email delivered through the existing self-hosted n8n instance, which also takes over maintenance reminder scheduling — turning a preview-only feature into one that actually fires. The default demo becomes a US shop in USD, with the PH shop kept as a switchable second seed.

## Changes from v1
- Taglish removed; English only. Language becomes a `shops` config field, so the code path stays capable of other languages without a rebuild.
- Foreign-ready: currency, timezone, locale, date/number formatting, and demo seed data all driven by shop config instead of hardcoded PH values.
- Full i18n extraction (`next-intl`), shipping `en` only. Plumbing now so future locales are a bundle, not a refactor.
- Messaging channel changed from SMS to email, delivered for real (not previewed) via n8n.
- Maintenance reminders upgraded from admin previews to a working n8n schedule trigger.
- Default demo shop changed from RapidFix Auto Care (Quezon City, PHP) to a US shop in USD.

## Core features (v2)
- `shops` config record driving currency, timezone, locale, language, sender identity, and price list.
- i18n bundle (`messages/en.json`) with Intl-based currency, date, and number formatting.
- `sendEmail()` abstraction behind `EMAIL_TRANSPORT=n8n|resend` — one env var swaps transport mid-pitch.
- Four email templates: status update, completion report, maintenance reminder, review request.
- n8n schedule trigger sending real maintenance reminders from due-service data.
- US demo seed (F-150, Camry, Silverado, USD pricing, US plates/timezone) plus an admin shop switcher.
- Send log with status write-back and a demo send cap.

## Deferred (not v2)
- Additional shipped locales beyond `en` — add per client once one asks.
- Inbound email parsing (customer replies) — no demo value, real complexity.
- SMS as a fallback channel — email covers the pitch; revisit post-sale.
- Self-serve shop signup / true multi-tenancy — config table is the groundwork, not the product.
- Payments, inventory.

## Stack changes
Adds `next-intl` (i18n routing + bundles) and `resend` (fallback transport). Email delivery primarily flows through the existing self-hosted n8n instance over an authenticated webhook; n8n also owns reminder scheduling, which avoids Vercel cron limits.

## Phases

### Phase 6: Shop config layer
- Scope: add `shops` table (name, country, locale, currency, timezone, language, email sender name/address, address). Replace every hardcoded currency symbol, timezone, and locale value with reads from the active shop record. Seed both a US and a PH shop.
- Done when: no currency symbol, timezone, or locale string exists as a literal anywhere in the codebase, and changing the active shop record changes formatting across every page with no code edit.

### Phase 7: i18n extraction
- Scope: install `next-intl`, extract all user-facing strings to `messages/en.json`, wire locale routing and Intl-based currency/date/number formatting. Triage and message-drafting prompts take a language param from shop config; Taglish-specific prompt handling removed.
- Done when: a grep for user-facing literal strings in components returns nothing, every screen has been clicked through without missing or broken copy, and adding a stub second locale renders without code changes.

### Phase 8: Email + automation layer via n8n
- Scope: thin `sendEmail()` abstraction behind `EMAIL_TRANSPORT=n8n|resend`. App POSTs template id + payload to an n8n webhook with a shared-secret header; n8n renders and delivers via its SMTP/Resend node and writes send status back to Supabase. Four templates. n8n schedule trigger queries jobs with due services and sends reminders. Demo send cap. Export workflow JSON to `n8n/workflows/` in the repo.
- Done when: a status change on the admin board delivers a real email through n8n and logs it; the reminder schedule trigger emails a due customer on demand; flipping `EMAIL_TRANSPORT=resend` still sends; the webhook rejects requests without the shared secret.

### Phase 9: US demo data, shop switcher, deploy
- Scope: US seed (F-150, Camry, Silverado, US plates, USD service pricing checked against real shop rates, US timezone), admin shop switcher for pitching either market, reset button reseeds both shops, n8n/Resend env vars documented, redeploy and verify.
- Done when: the deployed link opens the US shop by default, a full pitch walkthrough works on a phone-sized screen for both shops, and reset restores both cleanly.

## Risks / open decisions
- The n8n webhook must be publicly reachable over HTTPS from Vercel. If the self-hosted instance is LAN-only, phase 8 stalls — verify the public URL from outside the network before starting.
- An unauthenticated n8n webhook that sends email is an open relay. The shared secret is not optional.
- Real delivery to a prospect's inbox needs a verified sending domain (DKIM/SPF). Budget an hour and roughly $10/yr for a domain before the first pitch; without it, delivery is limited to your own verified address.
- Phase 7 is the kind of refactor that quietly breaks pages. Click through every screen before audit, not after.
- US service pricing must be sanity-checked against real US shop rates or estimates lose credibility with US owners.
- n8n adds a live-pitch failure point. The `EMAIL_TRANSPORT` env var is the mitigation — verify the Resend path works before relying on n8n in front of a client.
