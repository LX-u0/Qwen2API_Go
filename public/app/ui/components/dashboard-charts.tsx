"use client";

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
import type { OverviewResponse } from "../types";
import { useTranslation } from "react-i18next";

type Analytics = OverviewResponse["analytics"];

export function formatCompactNumber(value: number | undefined) {
  const safeValue = Number(value || 0);
  return new Intl.NumberFormat("zh-CN", {
    notation: safeValue >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(safeValue);
}

export function formatDecimal(value: number | undefined, digits = 1) {
  const safeValue = Number(value || 0);
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(safeValue);
}

export function formatUptime(seconds: number | undefined) {
  const safeSeconds = Math.max(0, Number(seconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#64748b"];

export function RequestTrendChart({ analytics }: { analytics: Analytics | undefined }) {
  const { t } = useTranslation();
  const minuteSeries = analytics?.minuteSeries || [];

  return (
    <div className="admin-chart-card">
      <div className="admin-chart-header">
        <div>
          <h4>{t("overview.requestTrend")}</h4>
          <p>Real-time RPM fluctuation</p>
        </div>
      </div>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={minuteSeries}>
            <defs>
              <linearGradient id="reqGradient" x1="0" y1="0" x2="0" y2="1">
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
            <Area type="monotone" dataKey="requests" stroke="#3b82f6" fill="url(#reqGradient)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function TokenThroughputChart({ analytics }: { analytics: Analytics | undefined }) {
  const { t } = useTranslation();
  const minuteSeries = analytics?.minuteSeries || [];

  return (
    <div className="admin-chart-card">
      <div className="admin-chart-header">
        <div>
          <h4>{t("overview.tokenThroughput")}</h4>
          <p>Input / Output throughput per minute</p>
        </div>
      </div>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={minuteSeries}>
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
            <Bar dataKey="promptTokens" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
            <Bar dataKey="completionTokens" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function RequestMixCard({ analytics }: { analytics: Analytics | undefined }) {
  const { t } = useTranslation();
  const data = analytics?.requestMix || [];

  return (
    <div className="admin-card">
      <div className="admin-card-header">
        <div>
          <h3>{t("overview.requestMix")}</h3>
          <p>Traffic composition by endpoint</p>
        </div>
      </div>
      <div className="admin-card-body">
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={70}
                paddingAngle={3}
                dataKey="value"
              >
                {data.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
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
        <div className="mt-2 grid grid-cols-2 gap-2">
          {data.map((item, idx) => (
            <div key={item.label} className="flex items-center gap-2 text-xs">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ background: CHART_COLORS[idx % CHART_COLORS.length] }}
              />
              <span className="text-[var(--text-secondary)]">{item.label}</span>
              <strong className="ml-auto">{formatCompactNumber(item.value)}</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AccountStatusPie({
  accounts,
}: {
  accounts: OverviewResponse["accounts"] | undefined;
}) {
  const data = [
    { name: "Valid", value: accounts?.valid || 0 },
    { name: "Expiring", value: accounts?.expiringSoon || 0 },
    { name: "Expired", value: accounts?.expired || 0 },
    { name: "Invalid", value: accounts?.invalid || 0 },
  ].filter((d) => d.value > 0);

  const colors = ["#10b981", "#f59e0b", "#ef4444", "#64748b"];

  return (
    <div className="h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}>
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
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
  );
}

export function ModelUsageBarChart({ models }: { models: { name: string; tokens: number }[] }) {
  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={models} layout="vertical" margin={{ left: 20, right: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis type="number" tick={{ fontSize: 11, fill: "var(--text-muted)" }} stroke="var(--border)" />
          <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10, fill: "var(--text-muted)" }} stroke="var(--border)" />
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
