import { BlobBinaryReader, DEFAULT_MAX_SLICE_BYTES } from "@trace/binary-core";
import { BoundedEventEmitter, type TraceEvent } from "@trace/event-system";
import { detectFileSignature } from "@trace/file-signatures";
import { evaluateForensicRules } from "@trace/forensics";
import { ParserRegistry } from "@trace/parser-registry";
import type {
  AnalysisCoverage,
  DetectedStructure,
  ForensicFinding,
  MetadataField,
} from "@trace/shared-types";
import type {
  AnalysisWorkerResponse,
  AnalyzeFileCommand,
  ReadHexWindowCommand,
} from "./protocol";

export function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof Error && err.name === "AbortError")
  );
}

export async function runAnalysisJob(
  cmd: AnalyzeFileCommand,
  registry: ParserRegistry,
  signal: AbortSignal,
  post: (msg: AnalysisWorkerResponse, transfer?: Transferable[]) => void
): Promise<void> {
  const emitter = new BoundedEventEmitter();
  const emitAndPost = (
    input: Omit<TraceEvent, "id" | "sequence" | "timestampIso">
  ): void => {
    emitter.emit(input, (event) => {
      post({ type: "event", fileId: cmd.fileId, event });
    });
  };

  try {
    emitAndPost({
      eventType: "FILE_RECEIVED",
      severity: "info",
      fileId: cmd.fileId,
      operation: "BlobBinaryReader.init",
      message: `Received ${cmd.fileName} (${cmd.file.size} bytes)`,
      payload: { sizeBytes: cmd.file.size },
    });

    emitAndPost({
      eventType: "FILE_VALIDATION_STARTED",
      severity: "info",
      fileId: cmd.fileId,
      operation: "validateFileSize",
      message: "Validating bounded file slice access",
    });

    const reader = new BlobBinaryReader(cmd.file, DEFAULT_MAX_SLICE_BYTES);
    const headerLength = Math.min(reader.byteLength, 65536);

    emitAndPost({
      eventType: "HEADER_READ",
      severity: "debug",
      fileId: cmd.fileId,
      operation: `Blob.slice(0, ${headerLength})`,
      message: `Read ${headerLength} header bytes`,
      byteRange: { start: 0, length: headerLength },
    });

    const identification = await detectFileSignature(reader, {
      fileName: cmd.fileName,
      declaredMime: cmd.declaredMime,
      signal,
    });

    emitAndPost({
      eventType: identification.extensionMismatch ? "SIGNATURE_MISMATCH" : "SIGNATURE_MATCHED",
      severity: identification.extensionMismatch ? "warn" : "info",
      fileId: cmd.fileId,
      operation: "detectFileSignature",
      message: identification.extensionMismatch
        ? `Extension mismatch: declared .${identification.declaredExtension ?? "none"}, detected ${identification.displayName}`
        : `Signature ${identification.confidence}: ${identification.displayName}`,
      byteRange: identification.evidence[0]?.byteRange,
      payload: {
        formatId: identification.formatId,
        confidence: identification.confidence,
        extensionMismatch: identification.extensionMismatch,
      },
    });

    emitAndPost({
      eventType: "MIME_IDENTIFIED",
      severity: "info",
      fileId: cmd.fileId,
      operation: "classifyMime",
      message: `Detected MIME ${identification.detectedMime} (${identification.supportStatus})`,
      payload: {
        detectedMime: identification.detectedMime,
        supportStatus: identification.supportStatus,
      },
    });

    const plan = registry.plan(identification, reader.byteLength);

    const fields: MetadataField[] = [];
    const structures: DetectedStructure[] = [];
    const parserFindings: ForensicFinding[] = [];
    const warnings = [...plan.warnings];

    const coverage: AnalysisCoverage = {
      mode: "local_browser",
      headerInspected: headerLength > 0 || reader.byteLength === 0,
      footerInspected: false,
      containerIndexInspected: false,
      completeFileScanned: reader.byteLength <= headerLength,
      fullHashComputed: false,
      uninspectedReasons: [],
    };

    const registeredParsers = registry
      .getAll()
      .filter((p) => p.canParse(identification));

    for (const parser of registeredParsers) {
      if (signal.aborted) {
        throw new DOMException("Analysis aborted", "AbortError");
      }

      emitAndPost({
        eventType: "PARSER_SELECTED",
        severity: "info",
        fileId: cmd.fileId,
        parserId: parser.id,
        operation: "ParserRegistry.select",
        message: `Selected parser ${parser.id}@${parser.version}`,
      });

      emitAndPost({
        eventType: "PARSER_STARTED",
        severity: "info",
        fileId: cmd.fileId,
        parserId: parser.id,
        operation: `${parser.id}.parse`,
        message: `Executing ${parser.id}`,
      });

      try {
        const out = await parser.parse({
          fileId: cmd.fileId,
          fileName: cmd.fileName,
          reader,
          identification,
          emitter,
          onEvent: (event) => post({ type: "event", fileId: cmd.fileId, event }),
          signal,
        });

        fields.push(...out.fields);
        structures.push(...out.structures);
        parserFindings.push(...out.findings);
        warnings.push(...out.warnings);
        Object.assign(coverage, out.coveragePatch);
      } catch (err) {
        if (isAbortError(err)) throw err;
        const msg = err instanceof Error ? err.message : "Unknown parser error";
        warnings.push(`Parser ${parser.id} failed: ${msg}`);
        emitAndPost({
          eventType: "PARSER_FAILED",
          severity: "error",
          fileId: cmd.fileId,
          parserId: parser.id,
          operation: `${parser.id}.parse`,
          message: msg,
        });
      }
    }

    if (registeredParsers.length === 0) {
      coverage.uninspectedReasons.push(
        `No local metadata parser registered for format '${identification.formatId}' yet.`
      );
    }

    const forensicResult = evaluateForensicRules({
      fileId: cmd.fileId,
      fileSizeBytes: reader.byteLength,
      identification,
      fields,
      structures,
      parserFindings,
    });
    const findings = forensicResult.findings;

    emitAndPost({
      eventType: "ANALYSIS_COMPLETED",
      severity: "info",
      fileId: cmd.fileId,
      operation: "analysisPipeline",
      message: `Completed local analysis (${fields.length} fields, ${findings.length} findings)`,
      payload: {
        fieldsCount: fields.length,
        findingsCount: findings.length,
        bytesReadTotal: reader.bytesReadTotal,
      },
    });

    post({
      type: "analysis_complete",
      requestId: cmd.requestId,
      payload: {
        fileId: cmd.fileId,
        identification,
        plan,
        fields,
        structures,
        findings,
        forensicSummary: forensicResult.summary,
        coverage,
        warnings,
      },
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
      message: err instanceof Error ? err.message : "Analysis failed",
    });
  }
}

export async function runHexWindowRead(
  cmd: ReadHexWindowCommand,
  signal: AbortSignal,
  post: (msg: AnalysisWorkerResponse, transfer?: Transferable[]) => void
): Promise<void> {
  try {
    const reader = new BlobBinaryReader(cmd.file, DEFAULT_MAX_SLICE_BYTES);
    const bytes = await reader.read(cmd.offset, cmd.length, signal);
    // Copy into standalone tightly-sized ArrayBuffer so ownership transfers cleanly
    const ownedBuffer = bytes.slice().buffer;
    post(
      {
        type: "hex_window",
        requestId: cmd.requestId,
        fileId: cmd.fileId,
        offset: cmd.offset,
        buffer: ownedBuffer,
      },
      [ownedBuffer]
    );
  } catch (err) {
    if (isAbortError(err)) {
      post({ type: "cancelled", requestId: cmd.requestId, fileId: cmd.fileId });
      return;
    }
    post({
      type: "error",
      requestId: cmd.requestId,
      fileId: cmd.fileId,
      message: err instanceof Error ? err.message : "Failed to read hex window",
    });
  }
}
