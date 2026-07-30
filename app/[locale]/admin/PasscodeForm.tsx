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
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="text-sm flex flex-col gap-1">
        {t("passcode")}
        <input
          type="password"
          value={passcode}
          onChange={(event) => setPasscode(event.target.value)}
          className="border border-black/20 rounded px-3 py-2"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="bg-black text-white rounded px-4 py-2 text-sm w-fit disabled:opacity-50"
      >
        {submitting ? t("checking") : t("logIn")}
      </button>
    </form>
  );
}
