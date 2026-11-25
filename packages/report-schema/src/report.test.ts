import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  buildTraceCsvReport,
  buildTraceJsonReport,
  buildTracePdfReport,
  escapeCsvCell,
  REPORT_SCHEMA_VERSION,
} from "./index";

describe("@trace/report-schema", () => {
  const sampleReport = buildTraceJsonReport({
    fileName: "evidence.jpg",
    sizeBytes: 2048,
    declaredMime: "image/jpeg",
    sha256: "a".repeat(64),
    identification: {
      formatId: "jpeg",
      displayName: "JPEG Image",
      category: "image",
      detectedMime: "image/jpeg",
      declaredExtension: "jpg",
      declaredMime: "image/jpeg",
      extensionMismatch: false,
      confidence: "confirmed",
      supportStatus: "fully_supported",
      evidence: [
        {
          ruleId: "sig-jpeg-soi",
          description: "JPEG SOI",
          byteRange: { start: 0, length: 3 },
          matchedHex: "FF D8 FF",
        },
      ],
      secondaryMatches: [],
    },
    coverage: {
      mode: "local_browser",
      headerInspected: true,
      footerInspected: true,
      containerIndexInspected: true,
      completeFileScanned: true,
      fullHashComputed: true,
      uninspectedReasons: [],
    },
    metadata: [
      {
        id: "m1",
        fieldName: "Artist",
        value: "=CMD|' /C calc'!A0",
        displayValue: "=CMD|' /C calc'!A0",
        dataType: "string",
        group: "exif",
        sourceParser: "exifr",
        confidence: "confirmed",
        isSensitive: true,
        status: "valid",
      },
    ],
    structures: [],
    findings: [
      {
        id: "f1",
        ruleId: "rule-privacy-author-identity",
        category: "privacy",
        title: "Author metadata present",
        severity: "medium",
        explanation: "Detected Artist tag.",
        evidence: "Artist",
        affectedFieldIds: ["m1"],
        whyItMatters: "Exposes identity.",
        suggestedAction: "Strip EXIF.",
        detectionMethod: "packages/forensics",
        confidence: "confirmed",
      },
    ],
    unsupportedWarnings: [],
    sanitizationHistory: [],
  });

  it("builds versioned JSON report conforming to v1.0.0", () => {
    expect(sampleReport.schemaVersion).toBe(REPORT_SCHEMA_VERSION);
    expect(sampleReport.file.sha256).toHaveLength(64);
    expect(sampleReport.findings).toHaveLength(1);
    expect(sampleReport.toolVersions.parsers.exifr).toBeDefined();
  });

  it("neutralizes CSV formula injection payloads and quotes cells properly", () => {
    expect(escapeCsvCell("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(escapeCsvCell("+1+1")).toBe("'+1+1");
    expect(escapeCsvCell("-2")).toBe("'-2");
    expect(escapeCsvCell("@cmd")).toBe("'@cmd");

    const csv = buildTraceCsvReport(sampleReport);
    expect(csv).toContain("'=CMD|' /C calc'!A0");
    expect(csv).toContain("JPEG Image");
  });

  it("generates a valid local PDF report readable by pdf-lib", async () => {
    const pdfBytes = await buildTracePdfReport(sampleReport);
    expect(new TextDecoder("latin1").decode(pdfBytes.subarray(0, 5))).toBe("%PDF-");
    const parsed = await PDFDocument.load(pdfBytes);
    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
