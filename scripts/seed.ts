import { createClient } from "@supabase/supabase-js";
import { seedDatabase, type ShopKey } from "../lib/seed";
import { AUTO_REPAIR_SCHEMA } from "../lib/supabase/schema";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  db: { schema: AUTO_REPAIR_SCHEMA },
});
const shopArgument = process.argv[2];

if (shopArgument && shopArgument !== "us" && shopArgument !== "ph") {
  throw new Error("Shop key must be either \"us\" or \"ph\"");
}
const requestedShop = shopArgument as ShopKey | undefined;

seedDatabase(supabase, requestedShop)
  .then(({ shops, services, jobs, activeShop }) => {
    console.log(
      `Seeded ${shops} shops, ${services} services, and ${jobs} jobs. Active shop: ${activeShop}.`
    );
    process.exit(0);
  })
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
