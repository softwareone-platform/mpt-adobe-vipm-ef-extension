import i18next, { InitOptions } from "i18next";
import resourcesToBackend from "i18next-resources-to-backend";
import { initReactI18next } from "react-i18next";

import { languageCodes } from "@softwareone-platform/sdk-react-ui-v0/countries/languageCodes";

import en from "./en.json";

const i18n: ReturnType<typeof i18next.createInstance> = i18next.createInstance();

i18n.use(initReactI18next);
i18n.use(
  resourcesToBackend(async (language: string) => {
    const validLanguage = languageCodes.find((l) => l.includes(language));
    if (!validLanguage) return;

    // Only English ships today; non-English languages fall back via `fallbackLng`.
    // To add a locale, replace this with a static import map keyed on `language`.
    const translations = (await import("./en.json")).default;
    i18n.addResourceBundle(language, "mpt", translations, true);
    return translations;
  }),
);
i18n.on("failedLoading", (lng, _ns, msg) =>
  console.error(`[i18n] Failed to load language ${lng} with error:`, msg),
);
i18n.init({
  lng: "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
  defaultNS: "mpt",
  nsSeparator: ";",
  keySeparator: ":",
  // Ship English synchronously so the first render is already translated. The
  // backend above stays for future locales, which load lazily on switch.
  resources: { en: { mpt: en } },
  react: { useSuspense: false },
} as InitOptions);

export { i18n };
