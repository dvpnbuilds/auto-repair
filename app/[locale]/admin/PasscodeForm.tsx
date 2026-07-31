"use client";

import {useState} from "react";
import {useTranslations} from "next-intl";
import {useRouter} from "@/i18n/navigation";

export default function PasscodeForm() {
  const t = useTranslations("Admin");
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({passcode}),
    });

    setSubmitting(false);

    if (!res.ok) {
      setError(t("incorrectPasscode"));
      return;
    }

    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <label className="field-label">
        {t("passcode")}
        <input
          required
          type="password"
          autoComplete="current-password"
          value={passcode}
          onChange={(event) => setPasscode(event.target.value)}
          className="field-control"
        />
      </label>
      {error && <p className="status-message">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="button-primary w-full"
      >
        {submitting ? t("checking") : t("logIn")}
      </button>
    </form>
  );
}
