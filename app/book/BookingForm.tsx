"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
  estimateMin: string;
  estimateMax: string;
};

const TIME_SLOTS = ["09:00", "11:00", "13:00", "15:00", "17:00"];

function formatPeso(amount: number) {
  return `₱${amount.toLocaleString("en-PH")}`;
}

export default function BookingForm({
  services,
  prefill,
}: {
  services: Service[];
  prefill: Prefill;
}) {
  const router = useRouter();
  const matchedService = services.find((s) => s.name === prefill.serviceName);

  const [customerName, setCustomerName] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [serviceId, setServiceId] = useState(matchedService?.id ?? "");
  const [issueDescription, setIssueDescription] = useState(prefill.issueDescription);
  const [date, setDate] = useState("");
  const [time, setTime] = useState(TIME_SLOTS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerName.trim() || !plateNumber.trim() || !phone.trim() || !vehicle.trim() || !date) {
      setError("Please fill in all required fields.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: customerName,
          plate_number: plateNumber,
          phone,
          vehicle,
          service_id: serviceId || null,
          issue_description: issueDescription || null,
          probable_issue: prefill.probableIssue || null,
          urgency: prefill.urgency || null,
          estimate_min: prefill.estimateMin ? Number(prefill.estimateMin) : null,
          estimate_max: prefill.estimateMax ? Number(prefill.estimateMax) : null,
          scheduled_at: `${date}T${time}:00+08:00`,
        }),
      });

      if (!res.ok) throw new Error("Booking failed");

      router.push(
        `/track?plate=${encodeURIComponent(plateNumber)}&phone=${encodeURIComponent(phone)}`
      );
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {prefill.probableIssue && (
        <div className="border border-black/10 rounded p-4 text-sm bg-zinc-50">
          <div className="font-medium mb-1">{prefill.probableIssue}</div>
          {prefill.estimateMin && prefill.estimateMax && (
            <div className="text-zinc-600">
              {formatPeso(Number(prefill.estimateMin))}–{formatPeso(Number(prefill.estimateMax))}{" "}
              (initial estimate, subject to inspection)
            </div>
          )}
        </div>
      )}

      <label className="text-sm flex flex-col gap-1">
        Name
        <input
          className="border border-black/20 rounded px-3 py-2"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
        />
      </label>

      <label className="text-sm flex flex-col gap-1">
        Plate number
        <input
          className="border border-black/20 rounded px-3 py-2"
          value={plateNumber}
          onChange={(e) => setPlateNumber(e.target.value)}
        />
      </label>

      <label className="text-sm flex flex-col gap-1">
        Phone
        <input
          className="border border-black/20 rounded px-3 py-2"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </label>

      <label className="text-sm flex flex-col gap-1">
        Vehicle
        <input
          className="border border-black/20 rounded px-3 py-2"
          placeholder="Hal. 2018 Honda City"
          value={vehicle}
          onChange={(e) => setVehicle(e.target.value)}
        />
      </label>

      <label className="text-sm flex flex-col gap-1">
        Service
        <select
          className="border border-black/20 rounded px-3 py-2"
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
        >
          <option value="">Select a service</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({formatPeso(s.price_min)}–{formatPeso(s.price_max)})
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm flex flex-col gap-1">
        Issue description
        <textarea
          className="border border-black/20 rounded px-3 py-2 min-h-20"
          value={issueDescription}
          onChange={(e) => setIssueDescription(e.target.value)}
        />
      </label>

      <div className="flex gap-3">
        <label className="text-sm flex flex-col gap-1 flex-1">
          Date
          <input
            type="date"
            min={today}
            className="border border-black/20 rounded px-3 py-2"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>

        <label className="text-sm flex flex-col gap-1 flex-1">
          Time
          <select
            className="border border-black/20 rounded px-3 py-2"
            value={time}
            onChange={(e) => setTime(e.target.value)}
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
        {loading ? "Booking..." : "Book now"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
