import type {EmailTemplateId, EmailTemplatePayload} from "@/lib/email/types";

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function subjectFor(templateId: EmailTemplateId, payload: EmailTemplatePayload): string {
  switch (templateId) {
    case "status_update":
      return `${payload.shopName}: repair status update`;
    case "completion_report":
      return `${payload.shopName}: your repair is complete`;
    case "reminder":
      return `${payload.shopName}: appointment reminder`;
    case "review_request":
      return `${payload.shopName}: how did we do?`;
  }
}

export function renderEmailTemplate(
  templateId: EmailTemplateId,
  payload: EmailTemplatePayload
): RenderedEmail {
  const subject = subjectFor(templateId, payload);
  const detailRows = [
    `<strong>Vehicle:</strong> ${escapeHtml(payload.vehicle)}`,
    payload.status ? `<strong>Status:</strong> ${escapeHtml(payload.status)}` : null,
    payload.scheduledAt
      ? `<strong>Appointment:</strong> ${escapeHtml(payload.scheduledAt)}`
      : null,
  ].filter(Boolean);
  const textDetails = [
    `Vehicle: ${payload.vehicle}`,
    payload.status ? `Status: ${payload.status}` : null,
    payload.scheduledAt ? `Appointment: ${payload.scheduledAt}` : null,
  ].filter(Boolean);

  return {
    subject,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#18181b;max-width:560px">
  <p>Hi ${escapeHtml(payload.customerName)},</p>
  <p>${escapeHtml(payload.messageBody)}</p>
  <p>${detailRows.join("<br>")}</p>
  <p style="color:#71717a;font-size:13px">${escapeHtml(payload.shopName)}<br>${escapeHtml(payload.shopAddress)}</p>
</div>`,
    text: `Hi ${payload.customerName},

${payload.messageBody}

${textDetails.join("\n")}

${payload.shopName}
${payload.shopAddress}`,
  };
}
