import { create } from "zustand";
import type { TraceEvent } from "@trace/event-system";
import { evaluateForensicRules, type ForensicRiskSummary } from "@trace/forensics";
import type { AnalysisPlan } from "@trace/parser-registry";
import type { SanitizationReportRecord } from "@trace/report-schema";
import type {
  AnalysisCoverage,
  ByteRange,
  DetectedStructure,
  FileIdentificationResult,
  ForensicFinding,
  MetadataField,
} from "@trace/shared-types";

export type InspectionMode = "analysis" | "re";
export type WorkspaceSection =
  | "overview"
  | "metadata"
  | "forensics"
  | "hex"
  | "sanitizer"
  | "export";

export type JobStatus = "queued" | "analyzing" | "completed" | "cancelled" | "error";

export interface FileSession {
  fileId: string;
  file: File;
  fileName: string;
  sizeBytes: number;
  declaredMime: string | null;
  status: JobStatus;
  errorMessage?: string;
  identification?: FileIdentificationResult;
  plan?: AnalysisPlan;
  fields: MetadataField[];
  structures: DetectedStructure[];
  findings: ForensicFinding[];
  forensicSummary?: ForensicRiskSummary;
  coverage?: AnalysisCoverage;
  warnings: string[];
  hashStatus: "idle" | "hashing" | "completed" | "cancelled" | "error";
  hashProgressPercent: number;
  sha256: string | null;
  events: TraceEvent[];
  selectedByteRange?: ByteRange;
  sanitizationHistory: SanitizationReportRecord[];
}

const MAX_EVENTS_PER_FILE = 5000;

interface WorkspaceState {
  sessions: Record<string, FileSession>;
  sessionOrder: string[];
  activeFileId: string | null;
  mode: InspectionMode;
  activeSection: WorkspaceSection;

  addFile: (file: File, initialStatus?: JobStatus) => FileSession;
  markAnalyzing: (fileId: string) => void;
  setActiveFile: (fileId: string) => void;
  setMode: (mode: InspectionMode) => void;
  setSection: (section: WorkspaceSection) => void;
  jumpToByteRange: (fileId: string, range: ByteRange) => void;
  appendEvent: (fileId: string, event: TraceEvent) => void;
  setAnalysisResult: (
    fileId: string,
    result: {
      identification: FileIdentificationResult;
      plan: AnalysisPlan;
      fields: MetadataField[];
      structures: DetectedStructure[];
      findings: ForensicFinding[];
      forensicSummary: ForensicRiskSummary;
      coverage: AnalysisCoverage;
      warnings: string[];
    }
  ) => void;
  setAnalysisError: (fileId: string, message: string) => void;
  setAnalysisCancelled: (fileId: string) => void;
  setHashProgress: (fileId: string, percent: number) => void;
  setHashComplete: (fileId: string, sha256: string) => void;
  setHashCancelled: (fileId: string) => void;
  setHashError: (fileId: string) => void;
  addSanitizationRecord: (fileId: string, record: SanitizationReportRecord) => void;
  mergeBackendAnalysis: (
    fileId: string,
    payload: {
      fields: MetadataField[];
      events: Array<{ eventType: string; severity: string; operation: string; message: string; timestampIso: string }>;
      sha256?: string;
    }
  ) => void;
  removeFile: (fileId: string) => void;
  clearAll: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  sessions: {},
  sessionOrder: [],
  activeFileId: null,
  mode: "analysis",
  activeSection: "overview",

  addFile: (file, initialStatus = "analyzing") => {
    const fileId = crypto.randomUUID();
    const session: FileSession = {
      fileId,
      file,
      fileName: file.name,
      sizeBytes: file.size,
      declaredMime: file.type || null,
      status: initialStatus,
      fields: [],
      structures: [],
      findings: [],
      warnings: [],
      hashStatus: "idle",
      hashProgressPercent: 0,
      sha256: null,
      events: [],
      sanitizationHistory: [],
    };
    set((state) => ({
      sessions: { ...state.sessions, [fileId]: session },
      sessionOrder: [...state.sessionOrder, fileId],
      activeFileId: fileId,
    }));
    return session;
  },

  markAnalyzing: (fileId) =>
    set((state) => {
      const target = state.sessions[fileId];
      if (!target) return state;
      return {
        sessions: {
          ...state.sessions,
          [fileId]: { ...target, status: "analyzing" },
        },
      };
    }),

  setActiveFile: (fileId) => set({ activeFileId: fileId }),
  setMode: (mode) => set({ mode }),
  setSection: (activeSection) => set({ activeSection }),

  jumpToByteRange: (fileId, range) =>
    set((state) => {
      const target = state.sessions[fileId];
      if (!target) return state;
      return {
        activeFileId: fileId,
        activeSection: "hex",
        sessions: {
          ...state.sessions,
          [fileId]: { ...target, selectedByteRange: range },
        },
      };
    }),

  appendEvent: (fileId, event) =>
    set((state) => {
      const target = state.sessions[fileId];
      if (!target) return state;
      const nextEvents =
        target.events.length >= MAX_EVENTS_PER_FILE
          ? [...target.events.slice(1), event]
          : [...target.events, event];
      return {
        sessions: {
          ...state.sessions,
          [fileId]: { ...target, events: nextEvents },
        },
      };
    }),

  setAnalysisResult: (fileId, result) =>
    set((state) => {
      const target = state.sessions[fileId];
      if (!target) return state;
      return {
        sessions: {
          ...state.sessions,
          [fileId]: {
            ...target,
            status: "completed",
            ...result,
          },
        },
      };
    }),

  setAnalysisError: (fileId, message) =>
    set((state) => {
      const target = state.sessions[fileId];
      if (!target) return state;
      return {
        sessions: {
          ...state.sessions,
          [fileId]: { ...target, status: "error", errorMessage: message },
        },
      };
    }),

  setAnalysisCancelled: (fileId) =>
    set((state) => {
      const target = state.sessions[fileId];
      if (!target) return state;
      return {
        sessions: {
          ...state.sessions,
          [fileId]: { ...target, status: "cancelled" },
        },
      };
    }),

  setHashProgress: (fileId, percent) =>
    set((state) => {
      const target = state.sessions[fileId];
      if (!target) return state;
      return {
        sessions: {
          ...state.sessions,
          [fileId]: {
            ...target,
            hashStatus: "hashing",
            hashProgressPercent: percent,
          },
        },
      };
    }),

  setHashComplete: (fileId, sha256) =>
    set((state) => {
      const target = state.sessions[fileId];
      if (!target) return state;
      return {
        sessions: {
          ...state.sessions,
          [fileId]: {
            ...target,
            hashStatus: "completed",
            hashProgressPercent: 100,
            sha256,
            coverage: target.coverage
              ? { ...target.coverage, fullHashComputed: true }
              : undefined,
          },
        },
      };
    }),

  setHashCancelled: (fileId) =>
    set((state) => {
      const target = state.sessions[fileId];
      if (!target) return state;
      return {
        sessions: {
          ...state.sessions,
          [fileId]: { ...target, hashStatus: "cancelled" },
        },
      };
    }),

  setHashError: (fileId) =>
    set((state) => {
      const target = state.sessions[fileId];
      if (!target) return state;
      return {
        sessions: {
          ...state.sessions,
          [fileId]: { ...target, hashStatus: "error" },
        },
      };
    }),

  addSanitizationRecord: (fileId, record) =>
    set((state) => {
      const target = state.sessions[fileId];
      if (!target) return state;
      return {
        sessions: {
          ...state.sessions,
          [fileId]: {
            ...target,
            sanitizationHistory: [...target.sanitizationHistory, record],
          },
        },
      };
    }),

  mergeBackendAnalysis: (fileId, payload) =>
    set((state) => {
      const target = state.sessions[fileId];
      if (!target || !target.identification) return state;
      const mergedFields = [...target.fields, ...payload.fields];
      const forensicResult = evaluateForensicRules({
        fileId,
        fileSizeBytes: target.sizeBytes,
        identification: target.identification,
        fields: mergedFields,
        structures: target.structures,
        parserFindings: target.findings.filter((f) => f.detectionMethod !== "packages/forensics"),
      });
      const baseSeq = target.events.at(-1)?.sequence ?? 0;
      const mappedEvents: TraceEvent[] = payload.events.map((ev, idx) => ({
        id: `${fileId}:remote:${baseSeq + idx + 1}`,
        sequence: baseSeq + idx + 1,
        timestampIso: ev.timestampIso,
        eventType: ev.eventType as TraceEvent["eventType"],
        severity: ev.severity as TraceEvent["severity"],
        fileId,
        parserId: "backend-sandbox",
        operation: ev.operation,
        message: ev.message,
      }));
      return {
        sessions: {
          ...state.sessions,
          [fileId]: {
            ...target,
            fields: mergedFields,
            findings: forensicResult.findings,
            forensicSummary: forensicResult.summary,
            sha256: target.sha256 ?? payload.sha256 ?? null,
            coverage: target.coverage
              ? {
                  ...target.coverage,
                  mode: "consented_backend",
                  fullHashComputed: target.coverage.fullHashComputed || Boolean(payload.sha256),
                }
              : undefined,
            events: [...target.events, ...mappedEvents].slice(-MAX_EVENTS_PER_FILE),
          },
        },
      };
    }),

  removeFile: (fileId) =>
    set((state) => {
      const nextSessions = { ...state.sessions };
      delete nextSessions[fileId];
      const nextOrder = state.sessionOrder.filter((id) => id !== fileId);
      const nextActive =
        state.activeFileId === fileId ? nextOrder[0] ?? null : state.activeFileId;
      return {
        sessions: nextSessions,
        sessionOrder: nextOrder,
        activeFileId: nextActive,
      };
    }),

  clearAll: () => set({ sessions: {}, sessionOrder: [], activeFileId: null }),
}));
