import {formatDateTime} from "@/lib/formatting";
import type {EmailTemplatePayload} from "@/lib/email/types";
import type {ShopConfig} from "@/lib/shop-config";

export type EmailJob = {
  customer_name: string;
  customer_email: string | null;
  vehicle: string;
  status: string;
  scheduled_at: string | null;
};

export function createEmailPayload(
  job: EmailJob,
  shop: ShopConfig,
  messageBody: string
): EmailTemplatePayload {
  return {
    customerName: job.customer_name,
    shopName: shop.name,
    shopAddress: shop.address,
    vehicle: job.vehicle,
    messageBody,
    status: job.status.replaceAll("_", " "),
    scheduledAt: job.scheduled_at
      ? formatDateTime(job.scheduled_at, shop)
      : undefined,
  };
}
