import { describe, expect, it } from "vitest";
import { createDefaultParserRegistry } from "@trace/parsers";
import {
  buildTraceCsvReport,
  buildTraceJsonReport,
  buildTracePdfReport,
} from "@trace/report-schema";
import { sanitizeLocalFile } from "@trace/sanitizers";
import { runAnalysisJob } from "./analysis-engine";
import { runHashJob } from "./hash-engine";
import type { AnalysisWorkerResponse, HashWorkerResponse } from "./protocol";

function ascii(s: string): number[] {
  return Array.from(s).map((c) => c.charCodeAt(0));
}

describe("TRACE End-to-End Local Pipeline Journey", () => {
  it("completes full upload -> parse -> forensics -> hash -> sanitize -> JSON/CSV/PDF report", async () => {
    const comment = "Author: Alice <alice@example.com>";
    const comLen = 2 + comment.length;
    const sofPayload = [8, 0x00, 0x10, 0x00, 0x10, 3];
    const sofLen = 2 + sofPayload.length;
    const rawJpeg = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xfe, (comLen >> 8) & 0xff, comLen & 0xff, ...ascii(comment),
      0xff, 0xc0, (sofLen >> 8) & 0xff, sofLen & 0xff, ...sofPayload,
      0xff, 0xda, 0x00, 0x04, 0x00, 0x00,
      0xff, 0xd9,
    ]);
    const fileBlob = new Blob([rawJpeg], { type: "image/jpeg" });

    // 1. Analyze via Worker Engine + Default Parser Registry + Forensic Rules
    const analysisMsgs: AnalysisWorkerResponse[] = [];
    await runAnalysisJob(
      {
        type: "analyze",
        requestId: "e2e-req-1",
        fileId: "e2e-file-1",
        file: fileBlob,
        fileName: "evidence.jpg",
        declaredMime: "image/jpeg",
      },
      createDefaultParserRegistry(),
      new AbortController().signal,
      (m) => analysisMsgs.push(m)
    );

    const complete = analysisMsgs.find(
      (m): m is Extract<AnalysisWorkerResponse, { type: "analysis_complete" }> =>
        m.type === "analysis_complete"
    );
    expect(complete).toBeDefined();
    const payload = complete!.payload;
    expect(payload.identification.formatId).toBe("jpeg");
    expect(payload.findings.some((f) => f.ruleId === "rule-privacy-email-address")).toBe(true);

    // 2. Compute Streaming SHA-256
    const hashMsgs: HashWorkerResponse[] = [];
    await runHashJob(
      { type: "hash", requestId: "e2e-hash-1", fileId: "e2e-file-1", file: fileBlob },
      new AbortController().signal,
      (m) => hashMsgs.push(m)
    );
    const sha256 = hashMsgs.find(
      (m): m is Extract<HashWorkerResponse, { type: "hash_complete" }> => m.type === "hash_complete"
    )?.sha256;
    expect(sha256).toHaveLength(64);

    // 3. Sanitize locally and verify removal
    const cleanRes = await sanitizeLocalFile(fileBlob, "evidence.jpg", "jpeg", ["comments"]);
    expect(cleanRes.overallStatus).toBe("removed_and_verified");
    expect(cleanRes.removedFieldNames).toContain("JPEG Comment");

    // 4. Generate JSON, CSV, and PDF exports including sanitization history
    const jsonReport = buildTraceJsonReport({
      fileName: "evidence.jpg",
      sizeBytes: rawJpeg.byteLength,
      declaredMime: "image/jpeg",
      sha256: sha256 ?? null,
      identification: payload.identification,
      coverage: payload.coverage,
      metadata: payload.fields,
      structures: payload.structures,
      findings: payload.findings,
      unsupportedWarnings: payload.warnings,
      sanitizationHistory: [
        {
          performedAtIso: new Date().toISOString(),
          strategy: "Lossless JPEG COM strip",
          removedCategories: ["comments"],
          statuses: cleanRes.categoryStatuses,
          warnings: cleanRes.warnings,
        },
      ],
    });
    expect(jsonReport.sanitizationHistory).toHaveLength(1);

    const csv = buildTraceCsvReport(jsonReport);
    expect(csv).toContain("Sanitization");
    const pdfBytes = await buildTracePdfReport(jsonReport);
    expect(new TextDecoder("latin1").decode(pdfBytes.subarray(0, 5))).toBe("%PDF-");
  });
});
