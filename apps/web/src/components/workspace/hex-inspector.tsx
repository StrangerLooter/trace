"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import type { ByteRange, DetectedStructure } from "@trace/shared-types";
import type { WorkerCoordinator } from "@/workers/coordinator";
import {
  decodeDataInspector,
  flattenStructures,
  parseHexPattern,
  parseOffsetInput,
  searchBlobPattern,
} from "./hex-utils";

const WINDOW_BYTES = 2048;

const STRUCT_PALETTE = [
  { bg: "var(--struct-0-bg)", fg: "var(--struct-0-fg)" },
  { bg: "var(--struct-1-bg)", fg: "var(--struct-1-fg)" },
  { bg: "var(--struct-2-bg)", fg: "var(--struct-2-fg)" },
  { bg: "var(--struct-3-bg)", fg: "var(--struct-3-fg)" },
  { bg: "var(--struct-4-bg)", fg: "var(--struct-4-fg)" },
];

export const HexInspector = React.memo(function HexInspector({
  fileId,
  file,
  fileSize,
  structures,
  selectedByteRange,
  coordinator,
}: {
  fileId: string;
  file: File;
  fileSize: number;
  structures: DetectedStructure[];
  selectedByteRange?: ByteRange;
  coordinator: WorkerCoordinator;
}) {
  const [windowStart, setWindowStart] = useState(0);
  const [windowBytes, setWindowBytes] = useState<Uint8Array>(new Uint8Array(0));
  const [cursorOffset, setCursorOffset] = useState(0);
  const [bytesPerRow, setBytesPerRow] = useState(16);
  const [offsetQuery, setOffsetQuery] = useState("0x00000000");
  const [searchMode, setSearchMode] = useState<"hex" | "ascii">("ascii");
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchStatus, setSearchStatus] = useState<string | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const updateCols = () => setBytesPerRow(window.innerWidth < 768 ? 8 : 16);
    updateCols();
    window.addEventListener("resize", updateCols);
    return () => window.removeEventListener("resize", updateCols);
  }, []);

  useEffect(() => {
    if (!selectedByteRange) return;
    const aligned = Math.floor(selectedByteRange.start / 16) * 16;
    setWindowStart(aligned);
    setCursorOffset(selectedByteRange.start);
    setOffsetQuery(`0x${selectedByteRange.start.toString(16).toUpperCase().padStart(8, "0")}`);
  }, [selectedByteRange]);

  useEffect(() => {
    let active = true;
    if (fileSize === 0) {
      setWindowBytes(new Uint8Array(0));
      return;
    }

    void coordinator
      .readHexWindow(fileId, file, windowStart, Math.min(WINDOW_BYTES, fileSize - windowStart))
      .then((bytes) => {
        if (active) setWindowBytes(bytes);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [fileId, file, fileSize, windowStart, coordinator]);

  const flatStructures = useMemo(() => flattenStructures(structures), [structures]);

  const rows = useMemo(() => {
    const list: Array<{ rowOffset: number; bytes: Uint8Array }> = [];
    for (let i = 0; i < windowBytes.byteLength; i += bytesPerRow) {
      list.push({
        rowOffset: windowStart + i,
        bytes: windowBytes.subarray(i, Math.min(i + bytesPerRow, windowBytes.byteLength)),
      });
    }
    return list;
  }, [windowBytes, windowStart, bytesPerRow]);

  const inspectorValues = useMemo(() => {
    const rel = cursorOffset - windowStart;
    if (rel < 0 || rel >= windowBytes.byteLength) return null;
    return decodeDataInspector(windowBytes.subarray(rel, rel + 8), cursorOffset);
  }, [cursorOffset, windowStart, windowBytes]);

  const jumpTo = (target: number) => {
    const clamped = Math.max(0, Math.min(target, Math.max(0, fileSize - 1)));
    const aligned = Math.floor(clamped / 16) * 16;
    setWindowStart(aligned);
    setCursorOffset(clamped);
    setOffsetQuery(`0x${clamped.toString(16).toUpperCase().padStart(8, "0")}`);
  };

  const handleOffsetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseOffsetInput(offsetQuery, fileSize);
    if (parsed !== null) jumpTo(parsed);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const pattern =
      searchMode === "hex"
        ? parseHexPattern(searchQuery)
        : new TextEncoder().encode(searchQuery);

    if (!pattern || pattern.byteLength === 0) {
      setSearchStatus("Invalid hex sequence (expected pairs like FF D8 FF).");
      return;
    }

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearching(true);
    setSearchStatus("Scanning bounded chunks...");

    try {
      const startAt = cursorOffset + 1 < fileSize ? cursorOffset + 1 : 0;
      const found = await searchBlobPattern(file, pattern, {
        startOffset: startAt,
        signal: controller.signal,
        onProgress: (pct) => setSearchStatus(`Scanning ${pct.toFixed(0)}%...`),
      });

      if (found !== null) {
        jumpTo(found);
        setSearchStatus(`Match found at 0x${found.toString(16).toUpperCase().padStart(8, "0")}`);
      } else {
        setSearchStatus("Pattern not found from cursor to EOF.");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setSearchStatus("Search cancelled.");
      } else {
        setSearchStatus("Search failed.");
      }
    } finally {
      setSearching(false);
    }
  };

  const getByteColorStyle = (absOffset: number): { bg?: string; fg?: string; selected?: boolean } => {
    if (
      selectedByteRange &&
      absOffset >= selectedByteRange.start &&
      absOffset < selectedByteRange.start + selectedByteRange.length
    ) {
      return { selected: true };
    }
    for (let i = 0; i < flatStructures.length; i++) {
      const s = flatStructures[i];
      if (absOffset >= s.byteRange.start && absOffset < s.byteRange.start + s.byteRange.length) {
        const pal = STRUCT_PALETTE[i % STRUCT_PALETTE.length];
        return { bg: pal.bg, fg: pal.fg };
      }
    }
    return {};
  };

  const colHeaders = useMemo(
    () => Array.from({ length: bytesPerRow }, (_, i) => i.toString(16).toUpperCase().padStart(2, "0")),
    [bytesPerRow]
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3.5">
        <form onSubmit={handleOffsetSubmit} className="flex items-center gap-2">
          <label htmlFor="hex-offset-input" className="sr-only">
            Jump to byte offset
          </label>
          <input
            id="hex-offset-input"
            type="text"
            value={offsetQuery}
            onChange={(e) => setOffsetQuery(e.target.value)}
            placeholder="0x00000000"
            className="font-mono-tech min-h-[38px] w-32 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 text-xs text-[var(--text-primary)]"
          />
          <button
            type="submit"
            className="min-h-[38px] rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent-primary)]"
          >
            Jump
          </button>
        </form>

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={windowStart === 0}
            onClick={() => jumpTo(Math.max(0, windowStart - WINDOW_BYTES))}
            aria-label="Previous hex page"
            className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-secondary)] disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={windowStart + WINDOW_BYTES >= fileSize}
            onClick={() => jumpTo(windowStart + WINDOW_BYTES)}
            aria-label="Next hex page"
            className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-secondary)] disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSearch} className="flex flex-1 flex-wrap items-center gap-2 min-w-[220px]">
          <select
            aria-label="Search pattern mode"
            value={searchMode}
            onChange={(e) => setSearchMode(e.target.value as "hex" | "ascii")}
            className="min-h-[38px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 text-xs text-[var(--text-primary)]"
          >
            <option value="ascii">ASCII</option>
            <option value="hex">Hex</option>
          </select>
          <div className="relative flex-1 min-w-[140px]">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search bytes"
              placeholder={searchMode === "hex" ? "FF D8 FF..." : "Exif / Author..."}
              className="font-mono-tech min-h-[38px] w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] pr-2.5 pl-8 text-xs text-[var(--text-primary)]"
            />
          </div>
          {searching ? (
            <button
              type="button"
              onClick={() => searchAbortRef.current?.abort()}
              className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-[var(--status-critical)]/50 px-3 text-xs text-[var(--status-critical)]"
            >
              <X className="h-3.5 w-3.5" />
              <span>Stop</span>
            </button>
          ) : (
            <button
              type="submit"
              className="min-h-[38px] rounded-lg bg-[var(--cta-bg)] px-3.5 text-xs font-medium text-[var(--cta-text)]"
            >
              Find Next
            </button>
          )}
        </form>

        {searchStatus && (
          <span className="font-mono-tech text-[11px] text-[var(--text-secondary)]">
            {searchStatus}
          </span>
        )}
      </div>

      {/* ImHex-Inspired 3-Pane Cockpit: Hex Editor + Data Inspector + Pattern Data Table */}
      <div className="grid gap-4 xl:grid-cols-12">
        {/* Hex Editor Pane */}
        <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] xl:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-2 font-mono-tech text-[11px] text-[var(--text-muted)]">
            <span>
              HEX EDITOR • 0x{windowStart.toString(16).toUpperCase().padStart(8, "0")} – 0x
              {Math.max(0, windowStart + windowBytes.byteLength - 1)
                .toString(16)
                .toUpperCase()
                .padStart(8, "0")}
            </span>
            <span>
              CURSOR 0x{cursorOffset.toString(16).toUpperCase().padStart(8, "0")} ({cursorOffset})
            </span>
          </div>

          <div className="max-h-[420px] overflow-x-auto overflow-y-auto p-2.5 font-mono-tech text-[11px] sm:p-3 sm:text-xs">
            {/* Column Address / 00..0F / ASCII Header */}
            <div className="mb-1.5 flex items-center gap-2 border-b border-[var(--border-subtle)] pb-1.5 text-[10px] uppercase text-[var(--text-muted)] sm:gap-3">
              <span className="w-[66px] shrink-0 sm:w-[82px]">Address</span>
              <div className="flex shrink-0 gap-0.5 sm:gap-1">
                {colHeaders.map((h, i) => (
                  <span
                    key={h}
                    className={`px-0.5 ${i === 7 && bytesPerRow === 16 ? "mr-2" : ""}`}
                  >
                    {h}
                  </span>
                ))}
              </div>
              <span className="ml-auto hidden shrink-0 border-l border-[var(--border-subtle)] pl-3 sm:inline">
                ASCII
              </span>
            </div>

            {rows.length === 0 ? (
              <p className="p-4 text-center text-[var(--text-secondary)]">Empty file (0 bytes).</p>
            ) : (
              rows.map((row) => (
                <div
                  key={row.rowOffset}
                  className="flex items-center gap-2 leading-6 hover:bg-[var(--bg-primary)]/40 sm:gap-3"
                >
                  <span className="w-[66px] shrink-0 text-[var(--text-muted)] sm:w-[82px]">
                    {row.rowOffset.toString(16).toUpperCase().padStart(8, "0")}
                  </span>

                  <div className="flex shrink-0 gap-0.5 sm:gap-1">
                    {Array.from(row.bytes).map((b, idx) => {
                      const abs = row.rowOffset + idx;
                      const isCursor = abs === cursorOffset;
                      const color = getByteColorStyle(abs);
                      const splitGap = idx === 7 && bytesPerRow === 16 ? "mr-2" : "";
                      return (
                        <button
                          key={abs}
                          type="button"
                          onClick={() => setCursorOffset(abs)}
                          style={
                            !isCursor && !color.selected && color.bg
                              ? { backgroundColor: color.bg, color: color.fg }
                              : undefined
                          }
                          className={`rounded px-0.5 transition-colors ${splitGap} ${
                            isCursor
                              ? "bg-[var(--accent-primary)] font-semibold text-[#0B0D10]"
                              : color.selected
                                ? "bg-[var(--status-warning)]/25 text-[var(--status-warning)]"
                                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                          }`}
                        >
                          {b.toString(16).toUpperCase().padStart(2, "0")}
                        </button>
                      );
                    })}
                  </div>

                  <span className="ml-auto hidden shrink-0 border-l border-[var(--border-subtle)] pl-3 text-[var(--text-secondary)] sm:inline">
                    {Array.from(row.bytes)
                      .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : "."))
                      .join("")}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Pane: ImHex-style Data Inspector */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 xl:col-span-4">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
            <h3 className="font-mono-tech text-xs font-medium uppercase tracking-wider text-[var(--text-primary)]">
              Data Inspector
            </h3>
            <span className="font-mono-tech text-[10px] text-[var(--text-muted)]">
              LIVE CURSOR
            </span>
          </div>
          {inspectorValues ? (
            <dl className="mt-2.5 divide-y divide-[var(--border-subtle)]/50 font-mono-tech text-xs">
              {[
                ["Offset", inspectorValues.offsetHex],
                ["Binary (8 bit)", inspectorValues.binary8],
                ["uint8_t", String(inspectorValues.uint8)],
                ["int8_t", String(inspectorValues.int8)],
                ["uint16_t (LE)", String(inspectorValues.uint16LE ?? "—")],
                ["uint16_t (BE)", String(inspectorValues.uint16BE ?? "—")],
                ["int32_t (LE)", String(inspectorValues.int32LE ?? "—")],
                ["uint32_t (LE)", String(inspectorValues.uint32LE ?? "—")],
                ["uint32_t (BE)", String(inspectorValues.uint32BE ?? "—")],
                ["uint64_t (LE)", inspectorValues.uint64LE ?? "—"],
                ["float (32 bit)", inspectorValues.float32LE ?? "—"],
                ["ASCII Char", `'${inspectorValues.asciiChar}'`],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between gap-2 py-1.5">
                  <dt className="text-[var(--text-muted)]">{label}</dt>
                  <dd className="text-[var(--text-primary)]">{val}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-3 text-xs text-[var(--text-secondary)]">Select a byte to inspect.</p>
          )}
        </div>

        {/* Bottom Pane: ImHex-style Pattern Data Table */}
        <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] xl:col-span-12">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-2 font-mono-tech text-[11px] text-[var(--text-muted)]">
            <span>PATTERN DATA • DETECTED STRUCTURES ({flatStructures.length})</span>
            <span>CLICK ROW TO NAVIGATE</span>
          </div>
          {flatStructures.length === 0 ? (
            <p className="p-4 text-xs text-[var(--text-secondary)]">No binary structures mapped for this file.</p>
          ) : (
            <div className="max-h-56 overflow-x-auto overflow-y-auto">
              <table className="w-full min-w-[600px] border-collapse text-left font-mono-tech text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                    <th className="p-2.5">Name</th>
                    <th className="p-2.5">Color</th>
                    <th className="p-2.5">Start</th>
                    <th className="p-2.5">End</th>
                    <th className="p-2.5">Size</th>
                    <th className="p-2.5">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]/60">
                  {flatStructures.map((s, idx) => {
                    const pal = STRUCT_PALETTE[idx % STRUCT_PALETTE.length];
                    const endOffset = Math.max(s.byteRange.start, s.byteRange.start + s.byteRange.length - 1);
                    return (
                      <tr
                        key={s.id}
                        onClick={() => jumpTo(s.byteRange.start)}
                        className="cursor-pointer hover:bg-[var(--bg-primary)]/60"
                      >
                        <td className="p-2.5 font-medium text-[var(--text-primary)]">{s.name}</td>
                        <td className="p-2.5">
                          <span
                            className="inline-block h-3 w-6 rounded-sm border border-[var(--border-subtle)]"
                            style={{ backgroundColor: pal.fg }}
                            aria-hidden="true"
                          />
                        </td>
                        <td className="p-2.5 text-[var(--accent-primary)]">
                          0x{s.byteRange.start.toString(16).toUpperCase().padStart(8, "0")}
                        </td>
                        <td className="p-2.5 text-[var(--text-secondary)]">
                          0x{endOffset.toString(16).toUpperCase().padStart(8, "0")}
                        </td>
                        <td className="p-2.5 text-[var(--text-secondary)]">
                          {s.byteRange.length} B
                        </td>
                        <td className="p-2.5 text-[var(--text-muted)]">{s.type}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
