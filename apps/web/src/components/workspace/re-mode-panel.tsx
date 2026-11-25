"use client";

import React, { useMemo, useState } from "react";
import { Copy, Download, Pause, Play, Trash2 } from "lucide-react";
import type { TraceEventSeverity } from "@trace/event-system";
import type { FileSession } from "@/stores/workspace-store";
import type { WorkerCoordinator } from "@/workers/coordinator";
import { HexInspector } from "./hex-inspector";
import { filterTraceEvents, formatEventLogText, formatEventTime, computeStageTimings } from "./re-mode-utils";

export function ReModePanel({
  session,
  coordinator,
  onJumpToOffset,
}: {
  session: FileSession;
  coordinator: WorkerCoordinator;
  onJumpToOffset: (start: number, length: number) => void;
}) {
  const [paused, setPaused] = useState(false);
  const [frozenLength, setFrozenLength] = useState<number | null>(null);
  const [clearedAfterSeq, setClearedAfterSeq] = useState(0);
  const [severity, setSeverity] = useState<TraceEventSeverity | "all">("all");
  const [parserFilter, setParserFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [useRegex, setUseRegex] = useState(false);
  const [copied, setCopied] = useState(false);

  const stageTimings = useMemo(() => computeStageTimings(session.events), [session.events]);

  const visibleSource = useMemo(() => {
    if (paused && frozenLength !== null) {
      return session.events.slice(0, frozenLength);
    }
    return session.events;
  }, [session.events, paused, frozenLength]);

  const parserIds = useMemo(() => {
    const set = new Set<string>();
    for (const ev of session.events) {
      set.add(ev.parserId ?? "core");
    }
    return Array.from(set);
  }, [session.events]);

  const filteredEvents = useMemo(
    () =>
      filterTraceEvents(visibleSource, {
        severity,
        parserId: parserFilter,
        query,
        useRegex,
        clearedAfterSequence: clearedAfterSeq,
      }),
    [visibleSource, severity, parserFilter, query, useRegex, clearedAfterSeq]
  );

  const handleTogglePause = () => {
    if (!paused) {
      setFrozenLength(session.events.length);
      setPaused(true);
    } else {
      setFrozenLength(null);
      setPaused(false);
    }
  };

  const handleCopy = async () => {
    const text = formatEventLogText(filteredEvents);
    await navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleExportLog = () => {
    const text = formatEventLogText(session.events);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${session.fileName}.trace-re.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Worker & Telemetry Status Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-2.5 font-mono-tech text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-[var(--accent-primary)]">
            <span className="h-2 w-2 rounded-full bg-[var(--accent-primary)]" aria-hidden="true" />
            RE MODE • READ-ONLY INSPECTION
          </span>
          <span className="text-[var(--text-muted)]">|</span>
          <span className="text-[var(--text-secondary)]">
            Events: {session.events.length}
          </span>
          <span className="text-[var(--text-secondary)]">
            Parsers: {session.plan?.selectedParserIds.join(", ") || "signature-only"}
          </span>
          {stageTimings.stages.length > 0 && (
            <>
              <span className="text-[var(--text-muted)]">|</span>
              <span className="text-[var(--text-secondary)]">
                Total: {stageTimings.totalMs}ms ({stageTimings.stages.map((s) => `${s.label} ${s.durationMs}ms`).join(", ")})
              </span>
            </>
          )}
        </div>
        <span className="text-[var(--text-muted)]">
          Status: {session.status.toUpperCase()}
        </span>
      </div>

      {/* Event Stream Console */}
      <section className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search RE Mode events"
              placeholder={useRegex ? "Regex /EXIF|GPS/..." : "Search events..."}
              className="font-mono-tech min-h-[36px] w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 text-xs text-[var(--text-primary)] sm:w-44"
            />
            <button
              type="button"
              onClick={() => setUseRegex((v) => !v)}
              aria-pressed={useRegex}
              title="Toggle regex pattern matching"
              className={`font-mono-tech min-h-[36px] rounded-md border px-2.5 text-xs ${
                useRegex
                  ? "border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                  : "border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-muted)]"
              }`}
            >
              .*
            </button>
            <select
              aria-label="Filter events by severity"
              value={severity}
              onChange={(e) => setSeverity(e.target.value as TraceEventSeverity | "all")}
              className="font-mono-tech min-h-[36px] rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 text-xs text-[var(--text-primary)]"
            >
              <option value="all">Severity: All</option>
              <option value="debug">debug</option>
              <option value="info">info</option>
              <option value="finding">finding</option>
              <option value="warn">warn</option>
              <option value="error">error</option>
            </select>
            <select
              aria-label="Filter events by parser"
              value={parserFilter}
              onChange={(e) => setParserFilter(e.target.value)}
              className="font-mono-tech min-h-[36px] rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 text-xs text-[var(--text-primary)]"
            >
              <option value="all">Parser: All</option>
              {parserIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleTogglePause}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              <span>{paused ? "Resume" : "Pause"}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const latest = session.events.at(-1)?.sequence ?? 0;
                setClearedAfterSeq(latest);
              }}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear View</span>
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <Copy className="h-3.5 w-3.5" />
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
            <button
              type="button"
              onClick={handleExportLog}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export Log</span>
            </button>
          </div>
        </div>

        <div className="max-h-64 overflow-y-auto p-3 font-mono-tech text-xs">
          {filteredEvents.length === 0 ? (
            <p className="p-3 text-[var(--text-muted)]">No visible events match the filters.</p>
          ) : (
            <ul className="space-y-1">
              {filteredEvents.map((ev) => (
                <li
                  key={ev.id}
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded px-1.5 py-0.5 hover:bg-[var(--bg-primary)]/60"
                >
                  <span className="text-[var(--text-muted)]">
                    [{formatEventTime(ev.timestampIso)}]
                  </span>
                  <span
                    className={
                      ev.severity === "error"
                        ? "text-[var(--status-critical)]"
                        : ev.severity === "warn" || ev.severity === "finding"
                          ? "text-[var(--status-warning)]"
                          : "text-[var(--accent-primary)]"
                    }
                  >
                    {ev.eventType}
                  </span>
                  {ev.parserId && (
                    <span className="text-[var(--text-muted)]">[{ev.parserId}]</span>
                  )}
                  <span className="text-[var(--text-secondary)]">{ev.message}</span>
                  {ev.byteRange && (
                    <button
                      type="button"
                      onClick={() =>
                        onJumpToOffset(ev.byteRange!.start, ev.byteRange!.length)
                      }
                      className="rounded bg-[var(--accent-soft)] px-1.5 text-[11px] text-[var(--accent-primary)] hover:underline"
                    >
                      0x{ev.byteRange.start.toString(16).padStart(8, "0")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Embedded Hex Inspector inside RE Mode */}
      <HexInspector
        fileId={session.fileId}
        file={session.file}
        fileSize={session.sizeBytes}
        structures={session.structures}
        selectedByteRange={session.selectedByteRange}
        coordinator={coordinator}
      />
    </div>
  );
}
