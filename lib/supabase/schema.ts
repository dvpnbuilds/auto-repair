import type { SupabaseClient } from "@supabase/supabase-js";

export const AUTO_REPAIR_SCHEMA = "auto_repair";

// Generated database types are not present in this demo, so keep the injected
// client schema-agnostic while the concrete clients remain scoped above.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppSupabaseClient = SupabaseClient<any, any, any, any, any>;
