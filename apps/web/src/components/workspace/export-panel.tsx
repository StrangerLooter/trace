"use client";

import React, { useMemo, useState } from "react";
import { Download, FileJson, FileSpreadsheet, FileText } from "lucide-react";
import {
  buildTraceCsvReport,
  buildTraceJsonReport,
  buildTracePdfReport,
  REPORT_SCHEMA_VERSION,
} from "@trace/report-schema";
import type { FileSession } from "@/stores/workspace-store";

function triggerLocalDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportPanel({ session }: { session: FileSession }) {
  const [exportingPdf, setExportingPdf] = useState(false);

  const report = useMemo(() => {
    if (!session.identification || !session.coverage) return null;
    return buildTraceJsonReport({
      fileName: session.fileName,
      sizeBytes: session.sizeBytes,
      declaredMime: session.declaredMime,
      sha256: session.sha256,
      identification: session.identification,
      coverage: session.coverage,
      metadata: session.fields,
      structures: session.structures,
      findings: session.findings,
      unsupportedWarnings: session.warnings,
      sanitizationHistory: session.sanitizationHistory,
    });
  }, [session]);

  if (!report) {
    return (
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-6 text-sm text-[var(--text-secondary)]">
        Waiting for file identification and analysis to finish before generating exports.
      </div>
    );
  }

  const handleJsonExport = () => {
    const json = JSON.stringify(report, null, 2);
    triggerLocalDownload(
      new Blob([json], { type: "application/json;charset=utf-8" }),
      `${session.fileName}.trace-report.json`
    );
  };

  const handleCsvExport = () => {
    const csv = buildTraceCsvReport(report);
    triggerLocalDownload(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
      `${session.fileName}.trace-report.csv`
    );
  };

  const handlePdfExport = async () => {
    setExportingPdf(true);
    try {
      const pdfBytes = await buildTracePdfReport(report);
      triggerLocalDownload(
        new Blob([pdfBytes.slice()], { type: "application/pdf" }),
        `${session.fileName}.trace-report.pdf`
      );
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5">
        <p className="font-mono-tech text-[11px] uppercase tracking-wider text-[var(--accent-primary)]">
          Local Report Generator • Schema v{REPORT_SCHEMA_VERSION}
        </p>
        <h3 className="mt-1 text-base font-medium text-[var(--text-primary)]">
          Export structured forensic reports
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
          All reports generate directly in browser memory—no sensitive metadata
          or file properties are uploaded or written to public URLs.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="flex flex-col justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5">
          <div>
            <FileJson className="h-5 w-5 text-[var(--accent-primary)]" aria-hidden="true" />
            <h4 className="mt-3 text-sm font-medium text-[var(--text-primary)]">
              Versioned JSON (v{REPORT_SCHEMA_VERSION})
            </h4>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">
              Full machine-readable bundle including identification, hashes,
              coverage, metadata groups, findings, structures, and sanitization history.
            </p>
          </div>
          <button
            type="button"
            onClick={handleJsonExport}
            className="mt-5 inline-flex min-h-[40px] items-center justify-center gap-2 rounded-full bg-[var(--cta-bg)] px-4 text-xs font-medium text-[var(--cta-text)]"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Export JSON</span>
          </button>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5">
          <div>
            <FileSpreadsheet className="h-5 w-5 text-[var(--accent-primary)]" aria-hidden="true" />
            <h4 className="mt-3 text-sm font-medium text-[var(--text-primary)]">
              Safe CSV Spreadsheet
            </h4>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">
              Flattened summary, findings, and metadata rows with spreadsheet
              formula-injection prefixes neutralized automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCsvExport}
            className="mt-5 inline-flex min-h-[40px] items-center justify-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--bg-primary)] px-4 text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent-primary)]"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Export CSV</span>
          </button>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5">
          <div>
            <FileText className="h-5 w-5 text-[var(--accent-primary)]" aria-hidden="true" />
            <h4 className="mt-3 text-sm font-medium text-[var(--text-primary)]">
              PDF Summary Report
            </h4>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">
              Clean A4 forensic summary generated locally via pdf-lib with
              identification, coverage flags, findings, and sanitization logs.
            </p>
          </div>
          <button
            type="button"
            disabled={exportingPdf}
            onClick={handlePdfExport}
            className="mt-5 inline-flex min-h-[40px] items-center justify-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--bg-primary)] px-4 text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent-primary)] disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{exportingPdf ? "Generating PDF..." : "Export PDF"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
