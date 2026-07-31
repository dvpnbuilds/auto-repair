"use client";

import {useRef, useState} from "react";
import {useTranslations} from "next-intl";
import {useRouter} from "@/i18n/navigation";
import {formatCurrency, getShopToday} from "@/lib/formatting";
import type {ShopConfig} from "@/lib/shop-config";
import {ArrowRightIcon, CalendarIcon, CheckIcon} from "../components/Icons";

type Service = {
  id: string;
  name: string;
  category: string;
  price_min: number;
  price_max: number;
  duration_minutes: number;
};

type Prefill = {
  serviceName: string;
  probableIssue: string;
  issueDescription: string;
  urgency: string;
};

const TIME_SLOTS = ["09:00", "11:00", "13:00", "15:00", "17:00"];

export default function BookingForm({
  services,
  prefill,
  shop,
}: {
  services: Service[];
  prefill: Prefill;
  shop: ShopConfig;
}) {
  const t = useTranslations("Booking");
  const common = useTranslations("Common");
  const router = useRouter();
  const matchedService = services.find((service) => service.name === prefill.serviceName);

  const [customerName, setCustomerName] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [serviceId, setServiceId] = useState(matchedService?.id ?? "");
  const [issueDescription, setIssueDescription] = useState(prefill.issueDescription);
  const [date, setDate] = useState("");
  const [time, setTime] = useState(TIME_SLOTS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  const today = getShopToday(shop);
  const selectedService = services.find((service) => service.id === serviceId);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (
      !customerName.trim() ||
      !plateNumber.trim() ||
      !phone.trim() ||
      !email.trim() ||
      !vehicle.trim() ||
      !date
    ) {
      setError(t("requiredError"));
      return;
    }

    setLoading(true);
    setError(null);
    idempotencyKey.current ??= crypto.randomUUID();

    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          idempotency_key: idempotencyKey.current,
          shop_id: shop.id,
          customer_name: customerName,
          plate_number: plateNumber,
          phone,
          customer_email: email,
          vehicle,
          service_id: serviceId || null,
          issue_description: issueDescription || null,
          probable_issue: prefill.probableIssue || null,
          urgency: prefill.urgency || null,
          scheduled_date: date,
          scheduled_time: time,
        }),
      });

      if (!res.ok) {
        const response = (await res.json().catch(() => null)) as
          | {error?: string}
          | null;
        if (response?.error === "SLOT_UNAVAILABLE") {
          setError(t("slotUnavailable"));
          return;
        }
        if (response?.error === "STALE_SHOP") {
          setError(t("shopChanged"));
          return;
        }
        throw new Error();
      }
      router.push("/track");
    } catch {
      setError(t("requestError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1fr_19rem] lg:items-start">
      <div className="surface overflow-hidden">
        {prefill.probableIssue && (
          <div className="flex gap-3 border-b border-[#cfe3df] bg-[#edf7f5] px-5 py-4 sm:px-7">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-[#087f78]">
              <CheckIcon className="size-4" />
            </span>
            <div className="text-sm">
              <div className="font-bold text-[#173744]">{prefill.probableIssue}</div>
              {selectedService && (
                <div className="mt-1 leading-6 text-[#60727a]">
                  {formatCurrency(selectedService.price_min, shop)}–{" "}
                  {formatCurrency(selectedService.price_max, shop)} ·{" "}
                  {common("initialEstimateDisclaimer")}
                </div>
              )}
            </div>
          </div>
        )}

        <section className="border-b border-[#e3eae8] p-5 sm:p-7">
          <div className="mb-6 flex items-center gap-3">
            <span className="section-number">1</span>
            <div>
              <h2 className="font-bold text-[#173744]">{t("contactTitle")}</h2>
              <p className="mt-0.5 text-xs text-[#718187]">{t("contactHint")}</p>
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="field-label sm:col-span-2">
              {t("name")}
              <input
                required
                autoComplete="name"
                className="field-control"
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
              />
            </label>
            <label className="field-label">
              {t("phone")}
              <input
                required
                type="tel"
                autoComplete="tel"
                className="field-control"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </label>
            <label className="field-label">
              {t("email")}
              <input
                required
                type="email"
                autoComplete="email"
                className="field-control"
                placeholder={t("emailPlaceholder")}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
          </div>
        </section>

        <section className="border-b border-[#e3eae8] p-5 sm:p-7">
          <div className="mb-6 flex items-center gap-3">
            <span className="section-number">2</span>
            <div>
              <h2 className="font-bold text-[#173744]">{t("vehicleTitle")}</h2>
              <p className="mt-0.5 text-xs text-[#718187]">{t("vehicleHint")}</p>
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="field-label">
              {t("vehicle")}
              <input
                required
                className="field-control"
                placeholder={t("vehiclePlaceholder")}
                value={vehicle}
                onChange={(event) => setVehicle(event.target.value)}
              />
            </label>
            <label className="field-label">
              {t("plateNumber")}
              <input
                required
                autoComplete="off"
                className="field-control"
                value={plateNumber}
                onChange={(event) => setPlateNumber(event.target.value)}
              />
            </label>
            <label className="field-label sm:col-span-2">
              {t("service")}
              <select
                className="field-control"
                value={serviceId}
                onChange={(event) => setServiceId(event.target.value)}
              >
                <option value="">{t("selectService")}</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name} ({formatCurrency(service.price_min, shop)}–
                    {formatCurrency(service.price_max, shop)})
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label sm:col-span-2">
              {t("issueDescription")}
              <textarea
                className="field-control min-h-28 resize-y"
                placeholder={t("issuePlaceholder")}
                value={issueDescription}
                onChange={(event) => setIssueDescription(event.target.value)}
              />
            </label>
          </div>
        </section>

        <section className="p-5 sm:p-7">
          <div className="mb-6 flex items-center gap-3">
            <span className="section-number">3</span>
            <div>
              <h2 className="font-bold text-[#173744]">{t("appointmentTitle")}</h2>
              <p className="mt-0.5 text-xs text-[#718187]">{t("appointmentHint")}</p>
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="field-label">
              {t("date")}
              <input
                required
                type="date"
                min={today}
                className="field-control"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
            <label className="field-label">
              {t("time")}
              <select
                className="field-control"
                value={time}
                onChange={(event) => setTime(event.target.value)}
              >
                {TIME_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
      </div>

      <aside className="surface-flat p-5 lg:sticky lg:top-28">
        <span className="grid size-11 place-items-center rounded-xl bg-[#dff2ee] text-[#087f78]">
          <CalendarIcon className="size-5" />
        </span>
        <h2 className="mt-5 text-lg font-bold text-[#173744]">{t("summaryTitle")}</h2>
        <p className="mt-2 text-sm leading-6 text-[#60727a]">{t("summaryHint")}</p>
        {selectedService && (
          <div className="mt-5 rounded-xl bg-[#f4f7f6] p-4">
            <p className="text-sm font-bold text-[#173744]">{selectedService.name}</p>
            <p className="mt-1 text-xs leading-5 text-[#60727a]">
              {formatCurrency(selectedService.price_min, shop)}–{" "}
              {formatCurrency(selectedService.price_max, shop)}
            </p>
          </div>
        )}
        {error && (
          <p role="alert" className="status-message mt-5">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="button-primary mt-6 w-full"
        >
          {loading ? t("booking") : t("bookNow")}
          {!loading && <ArrowRightIcon className="size-4" />}
        </button>
        <p className="mt-3 text-center text-xs leading-5 text-[#718187]">
          {t("confirmationHint")}
        </p>
      </aside>
    </form>
  );
}
