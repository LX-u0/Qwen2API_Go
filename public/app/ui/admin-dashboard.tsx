"use client";

import {
  LayoutDashboard,
  Monitor,
  Users,
  Settings,
  Brain,
  Upload,
  Bug,
  ImageIcon,
  Video,
  MessageSquareText,
  Menu,
  Moon,
  Sun,
  RefreshCw,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Globe,
  Sparkles,
} from "lucide-react";
import { Input } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { useAdminConsole } from "./hooks/use-admin-console";
import { AccountsTab } from "./components/accounts-tab";
import { AssetGenerationTab } from "./components/asset-generation-tab";
import { DebugTab } from "./components/debug-tab";
import { ModelsTab } from "./components/models-tab";
import { OverviewTab } from "./components/overview-tab";
import { PromptsTab } from "./components/prompts-tab";
import { SettingsTab } from "./components/settings-tab";
import { UploadsTab } from "./components/uploads-tab";
import { DataScreenTab } from "./components/datascreen-tab";
import { formatCompactNumber } from "./components/dashboard-charts";
import { PROMPT_IDS, promptValue } from "./prompts";
import type { TabKey } from "./types";
import { useState } from "react";

const LANG_OPTIONS = [
  { value: "zh", label: "langZh" },
  { value: "en", label: "langEn" },
  { value: "zh-Hant", label: "langZht" },
  { value: "ja", label: "langJa" },
];

export function AdminDashboard({ initialTab }: { initialTab?: TabKey } = {}) {
  const { t } = useTranslation();
  const { state, actions } = useAdminConsole(initialTab);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const NAV_ITEMS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
    { key: "overview", label: t("nav.overview"), icon: <LayoutDashboard size={18} /> },
    { key: "datascreen", label: t("nav.datascreen"), icon: <Monitor size={18} /> },
    { key: "accounts", label: t("nav.accounts"), icon: <Users size={18} /> },
    { key: "settings", label: t("nav.settings"), icon: <Settings size={18} /> },
    { key: "prompts", label: t("nav.prompts"), icon: <MessageSquareText size={18} /> },
    { key: "models", label: t("nav.models"), icon: <Brain size={18} /> },
    { key: "uploads", label: t("nav.uploads"), icon: <Upload size={18} /> },
    { key: "images", label: t("nav.images"), icon: <ImageIcon size={18} /> },
    { key: "videos", label: t("nav.videos"), icon: <Video size={18} /> },
    { key: "debug", label: t("nav.debug"), icon: <Bug size={18} /> },
  ];

  if (!state.verified) {
    return (
      <div className="admin-login">
        <div className="admin-login-card">
          <div className="flex items-center gap-3 mb-6">
            <div className="admin-sidebar-logo">Q2</div>
            <div>
              <h1>{t("appName")}</h1>
              <p className="text-[13px] text-[var(--text-secondary)] mt-1">{t("login.title")}</p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <Input
              placeholder={t("login.placeholder")}
              type="password"
              value={state.apiKeyInput}
              onChange={(e) => actions.setApiKeyInput(e.target.value)}
              className="w-full"
            />
            <div className="flex gap-3">
              <button className="admin-btn admin-btn-primary flex-1" onClick={() => void actions.verifyAdmin()}>
                <Sparkles size={16} />
                {t("login.enter")}
              </button>
              <button
                className="admin-btn admin-btn-secondary"
                onClick={() => {
                  actions.setApiKeyInput("");
                  if (typeof window !== "undefined") {
                    window.localStorage.removeItem("qwen2api-admin-key");
                  }
                }}
              >
                {t("login.clear")}
              </button>
            </div>
          </div>

          {state.toast ? (
            <div
              className={`mt-4 p-3 rounded-lg text-sm font-medium ${
                state.toast.type === "error"
                  ? "bg-[var(--danger-light)] text-[var(--danger)]"
                  : state.toast.type === "success"
                  ? "bg-[var(--success-light)] text-[var(--success)]"
                  : "bg-[var(--primary-light)] text-[var(--primary)]"
              }`}
            >
              {state.toast.message}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const currentTab = NAV_ITEMS.find((item) => item.key === state.activeTab);

  return (
    <div className="admin-root">
      {state.toast ? (
        <div className={`admin-toast ${state.toast.type}`}>{state.toast.message}</div>
      ) : null}

      {/* Mobile overlay */}
      <div
        className={`admin-sidebar-overlay ${mobileMenuOpen ? "open" : ""}`}
        onClick={() => setMobileMenuOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`admin-sidebar ${state.sidebarCollapsed ? "collapsed" : ""} ${mobileMenuOpen ? "mobile-open" : ""}`}>
        <div className="admin-sidebar-header">
          <div className="admin-sidebar-logo">Q2</div>
          <span className="admin-sidebar-title">{t("appName")}</span>
          <button
            className="admin-btn admin-btn-ghost admin-btn-sm ml-auto hidden lg:flex"
            onClick={actions.toggleSidebar}
            title={state.sidebarCollapsed ? "展开" : "收起"}
          >
            {state.sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
          <button
            className="admin-btn admin-btn-ghost admin-btn-sm ml-auto lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          >
            <ChevronLeft size={16} />
          </button>
        </div>

        <nav className="admin-sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`admin-nav-item ${state.activeTab === item.key ? "active" : ""}`}
              onClick={() => {
                actions.setActiveTab(item.key);
                setMobileMenuOpen(false);
              }}
              title={item.label}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <button className="admin-nav-item" onClick={actions.toggleTheme}>
            {state.themeMode === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            <span>{state.themeMode === "dark" ? t("common.themeLight") : t("common.themeDark")}</span>
          </button>
          <button className="admin-nav-item" onClick={() => void actions.refreshShell()}>
            <RefreshCw size={18} className={state.loadingShell ? "animate-spin" : ""} />
            <span>{state.loadingShell ? t("common.refreshing") : t("common.refresh")}</span>
          </button>
          <div className="admin-nav-item" style={{ cursor: "default" }}>
            <Globe size={18} />
            <select
              className="lang-select flex-1"
              value={state.language}
              onChange={(e) => actions.changeLanguage(e.target.value)}
            >
              {LANG_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(`common.${opt.label}`)}
                </option>
              ))}
            </select>
          </div>
          <button className="admin-nav-item" onClick={actions.logout}>
            <LogOut size={18} />
            <span>{t("common.logout")}</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className={`admin-main ${state.sidebarCollapsed ? "collapsed" : ""}`}>
        {/* Header */}
        <header className="admin-header">
          <div className="admin-header-left">
            <button
              className="admin-btn admin-btn-ghost admin-btn-sm lg:hidden"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu size={16} />
            </button>
            <span className="admin-page-title">{currentTab?.label || t("appName")}</span>
          </div>
          <div className="admin-header-right">
            <div className="hidden md:flex items-center gap-6 text-sm text-[var(--text-secondary)] mr-4">
              <div className="flex flex-col items-end">
                <span className="text-xs text-[var(--text-muted)]">{t("overview.totalRequests")}</span>
                <span className="font-semibold text-[var(--text)]">
                  {formatCompactNumber(state.overview?.analytics.totals.requests)}
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-xs text-[var(--text-muted)]">{t("overview.accountValid")}</span>
                <span className="font-semibold text-[var(--text)]">
                  {formatCompactNumber(state.overview?.accounts.valid)}
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-xs text-[var(--text-muted)]">{t("overview.modelTotal")}</span>
                <span className="font-semibold text-[var(--text)]">
                  {formatCompactNumber(state.modelCounts.total)}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="admin-content">
          {state.activeTab === "overview" ? (
            <OverviewTab overview={state.overview} modelCounts={state.modelCounts} />
          ) : null}

          {state.activeTab === "datascreen" ? (
            <DataScreenTab
              overview={state.overview}
              modelCounts={state.modelCounts}
              sseConnected={state.sseConnected}
            />
          ) : null}

          {state.activeTab === "accounts" ? (
            <AccountsTab
              accounts={state.accounts}
              batchTask={state.batchTask}
              filters={state.filters}
              draftKeyword={state.draftKeyword}
              newAccountEmail={state.newAccountEmail}
              newAccountPassword={state.newAccountPassword}
              batchAccountsText={state.batchAccountsText}
              loadingAccounts={state.loadingAccounts}
              actions={{
                setNewAccountEmail: actions.setNewAccountEmail,
                setNewAccountPassword: actions.setNewAccountPassword,
                setBatchAccountsText: actions.setBatchAccountsText,
                createAccount: actions.createAccount,
                createBatchTask: actions.createBatchTask,
                refreshAccounts: actions.refreshAccounts,
                setDraftKeyword: actions.setDraftKeyword,
                setFilters: actions.setFilters,
                refreshAccount: actions.refreshAccount,
                deleteAccount: actions.deleteAccount,
              }}
            />
          ) : null}

          {state.activeTab === "settings" ? (
            <SettingsTab
              settings={state.settings}
              savingSettings={state.savingSettings}
              addKeyValue={state.addKeyValue}
              thresholdHours={state.thresholdHours}
              setAddKeyValue={actions.setAddKeyValue}
              setThresholdHours={actions.setThresholdHours}
              setSettings={actions.setSettings}
              addRegularKey={actions.addRegularKey}
              deleteRegularKey={actions.deleteRegularKey}
              refreshAllAccounts={actions.refreshAllAccounts}
              reloadRuntimeConfig={actions.reloadRuntimeConfig}
              saveSettings={actions.saveSettings}
              saveChatCleanupMode={actions.saveChatCleanupMode}
            />
          ) : null}

          {state.activeTab === "prompts" ? (
            <PromptsTab
              prompts={state.prompts}
              savingSettings={state.savingSettings}
              savePrompts={actions.savePrompts}
              resetPrompts={actions.resetPrompts}
            />
          ) : null}

          {state.activeTab === "models" ? (
            <ModelsTab
              models={state.filteredModels}
              keyword={state.modelKeyword}
              setKeyword={actions.setModelKeyword}
              refreshingModels={state.refreshingModels}
              refreshModels={actions.refreshModels}
            />
          ) : null}

          {state.activeTab === "uploads" ? <UploadsTab apiKey={state.apiKey} /> : null}
          {state.activeTab === "images" ? (
            <AssetGenerationTab
              kind="image"
              apiKey={state.apiKey}
              defaultPrompt={promptValue(state.prompts, PROMPT_IDS.imageDefault)}
            />
          ) : null}
          {state.activeTab === "videos" ? (
            <AssetGenerationTab
              kind="video"
              apiKey={state.apiKey}
              defaultPrompt={promptValue(state.prompts, PROMPT_IDS.videoDefault)}
            />
          ) : null}
          {state.activeTab === "debug" ? (
            <DebugTab
              apiKey={state.apiKey}
              models={state.filteredModels}
              defaultSystemPrompt={promptValue(state.prompts, PROMPT_IDS.debugSystem)}
            />
          ) : null}
        </main>
      </div>
    </div>
  );
}
