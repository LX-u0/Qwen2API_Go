"use client";

import { useTranslation } from "react-i18next";
import type { Dispatch, SetStateAction } from "react";
import type { AccountItem, AccountsResponse, BatchTaskResponse, Filters } from "../types";
import { formatDateTime, formatHours, getStatusTone } from "../utils";
import { SectionTitle } from "./primitives";
import { Input, ProgressBar } from "@heroui/react";
import { Plus, Trash2, RefreshCw, Search, Filter, ChevronLeft, ChevronRight, UserPlus, ListRestart } from "lucide-react";

type AccountsActions = {
  setNewAccountEmail: (value: string) => void;
  setNewAccountPassword: (value: string) => void;
  setBatchAccountsText: (value: string) => void;
  createAccount: () => Promise<void>;
  createBatchTask: () => Promise<void>;
  refreshAccounts: () => Promise<void>;
  setDraftKeyword: (value: string) => void;
  setFilters: Dispatch<SetStateAction<Filters>>;
  refreshAccount: (email: string) => Promise<void>;
  deleteAccount: (email: string) => Promise<void>;
};

export function AccountsTab({
  accounts,
  batchTask,
  filters,
  draftKeyword,
  newAccountEmail,
  newAccountPassword,
  batchAccountsText,
  loadingAccounts,
  actions,
}: {
  accounts: AccountsResponse | null;
  batchTask: BatchTaskResponse | null;
  filters: Filters;
  draftKeyword: string;
  newAccountEmail: string;
  newAccountPassword: string;
  batchAccountsText: string;
  loadingAccounts: boolean;
  actions: AccountsActions;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-6">
      {/* Action deck */}
      <div className="admin-grid-2">
        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h3>{t("accounts.addAccount")}</h3>
              <p>Quick single account creation</p>
            </div>
          </div>
          <div className="admin-card-body flex flex-col gap-4">
            <Input
              placeholder="email@example.com"
              type="email"
              value={newAccountEmail}
              onChange={(e) => actions.setNewAccountEmail(e.target.value)}
            />
            <Input
              placeholder="Password"
              type="password"
              value={newAccountPassword}
              onChange={(e) => actions.setNewAccountPassword(e.target.value)}
            />
            <button className="admin-btn admin-btn-primary self-start" onClick={() => void actions.createAccount()}>
              <Plus size={16} />
              {t("common.create")}
            </button>
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h3>{t("accounts.batchImport")}</h3>
              <p>One email:password per line, async task with polling</p>
            </div>
          </div>
          <div className="admin-card-body flex flex-col gap-4">
            <textarea
              className="admin-textarea"
              rows={6}
              placeholder={t("accounts.batchPlaceholder")}
              value={batchAccountsText}
              onChange={(e) => actions.setBatchAccountsText(e.target.value)}
            />
            <button className="admin-btn admin-btn-secondary self-start" onClick={() => void actions.createBatchTask()}>
              <ListRestart size={16} />
              {t("accounts.createBatch")}
            </button>
            {batchTask ? (
              <div className="admin-task-box">
                <div className="admin-task-header">
                  <strong className="text-sm">{batchTask.message}</strong>
                  <span className={`admin-tag ${getStatusTone(batchTask.status)}`}>{batchTask.status}</span>
                </div>
                <ProgressBar value={batchTask.progress} />
                <div className="admin-task-meta">
                  <span>Progress {batchTask.completed}/{batchTask.total}</span>
                  <span>{t("common.success")} {batchTask.success}</span>
                  <span>{t("common.failed")} {batchTask.failed}</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Account list */}
      <div className="admin-card">
        <div className="admin-card-header">
          <SectionTitle
            title={t("accounts.accountList")}
            description="Server-side pagination, filtering, sorting and search"
            action={
              <button className="admin-btn admin-btn-ghost admin-btn-sm" onClick={() => void actions.refreshAccounts()}>
                <RefreshCw size={14} className={loadingAccounts ? "animate-spin" : ""} />
                {loadingAccounts ? t("common.loading") : t("common.refresh")}
              </button>
            }
          />
        </div>
        <div className="admin-card-body">
          <div className="admin-toolbar">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <Input
                placeholder={t("accounts.searchEmail")}
                value={draftKeyword}
                onChange={(e) => actions.setDraftKeyword(e.target.value)}
                className="w-64 pl-9"
              />
            </div>
            <select
              className="admin-select w-36"
              value={filters.status}
              onChange={(e) => actions.setFilters((c) => ({ ...c, status: e.target.value, page: 1 }))}
            >
              <option value="all">{t("accounts.allStatus")}</option>
              <option value="valid">{t("accounts.statusValid")}</option>
              <option value="expiringSoon">{t("accounts.statusExpiring")}</option>
              <option value="expired">{t("accounts.statusExpired")}</option>
              <option value="invalid">{t("accounts.statusInvalid")}</option>
            </select>
            <select
              className="admin-select w-36"
              value={filters.sortBy}
              onChange={(e) => actions.setFilters((c) => ({ ...c, sortBy: e.target.value, page: 1 }))}
            >
              <option value="expires">{t("accounts.sortByExpires")}</option>
              <option value="email">{t("accounts.sortByEmail")}</option>
              <option value="status">{t("accounts.sortByStatus")}</option>
            </select>
            <select
              className="admin-select w-28"
              value={filters.sortOrder}
              onChange={(e) => actions.setFilters((c) => ({ ...c, sortOrder: e.target.value as "asc" | "desc", page: 1 }))}
            >
              <option value="desc">{t("accounts.desc")}</option>
              <option value="asc">{t("accounts.asc")}</option>
            </select>
            <select
              className="admin-select w-28"
              value={String(filters.pageSize)}
              onChange={(e) => actions.setFilters((c) => ({ ...c, pageSize: Number(e.target.value), page: 1 }))}
            >
              <option value="25">{t("accounts.perPage25")}</option>
              <option value="50">{t("accounts.perPage50")}</option>
              <option value="100">{t("accounts.perPage100")}</option>
              <option value="200">{t("accounts.perPage200")}</option>
            </select>
          </div>

          <div className="admin-chips">
            <span className="admin-tag primary">{t("common.total")} {accounts?.total ?? 0}</span>
            <span className="admin-tag success">{t("accounts.statusValid")} {accounts?.filteredStats.valid ?? 0}</span>
            <span className="admin-tag warning">{t("accounts.statusExpiring")} {accounts?.filteredStats.expiringSoon ?? 0}</span>
            <span className="admin-tag danger">
              {(accounts?.filteredStats.expired ?? 0) + (accounts?.filteredStats.invalid ?? 0)}
            </span>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t("accounts.email")}</th>
                  <th>{t("accounts.status")}</th>
                  <th>{t("accounts.remainingHours")}</th>
                  <th>{t("accounts.expiresAt")}</th>
                  <th>{t("accounts.password")}</th>
                  <th>{t("accounts.token")}</th>
                  <th className="text-right">{t("accounts.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {accounts?.data.map((account) => (
                  <AccountRow
                    key={account.email}
                    account={account}
                    refreshAccount={actions.refreshAccount}
                    deleteAccount={actions.deleteAccount}
                  />
                ))}
                {!accounts?.data.length ? (
                  <tr>
                    <td colSpan={7} className="empty">
                      {t("accounts.noData")}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="admin-pagination">
            <span>
              {t("accounts.pageInfo", { page: accounts?.page ?? 1, totalPages: accounts?.totalPages ?? 1, total: accounts?.total ?? 0 })}
            </span>
            <div className="admin-pagination-actions">
              <button
                className="admin-btn admin-btn-ghost admin-btn-sm"
                onClick={() => actions.setFilters((c) => ({ ...c, page: Math.max(1, c.page - 1) }))}
              >
                <ChevronLeft size={14} />
                {t("accounts.prev")}
              </button>
              <button
                className="admin-btn admin-btn-secondary admin-btn-sm"
                onClick={() =>
                  actions.setFilters((c) => ({
                    ...c,
                    page: Math.min(accounts?.totalPages ?? c.page, c.page + 1),
                  }))
                }
              >
                {t("accounts.next")}
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountRow({
  account,
  refreshAccount,
  deleteAccount,
}: {
  account: AccountItem;
  refreshAccount: (email: string) => Promise<void>;
  deleteAccount: (email: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <tr>
      <td className="font-medium">{account.email}</td>
      <td>
        <span className={`admin-tag ${getStatusTone(account.status)}`}>{account.status}</span>
      </td>
      <td>{formatHours(account.remainingHours)}</td>
      <td>{formatDateTime(account.expiresAt)}</td>
      <td className="mono">{account.password || "-"}</td>
      <td className="mono">{account.token || "-"}</td>
      <td className="text-right">
        <div className="flex justify-end gap-2">
          <button
            className="admin-btn admin-btn-secondary admin-btn-sm"
            onClick={() => void refreshAccount(account.email)}
          >
            <RefreshCw size={14} />
            {t("accounts.refresh")}
          </button>
          <button
            className="admin-btn admin-btn-danger admin-btn-sm"
            onClick={() => void deleteAccount(account.email)}
          >
            <Trash2 size={14} />
            {t("common.delete")}
          </button>
        </div>
      </td>
    </tr>
  );
}
