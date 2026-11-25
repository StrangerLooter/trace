import type { TraceEvent } from "@trace/event-system";
import type { ForensicRiskSummary } from "@trace/forensics";
import type { AnalysisPlan } from "@trace/parser-registry";
import type {
  AnalysisCoverage,
  DetectedStructure,
  FileIdentificationResult,
  ForensicFinding,
  MetadataField,
} from "@trace/shared-types";

export interface AnalyzeFileCommand {
  type: "analyze";
  requestId: string;
  fileId: string;
  file: Blob;
  fileName: string;
  declaredMime: string | null;
}

export interface ReadHexWindowCommand {
  type: "read_hex_window";
  requestId: string;
  fileId: string;
  file: Blob;
  offset: number;
  length: number;
}

export interface CancelAnalysisCommand {
  type: "cancel";
  fileId: string;
}

export type AnalysisWorkerRequest =
  | AnalyzeFileCommand
  | ReadHexWindowCommand
  | CancelAnalysisCommand;

export interface AnalysisResultPayload {
  fileId: string;
  identification: FileIdentificationResult;
  plan: AnalysisPlan;
  fields: MetadataField[];
  structures: DetectedStructure[];
  findings: ForensicFinding[];
  forensicSummary: ForensicRiskSummary;
  coverage: AnalysisCoverage;
  warnings: string[];
}

export type AnalysisWorkerResponse =
  | { type: "event"; fileId: string; event: TraceEvent }
  | { type: "analysis_complete"; requestId: string; payload: AnalysisResultPayload }
  | {
      type: "hex_window";
      requestId: string;
      fileId: string;
      offset: number;
      buffer: ArrayBuffer;
    }
  | { type: "cancelled"; requestId?: string; fileId: string }
  | { type: "error"; requestId?: string; fileId: string; message: string };

export interface ComputeHashCommand {
  type: "hash";
  requestId: string;
  fileId: string;
  file: Blob;
  chunkSizeBytes?: number;
}

export interface CancelHashCommand {
  type: "cancel";
  fileId: string;
}

export type HashWorkerRequest = ComputeHashCommand | CancelHashCommand;

export type HashWorkerResponse =
  | { type: "event"; fileId: string; event: TraceEvent }
  | {
      type: "progress";
      requestId: string;
      fileId: string;
      bytesProcessed: number;
      totalBytes: number;
      percent: number;
    }
  | { type: "hash_complete"; requestId: string; fileId: string; sha256: string }
  | { type: "cancelled"; requestId?: string; fileId: string }
  | { type: "error"; requestId?: string; fileId: string; message: string };
