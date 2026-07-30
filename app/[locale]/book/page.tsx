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
    return <div className="px-6 py-12">{t("loadError")}</div>;
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
    <div className="px-6 py-12 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">{t("title")}</h1>
      <BookingForm services={services ?? []} prefill={prefill} shop={shop} />
    </div>
  );
}
