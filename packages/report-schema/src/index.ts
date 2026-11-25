import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type {
  AnalysisCoverage,
  DetectedStructure,
  FileIdentificationResult,
  ForensicFinding,
  MetadataField,
  SanitizationStatus,
} from "@trace/shared-types";

export const REPORT_SCHEMA_VERSION = "1.0.0";

export interface SanitizationReportRecord {
  performedAtIso: string;
  strategy: string;
  removedCategories: string[];
  statuses: Array<{ category: string; status: SanitizationStatus }>;
  warnings: string[];
  outputSha256?: string;
}

export interface TraceJsonReport {
  schemaVersion: typeof REPORT_SCHEMA_VERSION;
  generatedAtIso: string;
  toolVersions: {
    traceWeb: string;
    parsers: Record<string, string>;
  };
  file: {
    fileName: string;
    sizeBytes: number;
    declaredMime: string | null;
    sha256: string | null;
  };
  identification: FileIdentificationResult;
  coverage: AnalysisCoverage;
  metadata: MetadataField[];
  structures: DetectedStructure[];
  findings: ForensicFinding[];
  unsupportedWarnings: string[];
  sanitizationHistory: SanitizationReportRecord[];
}

export interface BuildReportInput {
  fileName: string;
  sizeBytes: number;
  declaredMime: string | null;
  sha256: string | null;
  identification: FileIdentificationResult;
  coverage: AnalysisCoverage;
  metadata: MetadataField[];
  structures: DetectedStructure[];
  findings: ForensicFinding[];
  unsupportedWarnings: string[];
  sanitizationHistory: SanitizationReportRecord[];
  traceWebVersion?: string;
}

export function buildTraceJsonReport(input: BuildReportInput): TraceJsonReport {
  const parserVersions: Record<string, string> = {};
  for (const field of input.metadata) {
    if (!parserVersions[field.sourceParser]) {
      parserVersions[field.sourceParser] = "0.1.0";
    }
  }

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAtIso: new Date().toISOString(),
    toolVersions: {
      traceWeb: input.traceWebVersion ?? "0.1.0",
      parsers: parserVersions,
    },
    file: {
      fileName: input.fileName,
      sizeBytes: input.sizeBytes,
      declaredMime: input.declaredMime,
      sha256: input.sha256,
    },
    identification: input.identification,
    coverage: input.coverage,
    metadata: input.metadata,
    structures: input.structures,
    findings: input.findings,
    unsupportedWarnings: input.unsupportedWarnings,
    sanitizationHistory: input.sanitizationHistory,
  };
}

/** Neutralize spreadsheet formula injection and apply RFC 4180 CSV quoting. */
export function escapeCsvCell(raw: string | number | boolean | null | undefined): string {
  if (raw === null || raw === undefined) return "";
  let str = String(raw);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildTraceCsvReport(report: TraceJsonReport): string {
  const rows: string[] = [];
  const pushRow = (cols: Array<string | number | boolean | null | undefined>) => {
    rows.push(cols.map(escapeCsvCell).join(","));
  };

  pushRow([
    "Section",
    "CategoryOrGroup",
    "KeyOrTitle",
    "ValueOrExplanation",
    "SeverityOrSensitivity",
    "ParserOrMethod",
    "ByteOffsetHex",
  ]);

  pushRow(["Summary", "File", "FileName", report.file.fileName, "info", "trace", ""]);
  pushRow(["Summary", "File", "SizeBytes", report.file.sizeBytes, "info", "trace", ""]);
  pushRow(["Summary", "File", "SHA256", report.file.sha256 ?? "Not computed", "info", "hash-wasm", ""]);
  pushRow([
    "Summary",
    "Identification",
    report.identification.displayName,
    `${report.identification.detectedMime} (confidence=${report.identification.confidence}, mismatch=${report.identification.extensionMismatch})`,
    report.identification.extensionMismatch ? "high" : "info",
    "file-signatures",
    report.identification.evidence[0]
      ? `0x${report.identification.evidence[0].byteRange.start.toString(16)}`
      : "",
  ]);

  for (const f of report.findings) {
    pushRow([
      "Finding",
      f.category,
      f.title,
      `${f.explanation} | Evidence: ${f.evidence}`,
      f.severity,
      f.detectionMethod,
      f.byteRange ? `0x${f.byteRange.start.toString(16)}` : "",
    ]);
  }

  for (const m of report.metadata) {
    pushRow([
      "Metadata",
      m.group,
      m.fieldName,
      m.displayValue,
      m.isSensitive ? "sensitive" : "standard",
      m.sourceParser,
      m.byteRange ? `0x${m.byteRange.start.toString(16)}` : "N/A",
    ]);
  }

  for (const s of report.sanitizationHistory) {
    pushRow([
      "Sanitization",
      s.strategy,
      s.removedCategories.join("; "),
      s.statuses.map((st) => `${st.category}:${st.status}`).join("; "),
      "info",
      "sanitizer",
      "",
    ]);
  }

  return `${rows.join("\r\n")}\r\n`;
}

function toAsciiSafe(text: string): string {
  return text.replace(/[^\x20-\x7e]/g, "?");
}

export async function buildTracePdfReport(report: TraceJsonReport): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`TRACE Report - ${toAsciiSafe(report.file.fileName)}`);
  doc.setCreator("TRACE File Intelligence Platform");

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);

  let page = doc.addPage([595.28, 841.89]); // A4
  let y = 795;

  const ensureSpace = (needed: number) => {
    if (y - needed < 50) {
      page = doc.addPage([595.28, 841.89]);
      y = 795;
    }
  };

  const drawLine = (
    text: string,
    opts: { size?: number; isBold?: boolean; isMono?: boolean; color?: ReturnType<typeof rgb>; indent?: number } = {}
  ) => {
    const size = opts.size ?? 9.5;
    const lineHeight = size + 5;
    const safe = toAsciiSafe(text);
    const maxChars = Math.floor((515 - (opts.indent ?? 0)) / (size * 0.55));
    const chunks: string[] = [];
    for (let i = 0; i < safe.length; i += maxChars) {
      chunks.push(safe.slice(i, i + maxChars));
    }
    if (chunks.length === 0) chunks.push("");

    for (const chunk of chunks) {
      ensureSpace(lineHeight);
      page.drawText(chunk, {
        x: 42 + (opts.indent ?? 0),
        y,
        size,
        font: opts.isMono ? mono : opts.isBold ? bold : font,
        color: opts.color ?? rgb(0.12, 0.14, 0.18),
      });
      y -= lineHeight;
    }
  };

  drawLine("TRACE - FILE INTELLIGENCE & DIGITAL FORENSICS REPORT", {
    size: 13,
    isBold: true,
    color: rgb(0.05, 0.07, 0.1),
  });
  drawLine(
    `Schema v${report.schemaVersion} | Generated: ${report.generatedAtIso} | Tool: TRACE v${report.toolVersions.traceWeb}`,
    { size: 8, isMono: true, color: rgb(0.4, 0.44, 0.5) }
  );
  y -= 8;

  drawLine("1. FILE IDENTIFICATION & PROPERTIES", { size: 11, isBold: true });
  drawLine(`File Name: ${report.file.fileName}`);
  drawLine(`Size: ${report.file.sizeBytes} bytes | Declared MIME: ${report.file.declaredMime ?? "none"}`);
  drawLine(
    `Detected Format: ${report.identification.displayName} (${report.identification.detectedMime}) | Confidence: ${report.identification.confidence}`
  );
  drawLine(
    `Extension Mismatch: ${report.identification.extensionMismatch ? "YES" : "No"} | Registry Status: ${report.identification.supportStatus}`
  );
  drawLine(`SHA-256: ${report.file.sha256 ?? "Not computed"}`, { isMono: true, size: 8.5 });
  y -= 6;

  drawLine("2. ANALYSIS COVERAGE", { size: 11, isBold: true });
  drawLine(
    `Mode: ${report.coverage.mode} | Header: ${report.coverage.headerInspected} | Footer: ${report.coverage.footerInspected} | Index: ${report.coverage.containerIndexInspected} | Complete: ${report.coverage.completeFileScanned}`
  );
  for (const w of [...report.unsupportedWarnings, ...report.coverage.uninspectedReasons]) {
    drawLine(`- ${w}`, { indent: 8, color: rgb(0.55, 0.35, 0.05) });
  }
  y -= 6;

  drawLine(`3. FORENSIC FINDINGS (${report.findings.length})`, { size: 11, isBold: true });
  if (report.findings.length === 0) {
    drawLine("No privacy disclosures or structural anomalies detected.", { indent: 8 });
  } else {
    for (const f of report.findings) {
      drawLine(`[${f.severity.toUpperCase()}] ${f.title}`, { isBold: true, indent: 6 });
      drawLine(f.explanation, { indent: 12, size: 8.5 });
      drawLine(`Evidence: ${f.evidence}`, { indent: 12, size: 8, isMono: true });
    }
  }
  y -= 6;

  drawLine(`4. EXTRACTED METADATA (${report.metadata.length} fields)`, { size: 11, isBold: true });
  for (const m of report.metadata.slice(0, 200)) {
    const off = m.byteRange ? ` @ 0x${m.byteRange.start.toString(16)}` : "";
    const sens = m.isSensitive ? " [SENSITIVE]" : "";
    drawLine(`[${m.group}] ${m.fieldName}${sens}: ${m.displayValue}${off}`, {
      size: 8.5,
      indent: 6,
    });
  }
  if (report.metadata.length > 200) {
    drawLine(`... ${report.metadata.length - 200} additional fields truncated in PDF summary; export JSON for full dataset.`, {
      size: 8.5,
      indent: 6,
    });
  }

  if (report.sanitizationHistory.length > 0) {
    y -= 6;
    drawLine(`5. SANITIZATION HISTORY (${report.sanitizationHistory.length})`, {
      size: 11,
      isBold: true,
    });
    for (const s of report.sanitizationHistory) {
      drawLine(`${s.performedAtIso} | ${s.strategy} | Removed: ${s.removedCategories.join(", ")}`, {
        size: 8.5,
        indent: 6,
      });
    }
  }

  return doc.save();
}
