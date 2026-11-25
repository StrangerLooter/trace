import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ParserRegistry } from "@trace/parser-registry";
import { runAnalysisJob, runHexWindowRead } from "./analysis-engine";
import { runHashJob } from "./hash-engine";
import type { AnalysisWorkerResponse, HashWorkerResponse } from "./protocol";

describe("Worker RPC Engines", () => {
  it("runs analysis job, emits authentic RE Mode events, and flags extension mismatch", async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const blob = new Blob([pngBytes]);
    const messages: AnalysisWorkerResponse[] = [];

    await runAnalysisJob(
      {
        type: "analyze",
        requestId: "req-1",
        fileId: "file-1",
        file: blob,
        fileName: "disguised.jpg",
        declaredMime: "image/jpeg",
      },
      new ParserRegistry(),
      new AbortController().signal,
      (msg) => messages.push(msg)
    );

    const events = messages
      .filter((m): m is Extract<AnalysisWorkerResponse, { type: "event" }> => m.type === "event")
      .map((m) => m.event.eventType);

    expect(events).toContain("FILE_RECEIVED");
    expect(events).toContain("HEADER_READ");
    expect(events).toContain("SIGNATURE_MISMATCH");
    expect(events).toContain("MIME_IDENTIFIED");
    expect(events).toContain("ANALYSIS_COMPLETED");

    const done = messages.find(
      (m): m is Extract<AnalysisWorkerResponse, { type: "analysis_complete" }> =>
        m.type === "analysis_complete"
    );
    expect(done).toBeDefined();
    expect(done?.payload.identification.formatId).toBe("png");
    expect(done?.payload.identification.extensionMismatch).toBe(true);
    expect(done?.payload.findings.some((f) => f.ruleId === "rule-extension-mismatch")).toBe(true);
  });

  it("reads bounded hex window with Transferable ArrayBuffer ownership", async () => {
    const bytes = new Uint8Array([10, 20, 30, 40, 50, 60]);
    const messages: Array<{ msg: AnalysisWorkerResponse; transfer?: Transferable[] }> = [];

    await runHexWindowRead(
      {
        type: "read_hex_window",
        requestId: "hex-1",
        fileId: "file-1",
        file: new Blob([bytes]),
        offset: 2,
        length: 3,
      },
      new AbortController().signal,
      (msg, transfer) => messages.push({ msg, transfer })
    );

    expect(messages).toHaveLength(1);
    const { msg, transfer } = messages[0];
    expect(msg.type).toBe("hex_window");
    if (msg.type === "hex_window") {
      expect(new Uint8Array(msg.buffer)).toEqual(new Uint8Array([30, 40, 50]));
      expect(transfer?.[0]).toBe(msg.buffer);
    }
  });

  it("streams SHA-256 with progress events and supports cancellation", async () => {
    const payload = new Uint8Array(128).map((_, i) => i);
    const expected = createHash("sha256").update(payload).digest("hex");
    const responses: HashWorkerResponse[] = [];

    await runHashJob(
      {
        type: "hash",
        requestId: "hash-1",
        fileId: "file-1",
        file: new Blob([payload]),
        chunkSizeBytes: 32,
      },
      new AbortController().signal,
      (msg) => responses.push(msg)
    );

    const complete = responses.find(
      (r): r is Extract<HashWorkerResponse, { type: "hash_complete" }> =>
        r.type === "hash_complete"
    );
    expect(complete?.sha256).toBe(expected);

    const cancelledResponses: HashWorkerResponse[] = [];
    const controller = new AbortController();
    controller.abort();

    await runHashJob(
      {
        type: "hash",
        requestId: "hash-2",
        fileId: "file-2",
        file: new Blob([payload]),
      },
      controller.signal,
      (msg) => cancelledResponses.push(msg)
    );

    expect(cancelledResponses.some((r) => r.type === "cancelled")).toBe(true);
  });
});
