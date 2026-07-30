import {getTranslations} from "next-intl/server";
import {isAdminAuthed} from "@/lib/admin/auth";
import {getActiveShop} from "@/lib/shop-config";
import {supabaseService} from "@/lib/supabase/server";
import AdminBoard, {type Message} from "./AdminBoard";
import PasscodeForm from "./PasscodeForm";

export default async function AdminPage() {
  const t = await getTranslations("Admin");
  const authed = await isAdminAuthed();

  if (!authed) {
    return (
      <div className="px-6 py-12 max-w-sm">
        <h1 className="text-2xl font-semibold mb-4">{t("loginTitle")}</h1>
        <PasscodeForm />
      </div>
    );
  }

  const shop = await getActiveShop(supabaseService);
  const {data: shops, error: shopsError} = await supabaseService
    .from("autoshop_shops")
    .select("shop_key, name, country, currency, is_active")
    .order("shop_key", {ascending: false});
  if (shopsError) {
    return <div className="px-6 py-12">{t("shopsLoadError")}</div>;
  }
  const {data: jobs, error: jobsError} = await supabaseService
    .from("autoshop_jobs")
    .select("*")
    .eq("shop_id", shop.id)
    .order("created_at", {ascending: false});

  if (jobsError) {
    return <div className="px-6 py-12">{t("jobsLoadError")}</div>;
  }

  const jobIds = (jobs ?? []).map((job) => job.id);
  let messages: Message[] = [];
  let messagesError: {message: string} | null = null;

  if (jobIds.length > 0) {
    const result = await supabaseService
      .from("autoshop_messages")
      .select("*")
      .in("job_id", jobIds)
      .order("created_at", {ascending: false});
    messages = (result.data ?? []) as Message[];
    messagesError = result.error;
  }

  const messageIds = messages.map((message) => message.id);
  if (messageIds.length > 0) {
    const {data: deliveries, error: deliveryError} = await supabaseService
      .from("autoshop_email_deliveries")
      .select("message_id, status")
      .in("message_id", messageIds);
    if (deliveryError) {
      return <div className="px-6 py-12">{t("messagesLoadError")}</div>;
    }
    const statusByMessage = new Map(
      (deliveries ?? []).map((delivery) => [delivery.message_id, delivery.status])
    );
    messages = messages.map((message) => ({
      ...message,
      delivery_status: statusByMessage.get(message.id),
    }));
  }

  if (messagesError) {
    return <div className="px-6 py-12">{t("messagesLoadError")}</div>;
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-2xl font-semibold mb-6">
        {t("boardTitle", {shopName: shop.name})}
      </h1>
      <AdminBoard
        jobs={jobs ?? []}
        messages={messages}
        activeShopKey={shop.shop_key}
        shops={shops ?? []}
      />
    </div>
  );
}
