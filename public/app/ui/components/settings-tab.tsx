"use client";

import { useTranslation } from "react-i18next";
import type { Dispatch, SetStateAction } from "react";
import type { SettingsResponse } from "../types";
import { Input, Switch } from "@heroui/react";
import { Save, Trash2, RefreshCw, RotateCcw, KeyRound, Settings2, SlidersHorizontal } from "lucide-react";

type SwitchValue = boolean | { target?: { checked?: boolean } };
type BooleanSettingKey = "autoRefresh" | "outThink" | "simpleModelMap";

function selectedSwitchValue(value: SwitchValue) {
  if (typeof value === "boolean") return value;
  return value.target?.checked ?? false;
}

export function SettingsTab({
  settings,
  savingSettings,
  addKeyValue,
  thresholdHours,
  setAddKeyValue,
  setThresholdHours,
  setSettings,
  addRegularKey,
  deleteRegularKey,
  refreshAllAccounts,
  reloadRuntimeConfig,
  saveSettings,
  saveChatCleanupMode,
}: {
  settings: SettingsResponse | null;
  savingSettings: boolean;
  addKeyValue: string;
  thresholdHours: string;
  setAddKeyValue: (value: string) => void;
  setThresholdHours: (value: string) => void;
  setSettings: Dispatch<SetStateAction<SettingsResponse | null>>;
  addRegularKey: () => Promise<void>;
  deleteRegularKey: (key: string) => Promise<void>;
  refreshAllAccounts: (force: boolean) => Promise<void>;
  reloadRuntimeConfig: () => Promise<void>;
  saveSettings: (path: string, body: Record<string, unknown>, successMessage: string) => Promise<void>;
  saveChatCleanupMode: (mode: number) => Promise<void>;
}) {
  const { t } = useTranslation();
  const enabledStrategies = [
    settings?.autoRefresh ?? false,
    settings?.outThink ?? false,
    settings?.simpleModelMap ?? false,
  ].filter(Boolean).length;

  const setBooleanSetting = (key: BooleanSettingKey, value: SwitchValue) => {
    const selected = selectedSwitchValue(value);
    setSettings((current) => (current ? { ...current, [key]: selected } : current));
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Overview stats */}
      <div className="admin-stat-grid">
        <div className="admin-stat-card primary">
          <div className="label">{t("settings.enabledStrategies")}</div>
          <div className="value">{enabledStrategies}/3</div>
          <div className="desc">Auto refresh, thinking output, model mapping</div>
        </div>
        <div className="admin-stat-card primary">
          <div className="label">{t("settings.regularKeyCount")}</div>
          <div className="value">{settings?.regularKeys.length ?? 0}</div>
          <div className="desc">Registered regular access keys</div>
        </div>
        <div className="admin-stat-card primary">
          <div className="label">{t("settings.refreshInterval")}</div>
          <div className="value">{settings?.autoRefreshInterval ?? 21600}s</div>
          <div className="desc">Auto token refresh interval</div>
        </div>
        <div className="admin-stat-card primary">
          <div className="label">{t("settings.searchMode")}</div>
          <div className="value">{settings?.searchInfoMode === "table" ? "Table" : "Text"}</div>
          <div className="desc">Default search result presentation</div>
        </div>
      </div>

      <div className="admin-settings-grid">
        <div className="flex flex-col gap-4">
          {/* Strategies */}
          <div className="admin-card">
            <div className="admin-card-header">
              <div>
                <h3><Settings2 size={16} className="inline mr-1" />{t("settings.strategies")}</h3>
                <p>Strategy switches, refresh params and model mapping</p>
              </div>
            </div>
            <div className="admin-card-body flex flex-col gap-6">
              <div>
                <h4 className="text-sm font-semibold mb-1">Strategy Toggles</h4>
                <p className="text-xs text-[var(--text-secondary)] mb-4">Manage high-frequency switches</p>
                <div className="flex flex-col gap-3">
                  <SwitchCard
                    title={t("settings.autoRefresh")}
                    desc={t("settings.autoRefreshDesc")}
                    checked={settings?.autoRefresh ?? false}
                    onChange={(v) => setBooleanSetting("autoRefresh", v)}
                    onSave={() =>
                      settings &&
                      void saveSettings(
                        "/api/setAutoRefresh",
                        { autoRefresh: settings.autoRefresh, autoRefreshInterval: settings.autoRefreshInterval },
                        t("settings.saveAutoRefresh"),
                      )
                    }
                    saving={savingSettings}
                    disabled={!settings}
                    saveLabel={t("settings.saveAutoRefresh")}
                  />
                  <SwitchCard
                    title={t("settings.outThink")}
                    desc={t("settings.outThinkDesc")}
                    checked={settings?.outThink ?? false}
                    onChange={(v) => setBooleanSetting("outThink", v)}
                    onSave={() =>
                      settings &&
                      void saveSettings("/api/setOutThink", { outThink: settings.outThink }, t("settings.saveOutThink"))
                    }
                    saving={savingSettings}
                    disabled={!settings}
                    saveLabel={t("settings.saveOutThink")}
                    variant="ghost"
                  />
                  <SwitchCard
                    title={t("settings.simpleModelMap")}
                    desc={t("settings.simpleModelMapDesc")}
                    checked={settings?.simpleModelMap ?? false}
                    onChange={(v) => setBooleanSetting("simpleModelMap", v)}
                    onSave={() =>
                      settings &&
                      void saveSettings(
                        "/api/simple-model-map",
                        { simpleModelMap: settings.simpleModelMap },
                        t("settings.saveModelMap"),
                      )
                    }
                    saving={savingSettings}
                    disabled={!settings}
                    saveLabel={t("settings.saveModelMap")}
                    variant="secondary"
                  />
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-1">{t("settings.runParams")}</h4>
                <p className="text-xs text-[var(--text-secondary)] mb-4">Runtime parameters</p>
                <div className="admin-form-grid">
                  <div className="admin-form-group">
                    <label>{t("settings.refreshIntervalLabel")}</label>
                    <Input
                      placeholder="Refresh interval (s)"
                      type="number"
                      value={String(settings?.autoRefreshInterval ?? 21600)}
                      onChange={(e) =>
                        setSettings((c) => (c ? { ...c, autoRefreshInterval: Number(e.target.value) || 0 } : c))
                      }
                    />
                    <button
                      className="admin-btn admin-btn-primary admin-btn-sm self-start mt-1"
                      disabled={!settings || savingSettings}
                      onClick={() =>
                        settings &&
                        void saveSettings(
                          "/api/setAutoRefresh",
                          { autoRefresh: settings.autoRefresh, autoRefreshInterval: settings.autoRefreshInterval },
                          t("settings.saveAutoRefresh"),
                        )
                      }
                    >
                      <Save size={14} />
                      {t("settings.saveRefreshParams")}
                    </button>
                  </div>
                  <div className="admin-form-group">
                    <label>{t("settings.batchConcurrency")}</label>
                    <Input
                      placeholder="Batch concurrency"
                      type="number"
                      value={String(settings?.batchLoginConcurrency ?? 5)}
                      onChange={(e) =>
                        setSettings((c) => (c ? { ...c, batchLoginConcurrency: Number(e.target.value) || 1 } : c))
                      }
                    />
                    <button
                      className="admin-btn admin-btn-secondary admin-btn-sm self-start mt-1"
                      disabled={!settings || savingSettings}
                      onClick={() =>
                        settings &&
                        void saveSettings(
                          "/api/setBatchLoginConcurrency",
                          { batchLoginConcurrency: settings.batchLoginConcurrency },
                          t("settings.saveConcurrency"),
                        )
                      }
                    >
                      <Save size={14} />
                      {t("settings.saveConcurrency")}
                    </button>
                  </div>
                  <div className="admin-form-group">
                    <label>{t("settings.searchInfoMode")}</label>
                    <select
                      className="admin-select"
                      value={settings?.searchInfoMode ?? "text"}
                      onChange={(e) =>
                        setSettings((c) => (c ? { ...c, searchInfoMode: e.target.value as "table" | "text" } : c))
                      }
                    >
                      <option value="text">Text</option>
                      <option value="table">Table</option>
                    </select>
                    <button
                      className="admin-btn admin-btn-secondary admin-btn-sm self-start mt-1"
                      disabled={!settings || savingSettings}
                      onClick={() =>
                        settings &&
                        void saveSettings(
                          "/api/search-info-mode",
                          { searchInfoMode: settings.searchInfoMode },
                          t("settings.saveSearchMode"),
                        )
                      }
                    >
                      <Save size={14} />
                      {t("settings.saveSearchMode")}
                    </button>
                  </div>
                  <div className="admin-form-group">
                    <label>{t("settings.chatCleanupMode")}</label>
                    <select
                      className="admin-select"
                      value={String(settings?.chatCleanupMode ?? 0)}
                      onChange={(e) =>
                        setSettings((c) => (c ? { ...c, chatCleanupMode: Number(e.target.value) } : c))
                      }
                    >
                      <option value="0">{t("settings.cleanupNone")}</option>
                      <option value="1">{t("settings.cleanupProgram")}</option>
                      <option value="2">{t("settings.cleanupAll")}</option>
                    </select>
                    <button
                      className="admin-btn admin-btn-secondary admin-btn-sm self-start mt-1"
                      disabled={!settings || savingSettings}
                      onClick={() => settings && void saveChatCleanupMode(settings.chatCleanupMode)}
                    >
                      <Save size={14} />
                      {t("settings.saveCleanupMode")}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {/* API Keys */}
          <div className="admin-card">
            <div className="admin-card-header">
              <div>
                <h3><KeyRound size={16} className="inline mr-1" />{t("settings.apiKeys")}</h3>
                <p>Manage regular API Keys separately</p>
              </div>
            </div>
            <div className="admin-card-body flex flex-col gap-4">
              <div className="flex gap-3">
                <Input
                  placeholder={t("settings.addKey")}
                  value={addKeyValue}
                  onChange={(e) => setAddKeyValue(e.target.value)}
                  className="flex-1"
                />
                <button className="admin-btn admin-btn-primary" onClick={() => void addRegularKey()}>
                  <PlusIcon />
                  {t("settings.addKeyBtn")}
                </button>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-3">{t("settings.existingKeys")}</h4>
                {settings?.regularKeys.map((key) => (
                  <div className="admin-key-row" key={key}>
                    <span className="truncate">{key}</span>
                    <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => void deleteRegularKey(key)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {!settings?.regularKeys.length ? (
                  <p className="text-sm text-[var(--text-muted)]">{t("settings.noKeys")}</p>
                ) : null}
              </div>
            </div>
          </div>

          {/* Refresh & Hot reload */}
          <div className="admin-card">
            <div className="admin-card-header">
              <div>
                <h3><SlidersHorizontal size={16} className="inline mr-1" />{t("settings.refreshAndReload")}</h3>
                <p>Account refresh and .env reload</p>
              </div>
            </div>
            <div className="admin-card-body flex flex-col gap-5">
              <div className="admin-form-group">
                <label>{t("settings.thresholdHours")}</label>
                <Input
                  placeholder="Threshold (hours)"
                  type="number"
                  value={thresholdHours}
                  onChange={(e) => setThresholdHours(e.target.value)}
                />
              </div>

              <div className="flex gap-3">
                <button className="admin-btn admin-btn-secondary flex-1" onClick={() => void refreshAllAccounts(false)}>
                  <RefreshCw size={14} />
                  {t("settings.thresholdRefresh")}
                </button>
                <button className="admin-btn admin-btn-danger flex-1" onClick={() => void refreshAllAccounts(true)}>
                  <RotateCcw size={14} />
                  {t("settings.forceRefresh")}
                </button>
              </div>

              <div className="border-t border-[var(--border)] pt-4">
                <h4 className="text-sm font-semibold mb-1">{t("settings.hotReload")}</h4>
                <p className="text-xs text-[var(--text-secondary)] mb-3">
                  Reload .env after manual edits
                </p>
                <button
                  className="admin-btn admin-btn-primary"
                  disabled={savingSettings}
                  onClick={() => void reloadRuntimeConfig()}
                >
                  <RotateCcw size={14} />
                  {t("settings.reloadEnv")}
                </button>
              </div>

              <div className="p-4 rounded-lg border border-[var(--danger)] bg-[var(--danger-light)] text-sm">
                <strong className="text-[var(--danger)] block mb-1">{t("settings.opsReminder")}</strong>
                <p className="text-[var(--text-secondary)]">{t("settings.opsReminderText")}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SwitchCard({
  title,
  desc,
  checked,
  onChange,
  onSave,
  saving,
  disabled,
  saveLabel,
  variant = "primary",
}: {
  title: string;
  desc: string;
  checked: boolean;
  onChange: (v: SwitchValue) => void;
  onSave: () => void;
  saving: boolean;
  disabled: boolean;
  saveLabel: string;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const variantClass =
    variant === "primary"
      ? "admin-btn-primary"
      : variant === "secondary"
      ? "admin-btn-secondary"
      : "admin-btn-ghost";

  return (
    <div className="admin-switch-card">
      <div>
        <strong>{title}</strong>
        <p>{desc}</p>
      </div>
      <div className="flex flex-col items-end gap-3">
        <Switch isSelected={checked} onChange={(value) => onChange(value)}>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch>
        <button className={`admin-btn ${variantClass} admin-btn-sm`} disabled={disabled || saving} onClick={onSave}>
          <Save size={14} />
          {saveLabel}
        </button>
      </div>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
