import type { TraceEvent } from "@trace/event-system";
import type { CustomSignatureRule } from "@trace/file-signatures";
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

/** Coordinates a bounded concurrent Web Worker pool for multi-file inspection + range hex reads. */
export class WorkerCoordinator {
  private readonly poolSize: number;
  private readonly analysisPool: Worker[] = [];
  private readonly fileWorkerIndex = new Map<string, number>();
  private nextSlot = 0;
  private customRules: CustomSignatureRule[] = [];
  private hashWorker: Worker | null = null;
  private readonly handlers: CoordinatorHandlers;
  private readonly pendingHexRequests = new Map<
    string,
    { resolve: (buf: Uint8Array) => void; reject: (err: Error) => void }
  >();

  constructor(handlers: CoordinatorHandlers, maxWorkers = 4) {
    this.handlers = handlers;
    const cores = typeof navigator !== "undefined" && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 2;
    this.poolSize = Math.max(1, Math.min(maxWorkers, cores));
  }

  private spawnAnalysisWorker(): Worker {
    const worker = new Worker(new URL("./analysis.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.addEventListener("message", (ev: MessageEvent<AnalysisWorkerResponse>) => {
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
    });
    worker.addEventListener("error", (err) => {
      for (const pending of this.pendingHexRequests.values()) {
        pending.reject(new Error(err.message || "Analysis worker crashed"));
      }
      this.pendingHexRequests.clear();
    });
    if (this.customRules.length > 0) {
      worker.postMessage({ type: "register_custom_signatures", rules: this.customRules });
    }
    return worker;
  }

  private getWorkerForFile(fileId: string): Worker {
    let slot = this.fileWorkerIndex.get(fileId);
    if (slot === undefined) {
      slot = this.nextSlot % this.poolSize;
      this.nextSlot++;
      this.fileWorkerIndex.set(fileId, slot);
    }
    if (!this.analysisPool[slot]) {
      this.analysisPool[slot] = this.spawnAnalysisWorker();
    }
    return this.analysisPool[slot];
  }

  private ensureHashWorker(): Worker {
    if (!this.hashWorker) {
      this.hashWorker = new Worker(new URL("./hash.worker.ts", import.meta.url), {
        type: "module",
      });
      this.hashWorker.addEventListener("message", (ev: MessageEvent<HashWorkerResponse>) => {
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
      });
    }
    return this.hashWorker;
  }

  registerCustomSignatures(rules: CustomSignatureRule[]): void {
    this.customRules = rules;
    for (const worker of this.analysisPool) {
      worker?.postMessage({ type: "register_custom_signatures", rules });
    }
  }

  analyzeFile(fileId: string, file: File): string {
    const requestId = crypto.randomUUID();
    const worker = this.getWorkerForFile(fileId);
    worker.postMessage({
      type: "analyze",
      requestId,
      fileId,
      file,
      fileName: file.name,
      declaredMime: file.type || null,
      fileLastModifiedMs: file.lastModified || undefined,
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
    const worker = this.getWorkerForFile(fileId);
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
    const slot = this.fileWorkerIndex.get(fileId);
    if (slot !== undefined) {
      this.analysisPool[slot]?.postMessage({ type: "cancel", fileId });
    }
    this.hashWorker?.postMessage({ type: "cancel", fileId });
  }

  terminateWorkers(): void {
    for (const w of this.analysisPool) {
      w?.terminate();
    }
    this.analysisPool.length = 0;
    this.fileWorkerIndex.clear();
    this.hashWorker?.terminate();
    this.hashWorker = null;
  }
}
