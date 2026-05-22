import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import zh from "./locales/zh.json";
import en from "./locales/en.json";
import zht from "./locales/zh-Hant.json";
import ja from "./locales/ja.json";

const resources = {
  zh: { translation: zh },
  en: { translation: en },
  "zh-Hant": { translation: zht },
  ja: { translation: ja },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "zh",
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "qwen2api-locale",
    },
  });

export default i18n;
