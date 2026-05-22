"use client";

import { useTranslation } from "react-i18next";
import { Input } from "@heroui/react";
import { useMemo, useState } from "react";
import { Send, Eraser, Terminal, Zap } from "lucide-react";
import { apiRequest } from "../api";
import type { ChatCompletionResponse, ModelItem } from "../types";
import { EndpointItem } from "./primitives";

const reasoningEffortOptions = ["", "none", "minimal", "low", "medium", "high", "xhigh"] as const;

export function DebugTab({
  apiKey,
  models,
  defaultSystemPrompt,
}: {
  apiKey: string;
  models: ModelItem[];
  defaultSystemPrompt?: string;
}) {
  const { t } = useTranslation();
  const availableModels = useMemo(() => models.map((item) => item.id), [models]);
  const [model, setModel] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(defaultSystemPrompt || "You are a debugging assistant.");
  const [message, setMessage] = useState("Hello, please introduce yourself briefly.");
  const [temperature, setTemperature] = useState("0.7");
  const [maxTokens, setMaxTokens] = useState("1024");
  const [reasoningEffort, setReasoningEffort] = useState<(typeof reasoningEffortOptions)[number]>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ChatCompletionResponse | null>(null);
  const [raw, setRaw] = useState("");
  const selectedModel = model || availableModels[0] || "";

  async function submitDebugChat() {
    if (!apiKey || !selectedModel || !message.trim()) return;
    try {
      setLoading(true);
      setError("");
      setResult(null);
      setRaw("");
      const messages: Array<{ role: string; content: string }> = [];
      if (systemPrompt.trim()) messages.push({ role: "system", content: systemPrompt.trim() });
      messages.push({ role: "user", content: message.trim() });
      const body: Record<string, unknown> = {
        model: selectedModel,
        stream: false,
        temperature: Number(temperature) || 0,
        max_tokens: Number(maxTokens) || 1024,
        messages,
      };
      if (reasoningEffort) body.reasoning_effort = reasoningEffort;
      const response = await apiRequest<ChatCompletionResponse>(
        "/v1/chat/completions",
        { method: "POST", body: JSON.stringify(body) },
        apiKey,
      );
      setResult(response);
      setRaw(JSON.stringify(response, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Debug request failed");
    } finally {
      setLoading(false);
    }
  }

  const content = result?.choices?.[0]?.message?.content || "";

  return (
    <div className="admin-grid-2">
      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3><Terminal size={16} className="inline mr-1" />{t("debug.title")}</h3>
            <p>{t("debug.subtitle")}</p>
          </div>
        </div>
        <div className="admin-card-body flex flex-col gap-5">
          <div className="admin-form-grid">
            <div className="admin-form-group">
              <label>{t("debug.model")}</label>
              <select className="admin-select" value={selectedModel} onChange={(e) => setModel(e.target.value)}>
                {availableModels.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
            <div className="admin-form-group">
              <label>{t("debug.temperature")}</label>
              <Input type="number" value={temperature} onChange={(e) => setTemperature(e.target.value)} />
            </div>
            <div className="admin-form-group">
              <label>{t("debug.maxTokens")}</label>
              <Input type="number" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} />
            </div>
            <div className="admin-form-group">
              <label>{t("debug.reasoningEffort")}</label>
              <select className="admin-select" value={reasoningEffort} onChange={(e) => setReasoningEffort(e.target.value as (typeof reasoningEffortOptions)[number])}>
                <option value="">default</option>
                {reasoningEffortOptions.filter((item) => item).map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="admin-grid-2">
            <div className="admin-form-group">
              <label>{t("debug.systemPrompt")}</label>
              <textarea className="admin-textarea" rows={5} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} />
            </div>
            <div className="admin-form-group">
              <label>{t("debug.userMessage")}</label>
              <textarea className="admin-textarea" rows={5} value={message} onChange={(e) => setMessage(e.target.value)} />
            </div>
          </div>

          <div className="flex gap-3">
            <button className="admin-btn admin-btn-primary" disabled={!selectedModel || !message.trim() || loading} onClick={() => void submitDebugChat()}>
              {loading ? <Zap size={16} className="animate-pulse" /> : <Send size={16} />}
              {loading ? t("debug.sending") : t("debug.send")}
            </button>
            <button className="admin-btn admin-btn-ghost" disabled={loading} onClick={() => { setResult(null); setRaw(""); setError(""); }}>
              <Eraser size={16} />
              {t("debug.clearResult")}
            </button>
          </div>

          {error ? (
            <div className="rounded-lg bg-[var(--danger-light)] p-3 text-sm font-medium text-[var(--danger)]">
              {error}
            </div>
          ) : null}

          <div className="admin-grid-2">
            <div className="admin-form-group">
              <label>{t("debug.modelReply")}</label>
              <div className="admin-debug-box">{content || "Send a request to see model response."}</div>
            </div>
            <div className="admin-form-group">
              <label>{t("debug.tokenUsage")}</label>
              <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">{t("debug.input")}</span>
                  <strong>{result?.usage?.prompt_tokens ?? 0}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">{t("debug.output")}</span>
                  <strong>{result?.usage?.completion_tokens ?? 0}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">{t("debug.total")}</span>
                  <strong>{result?.usage?.total_tokens ?? 0}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">{t("debug.model")}</span>
                  <strong className="mono">{result?.model ?? selectedModel ?? "-"}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="admin-form-group">
            <label>{t("debug.rawJson")}</label>
            <pre className="admin-code">{raw || "{ }"}</pre>
          </div>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3><Terminal size={16} className="inline mr-1" />{t("debug.apiOverview")}</h3>
            <p>{t("debug.apiOverviewSubtitle")}</p>
          </div>
        </div>
        <div className="admin-card-body flex flex-col gap-1">
          <EndpointItem method="POST" path="/verify" summary="Admin login verification." />
          <EndpointItem method="GET" path="/api/dashboard/overview" summary="Dashboard overview aggregate." />
          <EndpointItem method="GET" path="/api/getAllAccounts" summary="Server-paginated account query." />
          <EndpointItem method="GET" path="/api/models" summary="Protected model list for debug selection." />
          <EndpointItem method="POST" path="/v1/chat/completions" summary="Real chat debug endpoint." />
          <EndpointItem method="POST" path="/v1/uploads" summary="OSS upload, multipart / JSON base64 / raw body." />

          <pre className="admin-code mt-4">{`curl -X POST /v1/chat/completions \\
  -H "Authorization: Bearer ${apiKey ? "***" : "sk-admin"}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model":"${selectedModel || "qwen3-235b-a22b"}",
    "stream":false,
${reasoningEffort ? `    "reasoning_effort":"${reasoningEffort}",\n` : ""}    "messages":[{"role":"user","content":"Hello"}]
  }'`}</pre>
        </div>
      </div>
    </div>
  );
}
