# V2 release lineage and rollback guide

This file records the immutable V2 lineage after the independent audit found
that the original checkpoint combined several phases in one commit. The
historical checkpoint is preserved; rewriting published history would make the
release harder to verify and could disrupt existing clones.

## Immutable lineage

| Revision | Purpose |
|---|---|
| `8feff2c` | Pre-V2 baseline through the earlier application phases |
| `9ef4c57` | Consolidated V2 implementation checkpoint covering phases 6–9 |
| `f56c4ce` | P0 customer-data and administrator-authentication remediation |
| `0537202` | P1 transactional integrity and email-idempotency remediation |
| `v2-audit-remediated` | Tag applied to the final P2/P3 remediation commit |

The consolidated V2 checkpoint is still auditable by phase:

- Phase 6: `supabase/migrations/20260730090000_phase6_shop_config.sql`,
  `lib/shop-config.ts`, `lib/formatting.ts`.
- Phase 7: `i18n/`, `messages/`, localized routes under `app/[locale]/`.
- Phase 8: `lib/email/`, `app/api/webhooks/n8n/`, `app/api/automation/`,
  `n8n/workflows/`.
- Phase 9: `lib/seed.ts`, the admin shop controls, reset route, and deployment
  records in `PROGRESS.md`.

## Rollback rules

1. Application rollback uses an immutable commit or the
   `v2-audit-remediated` tag; never deploy a dirty working directory.
2. Database migrations are forward-only. Do not drop the P0/P1/P2 security,
   privacy, rate-limit, action-key, or email-delivery objects during an
   application rollback.
3. The additive P0–P2 schema remains compatible with the current V2 app. If an
   older application revision must be restored, verify its queries against a
   non-production database before promotion.
4. Never roll back rotated administrator secrets or re-enable anonymous access
   to customer tables.
5. n8n workflows are inactive exports until credentials are connected and the
   user explicitly activates them. Re-import the workflow JSON from the same
   application revision being deployed.

## Release verification

Each remediation commit must pass focused tests, TypeScript, ESLint, a
production build, and a production dependency audit. Live database checks use
synthetic records and remove them immediately after verification.
