"use client";

import { useSyncExternalStore } from "react";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n";

const subscribe = () => () => {};

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  if (!mounted) return <>{children}</>;
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
