"use client";

import { useTranslation } from "react-i18next";
import {
  formatCompactNumber,
  formatDecimal,
  formatUptime,
  RequestMixCard,
  RequestTrendChart,
  TokenThroughputChart,
} from "./dashboard-charts";
import { MetricRow, StatCard } from "./primitives";
import type { OverviewResponse } from "../types";

export function OverviewTab({
  overview,
  modelCounts,
}: {
  overview: OverviewResponse | null;
  modelCounts: {
    total: number;
    thinking: number;
    search: number;
    image: number;
    video: number;
  };
}) {
  const { t } = useTranslation();
  const accounts = overview?.accounts;
  const analytics = overview?.analytics;

  return (
    <div className="flex flex-col gap-6">
      {/* KPI Row 1 */}
      <div className="admin-stat-grid">
        <StatCard
          title={t("overview.accountTotal")}
          value={accounts?.total ?? "--"}
          description="Paginated management"
        />
        <StatCard
          title={t("overview.accountValid")}
          value={accounts?.valid ?? "--"}
          description="Valid and rotating"
          tone="success"
        />
        <StatCard
          title={t("overview.accountExpiring")}
          value={accounts?.expiringSoon ?? "--"}
          description="Recommend early refresh"
          tone="warning"
        />
        <StatCard
          title={t("overview.modelTotal")}
          value={modelCounts.total}
          description={`Thinking ${modelCounts.thinking} / Search ${modelCounts.search}`}
          tone="danger"
        />
      </div>

      {/* KPI Row 2 */}
      <div className="admin-stat-grid">
        <StatCard
          title={t("overview.rpm")}
          value={formatCompactNumber(analytics?.rpm)}
          description={`30m avg ${formatDecimal(analytics?.averageRpm)} rpm`}
          tone="success"
        />
        <StatCard
          title={t("overview.totalRequests")}
          value={formatCompactNumber(analytics?.totals.requests)}
          description={`Success ${formatDecimal(analytics?.successRate, 2)}%, Errors ${formatCompactNumber(analytics?.totals.errors)}`}
        />
        <StatCard
          title={t("overview.promptTokens")}
          value={formatCompactNumber(analytics?.totals.promptTokens)}
          description={`30m total ${formatCompactNumber(analytics?.tokens30m)}`}
          tone="warning"
        />
        <StatCard
          title={t("overview.completionTokens")}
          value={formatCompactNumber(analytics?.totals.completionTokens)}
          description={`Total ${formatCompactNumber(analytics?.totals.totalTokens)}`}
          tone="danger"
        />
      </div>

      {/* Main charts + side stats */}
      <div className="admin-grid-3">
        <div className="col-span-2 flex flex-col gap-4">
          <RequestTrendChart analytics={analytics} />
          <TokenThroughputChart analytics={analytics} />
        </div>
        <div className="flex flex-col gap-4">
          <RequestMixCard analytics={analytics} />

          <div className="admin-card">
            <div className="admin-card-header">
              <div>
                <h3>{t("overview.accountHealth")}</h3>
                <p>Account pool health overview</p>
              </div>
            </div>
            <div className="admin-card-body">
              <MetricRow label={t("overview.accountValid")} value={accounts?.valid ?? 0} total={accounts?.total ?? 0} />
              <MetricRow label={t("overview.accountExpiring")} value={accounts?.expiringSoon ?? 0} total={accounts?.total ?? 0} />
              <MetricRow label={t("accounts.statusExpired")} value={accounts?.expired ?? 0} total={accounts?.total ?? 0} />
              <MetricRow label={t("accounts.statusInvalid")} value={accounts?.invalid ?? 0} total={accounts?.total ?? 0} />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom cards */}
      <div className="admin-grid-4">
        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h3>{t("overview.trafficSplit")}</h3>
              <p>Business vs admin requests</p>
            </div>
          </div>
          <div className="admin-card-body space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Chat</span>
              <strong>{formatCompactNumber(analytics?.totals.chat)}</strong>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Models</span>
              <strong>{formatCompactNumber(analytics?.totals.models)}</strong>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Image / Video</span>
              <strong>{formatCompactNumber((analytics?.totals.image ?? 0) + (analytics?.totals.video ?? 0))}</strong>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Admin</span>
              <strong>{formatCompactNumber(analytics?.totals.admin)}</strong>
            </div>
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h3>{t("overview.serviceParams")}</h3>
              <p>Key runtime configuration</p>
            </div>
          </div>
          <div className="admin-card-body space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Listen</span>
              <strong className="mono">{overview?.server.listenAddress}:{overview?.server.listenPort}</strong>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Data Mode</span>
              <strong>{overview?.server.dataSaveMode ?? "--"}</strong>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Concurrency</span>
              <strong>{overview?.server.batchLoginConcurrency ?? "--"}</strong>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Search</span>
              <strong>{overview?.server.searchInfoMode ?? "--"}</strong>
            </div>
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h3>{t("overview.modelSupply")}</h3>
              <p>Current model pool overview</p>
            </div>
          </div>
          <div className="admin-card-body space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">{t("overview.modelTotal")}</span>
              <strong>{modelCounts.total}</strong>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Thinking</span>
              <strong>{modelCounts.thinking}</strong>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Search</span>
              <strong>{modelCounts.search}</strong>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Media</span>
              <strong>{modelCounts.image + modelCounts.video}</strong>
            </div>
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h3>{t("overview.keysAndTime")}</h3>
              <p>Control panel metadata</p>
            </div>
          </div>
          <div className="admin-card-body space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">API Keys</span>
              <strong>{overview?.apiKeys.total ?? "--"}</strong>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Admin Key</span>
              <strong>{overview?.apiKeys.admin ?? "--"}</strong>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Regular Key</span>
              <strong>{overview?.apiKeys.regular ?? "--"}</strong>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Generated</span>
              <strong>
                {overview?.generatedAt
                  ? new Date(overview.generatedAt).toLocaleTimeString("zh-CN", { hour12: false })
                  : "--"}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* Operations Overview */}
      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3>{t("overview.opsMetrics")}</h3>
            <p>Operations view of traffic, accounts, models and admin</p>
          </div>
        </div>
        <div className="admin-card-body">
          <div className="admin-grid-3">
            <div className="flex flex-col gap-3 p-4 border border-[var(--border)] rounded-lg bg-[var(--surface-hover)]">
              <span className="text-sm text-[var(--text-secondary)]">{t("overview.uptime")}</span>
              <strong className="text-xl">{formatUptime(analytics?.uptimeSeconds)}</strong>
            </div>
            <div className="flex flex-col gap-3 p-4 border border-[var(--border)] rounded-lg bg-[var(--surface-hover)]">
              <span className="text-sm text-[var(--text-secondary)]">{t("overview.requests30m")}</span>
              <strong className="text-xl">{formatCompactNumber(analytics?.requests30m)}</strong>
            </div>
            <div className="flex flex-col gap-3 p-4 border border-[var(--border)] rounded-lg bg-[var(--surface-hover)]">
              <span className="text-sm text-[var(--text-secondary)]">{t("overview.adminRequests")}</span>
              <strong className="text-xl">{formatCompactNumber(analytics?.adminRequests30m)}</strong>
            </div>
            <div className="flex flex-col gap-3 p-4 border border-[var(--border)] rounded-lg bg-[var(--surface-hover)]">
              <span className="text-sm text-[var(--text-secondary)]">{t("overview.peakRequests")}</span>
              <strong className="text-xl">{formatCompactNumber(analytics?.peakRequests)}</strong>
            </div>
            <div className="flex flex-col gap-3 p-4 border border-[var(--border)] rounded-lg bg-[var(--surface-hover)]">
              <span className="text-sm text-[var(--text-secondary)]">{t("overview.peakTokens")}</span>
              <strong className="text-xl">{formatCompactNumber(analytics?.peakTokens)}</strong>
            </div>
            <div className="flex flex-col gap-3 p-4 border border-[var(--border)] rounded-lg bg-[var(--surface-hover)]">
              <span className="text-sm text-[var(--text-secondary)]">{t("overview.uploadRequests")}</span>
              <strong className="text-xl">{formatCompactNumber(analytics?.totals.upload)}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
