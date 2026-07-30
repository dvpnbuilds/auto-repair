"use client";

import {useState} from "react";
import {useTranslations} from "next-intl";
import {formatDateTime, type RegionalConfig} from "@/lib/formatting";

type TrackerJob = {
  vehicle: string;
  plate_number: string;
  status: string;
  scheduled_at: string | null;
};

type TrackerHistory = {
  status: string;
  created_at: string;
};

type TrackerResult = {
  job: TrackerJob | null;
  history: TrackerHistory[];
};

export default function TrackerLookup({regional}: {regional: RegionalConfig}) {
  const t = useTranslations("Tracking");
  const common = useTranslations("Common");
  const [plate, setPlate] = useState("");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<TrackerResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/track", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({plate, phone}),
      });

      if (response.status === 429) {
        setError(t("rateLimited"));
        return;
      }
      if (!response.ok) {
        setError(t("lookupError"));
        return;
      }

      setResult((await response.json()) as TrackerResult);
    } catch {
      setError(t("lookupError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 mb-8">
        <label className="text-sm flex flex-col gap-1">
          {t("plateNumber")}
          <input
            name="plate"
            autoComplete="off"
            maxLength={20}
            required
            value={plate}
            onChange={(event) => setPlate(event.target.value)}
            className="border border-black/20 rounded px-3 py-2"
          />
        </label>
        <label className="text-sm flex flex-col gap-1">
          {t("phone")}
          <input
            name="phone"
            type="tel"
            autoComplete="tel"
            maxLength={24}
            required
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="border border-black/20 rounded px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="bg-black text-white rounded px-4 py-2 text-sm w-fit disabled:opacity-50"
        >
          {loading ? t("tracking") : t("track")}
        </button>
      </form>

      <div aria-live="polite">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {result && !result.job && (
          <p className="text-sm text-red-600">{t("notFound")}</p>
        )}
      </div>

      {result?.job && (
        <div className="border border-black/10 rounded p-6">
          <div className="flex justify-between gap-4 mb-4">
            <div>
              <div className="font-medium">{result.job.vehicle}</div>
              <div className="text-sm text-zinc-600">
                {result.job.plate_number}
              </div>
            </div>
            <span className="text-sm px-2 py-0.5 rounded bg-black/5 h-fit">
              {common(`status.${result.job.status}`)}
            </span>
          </div>

          {result.job.scheduled_at && (
            <div className="text-sm mb-4">
              <div className="text-zinc-600">{t("scheduledAt")}</div>
              <div>{formatDateTime(result.job.scheduled_at, regional)}</div>
            </div>
          )}

          <div className="text-sm text-zinc-600 mb-2">
            {t("statusTimeline")}
          </div>
          <ul className="space-y-2">
            {result.history.map((entry) => (
              <li
                key={`${entry.status}-${entry.created_at}`}
                className="text-sm border-l-2 border-black/10 pl-3"
              >
                <div className="font-medium">
                  {common(`status.${entry.status}`)}
                </div>
                <div className="text-zinc-600">
                  {formatDateTime(entry.created_at, regional)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
