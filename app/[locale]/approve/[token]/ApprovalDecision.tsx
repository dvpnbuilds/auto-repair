"use client";

import {useState} from "react";
import {useTranslations} from "next-intl";

type Decision = "approved" | "declined";

export default function ApprovalDecision({token}: {token: string}) {
  const t = useTranslations("Approval");
  const [busy, setBusy] = useState<Decision | null>(null);
  const [result, setResult] = useState<Decision | "error" | null>(null);
  const [error, setError] = useState("");

  async function decide(decision: Decision) {
    setBusy(decision);
    setError("");
    try {
      const response = await fetch(`/api/approvals/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({decision}),
      });
      const data = await response.json();
      if (!response.ok) {
        setResult("error");
        setError(data.error || t("decisionError"));
        return;
      }
      setResult(decision);
    } catch {
      setResult("error");
      setError(t("decisionError"));
    } finally {
      setBusy(null);
    }
  }

  if (result === "approved" || result === "declined") {
    return (
      <div
        role="status"
        className={`rounded-xl border p-5 ${
          result === "approved"
            ? "border-[#b8ddc2] bg-[#eef8f0] text-[#28633a]"
            : "border-[#e3d4bc] bg-[#fbf6ed] text-[#72532b]"
        }`}
      >
        <h2 className="font-bold">
          {result === "approved" ? t("approvedTitle") : t("declinedTitle")}
        </h2>
        <p className="mt-1 text-sm leading-6">
          {result === "approved" ? t("approvedHint") : t("declinedHint")}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => decide("approved")}
          disabled={busy !== null}
          className="button-primary min-h-12"
        >
          {busy === "approved" ? t("recording") : t("approve")}
        </button>
        <button
          type="button"
          onClick={() => decide("declined")}
          disabled={busy !== null}
          className="button-secondary min-h-12 !border-[#ddc7c3] !text-[#8a4038]"
        >
          {busy === "declined" ? t("recording") : t("decline")}
        </button>
      </div>
      {result === "error" && (
        <p role="alert" className="status-message mt-4">
          {error}
        </p>
      )}
    </div>
  );
}
