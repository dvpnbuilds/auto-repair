import "server-only";
import {parseApprovalToken, hashApprovalToken} from "@/lib/approvals/tokens";
import {supabaseService} from "@/lib/supabase/server";

type TerminalApprovalView = {
  terminal: true;
  status: "approved" | "declined" | "expired";
};

type PendingApprovalView = {
  terminal: false;
  id: string;
  token: string;
  description: string;
  lineItems: Array<{name: string; amount: number}>;
  amount: number;
  customerExplanation: string;
  status: "pending";
  expiresAt: string;
  isExpired: boolean;
  customerName: string;
  vehicle: string;
  shop: {
    name: string;
    address: string;
    locale: string;
    currency: string;
    timezone: string;
  };
};

export type ApprovalView = TerminalApprovalView | PendingApprovalView;

export async function getApprovalView(token: string): Promise<ApprovalView | null> {
  const parsed = parseApprovalToken(token);
  if (!parsed) return null;
  const {data: approval} = await supabaseService
    .from("autoshop_approval_requests")
    .select(
      "id, shop_id, job_id, status, expires_at"
    )
    .eq("id", parsed.requestId)
    .eq("token_hash", hashApprovalToken(parsed.token))
    .single();
  if (!approval) return null;

  const naturallyExpired =
    new Date(approval.expires_at).getTime() <= Date.now();
  if (approval.status !== "pending" || naturallyExpired) {
    return {
      terminal: true,
      status: naturallyExpired ? "expired" : approval.status,
    } as TerminalApprovalView;
  }

  const {data: details} = await supabaseService
    .from("autoshop_approval_requests")
    .select(
      "description, line_items, amount, customer_explanation, expires_at"
    )
    .eq("id", approval.id)
    .eq("token_hash", hashApprovalToken(parsed.token))
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .single();
  if (!details) {
    return {terminal: true, status: "expired"};
  }

  const [{data: job}, {data: shop}] = await Promise.all([
    supabaseService
      .from("autoshop_jobs")
      .select("customer_name, vehicle")
      .eq("id", approval.job_id)
      .eq("shop_id", approval.shop_id)
      .single(),
    supabaseService
      .from("autoshop_shops")
      .select("name, address, locale, currency, timezone")
      .eq("id", approval.shop_id)
      .single(),
  ]);
  if (!job || !shop) return null;
  const lineItems = Array.isArray(details.line_items)
    ? details.line_items.flatMap((item: unknown) => {
        if (
          !item ||
          typeof item !== "object" ||
          typeof (item as {name?: unknown}).name !== "string" ||
          !Number.isInteger((item as {amount?: unknown}).amount)
        ) {
          return [];
        }
        return [{
          name: (item as {name: string}).name,
          amount: (item as {amount: number}).amount,
        }];
      })
    : [];
  return {
    terminal: false,
    id: approval.id,
    token,
    description: details.description,
    lineItems,
    amount: details.amount,
    customerExplanation: details.customer_explanation,
    status: "pending",
    expiresAt: details.expires_at,
    isExpired: false,
    customerName: job.customer_name,
    vehicle: job.vehicle,
    shop,
  };
}
