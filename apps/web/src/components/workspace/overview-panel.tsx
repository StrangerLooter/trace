"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, CloudUpload, Hash, MapPin, Shield, XCircle } from "lucide-react";
import type { MetadataField } from "@trace/shared-types";
import { fetchBackendWithWakeRetry, warmBackendHealth } from "@/lib/backend-client";
import type { FileSession } from "@/stores/workspace-store";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

export function OverviewPanel({
  session,
  onComputeHash,
  onCancelHash,
  onJumpToOffset,
  onMergeBackend,
}: {
  session: FileSession;
  onComputeHash: (fileId: string) => void;
  onCancelHash: (fileId: string) => void;
  onJumpToOffset: (start: number, length: number) => void;
  onMergeBackend?: (
    fileId: string,
    payload: {
      fields: MetadataField[];
      events: Array<{ eventType: string; severity: string; operation: string; message: string; timestampIso: string }>;
      sha256?: string;
    }
  ) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showMapPreview, setShowMapPreview] = useState(false);
  const [backendConsent, setBackendConsent] = useState(false);
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [remoteStatus, setRemoteStatus] = useState<string | null>(null);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const id = session.identification;

  const timelineInfo = useMemo(() => {
    const capture = session.fields.find((f) =>
      /^(datetimeoriginal|createdate|creationdate|mvhd\.creation_time|segment\.info\.dateutc)$/i.test(
        f.rawKey ?? f.fieldName
      )
    );
    const osIso = session.fileLastModifiedMs ? new Date(session.fileLastModifiedMs).toISOString() : null;
    const capVal = capture ? String(capture.value) : null;
    return { captureField: capture, captureIso: capVal, osIso };
  }, [session.fields, session.fileLastModifiedMs]);

  const gpsCoords = useMemo(() => {
    const latField = session.fields.find((f) => /^(latitude|exif\.latitude|gpslatitude)$/i.test(f.rawKey ?? f.fieldName) && typeof f.value === "number");
    const lonField = session.fields.find((f) => /^(longitude|exif\.longitude|gpslongitude)$/i.test(f.rawKey ?? f.fieldName) && typeof f.value === "number");
    if (latField && lonField && typeof latField.value === "number" && typeof lonField.value === "number") {
      return { lat: latField.value, lon: lonField.value };
    }
    return null;
  }, [session.fields]);

  // Safe local raster preview via createImageBitmap -> canvas PNG blob (never SVG/HTML/PDF)
  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;
    setPreviewUrl(null);

    const safeRaster =
      id &&
      ["jpeg", "png", "webp", "gif", "avif"].includes(id.formatId) &&
      session.sizeBytes > 0 &&
      session.sizeBytes <= 25 * 1024 * 1024;

    if (!safeRaster) return;

    void createImageBitmap(session.file)
      .then((bitmap) => {
        if (!active) {
          bitmap.close();
          return;
        }
        const canvas = document.createElement("canvas");
        const maxDim = 320;
        const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const ctx2d = canvas.getContext("2d");
        ctx2d?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        canvas.toBlob((blob) => {
          if (!active || !blob) return;
          createdUrl = URL.createObjectURL(blob);
          setPreviewUrl(createdUrl);
        }, "image/png");
      })
      .catch(() => {
        // Malformed raster fails safely without crashing UI
      });

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [session.file, session.sizeBytes, id]);

  return (
    <div className="space-y-6">
      {id?.extensionMismatch && (
        <div
          role="alert"
          className="flex flex-wrap items-start gap-3 rounded-xl border border-[var(--status-critical)]/40 bg-[var(--status-critical)]/10 p-4 text-sm"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-critical)]" aria-hidden="true" />
          <div>
            <p className="font-medium text-[var(--text-primary)]">
              Extension &amp; Binary Signature Mismatch
            </p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Filename declares <code className="font-mono-tech">.{id.declaredExtension}</code>, but binary bytes match{" "}
              <strong className="text-[var(--text-primary)]">{id.displayName}</strong> ({id.detectedMime}).
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5">
          <p className="font-mono-tech text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
            Detected Format
          </p>
          <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">
            {id?.displayName ?? "Identifying..."}
          </p>
          <p className="font-mono-tech mt-1 text-xs text-[var(--text-secondary)]">
            {id?.detectedMime ?? "—"}
          </p>
          {id && (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="font-mono-tech rounded-full border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 py-0.5 text-[11px] text-[var(--accent-primary)]">
                Confidence: {id.confidence}
              </span>
              <span className="font-mono-tech rounded-full border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 py-0.5 text-[11px] text-[var(--text-secondary)]">
                Registry: {id.supportStatus.replace(/_/g, " ")}
              </span>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5">
          <p className="font-mono-tech text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
            File Properties
          </p>
          <dl className="mt-3 space-y-2 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-secondary)]">Size</dt>
              <dd className="font-mono-tech text-[var(--text-primary)]">
                {formatBytes(session.sizeBytes)} ({session.sizeBytes.toLocaleString()} B)
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-secondary)]">Declared Ext</dt>
              <dd className="font-mono-tech text-[var(--text-primary)]">
                {id?.declaredExtension ? `.${id.declaredExtension}` : "(none)"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-secondary)]">Browser MIME</dt>
              <dd className="font-mono-tech truncate max-w-[180px] text-[var(--text-primary)]">
                {session.declaredMime ?? "(empty)"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-secondary)]">Category</dt>
              <dd className="font-mono-tech text-[var(--text-primary)]">
                {id?.category ?? "—"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono-tech text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
              SHA-256 Digest
            </p>
            <Hash className="h-3.5 w-3.5 text-[var(--accent-primary)]" aria-hidden="true" />
          </div>

          {session.sha256 ? (
            <p className="font-mono-tech mt-3 break-all rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-2.5 text-[11px] text-[var(--accent-primary)]">
              {session.sha256}
            </p>
          ) : session.hashStatus === "hashing" ? (
            <div className="mt-3 space-y-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-primary)]">
                <div
                  className="h-full bg-[var(--accent-primary)] transition-all"
                  style={{ width: `${Math.round(session.hashProgressPercent)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono-tech text-[var(--text-secondary)]">
                  {session.hashProgressPercent.toFixed(1)}%
                </span>
                <button
                  type="button"
                  onClick={() => onCancelHash(session.fileId)}
                  className="text-xs font-medium text-[var(--status-critical)] hover:underline"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => onComputeHash(session.fileId)}
                className="inline-flex min-h-[38px] items-center rounded-full border border-[var(--border-strong)] bg-[var(--bg-primary)] px-4 text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent-primary)]"
              >
                Compute Streaming SHA-256
              </button>
              <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                Streams via bounded 16 MiB chunks in HashWorker.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Signature Evidence + Coverage + Safe Preview */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5 lg:col-span-2">
          <h3 className="text-sm font-medium text-[var(--text-primary)]">
            Signature Evidence &amp; Analysis Coverage
          </h3>

          {id && id.evidence.length > 0 && (
            <ul className="mt-3 space-y-2">
              {id.evidence.map((ev) => (
                <li
                  key={ev.ruleId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-xs"
                >
                  <span className="text-[var(--text-secondary)]">{ev.description}</span>
                  <button
                    type="button"
                    onClick={() => onJumpToOffset(ev.byteRange.start, ev.byteRange.length)}
                    className="font-mono-tech rounded bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] text-[var(--accent-primary)] hover:underline"
                  >
                    0x{ev.byteRange.start.toString(16).padStart(8, "0")} ({ev.matchedHex})
                  </button>
                </li>
              ))}
            </ul>
          )}

          {session.coverage && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {[
                { label: "Header inspected", ok: session.coverage.headerInspected },
                { label: "Footer inspected", ok: session.coverage.footerInspected },
                { label: "Container index inspected", ok: session.coverage.containerIndexInspected },
                { label: "Complete file scanned", ok: session.coverage.completeFileScanned },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-xs"
                >
                  {item.ok ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-[var(--accent-primary)]" aria-hidden="true" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden="true" />
                  )}
                  <span className="text-[var(--text-secondary)]">{item.label}</span>
                </div>
              ))}
            </div>
          )}

          {session.coverage && session.coverage.uninspectedReasons.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-[var(--status-warning)]">
              {session.coverage.uninspectedReasons.map((reason) => (
                <li key={reason}>• {reason}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-[var(--text-primary)]">Safe Preview</h3>
            <Shield className="h-3.5 w-3.5 text-[var(--accent-primary)]" aria-hidden="true" />
          </div>
          {previewUrl ? (
            <div className="mt-3 flex flex-col items-center">
              <img
                src={previewUrl}
                alt={`Sanitized raster preview of ${session.fileName}`}
                className="max-h-48 rounded-lg border border-[var(--border-subtle)] object-contain"
              />
              <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                Re-rasterized safely via canvas bitmap.
              </p>
            </div>
          ) : (
            <p className="mt-3 text-xs leading-relaxed text-[var(--text-secondary)]">
              Inline preview is restricted to raster images (&lt;= 25 MB). SVG, PDF,
              and executable formats are never executed or rendered inline.
            </p>
          )}
        </div>
      </div>

      {/* Multi-Layer Timeline & Opt-In GPS Location Cards (#1, #2) */}
      <div className={`grid gap-4 ${gpsCoords ? "lg:grid-cols-2" : "grid-cols-1"}`}>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-[var(--text-primary)]">Multi-Layer Timestamp Trail</h3>
            <Clock className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
          </div>
          <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-3">
              <dt className="font-mono-tech text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                1. Embedded Capture / Creation
              </dt>
              <dd className="font-mono-tech mt-1 break-all text-[var(--text-primary)]">
                {timelineInfo.captureIso ?? "Not embedded (or stripped)"}
              </dd>
            </div>
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-3">
              <dt className="font-mono-tech text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                2. OS Filesystem LastModified
              </dt>
              <dd className="font-mono-tech mt-1 break-all text-[var(--text-primary)]">
                {timelineInfo.osIso ?? "Unavailable"}
              </dd>
            </div>
          </dl>
          <p className="mt-2.5 text-[11px] text-[var(--text-muted)]">
            Transfers (downloads / messenger Document shares) update OS dates while original embedded tags preserve camera shutter time unless stripped by platforms like standard WhatsApp image compression.
          </p>
        </div>

        {gpsCoords && (
          <div className="rounded-xl border border-[var(--status-warning)]/40 bg-[var(--bg-secondary)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-[var(--status-warning)]" aria-hidden="true" />
                <h3 className="text-sm font-medium text-[var(--text-primary)]">GPS Coordinates Detected</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowMapPreview((v) => !v)}
                className="font-mono-tech rounded-full border border-[var(--border-strong)] bg-[var(--bg-primary)] px-3 py-1 text-[11px] text-[var(--accent-primary)] hover:border-[var(--accent-primary)]"
              >
                {showMapPreview ? "Hide Map" : "Load OSM Map Preview"}
              </button>
            </div>
            <p className="font-mono-tech mt-2 text-xs text-[var(--text-secondary)]">
              Lat: {gpsCoords.lat.toFixed(6)}, Lon: {gpsCoords.lon.toFixed(6)} •{" "}
              <a
                href={`https://www.openstreetmap.org/?mlat=${gpsCoords.lat}&mlon=${gpsCoords.lon}#map=15/${gpsCoords.lat}/${gpsCoords.lon}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent-primary)] hover:underline"
              >
                Open in OpenStreetMap
              </a>
            </p>
            {showMapPreview && (
              <iframe
                title="Embedded GPS OpenStreetMap Location Preview"
                className="mt-3 h-44 w-full rounded-lg border border-[var(--border-subtle)]"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${gpsCoords.lon - 0.01},${gpsCoords.lat - 0.01},${gpsCoords.lon + 0.01},${gpsCoords.lat + 0.01}&layer=mapnik&marker=${gpsCoords.lat},${gpsCoords.lon}`}
              />
            )}
          </div>
        )}
      </div>

      {/* Explicit-Consent Backend Escalation Card */}
      {session.plan?.requiresConsentForFull &&
        session.coverage?.mode !== "consented_backend" &&
        onMergeBackend && (
          <div className="rounded-xl border border-[var(--status-warning)]/40 bg-[var(--bg-secondary)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CloudUpload className="h-4 w-4 text-[var(--status-warning)]" aria-hidden="true" />
                <h3 className="text-sm font-medium text-[var(--text-primary)]">
                  Optional Deep Backend Inspection
                </h3>
              </div>
              {remoteBusy && (
                <span className="font-mono-tech rounded-full border border-[var(--status-warning)]/50 bg-[var(--status-warning)]/15 px-3 py-0.5 text-[11px] uppercase text-[var(--status-warning)]">
                  Remote Sandbox Processing • Ephemeral Session
                </span>
              )}
            </div>

            <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
              Local browser inspection stayed strictly on your device. To run deep server-side parsers (such as compressed PDF object trees, PE/ELF import tables, or ExifTool), explicit consent is required. Uploaded files are deleted immediately after processing.
            </p>

            <label className="mt-3 flex items-start gap-2 text-xs text-[var(--text-secondary)]">
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
                I consent to uploading <strong className="text-[var(--text-primary)]">{session.fileName}</strong> temporarily to the isolated backend sandbox for deep inspection.
              </span>
            </label>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={!backendConsent || remoteBusy}
                onClick={async () => {
                  setRemoteBusy(true);
                  setRemoteStatus(null);
                  setRemoteError(null);
                  try {
                    const form = new FormData();
                    form.append("file", session.file, session.fileName);
                    const resp = await fetchBackendWithWakeRetry(
                      "/api/v1/analyze",
                      {
                        method: "POST",
                        body: form,
                      },
                      setRemoteStatus
                    );
                    const data = await resp.json();
                    if (!resp.ok) {
                      setRemoteError(data.detail || "Backend inspection failed.");
                      return;
                    }
                    onMergeBackend(session.fileId, data);
                  } catch {
                    setRemoteError(
                      "Unable to reach isolated backend API. Local inspection results remain intact."
                    );
                  } finally {
                    setRemoteBusy(false);
                    setRemoteStatus(null);
                  }
                }}
                className="inline-flex min-h-[38px] items-center gap-2 rounded-full bg-[var(--cta-bg)] px-4 text-xs font-medium text-[var(--cta-text)] disabled:opacity-40"
              >
                <span>{remoteBusy ? "Inspecting Remotely..." : "Consent & Run Deep Inspection"}</span>
              </button>
              {remoteStatus && remoteBusy && (
                <span className="text-xs text-[var(--status-warning)]">{remoteStatus}</span>
              )}
              {remoteError && (
                <span className="text-xs text-[var(--status-critical)]">{remoteError}</span>
              )}
            </div>
          </div>
        )}
    </div>
  );
}
