import type { TraceEvent, TraceEventSeverity } from "@trace/event-system";

export interface EventFilterOptions {
  severity: TraceEventSeverity | "all";
  parserId: string;
  query: string;
  useRegex?: boolean;
  clearedAfterSequence: number;
}

export function filterTraceEvents(
  events: readonly TraceEvent[],
  opts: EventFilterOptions
): TraceEvent[] {
  const q = opts.query.trim();
  let regex: RegExp | null = null;
  if (q && opts.useRegex) {
    try {
      regex = new RegExp(q, "i");
    } catch {
      regex = null;
    }
  }
  const lower = q.toLowerCase();

  return events.filter((ev) => {
    if (ev.sequence <= opts.clearedAfterSequence) return false;
    if (opts.severity !== "all" && ev.severity !== opts.severity) return false;
    if (opts.parserId !== "all" && (ev.parserId ?? "core") !== opts.parserId) return false;
    if (q) {
      const hay = `${ev.eventType} ${ev.message} ${ev.operation} ${ev.parserId ?? ""}`;
      if (regex) {
        if (!regex.test(hay)) return false;
      } else if (!hay.toLowerCase().includes(lower)) {
        return false;
      }
    }
    return true;
  });
}

export function formatEventTime(iso: string): string {
  const idx = iso.indexOf("T");
  if (idx < 0) return iso;
  return iso.slice(idx + 1, idx + 13); // HH:MM:SS.mmm
}

export interface PipelineStageTiming {
  label: string;
  durationMs: number;
}

/** Derive pipeline stage latencies from monotonic TraceEvent timestamps. */
export function computeStageTimings(events: readonly TraceEvent[]): {
  totalMs: number;
  stages: PipelineStageTiming[];
} {
  if (events.length < 2) return { totalMs: 0, stages: [] };
  const tStart = Date.parse(events[0].timestampIso);
  const tSig = Date.parse(
    events.find((e) => e.eventType === "MIME_IDENTIFIED")?.timestampIso ?? events[0].timestampIso
  );
  const tParseStart = Date.parse(
    events.find((e) => e.eventType === "PARSER_STARTED")?.timestampIso ??
      events.find((e) => e.eventType === "MIME_IDENTIFIED")?.timestampIso ??
      events[0].timestampIso
  );
  const tDone = Date.parse(
    events.findLast((e) => e.eventType === "ANALYSIS_COMPLETED")?.timestampIso ??
      events[events.length - 1].timestampIso
  );

  const clamped = (a: number, b: number) => Math.max(0, Math.round(b - a));
  return {
    totalMs: clamped(tStart, tDone),
    stages: [
      { label: "Header & Sig", durationMs: clamped(tStart, tSig) },
      { label: "Parsers & Rules", durationMs: clamped(tParseStart, tDone) },
    ],
  };
}

export function formatEventLogText(events: readonly TraceEvent[]): string {
  return events
    .map((ev) => {
      const rangeStr = ev.byteRange
        ? ` offset=0x${ev.byteRange.start.toString(16).padStart(8, "0")} len=${ev.byteRange.length}`
        : "";
      const parserStr = ev.parserId ? ` [${ev.parserId}]` : "";
      return `[${formatEventTime(ev.timestampIso)}] ${ev.eventType}${parserStr} ${ev.message}${rangeStr}`;
    })
    .join("\n");
}
