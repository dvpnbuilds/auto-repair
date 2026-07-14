import { isAdminAuthed } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/server";
import PasscodeForm from "./PasscodeForm";
import AdminBoard from "./AdminBoard";

export default async function AdminPage() {
  const authed = await isAdminAuthed();

  if (!authed) {
    return (
      <div className="px-6 py-12 max-w-sm">
        <h1 className="text-2xl font-semibold mb-4">Admin login</h1>
        <PasscodeForm />
      </div>
    );
  }

  const { data: jobs, error: jobsError } = await supabaseService
    .from("autoshop_jobs")
    .select("*")
    .order("created_at", { ascending: false });

  if (jobsError) {
    return <div className="px-6 py-12">Failed to load jobs: {jobsError.message}</div>;
  }

  const { data: messages, error: messagesError } = await supabaseService
    .from("autoshop_messages")
    .select("*")
    .order("created_at", { ascending: false });

  if (messagesError) {
    return <div className="px-6 py-12">Failed to load messages: {messagesError.message}</div>;
  }

  return (
    <div className="px-6 py-12">
      <h1 className="text-2xl font-semibold mb-6">RapidFix job board</h1>
      <AdminBoard jobs={jobs ?? []} messages={messages ?? []} />
    </div>
  );
}
