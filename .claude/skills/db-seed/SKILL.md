---
name: db-seed
description: Create or repair the Supabase schema and RapidFix demo data. Trigger: "seed the db", "reset demo data", "restore seed", "set up the database".
---
Purpose: keep the demo's data layer reproducible so repeat pitches and the reset button always start clean.

1. Ensure the schema exists: tables `services`, `jobs`, `status_history`, `messages` (see PLAN.md Phase 1 for shape). Apply the SQL in `supabase/schema.sql` if present; otherwise create it.
2. Run the idempotent seed (`npm run seed`): it must fully clear and repopulate demo state, not append duplicates.
3. Seed content — shop "RapidFix Auto Care – Quezon City":
   - ~15 common PH services with peso prices (change oil, brake pads front/rear, aircon cleaning, CVT/ATF fluid change, tune-up, tire rotation, wheel alignment, battery replacement, radiator flush, spark plugs, timing belt, clutch overhaul, engine scanning, brake bleeding, underchassis check).
   - 6-8 in-flight jobs across statuses (booked/in progress/waiting parts/ready/done) on Vios, Mirage, Innova, Civic, with plate numbers, owner names, phones, and a short status_history trail each.
4. Verify: print row counts per table and confirm at least one job in each status.
Keep prices realistic for Metro Manila 2026. This script backs the Phase 5 demo reset button, so it must be safe to run repeatedly.
