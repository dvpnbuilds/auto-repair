import { supabaseAnon } from "@/lib/supabase/client";

function formatPeso(amount: number) {
  return `₱${amount.toLocaleString("en-PH")}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
}

export default async function TrackPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const plate = typeof params.plate === "string" ? params.plate.trim() : "";
  const phone = typeof params.phone === "string" ? params.phone.trim() : "";
  const searched = plate.length > 0 && phone.length > 0;

  let job: Record<string, unknown> | null = null;
  let history: { id: string; status: string; note: string | null; created_at: string }[] = [];
  let shopMessages: { id: string; kind: string; body: string; created_at: string }[] = [];
  let notFound = false;

  if (searched) {
    const { data: jobData, error } = await supabaseAnon
      .from("autoshop_jobs")
      .select("*")
      .ilike("plate_number", plate)
      .eq("phone", phone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return <div className="px-6 py-12">Failed to look up booking: {error.message}</div>;
    }

    if (!jobData) {
      notFound = true;
    } else {
      job = jobData;
      const { data: historyData, error: historyError } = await supabaseAnon
        .from("autoshop_status_history")
        .select("*")
        .eq("job_id", jobData.id)
        .order("created_at", { ascending: true });

      if (historyError) {
        return <div className="px-6 py-12">Failed to load status history: {historyError.message}</div>;
      }
      history = historyData ?? [];

      const { data: messagesData, error: messagesError } = await supabaseAnon
        .from("autoshop_messages")
        .select("id, kind, body, created_at")
        .eq("job_id", jobData.id)
        .in("kind", ["status_update", "completion_report"])
        .order("created_at", { ascending: false });

      if (messagesError) {
        return <div className="px-6 py-12">Failed to load messages: {messagesError.message}</div>;
      }
      shopMessages = messagesData ?? [];
    }
  }

  return (
    <div className="px-6 py-12 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-2">Track your repair</h1>
      <p className="text-sm text-zinc-600 mb-6">
        I-check ang status ng sasakyan mo gamit ang plate number at phone.
      </p>

      <form method="get" className="flex flex-col gap-3 mb-8">
        <label className="text-sm flex flex-col gap-1">
          Plate number
          <input
            name="plate"
            defaultValue={plate}
            className="border border-black/20 rounded px-3 py-2"
          />
        </label>
        <label className="text-sm flex flex-col gap-1">
          Phone
          <input
            name="phone"
            defaultValue={phone}
            className="border border-black/20 rounded px-3 py-2"
          />
        </label>
        <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm w-fit">
          Track
        </button>
      </form>

      {notFound && (
        <p className="text-sm text-red-600">
          No booking found for that plate number and phone. Please check and try again.
        </p>
      )}

      {job && (
        <div className="border border-black/10 rounded p-6">
          <div className="flex justify-between mb-4">
            <div>
              <div className="font-medium">{job.customer_name as string}</div>
              <div className="text-sm text-zinc-600">
                {job.vehicle as string} — {job.plate_number as string}
              </div>
            </div>
            <span className="text-sm px-2 py-0.5 rounded bg-black/5 h-fit">
              {job.status as string}
            </span>
          </div>

          {job.probable_issue ? (
            <div className="text-sm mb-4">
              <div className="text-zinc-600">Probable issue</div>
              <div>{job.probable_issue as string}</div>
              {Boolean(job.estimate_min) && Boolean(job.estimate_max) ? (
                <div className="text-zinc-600">
                  {formatPeso(job.estimate_min as number)}–{formatPeso(job.estimate_max as number)}{" "}
                  (initial estimate, subject to inspection)
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="text-sm text-zinc-600 mb-2">Status timeline</div>
          <ul className="space-y-2">
            {history.map((h) => (
              <li key={h.id} className="text-sm border-l-2 border-black/10 pl-3">
                <div className="font-medium capitalize">{h.status.replace(/_/g, " ")}</div>
                <div className="text-zinc-600">{formatDate(h.created_at)}</div>
                {h.note && <div className="text-zinc-600">{h.note}</div>}
              </li>
            ))}
          </ul>

          {shopMessages.length > 0 && (
            <>
              <div className="text-sm text-zinc-600 mt-6 mb-2">Messages from the shop</div>
              <ul className="space-y-2">
                {shopMessages.map((m) => (
                  <li key={m.id} className="text-sm border-l-2 border-black/10 pl-3">
                    <div className="text-zinc-600">{formatDate(m.created_at)}</div>
                    <div>{m.body}</div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
