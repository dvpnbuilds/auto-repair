"use client";

import {useState} from "react";
import {useTranslations} from "next-intl";

type ShopOption = {
  shop_key: string;
  name: string;
  country: string;
  currency: string;
};

export default function DashboardShopSwitcher({
  activeShopKey,
  shops,
}: {
  activeShopKey: string;
  shops: ShopOption[];
}) {
  const t = useTranslations("Dashboard");
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState(false);

  async function switchShop(shopKey: string) {
    if (shopKey === activeShopKey) return;
    setSwitching(true);
    setError(false);
    try {
      const response = await fetch("/api/admin/shop", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({shopKey}),
      });
      if (!response.ok) throw new Error();
      window.location.reload();
    } catch {
      setError(true);
      setSwitching(false);
    }
  }

  return (
    <label className="block min-w-56 text-xs font-bold text-[#52676f]">
      {t("shopLabel")}
      <select
        className="field-control mt-2"
        value={activeShopKey}
        disabled={switching}
        onChange={(event) => void switchShop(event.target.value)}
      >
        {shops.map((shop) => (
          <option key={shop.shop_key} value={shop.shop_key}>
            {shop.name} · {shop.country} · {shop.currency}
          </option>
        ))}
      </select>
      <span aria-live="polite" className="mt-1 block min-h-4 text-[#8a4038]">
        {switching ? t("switching") : error ? t("switchError") : ""}
      </span>
    </label>
  );
}
