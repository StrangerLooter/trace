"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Eraser, ShieldAlert } from "lucide-react";
import type { SanitizationReportRecord } from "@trace/report-schema";
import {
  createSanitizedZipBundle,
  getSanitizationCapabilities,
  sanitizeLocalFile,
  type SanitizationCategoryId,
  type SanitizationResult,
} from "@trace/sanitizers";
import { fetchBackendWithWakeRetry, getApiBaseUrl, warmBackendHealth } from "@/lib/backend-client";
import type { FileSession } from "@/stores/workspace-store";

export function SanitizerPanel({
  session,
  allSessions,
  onRecordSanitization,
}: {
  session: FileSession;
  allSessions?: FileSession[];
  onRecordSanitization: (fileId: string, record: SanitizationReportRecord) => void;
}) {
  const formatId = session.identification?.formatId ?? "unknown";
  const caps = getSanitizationCapabilities(formatId);
  const [selected, setSelected] = useState<Set<SanitizationCategoryId>>(new Set());
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SanitizationResult | null>(null);
  const [backendConsent, setBackendConsent] = useState(false);
  const [backendResult, setBackendResult] = useState<{
    status: string;
    downloadUrl: string;
    downloadFilename: string;
    removedKeys: string[];
    warnings: string[];
  } | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);

  const orientationField = session.fields.find(
    (f) => f.rawKey === "Orientation" && f.value !== 1 && f.value !== "Horizontal (normal)"
  );
  const localBatchCandidates = (allSessions ?? []).filter(
    (s) => getSanitizationCapabilities(s.identification?.formatId ?? "unknown").executionMode === "local_browser"
  );

  const handleBatchZip = async () => {
    if (localBatchCandidates.length < 2) return;
    setBatchBusy(true);
    try {
      const outputs: Array<{ filename: string; bytes: Uint8Array }> = [];
      for (const s of localBatchCandidates) {
        const fid = s.identification?.formatId ?? "unknown";
        const c = getSanitizationCapabilities(fid);
        const cats = c.categories.filter((cat) => cat.sensitiveDefault).map((cat) => cat.id);
        if (cats.length === 0) continue;
        const r = await sanitizeLocalFile(s.file, s.fileName, fid, cats);
        if (r.outputBytes.byteLength > 0) {
          outputs.push({ filename: r.suggestedFilename, bytes: r.outputBytes });
        }
      }
      if (outputs.length > 0) {
        const zipBytes = createSanitizedZipBundle(outputs);
        const blob = new Blob([zipBytes.slice()], { type: "application/zip" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "trace-sanitized-batch.zip";
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setBatchBusy(false);
    }
  };

  const handleBakeOrientationAndStrip = async () => {
    setRunning(true);
    try {
      const bitmap = await createImageBitmap(session.file);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
      bitmap.close();
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.94));
      if (!blob) return;
      const clean = await sanitizeLocalFile(blob, session.fileName, "jpeg", Array.from(selected));
      setResult(clean);
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    const defaults = new Set<SanitizationCategoryId>();
    for (const cat of caps.categories) {
      if (cat.sensitiveDefault) defaults.add(cat.id);
    }
    setSelected(defaults);
    setResult(null);
    setBackendResult(null);
    setBackendError(null);
    setBackendConsent(false);
  }, [session.fileId, formatId]);

  const toggleCategory = (id: SanitizationCategoryId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleLocalSanitize = async () => {
    if (selected.size === 0) return;
    setRunning(true);
    try {
      const res = await sanitizeLocalFile(
        session.file,
        session.fileName,
        formatId,
        Array.from(selected)
      );
      setResult(res);
      onRecordSanitization(session.fileId, {
        performedAtIso: new Date().toISOString(),
        strategy: caps.strategyName,
        removedCategories: Array.from(selected),
        statuses: res.categoryStatuses,
        warnings: res.warnings,
      });
    } finally {
      setRunning(false);
    }
  };

  const handleDownloadLocal = () => {
    if (!result || result.outputBytes.byteLength === 0) return;
    const blob = new Blob([result.outputBytes.slice()], { type: result.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.suggestedFilename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBackendPdfSanitize = async () => {
    if (!backendConsent) return;
    setRunning(true);
    setBackendStatus(null);
    setBackendError(null);
    try {
      const apiBase = getApiBaseUrl();
      const form = new FormData();
      form.append("file", session.file, session.fileName);
      const resp = await fetchBackendWithWakeRetry(
        "/api/v1/sanitize",
        {
          method: "POST",
          body: form,
        },
        setBackendStatus
      );
      const data = await resp.json();
      if (!resp.ok) {
        setBackendError(data.detail || "Backend PDF sanitization failed.");
        return;
      }
      setBackendResult({
        status: data.status,
        downloadUrl: `${apiBase}${data.download_url}`,
        downloadFilename: data.download_filename,
        removedKeys: data.removed_keys ?? [],
        warnings: data.warnings ?? [],
      });
      onRecordSanitization(session.fileId, {
        performedAtIso: new Date().toISOString(),
        strategy: caps.strategyName,
        removedCategories: ["pdf_metadata"],
        statuses: [{ category: "pdf_metadata", status: data.status }],
        warnings: data.warnings ?? [],
      });
    } catch {
      setBackendError(
        "Unable to reach isolated backend API. Confirm backend server is running and CORS permits this origin."
      );
    } finally {
      setRunning(false);
      setBackendStatus(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono-tech text-[11px] uppercase tracking-wider text-[var(--accent-primary)]">
              Format-Specific Metadata Sanitizer
            </p>
            <h3 className="mt-1 text-base font-medium text-[var(--text-primary)]">
              {caps.strategyName}
            </h3>
          </div>
          <span className="font-mono-tech rounded-full border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-1 text-[11px] text-[var(--text-secondary)]">
            Original Preserved
          </span>
        </div>

        <ul className="mt-3 space-y-1 text-xs text-[var(--status-warning)]">
          {caps.generalWarnings.map((w) => (
            <li key={w} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      </div>

      {!caps.supported ? (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-6 text-sm text-[var(--text-secondary)]">
          Status: <strong className="text-[var(--text-primary)]">Unsupported metadata</strong> — TRACE
          refuses to alter <code className="font-mono-tech">{formatId}</code> files because no verified
          format-specific cleaner is available for this container.
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Category Selection & Preview */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-medium text-[var(--text-primary)]">
                1. Select Metadata Categories
              </h4>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() =>
                    setSelected(
                      new Set(caps.categories.filter((c) => c.sensitiveDefault).map((c) => c.id))
                    )
                  }
                  className="rounded border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 py-0.5 text-[11px] text-[var(--accent-primary)] hover:border-[var(--accent-primary)]"
                >
                  Strict Privacy
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(new Set(caps.categories.map((c) => c.id)))}
                  className="rounded border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Select All
                </button>
              </div>
            </div>

            {orientationField && formatId === "jpeg" && (
              <div className="rounded-lg border border-[var(--status-warning)]/40 bg-[var(--status-warning)]/10 p-3 text-xs">
                <p className="font-medium text-[var(--status-warning)]">
                  Non-Normal EXIF Orientation ({String(orientationField.value)})
                </p>
                <p className="mt-1 text-[var(--text-secondary)]">
                  Stripping EXIF directly may rotate this portrait sideways in some viewers. You can bake the pixel orientation into a clean re-encoded JPEG instead:
                </p>
                <button
                  type="button"
                  disabled={running}
                  onClick={handleBakeOrientationAndStrip}
                  className="mt-2 rounded border border-[var(--status-warning)]/50 bg-[var(--bg-primary)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:border-[var(--accent-primary)]"
                >
                  Re-Orient Pixels &amp; Clean JPEG
                </button>
              </div>
            )}

            <div className="space-y-2.5">
              {caps.categories.map((cat) => (
                <label
                  key={cat.id}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-3"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(cat.id)}
                    onChange={() => toggleCategory(cat.id)}
                    className="mt-1 accent-[var(--accent-primary)]"
                  />
                  <div className="text-xs">
                    <p className="font-medium text-[var(--text-primary)]">{cat.label}</p>
                    <p className="mt-0.5 text-[var(--text-secondary)]">{cat.description}</p>
                    {cat.warning && (
                      <p className="mt-1 text-[11px] text-[var(--status-warning)]">{cat.warning}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>

            {caps.executionMode === "local_browser" ? (
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={running || selected.size === 0}
                  onClick={handleLocalSanitize}
                  className="inline-flex min-h-[42px] items-center gap-2 rounded-full bg-[var(--cta-bg)] px-5 text-xs font-medium text-[var(--cta-text)] disabled:opacity-40"
                >
                  <Eraser className="h-4 w-4" aria-hidden="true" />
                  <span>{running ? "Cleaning & Verifying..." : "Clean & Verify Locally"}</span>
                </button>
                {localBatchCandidates.length >= 2 && (
                  <button
                    type="button"
                    disabled={batchBusy}
                    onClick={handleBatchZip}
                    className="inline-flex min-h-[42px] items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--bg-primary)] px-4 text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent-primary)] disabled:opacity-40"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{batchBusy ? "Bundling ZIP..." : `Clean All (${localBatchCandidates.length}) as .zip`}</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3 rounded-lg border border-[var(--status-warning)]/40 bg-[var(--bg-primary)] p-4">
                <p className="flex items-center gap-2 text-xs font-medium text-[var(--status-warning)]">
                  <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Explicit Consent Required for Backend PDF Scrubbing</span>
                </p>
                <label className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={backendConsent}
                    onChange={(e) => {
                      setBackendConsent(e.target.checked);
                      if (e.target.checked) void warmBackendHealth();
                    }}
                    className="mt-0.5 accent-[var(--accent-primary)]"
                  />
                  <span>
                    I consent to temporarily uploading this PDF to the isolated TRACE backend
                    sandbox for structural scrubbing (deleted immediately after download).
                  </span>
                </label>
                <button
                  type="button"
                  disabled={!backendConsent || running}
                  onClick={handleBackendPdfSanitize}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-full bg-[var(--cta-bg)] px-5 text-xs font-medium text-[var(--cta-text)] disabled:opacity-40"
                >
                  <span>{running ? "Uploading & Scrubbing..." : "Consent & Clean PDF"}</span>
                </button>
                {backendStatus && running && (
                  <p className="text-xs text-[var(--status-warning)]">{backendStatus}</p>
                )}
                {backendError && (
                  <p className="text-xs text-[var(--status-critical)]">{backendError}</p>
                )}
              </div>
            )}
          </div>

          {/* Before / After Comparison & Download */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5 space-y-4">
            <h4 className="text-sm font-medium text-[var(--text-primary)]">
              2. Verification &amp; Clean Copy
            </h4>

            {result ? (
              <div className="space-y-4 text-xs">
                <div className="flex items-center gap-2 rounded-lg border border-[var(--accent-primary)]/40 bg-[var(--accent-soft)] p-3 text-[var(--accent-primary)]">
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="font-mono-tech uppercase">
                    Status: {result.overallStatus.replace(/_/g, " ")}
                  </span>
                </div>

                <dl className="grid grid-cols-2 gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-3">
                  <div>
                    <dt className="text-[var(--text-muted)]">Fields Before</dt>
                    <dd className="font-mono-tech mt-1 text-base text-[var(--text-primary)]">
                      {result.beforeFieldCount}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--text-muted)]">Fields After</dt>
                    <dd className="font-mono-tech mt-1 text-base text-[var(--accent-primary)]">
                      {result.afterFieldCount}
                    </dd>
                  </div>
                </dl>

                {result.removedFieldNames.length > 0 && (
                  <div>
                    <p className="font-mono-tech text-[11px] uppercase text-[var(--text-muted)]">
                      Removed &amp; Verified ({result.removedFieldNames.length})
                    </p>
                    <p className="mt-1 text-[var(--text-secondary)]">
                      {result.removedFieldNames.slice(0, 12).join(", ")}
                      {result.removedFieldNames.length > 12 ? "..." : ""}
                    </p>
                  </div>
                )}

                {result.outputBytes.byteLength > 0 && (
                  <button
                    type="button"
                    onClick={handleDownloadLocal}
                    className="inline-flex min-h-[42px] items-center gap-2 rounded-full bg-[var(--cta-bg)] px-5 text-xs font-medium text-[var(--cta-text)]"
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    <span>Download {result.suggestedFilename}</span>
                  </button>
                )}
              </div>
            ) : backendResult ? (
              <div className="space-y-4 text-xs">
                <div className="flex items-center gap-2 rounded-lg border border-[var(--accent-primary)]/40 bg-[var(--accent-soft)] p-3 text-[var(--accent-primary)]">
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="font-mono-tech uppercase">
                    Status: {backendResult.status.replace(/_/g, " ")}
                  </span>
                </div>
                <p className="text-[var(--text-secondary)]">
                  Removed keys: {backendResult.removedKeys.join(", ") || "None present"}
                </p>
                <a
                  href={backendResult.downloadUrl}
                  download={backendResult.downloadFilename}
                  className="inline-flex min-h-[42px] items-center gap-2 rounded-full bg-[var(--cta-bg)] px-5 text-xs font-medium text-[var(--cta-text)]"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  <span>Download {backendResult.downloadFilename} (One-Time)</span>
                </a>
              </div>
            ) : (
              <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                Run sanitization to generate a cleaned copy, re-inspect the output
                bytes automatically, and compare before/after fields.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
