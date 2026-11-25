"use client";

import React, { useMemo, useState } from "react";
import { GitCompare } from "lucide-react";
import type { FileSession } from "@/stores/workspace-store";

interface DiffRow {
  key: string;
  fieldName: string;
  valA: string | null;
  valB: string | null;
  status: "added" | "removed" | "changed" | "same";
}

export function DiffPanel({
  sessions,
  sessionOrder,
  activeFileId,
}: {
  sessions: Record<string, FileSession>;
  sessionOrder: string[];
  activeFileId: string | null;
}) {
  const [fileAId, setFileAId] = useState<string>(activeFileId ?? sessionOrder[0] ?? "");
  const [fileBId, setFileBId] = useState<string>(
    sessionOrder.find((id) => id !== (activeFileId ?? sessionOrder[0])) ?? sessionOrder[0] ?? ""
  );
  const [onlyDiffs, setOnlyDiffs] = useState(true);

  const sA = sessions[fileAId];
  const sB = sessions[fileBId];

  const rows = useMemo((): DiffRow[] => {
    if (!sA || !sB) return [];
    const mapA = new Map(sA.fields.map((f) => [f.rawKey || `${f.group}:${f.fieldName}`, f]));
    const mapB = new Map(sB.fields.map((f) => [f.rawKey || `${f.group}:${f.fieldName}`, f]));
    const keys = Array.from(new Set([...mapA.keys(), ...mapB.keys()]));
    return keys
      .map((key) => {
        const a = mapA.get(key);
        const b = mapB.get(key);
        let status: DiffRow["status"] = "same";
        if (!a && b) status = "added";
        else if (a && !b) status = "removed";
        else if (a && b && a.displayValue !== b.displayValue) status = "changed";
        return {
          key,
          fieldName: a?.fieldName ?? b?.fieldName ?? key,
          valA: a?.displayValue ?? null,
          valB: b?.displayValue ?? null,
          status,
        };
      })
      .filter((r) => !onlyDiffs || r.status !== "same");
  }, [sA, sB, onlyDiffs]);

  if (sessionOrder.length < 2) {
    return (
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-6 text-sm text-[var(--text-secondary)]">
        Upload or load at least <strong className="text-[var(--text-primary)]">2 files</strong> into the workspace queue to compare metadata, hashes, and stripped tags side by side.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <GitCompare className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
          <select
            aria-label="Baseline file A"
            value={fileAId}
            onChange={(e) => setFileAId(e.target.value)}
            className="min-h-[38px] max-w-[220px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 text-xs text-[var(--text-primary)]"
          >
            {sessionOrder.map((id) => (
              <option key={id} value={id}>
                A: {sessions[id]?.fileName}
              </option>
            ))}
          </select>
          <span className="font-mono-tech text-[var(--text-muted)]">vs</span>
          <select
            aria-label="Comparison file B"
            value={fileBId}
            onChange={(e) => setFileBId(e.target.value)}
            className="min-h-[38px] max-w-[220px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 text-xs text-[var(--text-primary)]"
          >
            {sessionOrder.map((id) => (
              <option key={id} value={id}>
                B: {sessions[id]?.fileName}
              </option>
            ))}
          </select>
        </div>

        <label className="inline-flex min-h-[38px] cursor-pointer items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 text-xs text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={onlyDiffs}
            onChange={(e) => setOnlyDiffs(e.target.checked)}
            className="accent-[var(--accent-primary)]"
          />
          <span>Only differences ({rows.length})</span>
        </label>
      </div>

      {sA && sB && (
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { tag: "Baseline (A)", s: sA },
            { tag: "Compared (B)", s: sB },
          ].map(({ tag, s }) => (
            <div key={tag} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 text-xs">
              <p className="font-mono-tech text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{tag}</p>
              <p className="mt-1 truncate font-medium text-[var(--text-primary)]">{s.fileName}</p>
              <p className="font-mono-tech mt-1 text-[11px] text-[var(--text-secondary)]">
                {s.sizeBytes.toLocaleString()} B • {s.fields.length} metadata fields • {s.findings.length} findings
              </p>
              <p className="font-mono-tech mt-1 truncate text-[11px] text-[var(--text-muted)]">
                SHA-256: {s.sha256 ?? "(not computed)"}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
        <table className="w-full min-w-[640px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] font-mono-tech text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
              <th className="p-3">Status</th>
              <th className="p-3">Field / Tag</th>
              <th className="p-3">File A Value</th>
              <th className="p-3">File B Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-6 text-center text-[var(--text-secondary)]">
                  No metadata differences between selected files.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.key} className="hover:bg-[var(--bg-primary)]/40">
                  <td className="p-3">
                    <span
                      className={`font-mono-tech rounded px-2 py-0.5 text-[10px] uppercase ${
                        r.status === "removed"
                          ? "bg-[var(--status-critical)]/15 text-[var(--status-critical)]"
                          : r.status === "added"
                            ? "bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                            : r.status === "changed"
                              ? "bg-[var(--status-warning)]/15 text-[var(--status-warning)]"
                              : "text-[var(--text-muted)]"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className="font-medium text-[var(--text-primary)]">{r.fieldName}</span>
                    <p className="font-mono-tech text-[10px] text-[var(--text-muted)]">{r.key}</p>
                  </td>
                  <td className="p-3 break-all text-[var(--text-secondary)]">{r.valA ?? "—"}</td>
                  <td className="p-3 break-all text-[var(--text-secondary)]">{r.valB ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
