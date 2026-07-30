"use client";

import {useState} from "react";
import {useTranslations} from "next-intl";
import {useRouter} from "@/i18n/navigation";
import {formatCurrency, getShopToday} from "@/lib/formatting";
import type {ShopConfig} from "@/lib/shop-config";

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

    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
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

      if (!res.ok) throw new Error();

      router.push("/track");
    } catch {
      setError(t("requestError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {prefill.probableIssue && (
        <div className="border border-black/10 rounded p-4 text-sm bg-zinc-50">
          <div className="font-medium mb-1">{prefill.probableIssue}</div>
          {selectedService && (
            <div className="text-zinc-600">
              {formatCurrency(selectedService.price_min, shop)}–
              {formatCurrency(selectedService.price_max, shop)} (
              {common("initialEstimateDisclaimer")})
            </div>
          )}
        </div>
      )}

      <label className="text-sm flex flex-col gap-1">
        {t("name")}
        <input
          className="border border-black/20 rounded px-3 py-2"
          value={customerName}
          onChange={(event) => setCustomerName(event.target.value)}
        />
      </label>

      <label className="text-sm flex flex-col gap-1">
        {t("plateNumber")}
        <input
          className="border border-black/20 rounded px-3 py-2"
          value={plateNumber}
          onChange={(event) => setPlateNumber(event.target.value)}
        />
      </label>

      <label className="text-sm flex flex-col gap-1">
        {t("phone")}
        <input
          className="border border-black/20 rounded px-3 py-2"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
      </label>

      <label className="text-sm flex flex-col gap-1">
        {t("email")}
        <input
          type="email"
          className="border border-black/20 rounded px-3 py-2"
          placeholder={t("emailPlaceholder")}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>

      <label className="text-sm flex flex-col gap-1">
        {t("vehicle")}
        <input
          className="border border-black/20 rounded px-3 py-2"
          placeholder={t("vehiclePlaceholder")}
          value={vehicle}
          onChange={(event) => setVehicle(event.target.value)}
        />
      </label>

      <label className="text-sm flex flex-col gap-1">
        {t("service")}
        <select
          className="border border-black/20 rounded px-3 py-2"
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

      <label className="text-sm flex flex-col gap-1">
        {t("issueDescription")}
        <textarea
          className="border border-black/20 rounded px-3 py-2 min-h-20"
          value={issueDescription}
          onChange={(event) => setIssueDescription(event.target.value)}
        />
      </label>

      <div className="flex gap-3">
        <label className="text-sm flex flex-col gap-1 flex-1">
          {t("date")}
          <input
            type="date"
            min={today}
            className="border border-black/20 rounded px-3 py-2"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>

        <label className="text-sm flex flex-col gap-1 flex-1">
          {t("time")}
          <select
            className="border border-black/20 rounded px-3 py-2"
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

      <button
        type="submit"
        disabled={loading}
        className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-50"
      >
        {loading ? t("booking") : t("bookNow")}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
