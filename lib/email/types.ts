import type {MessageKind} from "@/lib/openrouter/messages";
import type {ShopConfig} from "@/lib/shop-config";

export type EmailTransport = "n8n" | "resend";
export type EmailDeliveryStatus =
  | "pending"
  | "sent"
  | "failed"
  | "capped"
  | "reconciling";
export type EmailTemplateId = MessageKind;

export type EmailTemplatePayload = {
  customerName: string;
  shopName: string;
  shopAddress: string;
  vehicle: string;
  messageBody: string;
  status?: string;
  scheduledAt?: string;
  approvalUrl?: string;
  approvalAmount?: string;
  approvalDescription?: string;
  approvalExpiresAt?: string;
};

export type EmailDelivery = {
  id: string;
  shop_id: string;
  job_id: string;
  message_id: string | null;
  template_id: EmailTemplateId;
  transport: EmailTransport;
  recipient: string;
  status: EmailDeliveryStatus;
  provider_message_id: string | null;
  error: string | null;
  created_at: string;
  sent_at: string | null;
};

export type SendEmailInput = {
  shop: ShopConfig;
  jobId: string;
  messageId: string;
  templateId: EmailTemplateId;
  to: string | null;
  payload: EmailTemplatePayload;
};

export type SendEmailResult = {
  delivery: EmailDelivery;
  dispatched: boolean;
};
