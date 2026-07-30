import "server-only";
import {supabaseService} from "@/lib/supabase/server";
import type {
  EmailDelivery,
  EmailDeliveryStatus,
  EmailTemplateId,
  EmailTransport,
} from "@/lib/email/types";

type ReserveInput = {
  shopId: string;
  jobId: string;
  messageId: string;
  templateId: EmailTemplateId;
  transport: EmailTransport;
  recipient: string;
  cap: number;
};

export async function reserveEmailDelivery(
  input: ReserveInput
): Promise<{delivery: EmailDelivery; isNew: boolean}> {
  const {data, error} = await supabaseService.rpc(
    "reserve_autoshop_email_delivery",
    {
      p_shop_id: input.shopId,
      p_job_id: input.jobId,
      p_message_id: input.messageId,
      p_template_id: input.templateId,
      p_transport: input.transport,
      p_recipient: input.recipient,
      p_cap: input.cap,
    }
  );

  if (error || !data?.delivery) {
    throw new Error(`Failed to reserve email delivery: ${error?.message ?? "no result"}`);
  }

  return {
    delivery: data.delivery as EmailDelivery,
    isNew: data.is_new === true,
  };
}

export async function completeEmailDelivery(
  deliveryId: string,
  status: Extract<EmailDeliveryStatus, "sent" | "failed" | "reconciling">,
  providerMessageId?: string | null,
  errorMessage?: string | null
): Promise<EmailDelivery> {
  const {data, error} = await supabaseService.rpc(
    "complete_autoshop_email_delivery",
    {
      p_delivery_id: deliveryId,
      p_status: status,
      p_provider_message_id: providerMessageId ?? null,
      p_error: errorMessage ?? null,
    }
  );

  if (error || !data) {
    throw new Error(`Failed to complete email delivery: ${error?.message ?? "no result"}`);
  }

  return data as EmailDelivery;
}
