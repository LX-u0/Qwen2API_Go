"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTranslation } from "react-i18next";
import {
  Activity,
  CheckCircle,
  Clock,
  Cpu,
  Globe,
  Key,
  Server,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import type { OverviewResponse } from "../types";
import { formatCompactNumber } from "./dashboard-charts";

export function DataScreenTab({
  overview,
  modelCounts,
  sseConnected,
}: {
  overview: OverviewResponse | null;
  modelCounts: { total: number; thinking: number; search: number; image: number; video: number };
  sseConnected: boolean;
}) {
  const { t } = useTranslation();
  const analytics = overview?.analytics;
  const accounts = overview?.accounts;

  const requestSeries = useMemo(() => analytics?.minuteSeries || [], [analytics]);
  const tokenSeries = useMemo(() => analytics?.minuteSeries || [], [analytics]);

  const accountPieData = useMemo(
    () => [
      { name: t("accounts.statusValid"), value: accounts?.valid || 0 },
      { name: t("accounts.statusExpiring"), value: accounts?.expiringSoon || 0 },
      { name: t("accounts.statusExpired"), value: accounts?.expired || 0 },
      { name: t("accounts.statusInvalid"), value: accounts?.invalid || 0 },
    ],
    [accounts, t],
  );

  const requestMixData = useMemo(() => analytics?.requestMix || [], [analytics]);

  const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#64748b"];
  const PIE_COLORS = ["#10b981", "#f59e0b", "#ef4444", "#64748b"];

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("datascreen.title")}</h2>
        <div className="flex items-center gap-3">
          {sseConnected ? (
            <span className="datascreen-live-indicator">SSE Live</span>
          ) : (
            <span className="text-xs text-[var(--text-muted)]">Offline</span>
          )}
        </div>
      </div>

      {/* KPI Row */}
      <div className="datascreen-grid">
        <KpiCard
          icon={<Zap size={20} />}
          iconTone="primary"
          label={t("datascreen.rpmGauge")}
          value={formatCompactNumber(analytics?.rpm)}
        />
        <KpiCard
          icon={<Activity size={20} />}
          iconTone="success"
          label={t("overview.totalRequests")}
          value={formatCompactNumber(analytics?.totals.requests)}
        />
        <KpiCard
          icon={<CheckCircle size={20} />}
          iconTone="warning"
          label={t("datascreen.successRate")}
          value={`${formatCompactNumber(analytics?.successRate)}%`}
        />
        <KpiCard
          icon={<Users size={20} />}
          iconTone="danger"
          label={t("overview.accountValid")}
          value={formatCompactNumber(accounts?.valid)}
        />
        <KpiCard
          icon={<Server size={20} />}
          iconTone="primary"
          label={t("overview.modelTotal")}
          value={formatCompactNumber(modelCounts.total)}
        />
        <KpiCard
          icon={<Key size={20} />}
          iconTone="success"
          label={t("settings.regularKeyCount")}
          value={formatCompactNumber(overview?.apiKeys.regular)}
        />
        <KpiCard
          icon={<TrendingUp size={20} />}
          iconTone="warning"
          label={t("overview.peakRequests")}
          value={formatCompactNumber(analytics?.peakRequests)}
        />
        <KpiCard
          icon={<Clock size={20} />}
          iconTone="danger"
          label={t("overview.uptime")}
          value={`${Math.floor((analytics?.uptimeSeconds || 0) / 3600)}h`}
        />
      </div>

      {/* Charts Grid */}
      <div className="datascreen-chart-grid">
        <div className="datascreen-chart-card">
          <h4>{t("datascreen.requestTrend")}</h4>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={requestSeries}>
                <defs>
                  <linearGradient id="dsReqGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-muted)" }} stroke="var(--border)" />
                <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} stroke="var(--border)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "var(--text)",
                  }}
                />
                <Area type="monotone" dataKey="requests" stroke="#3b82f6" fill="url(#dsReqGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="datascreen-chart-card">
          <h4>{t("datascreen.tokenTrend")}</h4>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tokenSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-muted)" }} stroke="var(--border)" />
                <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} stroke="var(--border)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "var(--text)",
                  }}
                />
                <Bar dataKey="promptTokens" stackId="a" fill="#3b82f6" />
                <Bar dataKey="completionTokens" stackId="a" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="datascreen-chart-card">
          <h4>{t("datascreen.requestMix")}</h4>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={requestMixData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                  {requestMixData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "var(--text)",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="datascreen-chart-card">
          <h4>{t("datascreen.accountStatus")}</h4>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={accountPieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}>
                  {accountPieData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "var(--text)",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="datascreen-chart-card col-span-2">
          <h4>{t("datascreen.modelUsage")}</h4>
          <ModelUsageChart overview={overview} />
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  iconTone,
  label,
  value,
}: {
  icon: React.ReactNode;
  iconTone: "primary" | "success" | "warning" | "danger";
  label: string;
  value: string | number;
}) {
  return (
    <div className="datascreen-kpi">
      <div className={`datascreen-kpi-icon ${iconTone}`}>{icon}</div>
      <div className="datascreen-kpi-info">
        <div className="value">{value}</div>
        <div className="label">{label}</div>
      </div>
    </div>
  );
}

function ModelUsageChart({ overview }: { overview: OverviewResponse | null }) {
  const data = useMemo(() => {
    const mix = overview?.analytics?.requestMix || [];
    return mix.map((item) => ({ name: item.label, tokens: item.value })).slice(0, 8);
  }, [overview]);

  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 20, right: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis type="number" tick={{ fontSize: 11, fill: "var(--text-muted)" }} stroke="var(--border)" />
          <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 11, fill: "var(--text-muted)" }} stroke="var(--border)" />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--text)",
            }}
          />
          <Bar dataKey="tokens" fill="#3b82f6" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
