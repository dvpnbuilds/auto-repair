import {defineRouting} from "next-intl/routing";
import {locales} from "./locales.generated";

export const routing = defineRouting({
  locales,
  defaultLocale: "en",
  localePrefix: "always",
});
