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
    case "extra_work_approval":
      return `${payload.shopName}: review additional work`;
  }
}

export function renderEmailTemplate(
  templateId: EmailTemplateId,
  payload: EmailTemplatePayload
): RenderedEmail {
  const subject = subjectFor(templateId, payload);
  if (templateId === "extra_work_approval") {
    if (
      !payload.approvalUrl ||
      !payload.approvalAmount ||
      !payload.approvalDescription ||
      !payload.approvalExpiresAt
    ) {
      throw new Error("Approval email payload is incomplete");
    }
    const url = escapeHtml(payload.approvalUrl);
    return {
      subject,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#173744;max-width:560px">
  <p>Hi ${escapeHtml(payload.customerName)},</p>
  <p>${escapeHtml(payload.messageBody)}</p>
  <div style="margin:24px 0;padding:18px;border:1px solid #dce5e3;border-radius:12px;background:#f7faf9">
    <strong>Vehicle:</strong> ${escapeHtml(payload.vehicle)}<br>
    <strong>${escapeHtml(payload.approvalDescription)}</strong><br>
    Additional cost: ${escapeHtml(payload.approvalAmount)}
  </div>
  <p><a href="${url}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#087f78;color:#fff;text-decoration:none;font-weight:700">Review and decide</a></p>
  <p style="color:#60727a;font-size:13px">This private link expires ${escapeHtml(payload.approvalExpiresAt)} and can be used once.</p>
  <p style="color:#71717a;font-size:13px">${escapeHtml(payload.shopName)}<br>${escapeHtml(payload.shopAddress)}</p>
</div>`,
      text: `Hi ${payload.customerName},

${payload.messageBody}

Vehicle: ${payload.vehicle}
${payload.approvalDescription}
Additional cost: ${payload.approvalAmount}

Review and decide: ${payload.approvalUrl}
This private link expires ${payload.approvalExpiresAt} and can be used once.

${payload.shopName}
${payload.shopAddress}`,
    };
  }
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
