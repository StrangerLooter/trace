import type { TraceEvent, TraceEventSeverity } from "@trace/event-system";

export interface EventFilterOptions {
  severity: TraceEventSeverity | "all";
  parserId: string;
  query: string;
  clearedAfterSequence: number;
}

export function filterTraceEvents(
  events: readonly TraceEvent[],
  opts: EventFilterOptions
): TraceEvent[] {
  const q = opts.query.trim().toLowerCase();
  return events.filter((ev) => {
    if (ev.sequence <= opts.clearedAfterSequence) return false;
    if (opts.severity !== "all" && ev.severity !== opts.severity) return false;
    if (opts.parserId !== "all" && (ev.parserId ?? "core") !== opts.parserId) return false;
    if (q) {
      const hay = `${ev.eventType} ${ev.message} ${ev.operation} ${ev.parserId ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function formatEventTime(iso: string): string {
  const idx = iso.indexOf("T");
  if (idx < 0) return iso;
  return iso.slice(idx + 1, idx + 13); // HH:MM:SS.mmm
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
