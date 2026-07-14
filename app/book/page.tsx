import { supabaseAnon } from "@/lib/supabase/client";
import BookingForm from "./BookingForm";

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const { data: services, error } = await supabaseAnon
    .from("autoshop_services")
    .select("*")
    .order("category");

  if (error) {
    return <div className="px-6 py-12">Failed to load services: {error.message}</div>;
  }

  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const prefill = {
    serviceName: first(params.service_name) ?? "",
    probableIssue: first(params.probable_issue) ?? "",
    issueDescription: first(params.issue_description) ?? "",
    urgency: first(params.urgency) ?? "",
    estimateMin: first(params.estimate_min) ?? "",
    estimateMax: first(params.estimate_max) ?? "",
  };

  return (
    <div className="px-6 py-12 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">Book a repair</h1>
      <BookingForm services={services ?? []} prefill={prefill} />
    </div>
  );
}
