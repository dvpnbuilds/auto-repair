# Rules
1. One phase at a time. Never start phase N+1 until phase N is audited-pass.
2. Update PROGRESS.md at the end of every session.
3. No new dependencies without noting them in the decision log.
4. Keep PLAN.md immutable after approval; scope changes go through DV and get logged.
5. Write tests for each phase's completion criteria before marking it built.
6. OpenRouter and the Supabase service-role key are server-side only — never import them into client components.
7. All LLM outputs used for estimates/messages must be parsed as structured JSON and validated; never render raw model text as a price.
8. Every estimate shown to a customer carries the label "initial estimate, subject to inspection."
9. Triage estimates come from the seeded services price list, not invented numbers. If the model can't map to a service, it returns "needs inspection," not a guess.
10. The model name is read from OPENROUTER_MODEL — never hardcode a model string.
11. No real messages are sent in the demo. Reminder, review, and status messages are previews/marked-sent only.
12. Keep the seed script idempotent — it fully restores demo state so the reset button and repeat pitches work.
13. Secrets live in .env.local (never committed). Provide .env.example with placeholder keys.
