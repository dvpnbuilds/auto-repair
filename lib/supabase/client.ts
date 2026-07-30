import { createClient } from "@supabase/supabase-js";
import { AUTO_REPAIR_SCHEMA } from "@/lib/supabase/schema";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: AUTO_REPAIR_SCHEMA },
});
