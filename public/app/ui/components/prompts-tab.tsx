"use client";

import { useTranslation } from "react-i18next";
import { AlertTriangle, RotateCcw, Save, Filter, FileText, ShieldAlert, CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";
import { normalizePromptsResponse } from "../prompts";
import type { PromptItem, PromptsResponse } from "../types";

export function PromptsTab({
  prompts,
  savingSettings,
  savePrompts,
  resetPrompts,
}: {
  prompts: PromptsResponse | null;
  savingSettings: boolean;
  savePrompts: (updates: Record<string, string>) => Promise<void>;
  resetPrompts: (ids: string[]) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [category, setCategory] = useState("all");
  const [risk, setRisk] = useState<"all" | "protocol" | "normal">("all");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const normalizedPrompts = useMemo(() => normalizePromptsResponse(prompts), [prompts]);

  const items = useMemo(() => normalizedPrompts?.data || [], [normalizedPrompts]);
  const filtered = useMemo(
    () =>
      items.filter((item) => {
        const categoryMatched = category === "all" || item.category === category;
        const riskMatched =
          risk === "all" ||
          (risk === "protocol" && item.risk === "protocol") ||
          (risk === "normal" && item.risk !== "protocol");
        return categoryMatched && riskMatched;
      }),
    [category, items, risk],
  );

  const changedIds = Object.keys(drafts);
  const modifiedCount = items.filter((item) => item.modified).length;

  function updateDraft(item: PromptItem, value: string) {
    setDrafts((current) => {
      const next = { ...current };
      if (value === item.value) {
        delete next[item.id];
      } else {
        next[item.id] = value;
      }
      return next;
    });
  }

  async function saveOne(item: PromptItem) {
    await savePrompts({ [item.id]: drafts[item.id] ?? item.value });
    setDrafts((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
  }

  async function saveAllChanged() {
    const updates = Object.fromEntries(changedIds.map((id) => [id, drafts[id] ?? ""]));
    await savePrompts(updates);
    setDrafts({});
  }

  async function reset(ids: string[]) {
    await resetPrompts(ids);
    setDrafts((current) => {
      if (!ids.length) return {};
      const next = { ...current };
      ids.forEach((id) => delete next[id]);
      return next;
    });
  }

  if (!normalizedPrompts) {
    return (
      <div className="asset-empty-state">
        <FileText size={24} />
        <strong>{t("prompts.notLoaded")}</strong>
        <span>{t("prompts.reloadHint")}</span>
      </div>
    );
  }

  return (
    <div className="prompts-layout">
      <aside className="prompts-sidebar">
        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h3><FileText size={16} className="inline mr-1" />{t("prompts.title")}</h3>
              <p>{t("prompts.subtitle")}</p>
            </div>
          </div>
          <div className="admin-card-body flex flex-col gap-4">
            <div className="prompt-mini-stats">
              <div>
                <strong>{items.length}</strong>
                <span>{t("prompts.all")}</span>
              </div>
              <div>
                <strong>{modifiedCount}</strong>
                <span>{t("prompts.modified")}</span>
              </div>
              <div>
                <strong>{changedIds.length}</strong>
                <span>{t("prompts.unsaved")}</span>
              </div>
            </div>

            <div className="admin-form-group">
              <label className="flex items-center gap-1"><Filter size={12} />{t("prompts.category")}</label>
              <select className="admin-select" value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="all">{t("prompts.allCategories")}</option>
                {normalizedPrompts.categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div className="admin-form-group">
              <label className="flex items-center gap-1"><ShieldAlert size={12} />{t("prompts.risk")}</label>
              <select className="admin-select" value={risk} onChange={(event) => setRisk(event.target.value as typeof risk)}>
                <option value="all">{t("prompts.allRisk")}</option>
                <option value="normal">{t("prompts.normalRisk")}</option>
                <option value="protocol">{t("prompts.protocolRisk")}</option>
              </select>
            </div>

            <button className="admin-btn admin-btn-primary" disabled={!changedIds.length || savingSettings} onClick={() => void saveAllChanged()}>
              <Save size={16} />
              {t("prompts.saveAll")}
            </button>
            <button className="admin-btn admin-btn-danger" disabled={savingSettings || !items.length} onClick={() => void reset([])}>
              <RotateCcw size={16} />
              {t("prompts.resetAll")}
            </button>
          </div>
        </div>
      </aside>

      <section className="prompts-list">
        {filtered.map((item) => {
          const draft = drafts[item.id] ?? item.value;
          const changed = draft !== item.value;
          return (
            <article className="admin-card prompt-editor" key={item.id}>
              <div className="admin-card-header">
                <div>
                  <div className="prompt-title-row">
                    <h3>{item.title}</h3>
                    {item.risk === "protocol" ? (
                      <span className="prompt-badge danger">
                        <AlertTriangle size={14} />
                        {t("prompts.highRisk")}
                      </span>
                    ) : null}
                    <span className={`prompt-badge ${item.modified ? "changed" : ""}`}>
                      {item.modified ? t("prompts.modified") : t("prompts.builtIn")}
                    </span>
                    {changed ? <span className="prompt-badge unsaved">{t("prompts.unsavedTag")}</span> : null}
                  </div>
                  <p>{item.description}</p>
                </div>
              </div>
              <div className="admin-card-body flex flex-col gap-4">
                <div className="prompt-meta">
                  <span>{item.category}</span>
                  <code>{item.id}</code>
                </div>
                {item.placeholders.length ? (
                  <div className="prompt-placeholders">
                    {item.placeholders.map((placeholder) => (
                      <code key={placeholder}>{placeholder}</code>
                    ))}
                  </div>
                ) : null}
                <textarea
                  className="admin-textarea prompt-textarea"
                  value={draft}
                  rows={Math.min(18, Math.max(6, draft.split("\n").length + 2))}
                  onChange={(event) => updateDraft(item, event.target.value)}
                />
                <div className="flex flex-wrap gap-3">
                  <button className="admin-btn admin-btn-primary" disabled={!changed || savingSettings} onClick={() => void saveOne(item)}>
                    <Save size={16} />
                    {t("prompts.saveOne")}
                  </button>
                  <button
                    className="admin-btn admin-btn-secondary"
                    disabled={savingSettings}
                    onClick={() => updateDraft(item, item.defaultValue)}
                  >
                    <CheckCircle2 size={16} />
                    {t("prompts.useBuiltIn")}
                  </button>
                  <button className="admin-btn admin-btn-ghost" disabled={savingSettings} onClick={() => void reset([item.id])}>
                    <RotateCcw size={16} />
                    {t("prompts.resetOne")}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
        {!filtered.length ? <div className="asset-alert">{t("prompts.noMatch")}</div> : null}
      </section>
    </div>
  );
}
