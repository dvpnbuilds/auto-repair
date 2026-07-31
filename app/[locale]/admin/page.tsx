import {getTranslations} from "next-intl/server";
import {isAdminAuthed} from "@/lib/admin/auth";
import {getActiveShop} from "@/lib/shop-config";
import {supabaseService} from "@/lib/supabase/server";
import AdminBoard, {type Message} from "./AdminBoard";
import PasscodeForm from "./PasscodeForm";
import {LockIcon} from "../components/Icons";

export default async function AdminPage() {
  const t = await getTranslations("Admin");
  const authed = await isAdminAuthed();

  if (!authed) {
    return (
      <div className="page-shell">
        <div className="surface mx-auto max-w-md p-6 sm:p-8">
          <span className="grid size-12 place-items-center rounded-2xl bg-[#dff2ee] text-[#087f78]">
            <LockIcon className="size-5" />
          </span>
          <p className="eyebrow mt-6">{t("loginEyebrow")}</p>
          <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[#173744]">
            {t("loginTitle")}
          </h1>
          <p className="mb-7 mt-3 text-sm leading-6 text-[#60727a]">{t("loginHint")}</p>
          <PasscodeForm />
        </div>
      </div>
    );
  }

  const shop = await getActiveShop(supabaseService);
  const {data: shops, error: shopsError} = await supabaseService
    .from("autoshop_shops")
    .select("shop_key, name, country, currency, is_active")
    .order("shop_key", {ascending: false});
  if (shopsError) {
    return <div className="page-shell status-message">{t("shopsLoadError")}</div>;
  }
  const {data: jobs, error: jobsError} = await supabaseService
    .from("autoshop_jobs")
    .select("*")
    .eq("shop_id", shop.id)
    .order("created_at", {ascending: false});

  if (jobsError) {
    return <div className="page-shell status-message">{t("jobsLoadError")}</div>;
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
      return <div className="page-shell status-message">{t("messagesLoadError")}</div>;
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
    return <div className="page-shell status-message">{t("messagesLoadError")}</div>;
  }

  return (
    <div className="page-shell-wide">
      <header className="mb-8">
        <p className="eyebrow">{t("boardEyebrow")}</p>
        <h1 className="page-title-compact">{t("boardTitle", {shopName: shop.name})}</h1>
        <p className="page-lede">{t("boardHint")}</p>
      </header>
      <AdminBoard
        jobs={jobs ?? []}
        messages={messages}
        activeShopKey={shop.shop_key}
        shops={shops ?? []}
      />
    </div>
  );
}
