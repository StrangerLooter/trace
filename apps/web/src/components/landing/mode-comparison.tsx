"use client";

import React, { useState } from "react";
import { AlertTriangle, CheckCircle2, Terminal } from "lucide-react";

const SPECIMEN_EVENTS = [
  { ts: "12:04:01.104", type: "FILE_RECEIVED", msg: "sample_photo.jpg (3,842,110 bytes)" },
  { ts: "12:04:01.108", type: "HEADER_READ", msg: "Blob.slice(0x00000000, 65536)" },
  { ts: "12:04:01.111", type: "SIGNATURE_MATCHED", msg: "JPEG Image (FF D8 FF) • confidence=confirmed" },
  { ts: "12:04:01.118", type: "PARSER_SELECTED", msg: "jpeg-segment-parser + exifr" },
  { ts: "12:04:01.124", type: "STRUCTURE_DETECTED", msg: "APP1 EXIF segment @ 0x00000014 (14,208 B)" },
  { ts: "12:04:01.132", type: "SENSITIVE_FIELD_FOUND", msg: "GPSLatitude / GPSLongitude @ 0x000002B8" },
  { ts: "12:04:01.139", type: "ANALYSIS_COMPLETED", msg: "coverage=complete_local • 0 bytes uploaded" },
];

export function ModeComparison() {
  const [mode, setMode] = useState<"analysis" | "re">("analysis");

  return (
    <section id="re-mode" className="border-t border-[var(--border-subtle)] py-20 sm:py-24">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono-tech text-[11px] uppercase tracking-[0.16em] text-[var(--accent-primary)]">
              Dual-Lens Architecture
            </p>
            <h2 className="font-serif-display mt-2 text-3xl text-[var(--text-primary)] sm:text-4xl">
              Surface clarity or <span className="italic">raw binary telemetry.</span>
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)] sm:text-base">
              One execution engine powers both views. Switch effortlessly between
              human-readable privacy intelligence and authentic parser events with
              byte-offset traceability.
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Inspect Mode Specimen Switcher"
            className="inline-flex self-start rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "analysis"}
              onClick={() => setMode("analysis")}
              className={`min-h-[40px] rounded-full px-4 text-xs font-medium transition-colors ${
                mode === "analysis"
                  ? "bg-[var(--cta-bg)] text-[var(--cta-text)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              Analysis Mode
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "re"}
              onClick={() => setMode("re")}
              className={`min-h-[40px] inline-flex items-center gap-1.5 rounded-full px-4 font-mono-tech text-xs font-medium transition-colors ${
                mode === "re"
                  ? "bg-[var(--accent-soft)] text-[var(--accent-primary)] border border-[var(--accent-primary)]/40"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
              <span>RE Mode</span>
            </button>
          </div>
        </div>

        {/* Specimen Container */}
        <div className="mt-8 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-2.5">
            <span className="font-mono-tech text-xs text-[var(--text-secondary)]">
              SPECIMEN PREVIEW • sample_photo.jpg • 3.84 MB
            </span>
            <span className="font-mono-tech text-[11px] uppercase tracking-wider text-[var(--accent-primary)]">
              {mode === "analysis" ? "VIEW: ANALYSIS MODE" : "VIEW: REVERSE ENGINEERING MODE"}
            </span>
          </div>

          {mode === "analysis" ? (
            <div className="grid gap-6 p-6 md:grid-cols-3">
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-4">
                <p className="font-mono-tech text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                  Identification
                </p>
                <p className="mt-2 text-lg font-medium text-[var(--text-primary)]">
                  JPEG Image
                </p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Confirmed via FF D8 FF signature • Extension matches
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-[var(--accent-primary)]">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>No structural anomalies</span>
                </div>
              </div>

              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-4">
                <p className="font-mono-tech text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                  Privacy Finding • High
                </p>
                <p className="mt-2 flex items-center gap-2 text-base font-medium text-[var(--status-warning)]">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>GPS Coordinates Present</span>
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">
                  EXIF GPS tags expose capture location inside APP1 segment.
                </p>
              </div>

              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-4">
                <p className="font-mono-tech text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                  Device &amp; Software
                </p>
                <dl className="mt-2 space-y-1.5 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--text-secondary)]">Camera</dt>
                    <dd className="font-mono-tech text-[var(--text-primary)]">Fujifilm X-T5</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--text-secondary)]">Groups</dt>
                    <dd className="font-mono-tech text-[var(--text-primary)]">EXIF, GPS, XMP, ICC</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--text-secondary)]">Sanitize</dt>
                    <dd className="font-mono-tech text-[var(--accent-primary)]">Supported (Local)</dd>
                  </div>
                </dl>
              </div>
            </div>
          ) : (
            <div className="grid divide-y divide-[var(--border-subtle)] lg:grid-cols-2 lg:divide-x lg:divide-y-0">
              {/* Live Event Stream Mockup */}
              <div className="p-4 sm:p-5">
                <p className="font-mono-tech text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                  Live Parser Event Stream
                </p>
                <ul className="mt-3 space-y-1.5 font-mono-tech text-xs">
                  {SPECIMEN_EVENTS.map((ev) => (
                    <li key={ev.ts} className="flex flex-wrap gap-x-2 gap-y-0.5 leading-relaxed">
                      <span className="text-[var(--text-muted)]">[{ev.ts}]</span>
                      <span className="text-[var(--accent-primary)]">{ev.type}</span>
                      <span className="text-[var(--text-secondary)]">{ev.msg}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* ImHex-inspired Hex + Offset Specimen */}
              <div className="overflow-x-auto p-4 sm:p-5">
                <p className="font-mono-tech text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                  Hex Inspector • APP1 EXIF Highlight
                </p>
                <div className="mt-3 min-w-[440px] space-y-1 font-mono-tech text-xs">
                  <div className="grid grid-cols-[90px_1fr_130px] gap-3 text-[var(--text-muted)]">
                    <span>Offset</span>
                    <span>00 01 02 03 04 05 06 07  08 09 0A 0B 0C 0D 0E 0F</span>
                    <span>ASCII</span>
                  </div>
                  <div className="grid grid-cols-[90px_1fr_130px] gap-3 text-[var(--text-secondary)]">
                    <span className="text-[var(--text-muted)]">0x00000000</span>
                    <span>
                      <span className="rounded bg-[var(--accent-soft)] px-0.5 text-[var(--accent-primary)]">
                        FF D8 FF
                      </span>{" "}
                      E1 37 80 45 78  69 66 00 00 4D 4D 00 2A
                    </span>
                    <span>...Exif..MM.*</span>
                  </div>
                  <div className="grid grid-cols-[90px_1fr_130px] gap-3 text-[var(--text-secondary)]">
                    <span className="text-[var(--text-muted)]">0x00000010</span>
                    <span>
                      00 00 00 08 00 0C 01 0F  00 02 00 00 00 09 00 00
                    </span>
                    <span>................</span>
                  </div>
                  <div className="grid grid-cols-[90px_1fr_130px] gap-3 text-[var(--text-secondary)]">
                    <span className="text-[var(--text-muted)]">0x000002B0</span>
                    <span>
                      88 25 00 04 00 00 00 01{" "}
                      <span className="rounded bg-[var(--status-warning)]/20 px-0.5 text-[var(--status-warning)]">
                        00 00 03 A4
                      </span>{" "}
                      00 00 00 00
                    </span>
                    <span>.%..............</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
