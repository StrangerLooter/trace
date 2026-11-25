"use client";

import React, { useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import type { ForensicRiskSummary } from "@trace/forensics";
import type { FindingSeverity, ForensicFinding } from "@trace/shared-types";

const SEVERITY_BADGE: Record<FindingSeverity, string> = {
  critical: "border-[var(--status-critical)]/50 bg-[var(--status-critical)]/15 text-[var(--status-critical)]",
  high: "border-[var(--status-critical)]/40 bg-[var(--status-critical)]/10 text-[var(--status-critical)]",
  medium: "border-[var(--status-warning)]/40 bg-[var(--status-warning)]/15 text-[var(--status-warning)]",
  low: "border-[var(--status-info)]/40 bg-[var(--status-info)]/10 text-[var(--status-info)]",
  informational: "border-[var(--border-strong)] bg-[var(--bg-primary)] text-[var(--text-secondary)]",
};

export function ForensicsPanel({
  findings,
  summary,
  onJumpToOffset,
}: {
  findings: ForensicFinding[];
  summary?: ForensicRiskSummary;
  onJumpToOffset: (start: number, length: number) => void;
}) {
  const [severityFilter, setSeverityFilter] = useState<FindingSeverity | "all">("all");

  const visible = findings.filter(
    (f) => severityFilter === "all" || f.severity === severityFilter
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5">
        <div className="flex items-start gap-3">
          {findings.length === 0 ? (
            <ShieldCheck className="mt-0.5 h-5 w-5 text-[var(--accent-primary)]" aria-hidden="true" />
          ) : (
            <ShieldAlert className="mt-0.5 h-5 w-5 text-[var(--status-warning)]" aria-hidden="true" />
          )}
          <div>
            <h3 className="text-sm font-medium text-[var(--text-primary)]">
              Deterministic Risk &amp; Integrity Assessment
            </h3>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {summary?.deterministicSummary ?? "Analysis pending."}
            </p>
          </div>
        </div>

        <select
          aria-label="Filter findings by severity"
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as FindingSeverity | "all")}
          className="min-h-[40px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 text-xs text-[var(--text-primary)]"
        >
          <option value="all">All Severities ({findings.length})</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="informational">Informational</option>
        </select>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-8 text-center text-sm text-[var(--text-secondary)]">
          No findings match this filter.
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((finding) => (
            <article
              key={finding.id}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span
                    className={`font-mono-tech rounded-full border px-2.5 py-0.5 text-[11px] uppercase ${SEVERITY_BADGE[finding.severity]}`}
                  >
                    {finding.severity}
                  </span>
                  <h4 className="text-sm font-medium text-[var(--text-primary)]">
                    {finding.title}
                  </h4>
                </div>
                {finding.byteRange && (
                  <button
                    type="button"
                    onClick={() =>
                      onJumpToOffset(finding.byteRange!.start, finding.byteRange!.length)
                    }
                    className="font-mono-tech rounded bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] text-[var(--accent-primary)] hover:underline"
                  >
                    Jump to 0x{finding.byteRange.start.toString(16).padStart(8, "0")}
                  </button>
                )}
              </div>

              <p className="mt-3 text-xs leading-relaxed text-[var(--text-secondary)]">
                {finding.explanation}
              </p>

              <dl className="mt-4 grid gap-3 border-t border-[var(--border-subtle)] pt-3 text-xs sm:grid-cols-2">
                <div>
                  <dt className="font-mono-tech text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                    Evidence
                  </dt>
                  <dd className="mt-1 break-all text-[var(--text-secondary)]">{finding.evidence}</dd>
                </div>
                <div>
                  <dt className="font-mono-tech text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                    Why It Matters
                  </dt>
                  <dd className="mt-1 text-[var(--text-secondary)]">{finding.whyItMatters}</dd>
                </div>
                <div>
                  <dt className="font-mono-tech text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                    Suggested Action
                  </dt>
                  <dd className="mt-1 text-[var(--text-primary)]">{finding.suggestedAction}</dd>
                </div>
                <div>
                  <dt className="font-mono-tech text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                    Method &amp; Confidence
                  </dt>
                  <dd className="font-mono-tech mt-1 text-[11px] text-[var(--text-muted)]">
                    {finding.detectionMethod} • {finding.confidence}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
