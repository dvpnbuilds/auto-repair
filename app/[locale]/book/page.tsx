import {getTranslations} from "next-intl/server";
import {getActiveShop} from "@/lib/shop-config";
import {supabaseAnon} from "@/lib/supabase/client";
import BookingForm from "./BookingForm";

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{[key: string]: string | string[] | undefined}>;
}) {
  const t = await getTranslations("Booking");
  const params = await searchParams;
  const shop = await getActiveShop();
  const {data: services, error} = await supabaseAnon
    .from("autoshop_services")
    .select("*")
    .eq("shop_id", shop.id)
    .order("category");

  if (error) {
    return <div className="page-shell status-message">{t("loadError")}</div>;
  }

  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  const prefill = {
    serviceName: first(params.service_name) ?? "",
    probableIssue: first(params.probable_issue) ?? "",
    issueDescription: first(params.issue_description) ?? "",
    urgency: first(params.urgency) ?? "",
  };

  return (
    <div className="page-shell">
      <header className="mb-10 max-w-3xl">
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1 className="page-title-compact">{t("title")}</h1>
        <p className="page-lede">{t("intro")}</p>
      </header>
      <BookingForm services={services ?? []} prefill={prefill} shop={shop} />
    </div>
  );
}
