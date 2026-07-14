import { supabaseAnon } from "@/lib/supabase/client";

function formatPeso(amount: number) {
  return `₱${amount.toLocaleString("en-PH")}`;
}

export default async function JobsPage() {
  const { data: jobs, error } = await supabaseAnon
    .from("autoshop_jobs")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return <div className="px-6 py-12">Failed to load jobs: {error.message}</div>;
  }

  return (
    <div className="px-6 py-12 max-w-3xl">
      <h1 className="text-2xl font-semibold mb-6">Jobs</h1>
      <ul className="divide-y divide-black/10">
        {jobs?.map((job) => (
          <li key={job.id} className="py-3">
            <div className="flex justify-between">
              <div className="font-medium">
                {job.customer_name} — {job.plate_number}
              </div>
              <span className="text-sm px-2 py-0.5 rounded bg-black/5">{job.status}</span>
            </div>
            <div className="text-sm text-zinc-600">{job.vehicle}</div>
            {job.probable_issue && (
              <div className="text-sm mt-1">
                {job.probable_issue}
                {job.estimate_min && job.estimate_max && (
                  <span className="text-zinc-600">
                    {" "}
                    · {formatPeso(job.estimate_min)}–{formatPeso(job.estimate_max)} (initial
                    estimate, subject to inspection)
                  </span>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
