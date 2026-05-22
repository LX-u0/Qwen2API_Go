"use client";

import { useTranslation } from "react-i18next";
import {
  Copy,
  ExternalLink,
  ImageIcon,
  RefreshCw,
  Sparkles,
  Video,
  Wand2,
  RotateCcw,
  AlertCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ApiRequestError, apiRequest, apiRequestEnvelope } from "../api";
import type { ModelItem, ModelsResponse } from "../types";

type AssetKind = "image" | "video";

type AssetGenerationResponse = {
  id?: string;
  object?: string;
  created?: number;
  status?: string;
  data?: Array<{
    url?: string;
    b64_json?: string;
  }>;
};

const IMAGE_SIZE_OPTIONS = [
  { value: "1024x1024", label: "1:1" },
  { value: "1536x1024", label: "4:3" },
  { value: "1024x1536", label: "3:4" },
  { value: "1792x1024", label: "16:9" },
  { value: "1024x1792", label: "9:16" },
];

const VIDEO_SIZE_OPTIONS = [
  { value: "1:1", label: "1:1" },
  { value: "3:4", label: "3:4" },
  { value: "4:3", label: "4:3" },
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
];

export function AssetGenerationTab({ kind, apiKey, defaultPrompt }: { kind: AssetKind; apiKey: string; defaultPrompt?: string }) {
  const { t } = useTranslation();
  const configuredDefaultPrompt = defaultPrompt || (kind === "image"
    ? "A clean product poster with a glass-textured Qwen2API logo on a desk, soft studio light, HD details"
    : "A glowing Qwen2API logo slowly rising from a dark workbench, camera slightly pushing in, tech feel, smooth motion");
  const Icon = kind === "image" ? ImageIcon : Video;
  const sizeOptions = kind === "video" ? VIDEO_SIZE_OPTIONS : IMAGE_SIZE_OPTIONS;
  const [models, setModels] = useState<ModelItem[]>([]);
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState(configuredDefaultPrompt);
  const [size, setSize] = useState(sizeOptions[0].value);
  const [loading, setLoading] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AssetGenerationResponse | null>(null);
  const [raw, setRaw] = useState("");
  const [copied, setCopied] = useState(false);

  const selectedModel = model || models[0]?.id || "";
  const selectedSize = sizeOptions.some((item) => item.value === size) ? size : sizeOptions[0].value;
  const resultUrl = result?.data?.[0]?.url || "";
  const canSubmit = Boolean(selectedModel) && Boolean(prompt.trim()) && !loading;

  const apiPath = kind === "image" ? "/v1/images/generations" : "/v1/videos";
  const modelSuffix = kind === "image" ? "-image" : "-video";
  const submitLabel = kind === "image" ? t("images.generate") : t("videos.generate");
  const loadingLabel = kind === "image" ? t("images.generating") : t("videos.generating");

  const curlExample = useMemo(
    () => `curl -X POST ${apiPath} \\
  -H "Authorization: Bearer ${apiKey ? "***" : "sk-admin"}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model":"${selectedModel || modelSuffix.replace("-", "qwen-")}",
    "prompt":"${prompt.trim() || "Describe content"}",
    "size":"${selectedSize}"
  }'`,
    [apiKey, apiPath, modelSuffix, prompt, selectedModel, selectedSize],
  );

  useEffect(() => {
    let cancelled = false;
    async function loadModels() {
      if (!apiKey) return;
      try {
        setLoadingModels(true);
        const response = await apiRequest<ModelsResponse>("/api/models", {}, apiKey);
        const filtered = (response.data || []).filter((item) => item.id.endsWith(modelSuffix));
        if (cancelled) return;
        setModels(filtered);
        setModel((current) => {
          if (current && filtered.some((item) => item.id === current)) return current;
          return filtered[0]?.id || "";
        });
      } catch {
        if (!cancelled) setError("Failed to load models.");
      } finally {
        if (!cancelled) setLoadingModels(false);
      }
    }
    void loadModels();
    return () => { cancelled = true; };
  }, [apiKey, modelSuffix]);

  async function submitGeneration() {
    if (!canSubmit) return;
    try {
      setLoading(true);
      setError("");
      setCopied(false);
      setResult(null);
      setRaw("");
      const response = await apiRequestEnvelope<AssetGenerationResponse>(
        apiPath,
        { method: "POST", body: JSON.stringify({ model: selectedModel, prompt: prompt.trim(), size: selectedSize }) },
        apiKey,
      );
      setResult(response.body);
      setRaw(JSON.stringify(response, null, 2));
      if (!response.body.data?.[0]?.url) setError("No resource URL found.");
    } catch (err) {
      if (err instanceof ApiRequestError) setRaw(JSON.stringify(err.response, null, 2));
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setLoading(false);
    }
  }

  async function copyResultUrl() {
    if (!resultUrl) return;
    try {
      await navigator.clipboard.writeText(resultUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Copy failed, please copy manually.");
    }
  }

  if (loadingModels) {
    return (
      <div className="asset-empty-state">
        <RefreshCw size={22} className="animate-spin" />
        <strong>Loading models</strong>
        <span>Please wait...</span>
      </div>
    );
  }

  return (
    <div className="asset-tool-grid">
      <section className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3><Wand2 size={16} className="inline mr-1" />{kind === "image" ? t("images.title") : t("videos.title")}</h3>
            <p>{kind === "image" ? t("images.subtitle") : t("videos.subtitle")}</p>
          </div>
        </div>
        <div className="admin-card-body flex flex-col gap-5">
          <div className="admin-form-grid">
            <div className="admin-form-group">
              <label>{kind === "image" ? t("images.model") : t("videos.model")}</label>
              <select className="admin-select" value={selectedModel} onChange={(event) => setModel(event.target.value)}>
                {models.map((item) => (
                  <option key={item.id} value={item.id}>{item.id}</option>
                ))}
              </select>
            </div>
            <div className="admin-form-group">
              <label>{kind === "image" ? t("images.size") : t("videos.size")}</label>
              <select className="admin-select" value={selectedSize} onChange={(event) => setSize(event.target.value)}>
                {sizeOptions.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </div>
            <div className="admin-form-group">
              <label>Available</label>
              <div className="asset-inline-stat">
                <strong>{models.length}</strong>
                <span>{modelSuffix}</span>
              </div>
            </div>
          </div>

          <div className="admin-form-group">
            <label>{t("images.prompt")}</label>
            <textarea className="admin-textarea" rows={8} placeholder={kind === "image" ? "Describe the image..." : "Describe the video..."} value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          </div>

          <div className="flex flex-wrap gap-3">
            <button className="admin-btn admin-btn-primary" disabled={!canSubmit} onClick={() => void submitGeneration()}>
              {loading ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {loading ? loadingLabel : submitLabel}
            </button>
            <button className="admin-btn admin-btn-secondary" disabled={loading} onClick={() => { setPrompt(configuredDefaultPrompt); setResult(null); setRaw(""); setError(""); setCopied(false); }}>
              <RotateCcw size={16} />
              {t("images.reset")}
            </button>
          </div>

          {!models.length ? (
            <div className="asset-alert flex items-center gap-2">
              <AlertCircle size={16} />
              No {modelSuffix} variants in model list.
            </div>
          ) : null}
          {error ? <div className="asset-alert danger flex items-center gap-2"><AlertCircle size={16} />{error}</div> : null}
        </div>
      </section>

      <section className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3>{kind === "image" ? t("images.resultTitle") : t("videos.resultTitle")}</h3>
            <p>{kind === "image" ? t("images.resultSubtitle") : t("videos.resultSubtitle")}</p>
          </div>
        </div>
        <div className="admin-card-body flex flex-col gap-5">
          <div className="asset-preview">
            {resultUrl && kind === "image" ? <img src={resultUrl} alt="AI generated" /> : null}
            {resultUrl && kind === "video" ? <video src={resultUrl} controls playsInline /> : null}
            {!resultUrl ? (
              <div className="asset-preview-empty">
                <Icon size={36} />
                <strong>No result yet</strong>
                <span>Submit request to see result here.</span>
              </div>
            ) : null}
          </div>

          {resultUrl ? (
            <div className="asset-result-actions">
              <a className="admin-btn admin-btn-secondary" href={resultUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={16} />
                {t("images.openLink")}
              </a>
              <button className="admin-btn admin-btn-ghost" onClick={() => void copyResultUrl()}>
                <Copy size={16} />
                {copied ? t("common.copied") : t("images.copyUrl")}
              </button>
            </div>
          ) : null}

          <div className="admin-form-group">
            <label>{t("images.resourceUrl")}</label>
            <div className="asset-url-box">{resultUrl || "Resource URL will appear after generation."}</div>
          </div>

          <div className="admin-form-group">
            <label>{t("images.reqExample")}</label>
            <pre className="admin-code">{curlExample}</pre>
          </div>

          <div className="admin-form-group">
            <label>{t("images.fullJson")}</label>
            <pre className="admin-code">{raw || "{ }"}</pre>
          </div>
        </div>
      </section>
    </div>
  );
}
