# Rules
1. One phase at a time. For v2 phases 6-9, the user explicitly deferred the independent audit until all v2 phases are built; phase progression does not require a per-phase audited-pass.
2. Update PROGRESS.md at the end of every session.
3. No new dependencies without noting them in the decision log.
4. Keep PLAN.md immutable after approval; scope changes go through DV and get logged.
5. Write tests for each phase's completion criteria before marking it built.
6. OpenRouter and the Supabase service-role key are server-side only — never import them into client components.
7. All LLM outputs used for estimates/messages must be parsed as structured JSON and validated; never render raw model text as a price.
8. Every estimate shown to a customer carries the label "initial estimate, subject to inspection."
9. Triage estimates come from the seeded services price list, not invented numbers. If the model can't map to a service, it returns "needs inspection," not a guess.
10. The model name is read from OPENROUTER_MODEL — never hardcode a model string.
11. Email messages are delivered for real only through `sendEmail()` and must be logged, authenticated, idempotent, and constrained by the demo send cap.
12. Keep the seed script idempotent — it fully restores demo state so the reset button and repeat pitches work.
13. Secrets live in .env.local (never committed). Provide .env.example with placeholder keys.
14. No hardcoded currency symbols, timezones, locales, or date formats. Read them from the active `shops` record.
15. No user-facing literal strings in components — everything goes through the i18n bundle.
16. The Resend API key, n8n webhook URL, and webhook shared secret are server-side only; never import them into client components.
17. All email sends go through the `sendEmail()` abstraction and respect the demo send cap. Never call a provider or the n8n webhook directly from feature code.
18. All app-owned database objects live in the dedicated `auto_repair` PostgreSQL schema; do not add this app's tables to `public`.
19. Public unauthenticated state-changing endpoints require a signed, single-use, expiring token verified server-side, plus rate limiting. Tokens are stored hashed, never in plaintext.
20. Uploaded media is private by default, served only via signed URLs, with server-side size and MIME allowlist enforcement before anything is written to storage.
21. Money derived from estimate ranges is always labeled estimated. Never present it as revenue.
22. No new runtime dependencies in v3. Dashboard charts are CSS/SVG.
23. The vision path uses `OPENROUTER_VISION_MODEL` only. Never route image requests through `OPENROUTER_MODEL`, and never let a vision failure produce an invented finding — degrade to text-only triage.
