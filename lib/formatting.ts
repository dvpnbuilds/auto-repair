import type { ShopConfig } from "@/lib/shop-config";

export type RegionalConfig = Pick<ShopConfig, "locale" | "currency" | "timezone">;

export function formatCurrency(amount: number, config: RegionalConfig): string {
  return new Intl.NumberFormat(config.locale, {
    style: "currency",
    currency: config.currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDateTime(
  value: string | number | Date,
  config: RegionalConfig
): string {
  return new Intl.DateTimeFormat(config.locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: config.timezone,
  }).format(new Date(value));
}

function dateParts(value: Date, config: RegionalConfig) {
  const parts = new Intl.DateTimeFormat(config.locale, {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);

  const read = (type: Intl.DateTimeFormatPartTypes) => {
    const part = parts.find((item) => item.type === type)?.value;
    if (!part) throw new Error(`Missing ${type} while formatting shop time`);
    return Number(part);
  };

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

export function getShopToday(config: RegionalConfig, now = new Date()): string {
  const { year, month, day } = dateParts(now, config);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function shopLocalDateTimeToIso(
  date: string,
  time: string,
  config: RegionalConfig
): string {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute, 0);

  let candidate = desiredUtc;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = dateParts(new Date(candidate), config);
    const representedUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    candidate += desiredUtc - representedUtc;
  }

  return new Date(candidate).toISOString();
}
