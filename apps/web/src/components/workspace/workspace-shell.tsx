"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Download,
  Eraser,
  FileCode2,
  FileSearch,
  FlaskConical,
  GitCompare,
  Keyboard,
  Layers,
  Menu,
  Moon,
  Plus,
  ShieldAlert,
  Sun,
  Terminal,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { TraceLogo } from "@/components/ui/trace-logo";
import { useTheme } from "@/components/ui/theme-provider";
import { useWorkspaceStore, type WorkspaceSection } from "@/stores/workspace-store";
import { WorkerCoordinator } from "@/workers/coordinator";
import { DiffPanel } from "./diff-panel";
import { ForensicsPanel } from "./forensics-panel";
import { MetadataPanel } from "./metadata-panel";
import { OverviewPanel } from "./overview-panel";
import { buildSampleEvidenceFiles } from "./sample-locker";

const HexInspector = dynamic(
  () => import("./hex-inspector").then((m) => m.HexInspector),
  { ssr: false }
);
const ReModePanel = dynamic(
  () => import("./re-mode-panel").then((m) => m.ReModePanel),
  { ssr: false }
);
const SanitizerPanel = dynamic(
  () => import("./sanitizer-panel").then((m) => m.SanitizerPanel),
  { ssr: false }
);
const ExportPanel = dynamic(
  () => import("./export-panel").then((m) => m.ExportPanel),
  { ssr: false }
);

const SECTIONS: Array<{
  id: WorkspaceSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "overview", label: "Overview", icon: FileSearch },
  { id: "metadata", label: "Metadata", icon: Layers },
  { id: "forensics", label: "Forensics", icon: ShieldAlert },
  { id: "hex", label: "Hex Inspector", icon: FileCode2 },
  { id: "sanitizer", label: "Sanitizer", icon: Eraser },
  { id: "diff", label: "Diff / Compare", icon: GitCompare },
  { id: "export", label: "Export", icon: Download },
];

export function WorkspaceShell() {
  const { theme, toggleTheme } = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const sigInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [scanLevel, setScanLevel] = useState<"quick" | "full">("quick");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [saveHistoryOptIn, setSaveHistoryOptIn] = useState(false);
  const [savedSummariesCount, setSavedSummariesCount] = useState(0);
  const [customSigCount, setCustomSigCount] = useState(0);

  const {
    sessions,
    sessionOrder,
    activeFileId,
    mode,
    activeSection,
    addFile,
    markAnalyzing,
    setActiveFile,
    setMode,
    setSection,
    jumpToByteRange,
    appendEvent,
    setAnalysisResult,
    setAnalysisError,
    setAnalysisCancelled,
    setHashProgress,
    setHashComplete,
    setHashCancelled,
    setHashError,
    addSanitizationRecord,
    mergeBackendAnalysis,
    removeFile,
    clearAll,
  } = useWorkspaceStore();

  const coordinator = useMemo(
    () =>
      new WorkerCoordinator({
        onEvent: (fileId, event) => appendEvent(fileId, event),
        onAnalysisComplete: (payload) => setAnalysisResult(payload.fileId, payload),
        onAnalysisError: (fileId, msg) => setAnalysisError(fileId, msg),
        onHashProgress: (fileId, pct) => setHashProgress(fileId, pct),
        onHashComplete: (fileId, sha256) => setHashComplete(fileId, sha256),
        onHashError: (fileId) => setHashError(fileId),
        onCancelled: (fileId, kind) => {
          if (kind === "analysis") setAnalysisCancelled(fileId);
          else setHashCancelled(fileId);
        },
      }),
    [
      appendEvent,
      setAnalysisResult,
      setAnalysisError,
      setHashProgress,
      setHashComplete,
      setHashError,
      setAnalysisCancelled,
      setHashCancelled,
    ]
  );

  useEffect(() => {
    for (const id of sessionOrder) {
      const s = sessions[id];
      if (s?.status === "queued") {
        markAnalyzing(id);
        coordinator.analyzeFile(id, s.file);
      }
    }
  }, [sessionOrder, sessions, markAnalyzing, coordinator]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sidebarOpen]);

  useEffect(() => {
    return () => {
      coordinator.terminateWorkers();
    };
  }, [coordinator]);

  // Opt-in local summary history (#37) — disabled by default, never persists file bytes
  useEffect(() => {
    try {
      const enabled = localStorage.getItem("trace_history_optin") === "1";
      setSaveHistoryOptIn(enabled);
      const raw = localStorage.getItem("trace_session_summaries");
      if (raw) setSavedSummariesCount((JSON.parse(raw) as unknown[]).length);
    } catch {
      // Ignore storage failures
    }
  }, []);

  useEffect(() => {
    if (!saveHistoryOptIn) return;
    const completed = sessionOrder
      .map((id) => sessions[id])
      .filter((s) => s?.status === "completed")
      .map((s) => ({
        fileName: s.fileName,
        format: s.identification?.formatId ?? "unknown",
        sizeBytes: s.sizeBytes,
        findings: s.findings.length,
        savedAt: new Date().toISOString(),
      }));
    if (completed.length === 0) return;
    try {
      localStorage.setItem("trace_session_summaries", JSON.stringify(completed.slice(-25)));
      setSavedSummariesCount(completed.length);
    } catch {
      // Ignore storage quota errors
    }
  }, [saveHistoryOptIn, sessionOrder, sessions]);

  // Keyboard shortcuts (#36)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "?") {
        setShowShortcuts((v) => !v);
      } else if (e.key === "Escape") {
        setShowShortcuts(false);
      } else if (e.key === "m" || e.key === "M") {
        setMode(mode === "analysis" ? "re" : "analysis");
      } else if (e.key >= "1" && e.key <= "7") {
        const target = SECTIONS[Number(e.key) - 1];
        if (target) {
          setMode("analysis");
          setSection(target.id);
        }
      } else if ((e.key === "j" || e.key === "k") && sessionOrder.length > 1 && activeFileId) {
        const idx = sessionOrder.indexOf(activeFileId);
        const nextIdx =
          e.key === "j"
            ? (idx + 1) % sessionOrder.length
            : (idx - 1 + sessionOrder.length) % sessionOrder.length;
        setActiveFile(sessionOrder[nextIdx]);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, setMode, setSection, sessionOrder, activeFileId, setActiveFile]);

  const loadSampleLocker = () => {
    const samples = buildSampleEvidenceFiles();
    for (const file of samples) {
      const session = addFile(file);
      coordinator.analyzeFile(session.fileId, file);
      if (scanLevel === "full") {
        coordinator.hashFile(session.fileId, file);
      }
    }
    setSidebarOpen(false);
  };

  const enqueueFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    for (const file of Array.from(fileList)) {
      const session = addFile(file);
      coordinator.analyzeFile(session.fileId, file);
      if (scanLevel === "full") {
        coordinator.hashFile(session.fileId, file);
      }
    }
    setSidebarOpen(false);
  };

  const activeSession = activeFileId ? sessions[activeFileId] : undefined;

  const handleJumpToOffset = (start: number, length: number) => {
    if (!activeSession) return;
    jumpToByteRange(activeSession.fileId, { start, length });
  };

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-primary)]">
      <input
        ref={inputRef}
        type="file"
        multiple
        aria-label="Upload files for local inspection"
        onChange={(e) => {
          enqueueFiles(e.target.files);
          e.target.value = "";
        }}
        className="sr-only"
      />

      {/* Top Workspace Bar */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-glass)] px-3 backdrop-blur-md sm:gap-3 sm:px-4">
        <div className="flex items-center gap-2 min-w-0 sm:gap-3">
          <button
            type="button"
            onClick={() => setSidebarOpen((p) => !p)}
            aria-expanded={sidebarOpen}
            aria-label="Toggle workspace queue sidebar"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-primary)] lg:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>

          <Link href="/" aria-label="Back to TRACE Home" className="shrink-0">
            <TraceLogo />
          </Link>

          {activeSession && (
            <div className="hidden items-center gap-2 border-l border-[var(--border-subtle)] pl-3 md:flex min-w-0">
              <span className="truncate max-w-[200px] text-xs font-medium text-[var(--text-primary)]">
                {activeSession.fileName}
              </span>
              {activeSession.identification && (
                <span className="font-mono-tech rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-2 py-0.5 text-[11px] text-[var(--accent-primary)]">
                  {activeSession.identification.formatId.toUpperCase()}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
          {/* Signature Mode Switcher: Analysis Mode vs RE Mode */}
          <div
            role="tablist"
            aria-label="Inspection Mode"
            className="inline-flex rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-0.5 sm:p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "analysis"}
              onClick={() => setMode("analysis")}
              className={`min-h-[34px] rounded-full px-2.5 text-[11px] font-medium transition-colors sm:px-3.5 sm:text-xs ${
                mode === "analysis"
                  ? "bg-[var(--cta-bg)] text-[var(--cta-text)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <span className="sm:hidden">Analysis</span>
              <span className="hidden sm:inline">Analysis Mode</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "re"}
              onClick={() => setMode("re")}
              className={`inline-flex min-h-[34px] items-center gap-1 rounded-full px-2.5 font-mono-tech text-[11px] font-medium transition-colors sm:gap-1.5 sm:px-3.5 sm:text-xs ${
                mode === "re"
                  ? "border border-[var(--accent-primary)]/40 bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sm:hidden">RE</span>
              <span className="hidden sm:inline">RE Mode</span>
            </button>
          </div>

          <button
            type="button"
            aria-label="Add files"
            onClick={() => inputRef.current?.click()}
            className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center gap-1.5 rounded-full bg-[var(--cta-bg)] px-2.5 text-xs font-medium text-[var(--cta-text)] sm:px-3.5"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Add Files</span>
          </button>

          <button
            type="button"
            onClick={() => setShowShortcuts((v) => !v)}
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
            className="hidden h-10 w-10 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] sm:inline-flex"
          >
            <Keyboard className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            className="hidden h-10 w-10 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] sm:inline-flex"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <div className="relative flex flex-1">
        {sidebarOpen && (
          <div
            aria-hidden="true"
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          />
        )}
        {/* Left Sidebar (BlacX-inspired File Queue & Section Rail) */}
        <aside
          aria-label="Workspace navigation and file queue"
          className={`${
            sidebarOpen ? "fixed inset-y-0 left-0 z-50 flex pt-16" : "hidden"
          } w-64 shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-secondary)] lg:static lg:flex lg:pt-0`}
        >
          {sidebarOpen && (
            <button
              type="button"
              aria-label="Close sidebar"
              onClick={() => setSidebarOpen(false)}
              className="self-end p-3 text-[var(--text-secondary)] lg:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          {mode === "analysis" && (
            <nav aria-label="Analysis Sections" className="border-b border-[var(--border-subtle)] p-3">
              <p className="font-mono-tech px-2 pb-2 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                General
              </p>
              <ul className="space-y-1">
                {SECTIONS.map((sec) => {
                  const Icon = sec.icon;
                  const active = activeSection === sec.id;
                  return (
                    <li key={sec.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSection(sec.id);
                          setSidebarOpen(false);
                        }}
                        className={`flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-2.5 text-xs font-medium transition-colors ${
                          active
                            ? "bg-[var(--bg-elevated)] text-[var(--text-primary)]"
                            : "text-[var(--text-secondary)] hover:bg-[var(--bg-primary)]/60 hover:text-[var(--text-primary)]"
                        }`}
                      >
                        <Icon className="h-4 w-4 text-[var(--accent-primary)]" />
                        <span>{sec.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="font-mono-tech mt-4 px-2 pb-1.5 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                Reference
              </p>
              <ul className="space-y-0.5 text-xs text-[var(--text-secondary)]">
                <li>
                  <Link href="/formats" className="flex min-h-[34px] items-center rounded-md px-2.5 hover:bg-[var(--bg-primary)]/60 hover:text-[var(--text-primary)]">
                    Format Registry
                  </Link>
                </li>
                <li>
                  <Link href="/security" className="flex min-h-[34px] items-center rounded-md px-2.5 hover:bg-[var(--bg-primary)]/60 hover:text-[var(--text-primary)]">
                    Security &amp; Privacy
                  </Link>
                </li>
              </ul>
            </nav>
          )}

          <div className="flex flex-1 flex-col p-3">
            <div className="flex items-center justify-between px-2 pb-2">
              <p className="font-mono-tech text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                File Queue ({sessionOrder.length})
              </p>
              {sessionOrder.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    coordinator.terminateWorkers();
                    clearAll();
                  }}
                  className="text-[11px] text-[var(--text-muted)] hover:text-[var(--status-critical)]"
                >
                  Clear All
                </button>
              )}
            </div>

            <div className="flex-1 space-y-1.5 overflow-y-auto">
              {sessionOrder.map((id) => {
                const item = sessions[id];
                if (!item) return null;
                const isSelected = id === activeFileId;
                return (
                  <div
                    key={id}
                    className={`flex items-center justify-between gap-2 rounded-lg border p-2.5 text-xs ${
                      isSelected
                        ? "border-[var(--accent-primary)]/50 bg-[var(--bg-elevated)]"
                        : "border-[var(--border-subtle)] bg-[var(--bg-primary)]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setActiveFile(id);
                        setSidebarOpen(false);
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate font-medium text-[var(--text-primary)]">
                        {item.fileName}
                      </p>
                      <p className="font-mono-tech mt-0.5 text-[10px] text-[var(--text-muted)]">
                        {item.identification?.formatId.toUpperCase() ?? "SCANNING"} • {item.status}
                      </p>
                    </button>

                    {item.status === "analyzing" ? (
                      <button
                        type="button"
                        aria-label={`Cancel analysis for ${item.fileName}`}
                        onClick={() => coordinator.cancelFile(id)}
                        className="p-1 text-[var(--status-warning)] hover:text-[var(--status-critical)]"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Remove ${item.fileName}`}
                        onClick={() => removeFile(id)}
                        className="p-1 text-[var(--text-muted)] hover:text-[var(--status-critical)]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="border-t border-[var(--border-subtle)] pt-3 space-y-2 text-[11px] text-[var(--text-secondary)]">
              <button
                type="button"
                onClick={loadSampleLocker}
                className="flex min-h-[36px] w-full items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 font-medium text-[var(--accent-primary)] hover:border-[var(--accent-primary)]"
              >
                <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Load Sample Evidence</span>
              </button>

              <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 py-2">
                <span>Save history ({savedSummariesCount})</span>
                <input
                  type="checkbox"
                  checked={saveHistoryOptIn}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setSaveHistoryOptIn(next);
                    localStorage.setItem("trace_history_optin", next ? "1" : "0");
                    if (!next) {
                      localStorage.removeItem("trace_session_summaries");
                      setSavedSummariesCount(0);
                    }
                  }}
                  className="accent-[var(--accent-primary)]"
                />
              </label>

              <input
                ref={sigInputRef}
                type="file"
                accept=".json"
                aria-label="Import custom signature JSON rules"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try {
                    const parsed = JSON.parse(await file.text());
                    if (Array.isArray(parsed)) {
                      coordinator.registerCustomSignatures(parsed);
                      setCustomSigCount(parsed.length);
                    }
                  } catch {
                    // Ignore malformed JSON
                  }
                }}
                className="sr-only"
              />
              <button
                type="button"
                onClick={() => sigInputRef.current?.click()}
                className="flex min-h-[34px] w-full items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 hover:border-[var(--border-strong)]"
              >
                <span>Signature Plugin (.json)</span>
                <span className="font-mono-tech text-[10px] text-[var(--accent-primary)]">
                  {customSigCount}
                </span>
              </button>
            </div>

            <div className="border-t border-[var(--border-subtle)] pt-3 sm:hidden">
              <button
                type="button"
                onClick={toggleTheme}
                className="flex min-h-[40px] w-full items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 text-xs text-[var(--text-secondary)]"
              >
                <span>Theme: {theme === "dark" ? "Dark Graphite" : "Light Paper"}</span>
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </aside>

        {/* Main Workspace Region */}
        <main
          id="main-content"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            enqueueFiles(e.dataTransfer.files);
          }}
          className="flex-1 p-4 sm:p-6 lg:p-8"
        >
          <div className="mx-auto max-w-[1440px]">
            <div aria-live="polite" className="sr-only">
              {activeSession
                ? `${activeSession.fileName} status ${activeSession.status}`
                : "No file selected"}
            </div>

            {!activeSession ? (
              <div className="mx-auto max-w-[880px] space-y-6">
                <div>
                  <h1 className="font-serif-display text-3xl text-[var(--text-primary)] sm:text-4xl">
                    TRACE Metadata &amp; Binary Workspace
                  </h1>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Select local processing depth and drop one or more files below.
                  </p>
                </div>

                {/* BlacX-inspired Processing Level Selection Cards */}
                <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Local Processing Level">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={scanLevel === "quick"}
                    onClick={() => setScanLevel("quick")}
                    className={`rounded-xl border p-4 text-left transition-colors ${
                      scanLevel === "quick"
                        ? "border-[var(--accent-primary)] bg-[var(--bg-secondary)]"
                        : "border-[var(--border-subtle)] bg-[var(--bg-secondary)]/60 hover:border-[var(--border-strong)]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-[var(--text-primary)]">Quick Local Scan</span>
                      <span className="font-mono-tech text-[10px] uppercase text-[var(--accent-primary)]">
                        {scanLevel === "quick" ? "Selected" : "Default"}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
                      Bounded signature detection, container box walk, metadata &amp; forensic rules. Ideal for 5 GB+ files.
                    </p>
                  </button>

                  <button
                    type="button"
                    role="radio"
                    aria-checked={scanLevel === "full"}
                    onClick={() => setScanLevel("full")}
                    className={`rounded-xl border p-4 text-left transition-colors ${
                      scanLevel === "full"
                        ? "border-[var(--accent-primary)] bg-[var(--bg-secondary)]"
                        : "border-[var(--border-subtle)] bg-[var(--bg-secondary)]/60 hover:border-[var(--border-strong)]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-[var(--text-primary)]">Deep Local + SHA-256</span>
                      <span className="font-mono-tech text-[10px] uppercase text-[var(--text-muted)]">
                        {scanLevel === "full" ? "Selected" : "Streaming"}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
                      Runs Quick Local Scan plus automatic streaming SHA-256 digest via bounded 16 MiB chunks.
                    </p>
                  </button>
                </div>

                <div
                  className={`flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed p-8 text-center transition-colors ${
                    dragging
                      ? "border-[var(--accent-primary)] bg-[var(--accent-soft)]"
                      : "border-[var(--border-strong)] bg-[var(--bg-secondary)]"
                  }`}
                >
                  <Upload
                    className="h-7 w-7 text-[var(--accent-primary)]"
                    aria-hidden="true"
                  />
                  <h2 className="mt-3 text-base font-medium text-[var(--text-primary)]">
                    Drag and drop files here
                  </h2>
                  <p className="mt-1.5 max-w-md text-xs text-[var(--text-secondary)]">
                    Any file type or unknown extension. 100% local in browser Web Workers.
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      className="inline-flex min-h-[42px] items-center rounded-full bg-[var(--cta-bg)] px-6 text-xs font-medium text-[var(--cta-text)]"
                    >
                      Upload File
                    </button>
                    <button
                      type="button"
                      onClick={loadSampleLocker}
                      className="inline-flex min-h-[42px] items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--bg-primary)] px-5 text-xs font-medium text-[var(--accent-primary)] hover:border-[var(--accent-primary)]"
                    >
                      <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Try Sample Evidence Locker (3 Files)</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : mode === "re" ? (
              <ReModePanel
                session={activeSession}
                coordinator={coordinator}
                onJumpToOffset={handleJumpToOffset}
              />
            ) : (
              <div className="space-y-6">
                {/* Mobile section pills */}
                <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
                  {SECTIONS.map((sec) => (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => setSection(sec.id)}
                      className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium ${
                        activeSection === sec.id
                          ? "bg-[var(--cta-bg)] text-[var(--cta-text)]"
                          : "border border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
                      }`}
                    >
                      {sec.label}
                    </button>
                  ))}
                </div>

                {activeSection === "overview" && (
                  <OverviewPanel
                    session={activeSession}
                    onComputeHash={(fid) => coordinator.hashFile(fid, activeSession.file)}
                    onCancelHash={(fid) => coordinator.cancelFile(fid)}
                    onJumpToOffset={(start, length) => {
                      handleJumpToOffset(start, length);
                      setSection("hex");
                    }}
                    onMergeBackend={mergeBackendAnalysis}
                  />
                )}
                {activeSection === "metadata" && (
                  <MetadataPanel
                    fields={activeSession.fields}
                    onJumpToOffset={(start, length) => {
                      handleJumpToOffset(start, length);
                      setSection("hex");
                    }}
                  />
                )}
                {activeSection === "forensics" && (
                  <ForensicsPanel
                    findings={activeSession.findings}
                    summary={activeSession.forensicSummary}
                    onJumpToOffset={(start, length) => {
                      handleJumpToOffset(start, length);
                      setSection("hex");
                    }}
                  />
                )}
                {activeSection === "hex" && (
                  <HexInspector
                    fileId={activeSession.fileId}
                    file={activeSession.file}
                    fileSize={activeSession.sizeBytes}
                    structures={activeSession.structures}
                    selectedByteRange={activeSession.selectedByteRange}
                    coordinator={coordinator}
                  />
                )}
                {activeSection === "sanitizer" && (
                  <SanitizerPanel
                    session={activeSession}
                    allSessions={sessionOrder.map((id) => sessions[id]).filter(Boolean)}
                    onRecordSanitization={addSanitizationRecord}
                  />
                )}
                {activeSection === "diff" && (
                  <DiffPanel
                    sessions={sessions}
                    sessionOrder={sessionOrder}
                    activeFileId={activeFileId}
                  />
                )}
                {activeSection === "export" && (
                  <ExportPanel session={activeSession} />
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      {showShortcuts && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard Shortcuts"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-6 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <h2 className="font-mono-tech text-sm font-medium uppercase tracking-wider text-[var(--text-primary)]">
                Workspace Shortcuts
              </h2>
              <button
                type="button"
                aria-label="Close shortcuts dialog"
                onClick={() => setShowShortcuts(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <dl className="mt-4 space-y-2.5 font-mono-tech">
              {[
                ["1 – 7", "Switch Analysis sections (Overview..Export)"],
                ["m", "Toggle Analysis Mode <-> RE Mode"],
                ["j / k", "Next / Previous file in queue"],
                ["?", "Toggle this shortcuts overlay"],
                ["Esc", "Close active modal or mobile drawer"],
              ].map(([k, desc]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="rounded bg-[var(--bg-primary)] px-2 py-0.5 text-[var(--accent-primary)]">{k}</dt>
                  <dd className="text-right text-[var(--text-secondary)]">{desc}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
