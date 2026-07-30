# Auto Repair n8n workflows

Import both JSON files from `n8n/workflows/`.

## Credentials

Create these credentials in n8n after import:

1. **AutoShop Webhook Secret** — Header Auth with header name `x-autoshop-webhook-secret` and the same value as the app's `N8N_WEBHOOK_SECRET`.
2. **Resend API key** — Header Auth with header name `Authorization` and value
   `Bearer <your Resend API key>`.

Reconnect the placeholder credentials on the imported nodes. Apply the
**AutoShop Webhook Secret** credential to the incoming webhook and both
callback HTTP nodes. Callback authentication is read directly from the n8n
credential store; the secret is never copied into workflow execution data. Do
not put secret values in the workflow JSON.

## Environment

Set `AUTOSHOP_APP_URL` on the n8n host to the public HTTPS origin of the deployed app, without a trailing slash.
The reminder workflow uses the n8n instance timezone for its hourly trigger; due appointments are compared as absolute UTC timestamps by the app using each shop's configured timezone at booking time.

## Activation order

1. Activate **Auto Repair — Email Delivery** and copy its production webhook URL into the app's `N8N_WEBHOOK_URL`.
2. Configure the app's remaining Phase 8 environment variables and redeploy it.
3. Replace the active shop's seeded `.example` sender with an address on the verified Resend domain.
4. Run **Auto Repair — Maintenance Reminders** manually once and confirm its response.
5. Activate the reminder workflow.

The email workflow uses Header Auth before accepting a payload. It validates that
the request's `Idempotency-Key` matches the durable delivery ID, renders one of
four template IDs, and sends through Resend's HTTP API with that same key.
Successful callbacks mark the delivery `sent`; ambiguous workflow or provider
failures mark it `reconciling` so the app can safely retry within Resend's
idempotency window.

The exported files intentionally contain placeholder credential IDs and are inactive. Importing them does not send email until credentials are reconnected and each workflow is activated.
