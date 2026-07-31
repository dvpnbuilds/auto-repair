import {getTranslations} from "next-intl/server";
import {getApprovalView} from "@/lib/approvals/queries";
import {formatCurrency, formatDateTime} from "@/lib/formatting";
import ApprovalDecision from "./ApprovalDecision";

export default async function ApprovalPage({
  params,
}: {
  params: Promise<{token: string}>;
}) {
  const t = await getTranslations("Approval");
  const {token} = await params;
  let approval = null;
  try {
    approval = await getApprovalView(token);
  } catch {
    approval = null;
  }

  if (!approval) {
    return (
      <div className="page-shell">
        <section className="surface mx-auto max-w-xl p-6 text-center sm:p-9">
          <p className="eyebrow">{t("eyebrow")}</p>
          <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[#173744]">
            {t("invalidTitle")}
          </h1>
          <p className="mt-3 leading-7 text-[#60727a]">{t("invalidHint")}</p>
        </section>
      </div>
    );
  }

  if (approval.terminal) {
    return (
      <div className="page-shell">
        <section className="surface mx-auto max-w-xl p-6 text-center sm:p-9">
          <p className="eyebrow">{t("eyebrow")}</p>
          <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[#173744]">
            {t(`${approval.status}Title`)}
          </h1>
          <p className="mt-3 leading-7 text-[#60727a]">
            {t(`${approval.status}Hint`)}
          </p>
        </section>
      </div>
    );
  }

  const actionable = !approval.isExpired;

  return (
    <div className="page-shell">
      <div className="mx-auto max-w-2xl">
        <header className="mb-7">
          <p className="eyebrow">{t("eyebrow")}</p>
          <h1 className="page-title-compact">{t("title")}</h1>
          <p className="page-lede">
            {t("intro", {
              customerName: approval.customerName,
              shopName: approval.shop.name,
            })}
          </p>
        </header>

        <section className="surface overflow-hidden">
          <div className="border-b border-[#dce5e3] bg-[#f1f7f5] p-5 sm:p-7">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#087f78]">
              {approval.vehicle}
            </p>
            <h2 className="mt-2 text-xl font-bold text-[#173744]">
              {approval.description}
            </h2>
          </div>
          <div className="space-y-6 p-5 sm:p-7">
            <p className="leading-7 text-[#405861]">
              {approval.customerExplanation}
            </p>

            <div className="rounded-xl border border-[#dce5e3] bg-[#fbfdfc]">
              {approval.lineItems.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between gap-4 border-b border-[#e6ecea] px-4 py-3 last:border-b-0"
                >
                  <span className="text-sm font-medium text-[#405861]">
                    {item.name}
                  </span>
                  <strong className="text-[#173744]">
                    {formatCurrency(item.amount, approval.shop)}
                  </strong>
                </div>
              ))}
              <div className="flex items-center justify-between gap-4 bg-[#f1f7f5] px-4 py-4">
                <span className="font-bold text-[#29434d]">{t("additionalTotal")}</span>
                <strong className="text-xl text-[#087f78]">
                  {formatCurrency(approval.amount, approval.shop)}
                </strong>
              </div>
            </div>

            <p className="text-xs leading-5 text-[#718187]">
              {t("expires", {
                date: formatDateTime(approval.expiresAt, approval.shop),
              })}
            </p>

            {actionable ? (
              <ApprovalDecision token={approval.token} />
            ) : (
              <div role="status" className="rounded-xl bg-[#f4f7f6] p-5">
                <h2 className="font-bold text-[#173744]">
                  {t("expiredTitle")}
                </h2>
                <p className="mt-1 text-sm leading-6 text-[#60727a]">
                  {t("expiredHint")}
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
