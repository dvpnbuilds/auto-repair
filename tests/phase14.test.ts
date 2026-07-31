import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {test} from "node:test";
import {fileURLToPath} from "node:url";
import {createClient} from "@supabase/supabase-js";
import {SEED_SHOPS} from "../lib/seed";
import {AUTO_REPAIR_SCHEMA} from "../lib/supabase/schema";

const root = fileURLToPath(new URL("../", import.meta.url));

test("both seeded shops provide complete, distinct landing-page brands", () => {
  assert.equal(SEED_SHOPS.length, 2);
  for (const shop of SEED_SHOPS) {
    assert.ok(shop.name.trim());
    assert.ok(shop.tagline.trim());
    assert.ok(shop.address.trim());
    assert.ok(shop.phone.trim());
    assert.ok(shop.hours.trim());
  }
  assert.notEqual(SEED_SHOPS[0].tagline, SEED_SHOPS[1].tagline);
  assert.notEqual(SEED_SHOPS[0].phone, SEED_SHOPS[1].phone);
  assert.notEqual(SEED_SHOPS[0].hours, SEED_SHOPS[1].hours);
});

test("landing page is config-driven with live prices and all customer CTAs", async () => {
  const [page, config, migration, messages] = await Promise.all([
    readFile(join(root, "app", "[locale]", "page.tsx"), "utf8"),
    readFile(join(root, "lib", "shop-config.ts"), "utf8"),
    readFile(
      join(
        root,
        "supabase",
        "migrations",
        "20260731170000_phase14_shop_brand.sql"
      ),
      "utf8"
    ),
    readFile(join(root, "messages", "en.json"), "utf8"),
  ]);

  assert.match(config, /tagline: string/);
  assert.match(config, /phone: string/);
  assert.match(config, /hours: string/);
  assert.match(page, /shop\.tagline/);
  assert.match(page, /shop\.address/);
  assert.match(page, /shop\.phone/);
  assert.match(page, /shop\.hours/);
  assert.match(page, /\.from\("autoshop_services"\)/);
  assert.match(page, /\.eq\("shop_id", shop\.id\)/);
  assert.match(page, /\.limit\(3\)/);
  assert.match(page, /formatCurrency/);
  assert.match(page, /t\("metadataTitle", \{shopName: shop\.name\}\)/);
  assert.doesNotMatch(page, /\| Auto care/);
  assert.match(messages, /"metadataTitle": "\{shopName\} \| Auto care"/);
  assert.match(page, /href="\/intake"/);
  assert.match(page, /href="\/book"/);
  assert.match(page, /href="\/track"/);
  assert.match(page, /pathname: "\/book"/);
  assert.doesNotMatch(page, /Northstar|RapidFix|USD|PHP|en-US|en-PH/);
  assert.match(migration, /add column if not exists tagline text/);
  assert.match(migration, /add column if not exists phone text/);
  assert.match(migration, /add column if not exists hours text/);
  assert.match(messages, /Starting prices come from this shop/);
  assert.match(messages, /Initial estimate, subject to inspection/);
});

test("anonymous shop and service reads provide both live branded previews", async (t) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    t.skip("Supabase anonymous credentials are unavailable");
    return;
  }
  const client = createClient(url, anonKey, {
    db: {schema: AUTO_REPAIR_SCHEMA},
  });
  const {data: shops, error: shopsError} = await client
    .from("autoshop_shops")
    .select("id, shop_key, name, tagline, address, phone, hours");
  assert.ifError(shopsError);
  assert.equal(shops?.length, 2);

  for (const shop of shops ?? []) {
    assert.ok(shop.tagline);
    assert.ok(shop.phone);
    assert.ok(shop.hours);
    const {data: services, error: servicesError} = await client
      .from("autoshop_services")
      .select("name, price_min, price_max")
      .eq("shop_id", shop.id)
      .limit(3);
    assert.ifError(servicesError);
    assert.equal(services?.length, 3);
    assert.ok(
      services?.every(
        (service) =>
          service.price_min > 0 && service.price_max >= service.price_min
      )
    );
  }
});
