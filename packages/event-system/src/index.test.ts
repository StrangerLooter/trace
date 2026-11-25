import { describe, expect, it } from "vitest";
import { BoundedEventEmitter, TRACE_EVENT_TYPES } from "./index";

describe("BoundedEventEmitter", () => {
  it("supports all 22 canonical TRACE event types and enforces ring buffer cap", () => {
    expect(TRACE_EVENT_TYPES).toHaveLength(22);

    const emitter = new BoundedEventEmitter(3);
    emitter.emit({
      eventType: "FILE_RECEIVED",
      severity: "info",
      fileId: "f1",
      operation: "ingest",
      message: "received",
    });
    emitter.emit({
      eventType: "HEADER_READ",
      severity: "debug",
      fileId: "f1",
      operation: "slice(0,32)",
      message: "read",
      byteRange: { start: 0, length: 32 },
    });
    emitter.emit({
      eventType: "SIGNATURE_MATCHED",
      severity: "info",
      fileId: "f1",
      operation: "match",
      message: "jpeg",
    });
    emitter.emit({
      eventType: "ANALYSIS_COMPLETED",
      severity: "info",
      fileId: "f1",
      operation: "complete",
      message: "done",
    });

    const events = emitter.getAll();
    expect(events).toHaveLength(3);
    expect(events[0].eventType).toBe("HEADER_READ");
    expect(events[2].eventType).toBe("ANALYSIS_COMPLETED");
  });
});
