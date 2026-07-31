import {getTranslations} from "next-intl/server";
import {isAdminAuthed} from "@/lib/admin/auth";
import {getActiveShop} from "@/lib/shop-config";
import {supabaseService} from "@/lib/supabase/server";
import AdminBoard, {type Message} from "./AdminBoard";
import PasscodeForm from "./PasscodeForm";
import {LockIcon} from "../components/Icons";
import {formatCurrency} from "@/lib/formatting";
import {intakePhotoBucket} from "@/lib/photos/server";
import AdminSectionNav from "./AdminSectionNav";

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

  const {data: technicians, error: techniciansError} = await supabaseService
    .from("autoshop_technicians")
    .select("id, name")
    .eq("shop_id", shop.id)
    .eq("is_active", true)
    .order("name");
  if (techniciansError) {
    return (
      <div className="page-shell status-message">
        {t("techniciansLoadError")}
      </div>
    );
  }

  const {data: serviceRows, error: servicesError} = await supabaseService
    .from("autoshop_services")
    .select("id, name, price_min, price_max")
    .eq("shop_id", shop.id)
    .order("name");
  if (servicesError) {
    return <div className="page-shell status-message">{t("servicesLoadError")}</div>;
  }
  const services = (serviceRows ?? []).map((service) => ({
    ...service,
    priceLabel: `${formatCurrency(service.price_min, shop)}–${formatCurrency(
      service.price_max,
      shop
    )}`,
  }));

  const jobIds = (jobs ?? []).map((job) => job.id);
  let messages: Message[] = [];
  let messagesError: {message: string} | null = null;
  let approvals: Array<{
    id: string;
    job_id: string;
    description: string;
    amount: number;
    status: "pending" | "approved" | "declined" | "expired";
    expires_at: string;
  }> = [];
  let jobPhotos: Array<{
    id: string;
    job_id: string;
    signedUrl: string;
  }> = [];

  if (jobIds.length > 0) {
    const result = await supabaseService
      .from("autoshop_messages")
      .select("*")
      .in("job_id", jobIds)
      .order("created_at", {ascending: false});
    messages = (result.data ?? []) as Message[];
    messagesError = result.error;
    const approvalResult = await supabaseService
      .from("autoshop_approval_requests")
      .select("id, job_id, description, amount, status, expires_at")
      .in("job_id", jobIds)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", {ascending: false});
    if (approvalResult.error) {
      return <div className="page-shell status-message">{t("approvalsLoadError")}</div>;
    }
    approvals = approvalResult.data ?? [];
    const photoResult = await supabaseService
      .from("autoshop_intake_photos")
      .select("id, job_id, storage_path")
      .in("job_id", jobIds)
      .eq("status", "ready")
      .order("created_at");
    if (photoResult.error) {
      return <div className="page-shell status-message">{t("photosLoadError")}</div>;
    }
    const photoRows = photoResult.data ?? [];
    if (photoRows.length > 0) {
      const {data: signedPhotos, error: signedPhotoError} =
        await supabaseService.storage
          .from(intakePhotoBucket())
          .createSignedUrls(
            photoRows.map((photo) => photo.storage_path),
            5 * 60
          );
      if (signedPhotoError || !signedPhotos) {
        return <div className="page-shell status-message">{t("photosLoadError")}</div>;
      }
      const urlByPath = new Map(
        signedPhotos.map((photo) => [photo.path, photo.signedUrl])
      );
      jobPhotos = photoRows.flatMap((photo) => {
        const signedUrl = urlByPath.get(photo.storage_path);
        return signedUrl
          ? [{id: photo.id, job_id: photo.job_id, signedUrl}]
          : [];
      });
    }
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
      <AdminSectionNav
        active="board"
        boardLabel={t("navBoard")}
        dashboardLabel={t("navDashboard")}
      />
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
        technicians={technicians ?? []}
        services={services}
        approvals={approvals}
        jobPhotos={jobPhotos}
      />
    </div>
  );
}
