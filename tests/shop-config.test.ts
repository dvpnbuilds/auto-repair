import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  formatCurrency,
  formatDateTime,
  getShopToday,
  shopLocalDateTimeToIso,
} from "../lib/formatting";
import { SEED_SHOPS } from "../lib/seed";

const usShop = SEED_SHOPS.find((shop) => shop.shop_key === "us")!;
const phShop = SEED_SHOPS.find((shop) => shop.shop_key === "ph")!;

test("shop config changes currency and date formatting without formatter code changes", () => {
  const usCurrency = formatCurrency(1234, usShop);
  const phCurrency = formatCurrency(1234, phShop);
  const instant = "2026-08-01T12:00:00.000Z";

  assert.notEqual(usCurrency, phCurrency);
  assert.notEqual(formatDateTime(instant, usShop), formatDateTime(instant, phShop));
  assert.equal(getShopToday(phShop, new Date("2026-07-31T16:30:00.000Z")), "2026-08-01");
});

test("booking converts a shop-local slot to the correct UTC instant", () => {
  assert.equal(
    shopLocalDateTimeToIso("2026-08-01", "09:00", usShop),
    "2026-08-01T14:00:00.000Z"
  );
  assert.equal(
    shopLocalDateTimeToIso("2026-08-01", "09:00", phShop),
    "2026-08-01T01:00:00.000Z"
  );
});

test("regional literals are confined to shop seed records", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const files = [
    "app/[locale]/services/page.tsx",
    "app/[locale]/jobs/page.tsx",
    "app/[locale]/intake/IntakeForm.tsx",
    "app/[locale]/book/BookingForm.tsx",
    "app/[locale]/track/page.tsx",
    "lib/openrouter/triage.ts",
    "lib/openrouter/messages.ts",
  ];

  for (const file of files) {
    const source = await readFile(`${root}${file}`, "utf8");
    assert.doesNotMatch(source, /["'](?:en-US|en-PH|USD|PHP|Asia\/Manila|America\/Chicago)["']/);
    assert.doesNotMatch(source, /\.toLocaleString\(/);
  }
});
