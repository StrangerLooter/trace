import { describe, expect, it } from "vitest";
import type { TraceEvent } from "@trace/event-system";
import {
  decodeDataInspector,
  parseHexPattern,
  parseOffsetInput,
  searchBlobPattern,
} from "./hex-utils";
import { filterTraceEvents, formatEventLogText } from "./re-mode-utils";

describe("hex-utils", () => {
  it("decodes multi-width Data Inspector values deterministically", () => {
    const bytes = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    const decoded = decodeDataInspector(bytes, 0x10);
    expect(decoded).not.toBeNull();
    expect(decoded?.offsetHex).toBe("0x00000010");
    expect(decoded?.asciiChar).toBe("M");
    expect(decoded?.uint8).toBe(0x4d);
    expect(decoded?.uint16LE).toBe(0x5a4d);
    expect(decoded?.uint16BE).toBe(0x4d5a);
    expect(decoded?.uint32LE).toBe(0x00905a4d);
  });

  it("parses hex and offset inputs safely", () => {
    expect(parseHexPattern("FF D8 FF")).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
    expect(parseHexPattern("0xffd8")).toEqual(new Uint8Array([0xff, 0xd8]));
    expect(parseHexPattern("ZZ")).toBeNull();
    expect(parseHexPattern("F")).toBeNull();

    expect(parseOffsetInput("0x10", 100)).toBe(16);
    expect(parseOffsetInput("250", 100)).toBe(99);
    expect(parseOffsetInput("-5", 100)).toBeNull();
  });

  it("finds patterns spanning chunk boundaries in Blob search", async () => {
    const buf = new Uint8Array(64).fill(0x20);
    buf.set([0xde, 0xad, 0xbe, 0xef], 14); // spans 16-byte chunk boundary
    const offset = await searchBlobPattern(new Blob([buf]), new Uint8Array([0xde, 0xad, 0xbe, 0xef]), {
      chunkSizeBytes: 16,
    });
    expect(offset).toBe(14);

    const missing = await searchBlobPattern(new Blob([buf]), new Uint8Array([0xca, 0xfe]), {
      chunkSizeBytes: 16,
    });
    expect(missing).toBeNull();
  });
});

describe("re-mode-utils", () => {
  it("filters events by severity, parser, cleared sequence, and search query", () => {
    const events: TraceEvent[] = [
      {
        id: "1",
        sequence: 1,
        timestampIso: "2026-11-25T12:04:01.104Z",
        eventType: "FILE_RECEIVED",
        severity: "info",
        fileId: "f1",
        operation: "ingest",
        message: "Received sample.jpg",
      },
      {
        id: "2",
        sequence: 2,
        timestampIso: "2026-11-25T12:04:01.120Z",
        eventType: "STRUCTURE_DETECTED",
        severity: "debug",
        fileId: "f1",
        parserId: "jpeg-segment-parser",
        operation: "structure",
        message: "APP1 EXIF segment",
        byteRange: { start: 20, length: 128 },
      },
      {
        id: "3",
        sequence: 3,
        timestampIso: "2026-11-25T12:04:01.135Z",
        eventType: "ANOMALY_DETECTED",
        severity: "warn",
        fileId: "f1",
        parserId: "jpeg-segment-parser",
        operation: "integrity",
        message: "Trailing bytes past EOI",
        byteRange: { start: 500, length: 12 },
      },
    ];

    const filtered = filterTraceEvents(events, {
      severity: "warn",
      parserId: "jpeg-segment-parser",
      query: "trailing",
      clearedAfterSequence: 1,
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].eventType).toBe("ANOMALY_DETECTED");

    const logText = formatEventLogText(filtered);
    expect(logText).toContain("[12:04:01.135] ANOMALY_DETECTED [jpeg-segment-parser]");
    expect(logText).toContain("offset=0x000001f4 len=12");
  });
});
