"use client";

import { useTranslation } from "react-i18next";
import { Input } from "@heroui/react";
import { RefreshCw, Search, BrainCircuit, TrendingUp, Database } from "lucide-react";
import type { ModelItem } from "../types";
import { formatCompactNumber } from "./dashboard-charts";
import { SectionTitle } from "./primitives";

export function ModelsTab({
  models,
  keyword,
  setKeyword,
  refreshingModels,
  refreshModels,
}: {
  models: ModelItem[];
  keyword: string;
  setKeyword: (value: string) => void;
  refreshingModels: boolean;
  refreshModels: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const activeModels = models.filter((model) => (model.usage?.totalTokens || 0) > 0).length;
  const totals = models.reduce(
    (acc, model) => {
      acc.prompt += model.usage?.promptTokens || 0;
      acc.completion += model.usage?.completionTokens || 0;
      acc.total += model.usage?.totalTokens || 0;
      return acc;
    },
    { prompt: 0, completion: 0, total: 0 },
  );

  return (
    <div className="admin-card">
      <div className="admin-card-header">
        <SectionTitle
          title={t("models.title")}
          description={t("models.subtitle")}
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <Input
                  placeholder={t("models.searchModel")}
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="w-64 pl-9"
                />
              </div>
              <button
                className="admin-btn admin-btn-primary"
                disabled={refreshingModels}
                onClick={() => void refreshModels()}
                title="Refresh models from upstream"
              >
                <RefreshCw size={16} className={refreshingModels ? "animate-spin" : ""} />
                {t("models.refreshModels")}
              </button>
            </div>
          }
        />
      </div>
      <div className="admin-card-body">
        <div className="admin-stat-grid mb-6">
          <div className="admin-stat-card primary">
            <div className="label flex items-center gap-1"><Database size={14} />{t("models.currentCount")}</div>
            <div className="value">{formatCompactNumber(models.length)}</div>
          </div>
          <div className="admin-stat-card success">
            <div className="label flex items-center gap-1"><BrainCircuit size={14} />{t("models.activeVariants")}</div>
            <div className="value">{formatCompactNumber(activeModels)}</div>
          </div>
          <div className="admin-stat-card warning">
            <div className="label flex items-center gap-1"><TrendingUp size={14} />{t("models.totalPrompt")}</div>
            <div className="value">{formatCompactNumber(totals.prompt)}</div>
          </div>
          <div className="admin-stat-card danger">
            <div className="label flex items-center gap-1"><TrendingUp size={14} />{t("models.totalCompletion")}</div>
            <div className="value">{formatCompactNumber(totals.completion)}</div>
          </div>
        </div>

        <div className="admin-model-grid">
          {models.map((model) => (
            <div className="admin-model-card" key={model.id}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <h4 className="truncate">{model.id}</h4>
                  <p className="id truncate">{model.display_name || model.name || model.upstream_id || "-"}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-xs text-[var(--text-muted)]">{t("models.totalTokens")}</span>
                  <strong className="text-lg">{formatCompactNumber(model.usage?.totalTokens)}</strong>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                {model.id.includes("thinking") ? <span className="admin-tag success">Thinking</span> : null}
                {model.id.includes("search") ? <span className="admin-tag warning">Search</span> : null}
                {model.id.includes("image") ? <span className="admin-tag primary">Image</span> : null}
                {model.id.includes("video") ? <span className="admin-tag danger">Video</span> : null}
                {model.usage?.totalTokens ? <span className="admin-tag success">{t("common.success")}</span> : null}
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">{t("models.requestName")}</span>
                  <strong>{model.name || model.id}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">{t("models.upstreamId")}</span>
                  <strong className="mono">{model.upstream_id || "-"}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">{t("models.displayName")}</span>
                  <strong>{model.display_name || "-"}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">{t("models.inputTokens")}</span>
                  <strong>{formatCompactNumber(model.usage?.promptTokens)}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">{t("models.outputTokens")}</span>
                  <strong>{formatCompactNumber(model.usage?.completionTokens)}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">{t("models.totalTokens")}</span>
                  <strong>{formatCompactNumber(model.usage?.totalTokens)}</strong>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
