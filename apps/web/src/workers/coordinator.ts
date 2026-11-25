import type { TraceEvent } from "@trace/event-system";
import type {
  AnalysisResultPayload,
  AnalysisWorkerResponse,
  HashWorkerResponse,
} from "./protocol";

export interface CoordinatorHandlers {
  onEvent: (fileId: string, event: TraceEvent) => void;
  onAnalysisComplete: (payload: AnalysisResultPayload) => void;
  onAnalysisError: (fileId: string, message: string) => void;
  onHashProgress: (fileId: string, percent: number, bytesProcessed: number) => void;
  onHashComplete: (fileId: string, sha256: string) => void;
  onHashError: (fileId: string, message: string) => void;
  onCancelled: (fileId: string, workerKind: "analysis" | "hash") => void;
}

export class WorkerCoordinator {
  private analysisWorker: Worker | null = null;
  private hashWorker: Worker | null = null;
  private readonly handlers: CoordinatorHandlers;
  private readonly pendingHexRequests = new Map<
    string,
    { resolve: (buf: Uint8Array) => void; reject: (err: Error) => void }
  >();

  constructor(handlers: CoordinatorHandlers) {
    this.handlers = handlers;
  }

  private ensureAnalysisWorker(): Worker {
    if (!this.analysisWorker) {
      this.analysisWorker = new Worker(
        new URL("./analysis.worker.ts", import.meta.url),
        { type: "module" }
      );
      this.analysisWorker.addEventListener(
        "message",
        (ev: MessageEvent<AnalysisWorkerResponse>) => {
          const msg = ev.data;
          if (msg.type === "event") {
            this.handlers.onEvent(msg.fileId, msg.event);
          } else if (msg.type === "analysis_complete") {
            this.handlers.onAnalysisComplete(msg.payload);
          } else if (msg.type === "hex_window") {
            const pending = this.pendingHexRequests.get(msg.requestId);
            if (pending) {
              this.pendingHexRequests.delete(msg.requestId);
              pending.resolve(new Uint8Array(msg.buffer));
            }
          } else if (msg.type === "cancelled") {
            if (msg.requestId) {
              const pending = this.pendingHexRequests.get(msg.requestId);
              if (pending) {
                this.pendingHexRequests.delete(msg.requestId);
                pending.reject(new Error("Hex read cancelled"));
              }
            }
            this.handlers.onCancelled(msg.fileId, "analysis");
          } else if (msg.type === "error") {
            if (msg.requestId) {
              const pending = this.pendingHexRequests.get(msg.requestId);
              if (pending) {
                this.pendingHexRequests.delete(msg.requestId);
                pending.reject(new Error(msg.message));
                return;
              }
            }
            this.handlers.onAnalysisError(msg.fileId, msg.message);
          }
        }
      );
      this.analysisWorker.addEventListener("error", (err) => {
        for (const pending of this.pendingHexRequests.values()) {
          pending.reject(new Error(err.message || "Analysis worker crashed"));
        }
        this.pendingHexRequests.clear();
      });
    }
    return this.analysisWorker;
  }

  private ensureHashWorker(): Worker {
    if (!this.hashWorker) {
      this.hashWorker = new Worker(new URL("./hash.worker.ts", import.meta.url), {
        type: "module",
      });
      this.hashWorker.addEventListener(
        "message",
        (ev: MessageEvent<HashWorkerResponse>) => {
          const msg = ev.data;
          if (msg.type === "event") {
            this.handlers.onEvent(msg.fileId, msg.event);
          } else if (msg.type === "progress") {
            this.handlers.onHashProgress(msg.fileId, msg.percent, msg.bytesProcessed);
          } else if (msg.type === "hash_complete") {
            this.handlers.onHashComplete(msg.fileId, msg.sha256);
          } else if (msg.type === "cancelled") {
            this.handlers.onCancelled(msg.fileId, "hash");
          } else if (msg.type === "error") {
            this.handlers.onHashError(msg.fileId, msg.message);
          }
        }
      );
    }
    return this.hashWorker;
  }

  analyzeFile(fileId: string, file: File): string {
    const requestId = crypto.randomUUID();
    const worker = this.ensureAnalysisWorker();
    worker.postMessage({
      type: "analyze",
      requestId,
      fileId,
      file,
      fileName: file.name,
      declaredMime: file.type || null,
    });
    return requestId;
  }

  hashFile(fileId: string, file: File, chunkSizeBytes?: number): string {
    const requestId = crypto.randomUUID();
    const worker = this.ensureHashWorker();
    worker.postMessage({
      type: "hash",
      requestId,
      fileId,
      file,
      chunkSizeBytes,
    });
    return requestId;
  }

  readHexWindow(fileId: string, file: File, offset: number, length: number): Promise<Uint8Array> {
    const requestId = crypto.randomUUID();
    const worker = this.ensureAnalysisWorker();
    return new Promise((resolve, reject) => {
      this.pendingHexRequests.set(requestId, { resolve, reject });
      worker.postMessage({
        type: "read_hex_window",
        requestId,
        fileId,
        file,
        offset,
        length,
      });
    });
  }

  cancelFile(fileId: string): void {
    this.analysisWorker?.postMessage({ type: "cancel", fileId });
    this.hashWorker?.postMessage({ type: "cancel", fileId });
  }

  terminateWorkers(): void {
    this.analysisWorker?.terminate();
    this.hashWorker?.terminate();
    this.analysisWorker = null;
    this.hashWorker = null;
    for (const pending of this.pendingHexRequests.values()) {
      pending.reject(new Error("Workers terminated"));
    }
    this.pendingHexRequests.clear();
  }
}
