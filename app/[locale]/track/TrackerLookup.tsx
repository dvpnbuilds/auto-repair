"use client";

import {useState} from "react";
import {useTranslations} from "next-intl";
import {formatDateTime, type RegionalConfig} from "@/lib/formatting";
import {CarIcon, CheckIcon, ClockIcon, SearchIcon, ShieldIcon} from "../components/Icons";

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
    <div className="grid gap-6 lg:grid-cols-[21rem_1fr] lg:items-start">
      <div className="surface p-5 sm:p-7">
        <span className="grid size-11 place-items-center rounded-xl bg-[#dff2ee] text-[#087f78]">
          <SearchIcon className="size-5" />
        </span>
        <h2 className="mt-5 text-lg font-bold text-[#173744]">{t("lookupTitle")}</h2>
        <p className="mt-2 text-sm leading-6 text-[#60727a]">{t("lookupHint")}</p>
        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
          <label className="field-label">
            {t("plateNumber")}
            <input
              name="plate"
              autoComplete="off"
              maxLength={20}
              required
              value={plate}
              onChange={(event) => setPlate(event.target.value)}
              className="field-control"
            />
          </label>
          <label className="field-label">
            {t("phone")}
            <input
              name="phone"
              type="tel"
              autoComplete="tel"
              maxLength={24}
              required
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="field-control"
            />
          </label>
          <button type="submit" disabled={loading} className="button-primary w-full">
            <SearchIcon className="size-4" />
            {loading ? t("tracking") : t("track")}
          </button>
        </form>

        <div aria-live="polite">
          {error && <p className="status-message mt-5">{error}</p>}
          {result && !result.job && <p className="status-message mt-5">{t("notFound")}</p>}
        </div>
        <p className="mt-5 flex items-center gap-2 text-xs leading-5 text-[#718187]">
          <ShieldIcon className="size-4 shrink-0 text-[#087f78]" />
          {t("privacyHint")}
        </p>
      </div>

      {result?.job ? (
        <div className="surface overflow-hidden">
          <div className="flex flex-col gap-5 border-b border-[#dce5e3] bg-[#edf7f5] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div className="flex items-center gap-4">
              <span className="grid size-12 place-items-center rounded-2xl bg-white text-[#087f78] shadow-sm">
                <CarIcon className="size-6" />
              </span>
              <div>
                <h2 className="text-xl font-bold tracking-[-0.025em] text-[#173744]">
                  {result.job.vehicle}
                </h2>
                <p className="mt-1 text-sm text-[#60727a]">{result.job.plate_number}</p>
              </div>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#b8ddd6] bg-white px-3 py-2 text-xs font-bold text-[#087f78]">
              <span className="size-2 rounded-full bg-[#55ad73]" />
              {common(`status.${result.job.status}`)}
            </span>
          </div>

          <div className="p-6 sm:p-8">
            {result.job.scheduled_at && (
              <div className="mb-8 flex items-center gap-3 rounded-xl bg-[#f5f1e9] p-4">
                <ClockIcon className="size-5 shrink-0 text-[#8b6a42]" />
                <div>
                  <div className="text-xs font-semibold text-[#78674f]">{t("scheduledAt")}</div>
                  <div className="mt-0.5 text-sm font-bold text-[#3d4d53]">
                    {formatDateTime(result.job.scheduled_at, regional)}
                  </div>
                </div>
              </div>
            )}

            <h3 className="text-sm font-bold text-[#173744]">{t("statusTimeline")}</h3>
            <ul className="mt-5 space-y-0">
              {result.history.map((entry, index) => (
                <li key={`${entry.status}-${entry.created_at}`} className="relative flex gap-4 pb-7 last:pb-0">
                  {index < result.history.length - 1 && (
                    <span className="absolute left-[0.68rem] top-6 h-[calc(100%-0.5rem)] w-px bg-[#c8dcd8]" />
                  )}
                  <span className="z-10 mt-0.5 grid size-[1.4rem] shrink-0 place-items-center rounded-full bg-[#dff2ee] text-[#087f78]">
                    <CheckIcon className="size-3" />
                  </span>
                  <div>
                    <div className="text-sm font-bold text-[#29434d]">
                      {common(`status.${entry.status}`)}
                    </div>
                    <div className="mt-0.5 text-xs text-[#718187]">
                      {formatDateTime(entry.created_at, regional)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="surface-flat hidden min-h-80 place-items-center p-8 text-center lg:grid">
          <div className="max-w-xs">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#edf5f3] text-[#75a69f]">
              <CarIcon className="size-7" />
            </span>
            <h2 className="mt-5 font-bold text-[#173744]">{t("emptyTitle")}</h2>
            <p className="mt-2 text-sm leading-6 text-[#718187]">{t("emptyHint")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
