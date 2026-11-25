import type { ByteRange } from "@trace/shared-types";

export const TRACE_EVENT_TYPES = [
  "FILE_RECEIVED",
  "FILE_VALIDATION_STARTED",
  "HEADER_READ",
  "SIGNATURE_MATCHED",
  "SIGNATURE_MISMATCH",
  "MIME_IDENTIFIED",
  "HASHING_STARTED",
  "HASHING_PROGRESS",
  "HASHING_COMPLETED",
  "PARSER_SELECTED",
  "PARSER_STARTED",
  "STRUCTURE_DETECTED",
  "METADATA_GROUP_STARTED",
  "METADATA_FIELD_FOUND",
  "SENSITIVE_FIELD_FOUND",
  "ANOMALY_DETECTED",
  "PARSER_WARNING",
  "PARSER_FAILED",
  "SANITIZATION_STARTED",
  "SANITIZATION_COMPLETED",
  "VERIFICATION_COMPLETED",
  "ANALYSIS_COMPLETED",
] as const;

export type TraceEventType = (typeof TRACE_EVENT_TYPES)[number];

export type TraceEventSeverity = "debug" | "info" | "warn" | "error" | "finding";

export interface TraceEvent {
  id: string;
  sequence: number;
  timestampIso: string;
  eventType: TraceEventType;
  severity: TraceEventSeverity;
  fileId: string;
  parserId?: string;
  operation: string;
  message: string;
  byteRange?: ByteRange;
  payload?: Record<string, string | number | boolean | null>;
}

export class BoundedEventEmitter {
  private readonly maxEvents: number;
  private events: TraceEvent[] = [];
  private seq = 0;

  constructor(maxEvents = 5000) {
    this.maxEvents = maxEvents;
  }

  emit(
    input: Omit<TraceEvent, "id" | "sequence" | "timestampIso">,
    onEmit?: (event: TraceEvent) => void
  ): TraceEvent {
    const seq = ++this.seq;
    const event: TraceEvent = {
      id: `${input.fileId}:${seq}`,
      sequence: seq,
      timestampIso: new Date().toISOString(),
      ...input,
    };

    if (this.events.length >= this.maxEvents) {
      this.events.shift();
    }
    this.events.push(event);
    onEmit?.(event);
    return event;
  }

  getAll(): readonly TraceEvent[] {
    return this.events;
  }

  clear(): void {
    this.events = [];
  }
}
