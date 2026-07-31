"use client";

import {useEffect, useRef, useState} from "react";
import {useTranslations} from "next-intl";
import {Link} from "@/i18n/navigation";
import {formatCurrency} from "@/lib/formatting";
import type {ShopConfig} from "@/lib/shop-config";
import {
  ArrowRightIcon,
  CheckIcon,
  MessageIcon,
  PhotoIcon,
  SearchIcon,
  TrashIcon,
  WrenchIcon,
} from "../components/Icons";

type ChatMessage = {role: "user" | "assistant"; content: string};

type TriageDone = {
  status: "done";
  probable_issue: string;
  urgency: "low" | "medium" | "high";
  service_name: string | null;
  estimate_min: number | null;
  estimate_max: number | null;
  needs_inspection: boolean;
  disclaimer: string;
  visual_findings?: string[];
  vision_used?: boolean;
  vision_attempted?: boolean;
};

type UploadedPhoto = {
  id: string;
  name: string;
  previewUrl: string;
  deleteToken?: string;
  status: "uploading" | "ready";
};

const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const INTAKE_TRANSFER_KEY = "autoshop-intake-photo-transfer";

export default function IntakeForm({shop}: {shop: ShopConfig}) {
  const t = useTranslations("Intake");
  const common = useTranslations("Common");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TriageDone | null>(null);
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const intakeToken = useRef<string | null>(null);
  const intakeSessionId = useRef<string | null>(null);
  const previewUrls = useRef(new Set<string>());
  const examples = [t("exampleNoise"), t("exampleWarning"), t("exampleStart")];
  const readyPhotos = photos.filter((photo) => photo.status === "ready");
  const photosUploading = photos.some((photo) => photo.status === "uploading");

  useEffect(() => {
    sessionStorage.removeItem(INTAKE_TRANSFER_KEY);
    const createdPreviewUrls = previewUrls.current;
    return () => {
      for (const previewUrl of createdPreviewUrls) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, []);

  async function uploadPhotos(files: FileList | null) {
    if (!files?.length) return;
    setPhotoError(null);
    const selected = Array.from(files);
    if (photos.length + selected.length > MAX_PHOTOS) {
      setPhotoError(t("photoLimitError"));
      return;
    }
    if (
      selected.some(
        (file) =>
          !ALLOWED_PHOTO_TYPES.includes(file.type) ||
          file.size < 1 ||
          file.size > MAX_PHOTO_BYTES
      )
    ) {
      setPhotoError(t("photoTypeSizeError"));
      return;
    }

    if (!intakeToken.current) {
      try {
        const sessionResponse = await fetch("/api/triage/photo-session", {
          method: "POST",
        });
        if (!sessionResponse.ok) throw new Error();
        const session = (await sessionResponse.json()) as {token?: unknown};
        if (typeof session.token !== "string") throw new Error();
        intakeToken.current = session.token;
      } catch {
        setPhotoError(t("photoUploadError"));
        return;
      }
    }
    for (const file of selected) {
      const id = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(file);
      previewUrls.current.add(previewUrl);
      const pending: UploadedPhoto = {
        id,
        name: file.name,
        previewUrl,
        status: "uploading",
      };
      setPhotos((current) => [...current, pending]);
      try {
        const actionResponse = await fetch(
          `/api/triage/photo-session/${id}`,
          {
            method: "POST",
            headers: {"x-intake-token": intakeToken.current},
          }
        );
        if (!actionResponse.ok) throw new Error();
        const action = (await actionResponse.json()) as {uploadToken?: unknown};
        if (typeof action.uploadToken !== "string") throw new Error();

        const response = await fetch("/api/triage/photos", {
          method: "POST",
          headers: {
            "Content-Type": file.type,
            "x-intake-token": intakeToken.current,
            "x-photo-action-token": action.uploadToken,
            "x-photo-id": id,
          },
          body: file,
        });
        if (!response.ok) throw new Error();
        const uploaded = (await response.json()) as {
          photo?: {deleteToken?: unknown};
        };
        if (typeof uploaded.photo?.deleteToken !== "string") throw new Error();
        setPhotos((current) =>
          current.map((photo) =>
            photo.id === id
              ? {
                  ...photo,
                  deleteToken: uploaded.photo?.deleteToken as string,
                  status: "ready",
                }
              : photo
          )
        );
      } catch {
        setPhotos((current) => current.filter((photo) => photo.id !== id));
        previewUrls.current.delete(previewUrl);
        URL.revokeObjectURL(previewUrl);
        setPhotoError(t("photoUploadError"));
      }
    }
  }

  async function removePhoto(photo: UploadedPhoto) {
    if (
      !intakeToken.current ||
      !photo.deleteToken ||
      photo.status !== "ready"
    ) {
      return;
    }
    try {
      const response = await fetch(`/api/triage/photos/${photo.id}`, {
        method: "DELETE",
        headers: {
          "x-intake-token": intakeToken.current,
          "x-photo-action-token": photo.deleteToken,
        },
      });
      if (!response.ok) throw new Error();
      setPhotos((current) => current.filter((item) => item.id !== photo.id));
      previewUrls.current.delete(photo.previewUrl);
      URL.revokeObjectURL(photo.previewUrl);
    } catch {
      setPhotoError(t("photoRemoveError"));
    }
  }

  async function send(nextMessages: ChatMessage[], forceFinal = false) {
    setLoading(true);
    setError(null);
    intakeSessionId.current ??= crypto.randomUUID();
    try {
      const res = await fetch("/api/triage", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          messages: nextMessages,
          forceFinal,
          sessionId: intakeSessionId.current,
          shopId: shop.id,
          ...(readyPhotos.length > 0 && intakeToken.current
            ? {
                intakeToken: intakeToken.current,
                photoIds: readyPhotos.map((photo) => photo.id),
              }
            : {}),
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();

      if (data.status === "ask") {
        setMessages([...nextMessages, {role: "assistant", content: data.question}]);
      } else {
        setResult(data);
      }
    } catch {
      setError(t("requestError"));
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent, forceFinal = false) {
    e.preventDefault();
    if (!input.trim()) return;
    const nextMessages: ChatMessage[] = [...messages, {role: "user", content: input}];
    setMessages(nextMessages);
    setInput("");
    void send(nextMessages, forceFinal);
  }

  return (
    <div className="page-shell">
      <header className="mb-10 max-w-3xl">
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1 className="page-title-compact">{t("title")}</h1>
        <p className="page-lede">{t("intro")}</p>
      </header>

      {!result ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_19rem] lg:items-start">
          <div className="surface overflow-hidden">
            <div className="flex items-center gap-3 border-b border-[#e3eae8] px-5 py-4 sm:px-7">
              <span className="grid size-9 place-items-center rounded-full bg-[#dff2ee] text-[#087f78]">
                <MessageIcon className="size-4" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-[#173744]">{t("conversationTitle")}</h2>
                <p className="text-xs text-[#718187]">{t("conversationHint")}</p>
              </div>
            </div>

            <div className="min-h-44 space-y-4 px-5 py-6 sm:px-7">
              {messages.length === 0 && (
                <div className="mx-auto max-w-md py-4 text-center">
                  <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#f5f1e9] text-[#876b48]">
                    <WrenchIcon className="size-5" />
                  </span>
                  <p className="mt-4 text-sm leading-6 text-[#60727a]">{t("emptyConversation")}</p>
                </div>
              )}
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                      message.role === "user"
                        ? "rounded-br-md bg-[#087f78] text-white"
                        : "rounded-bl-md bg-[#edf5f3] text-[#29434d]"
                    }`}
                  >
                    {message.content}
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="border-t border-[#e3eae8] bg-[#fbfdfc] p-5 sm:p-7">
              <section
                aria-labelledby="intake-photo-title"
                className="mb-6 rounded-xl border border-[#d7e4e1] bg-white p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#edf5f3] text-[#087f78]">
                    <PhotoIcon className="size-4" />
                  </span>
                  <div>
                    <h3 id="intake-photo-title" className="text-sm font-bold text-[#173744]">
                      {t("photoTitle")}
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-[#60727a]">
                      {t("photoHint")}
                    </p>
                  </div>
                </div>

                {photos.length > 0 && (
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {photos.map((photo, index) => (
                      <div
                        key={photo.id}
                        className="relative aspect-square overflow-hidden rounded-lg border border-[#dce5e3] bg-[#edf2f1]"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.previewUrl}
                          alt={t("photoPreviewAlt", {number: index + 1})}
                          width={160}
                          height={160}
                          className="size-full object-cover"
                        />
                        {photo.status === "uploading" ? (
                          <span className="absolute inset-x-1 bottom-1 rounded-md bg-white/90 px-1.5 py-1 text-center text-[0.65rem] font-bold text-[#52676f]">
                            {t("photoUploading")}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => removePhoto(photo)}
                            aria-label={t("removePhoto", {number: index + 1})}
                            className="absolute right-1 top-1 grid size-8 place-items-center rounded-md bg-white/95 text-[#8a4038] shadow-sm hover:bg-white"
                          >
                            <TrashIcon className="size-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {photos.length < MAX_PHOTOS && (
                  <label className="mt-4 flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-dashed border-[#9fc5be] bg-[#f5faf8] px-3 py-2 text-center text-xs font-bold text-[#087f78] hover:border-[#6faea3] hover:bg-[#edf7f5]">
                    {photos.length === 0 ? t("addPhotos") : t("addAnotherPhoto")}
                    <input
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      disabled={loading || photosUploading}
                      onChange={(event) => {
                        void uploadPhotos(event.target.files);
                        event.target.value = "";
                      }}
                    />
                  </label>
                )}
                <p className="mt-2 text-[0.7rem] leading-5 text-[#718187]">
                  {t("photoPrivacy")}
                </p>
                {photoError && (
                  <p role="alert" className="status-message mt-3">
                    {photoError}
                  </p>
                )}
              </section>

              <label className="field-label">
                {t("messageLabel")}
                <textarea
                  className="field-control min-h-28 resize-y"
                  placeholder={t("placeholder")}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  disabled={loading}
                />
              </label>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <button
                  type="submit"
                  disabled={loading || photosUploading || !input.trim()}
                  className="button-primary"
                >
                  {loading ? t("sending") : t("send")}
                  {!loading && <ArrowRightIcon className="size-4" />}
                </button>
                <button
                  type="button"
                  disabled={loading || photosUploading || !input.trim()}
                  onClick={(event) => handleSubmit(event, true)}
                  className="button-secondary"
                >
                  {t("estimateNow")}
                </button>
              </div>
              {error && (
                <p role="alert" className="status-message mt-4">
                  {error}
                </p>
              )}
            </form>
          </div>

          <aside className="surface-flat p-5 lg:sticky lg:top-28">
            <span className="grid size-11 place-items-center rounded-xl bg-[#dff2ee] text-[#087f78]">
              <SearchIcon className="size-5" />
            </span>
            <h2 className="mt-5 text-lg font-bold text-[#173744]">{t("examplesTitle")}</h2>
            <p className="mt-2 text-sm leading-6 text-[#60727a]">{t("examplesHint")}</p>
            <div className="mt-5 flex flex-col gap-2">
              {examples.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setInput(example)}
                  disabled={loading}
                  className="rounded-xl border border-[#dce5e3] bg-[#fbfdfc] px-3 py-3 text-left text-xs font-medium leading-5 text-[#52676f] hover:border-[#a8cec7] hover:bg-[#edf5f3]"
                >
                  {example}
                </button>
              ))}
            </div>
          </aside>
        </div>
      ) : (
        <div className="surface mx-auto max-w-3xl overflow-hidden">
          <div className="flex items-center gap-3 border-b border-[#cfe3df] bg-[#edf7f5] px-6 py-5 sm:px-8">
            <span className="grid size-10 place-items-center rounded-full bg-white text-[#087f78]">
              <CheckIcon className="size-5" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#087f78]">
                {t("resultReady")}
              </p>
              <h2 className="font-bold text-[#173744]">{t("probableIssue")}</h2>
            </div>
          </div>
          <div className="p-6 sm:p-8">
            <p className="text-xl font-semibold tracking-[-0.025em] text-[#173744]">
              {result.probable_issue}
            </p>
            <div className="mt-7 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl bg-[#f4f7f6] p-4">
                <div className="text-xs font-semibold text-[#718187]">{t("urgency")}</div>
                <div className="mt-1 font-bold text-[#29434d]">
                  {t(`urgencyLevel.${result.urgency}`)}
                </div>
              </div>
              <div className="rounded-xl bg-[#f4f7f6] p-4">
                <div className="text-xs font-semibold text-[#718187]">{t("suggestedService")}</div>
                <div className="mt-1 font-bold text-[#29434d]">
                  {result.service_name ?? common("needsInspection")}
                </div>
              </div>
              <div className="rounded-xl bg-[#f4f7f6] p-4">
                <div className="text-xs font-semibold text-[#718187]">{t("estimate")}</div>
                <div className="mt-1 font-bold text-[#29434d]">
                  {result.needs_inspection ||
                  result.estimate_min === null ||
                  result.estimate_max === null
                    ? common("needsInspection")
                    : `${formatCurrency(result.estimate_min, shop)} – ${formatCurrency(
                        result.estimate_max,
                        shop
                      )}`}
                </div>
              </div>
            </div>
            <p className="mt-5 text-xs leading-5 text-[#718187]">
              {common("initialEstimateDisclaimer")}
            </p>
            {result.visual_findings && result.visual_findings.length > 0 && (
              <div className="mt-6 rounded-xl border border-[#d7e4e1] bg-[#f7fbfa] p-4">
                <h3 className="text-sm font-bold text-[#173744]">
                  {t("visualFindings")}
                </h3>
                <ul className="mt-2 space-y-2 text-sm leading-6 text-[#52676f]">
                  {result.visual_findings.map((finding) => (
                    <li key={finding} className="flex gap-2">
                      <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-[#6bc2b5]" />
                      <span>{finding}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs leading-5 text-[#718187]">
                  {t("visualFindingsDisclaimer")}
                </p>
              </div>
            )}
            {result.vision_attempted && !result.vision_used && (
              <p className="mt-5 rounded-xl bg-[#f5f1e9] p-4 text-sm leading-6 text-[#6f6251]">
                {t("visionFallback")}
              </p>
            )}
            <Link
              href={{
                pathname: "/book",
                query: {
                  service_name: result.service_name ?? "",
                  probable_issue: result.probable_issue,
                  urgency: result.urgency,
                  issue_description:
                    messages.find((message) => message.role === "user")?.content ?? "",
                },
              }}
              onClick={() => {
                if (intakeSessionId.current) {
                  sessionStorage.setItem(
                    INTAKE_TRANSFER_KEY,
                    JSON.stringify({
                      intakeSessionId: intakeSessionId.current,
                      ...(readyPhotos.length > 0 && intakeToken.current
                        ? {intakeToken: intakeToken.current}
                        : {}),
                    })
                  );
                }
              }}
              className="button-primary mt-7"
            >
              {t("bookRepair")}
              <ArrowRightIcon className="size-4" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
