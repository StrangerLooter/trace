import {
  BlobBinaryReader,
  DEFAULT_MAX_SLICE_BYTES,
  streamSha256,
} from "@trace/binary-core";
import { BoundedEventEmitter } from "@trace/event-system";
import { isAbortError } from "./analysis-engine";
import type { ComputeHashCommand, HashWorkerResponse } from "./protocol";

export async function runHashJob(
  cmd: ComputeHashCommand,
  signal: AbortSignal,
  post: (msg: HashWorkerResponse) => void
): Promise<void> {
  const emitter = new BoundedEventEmitter();
  const emitAndPost = (
    input: Parameters<BoundedEventEmitter["emit"]>[0]
  ): void => {
    emitter.emit(input, (event) => {
      post({ type: "event", fileId: cmd.fileId, event });
    });
  };

  try {
    const reader = new BlobBinaryReader(cmd.file, DEFAULT_MAX_SLICE_BYTES);
    const chunkSize = cmd.chunkSizeBytes ?? 16 * 1024 * 1024;

    emitAndPost({
      eventType: "HASHING_STARTED",
      severity: "info",
      fileId: cmd.fileId,
      operation: `streamSha256(chunk=${chunkSize})`,
      message: `Streaming SHA-256 over ${reader.byteLength} bytes`,
      payload: { totalBytes: reader.byteLength, chunkSize },
    });

    let lastReportedPct = -1;
    const sha256 = await streamSha256(reader, {
      chunkSizeBytes: chunkSize,
      signal,
      onProgress: (p) => {
        post({
          type: "progress",
          requestId: cmd.requestId,
          fileId: cmd.fileId,
          bytesProcessed: p.bytesProcessed,
          totalBytes: p.totalBytes,
          percent: p.percent,
        });

        const rounded = Math.floor(p.percent / 20) * 20;
        if (rounded > lastReportedPct && rounded > 0 && rounded < 100) {
          lastReportedPct = rounded;
          emitAndPost({
            eventType: "HASHING_PROGRESS",
            severity: "debug",
            fileId: cmd.fileId,
            operation: "hash-wasm.update",
            message: `SHA-256 progress ${rounded}% (${p.bytesProcessed}/${p.totalBytes} bytes)`,
            payload: { percent: rounded, bytesProcessed: p.bytesProcessed },
          });
        }
      },
    });

    emitAndPost({
      eventType: "HASHING_COMPLETED",
      severity: "info",
      fileId: cmd.fileId,
      operation: "hash-wasm.digest",
      message: `SHA-256 computed (${sha256.slice(0, 12)}...)`,
      payload: { sha256 },
    });

    post({
      type: "hash_complete",
      requestId: cmd.requestId,
      fileId: cmd.fileId,
      sha256,
    });
  } catch (err) {
    if (isAbortError(err)) {
      post({ type: "cancelled", requestId: cmd.requestId, fileId: cmd.fileId });
      return;
    }
    post({
      type: "error",
      requestId: cmd.requestId,
      fileId: cmd.fileId,
      message: err instanceof Error ? err.message : "Hashing failed",
    });
  }
}
