import {callWithRetry} from "@/lib/callWithRetry";
import {renderEmailTemplate} from "@/lib/email/templates";
import type {SendEmailInput} from "@/lib/email/types";

export const N8N_EMAIL_SECRET_HEADER = "x-autoshop-webhook-secret";

type N8nTransportConfig = {
  webhookUrl: string;
  secret: string;
  appBaseUrl: string;
};

type ResendSend = (
  message: {
    from: string;
    to: string;
    subject: string;
    html: string;
    text: string;
    tags: Array<{name: string; value: string}>;
  },
  options: {idempotencyKey: string}
) => Promise<{
  data: {id: string} | null;
  error: {message: string} | null;
}>;

export async function dispatchN8nEmail(
  input: SendEmailInput,
  recipient: string,
  deliveryId: string,
  config: N8nTransportConfig,
  fetcher: typeof fetch = fetch
): Promise<void> {
  await callWithRetry(async () => {
    const response = await fetcher(config.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [N8N_EMAIL_SECRET_HEADER]: config.secret,
        "Idempotency-Key": deliveryId,
      },
      body: JSON.stringify({
        delivery_id: deliveryId,
        template_id: input.templateId,
        to: recipient,
        from_name: input.shop.email_sender_name,
        from_email: input.shop.email_sender_address,
        locale: input.shop.language,
        payload: input.payload,
        callback_url: `${config.appBaseUrl.replace(/\/$/, "")}/api/webhooks/n8n/email-status`,
      }),
    });

    if (!response.ok) {
      throw new Error(`n8n webhook returned ${response.status}`);
    }
  });
}

export async function dispatchResendEmail(
  input: SendEmailInput,
  recipient: string,
  deliveryId: string,
  send: ResendSend
): Promise<string> {
  const rendered = renderEmailTemplate(input.templateId, input.payload);
  const {data, error} = await send(
    {
      from: `${input.shop.email_sender_name} <${input.shop.email_sender_address}>`,
      to: recipient,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      tags: [
        {name: "delivery_id", value: deliveryId},
        {name: "template_id", value: input.templateId},
      ],
    },
    {idempotencyKey: deliveryId}
  );

  if (error || !data?.id) {
    throw new Error(`Resend send failed: ${error?.message ?? "no message id"}`);
  }
  return data.id;
}
