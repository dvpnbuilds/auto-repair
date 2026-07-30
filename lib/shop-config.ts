import { supabaseAnon } from "@/lib/supabase/client";
import type { AppSupabaseClient } from "@/lib/supabase/schema";

export type ShopConfig = {
  id: string;
  shop_key: string;
  name: string;
  country: string;
  locale: string;
  currency: string;
  timezone: string;
  language: string;
  email_sender_name: string;
  email_sender_address: string;
  address: string;
  is_active: boolean;
};

const SHOP_COLUMNS =
  "id, shop_key, name, country, locale, currency, timezone, language, email_sender_name, email_sender_address, address, is_active";

export async function getActiveShop(
  client: AppSupabaseClient = supabaseAnon
): Promise<ShopConfig> {
  const { data, error } = await client
    .from("autoshop_shops")
    .select(SHOP_COLUMNS)
    .eq("is_active", true)
    .single();

  if (error || !data) {
    throw error ?? new Error("No active shop is configured");
  }

  return data as ShopConfig;
}

export async function getShopById(
  shopId: string,
  client: AppSupabaseClient = supabaseAnon
): Promise<ShopConfig> {
  const { data, error } = await client
    .from("autoshop_shops")
    .select(SHOP_COLUMNS)
    .eq("id", shopId)
    .single();

  if (error || !data) {
    throw error ?? new Error("Shop configuration was not found");
  }

  return data as ShopConfig;
}
