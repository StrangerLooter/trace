import { zipSync } from "@trace/parsers";
import {
  buildCleanFilename,
  getSanitizationCapabilities,
  type SanitizationCategoryId,
  type SanitizationResult,
} from "./capabilities";
import { sanitizeJpegBytes } from "./jpeg-sanitizer";
import { sanitizeMp3Bytes } from "./mp3-sanitizer";
import { sanitizeOfficeBytes } from "./office-sanitizer";
import { sanitizePngBytes } from "./png-sanitizer";
import { sanitizeWavBytes } from "./wav-sanitizer";
import { sanitizeWebpBytes } from "./webp-sanitizer";

export * from "./capabilities";
export * from "./jpeg-sanitizer";
export * from "./mp3-sanitizer";
export * from "./office-sanitizer";
export * from "./png-sanitizer";
export * from "./wav-sanitizer";
export * from "./webp-sanitizer";

const MAX_LOCAL_SANITIZE_BYTES = 100 * 1024 * 1024; // 100 MiB safe browser output buffer cap

export async function sanitizeLocalFile(
  file: Blob,
  fileName: string,
  formatId: string,
  categories: readonly SanitizationCategoryId[]
): Promise<SanitizationResult> {
  if (file.size > MAX_LOCAL_SANITIZE_BYTES) {
    return {
      formatId,
      outputBytes: new Uint8Array(0),
      mimeType: "application/octet-stream",
      suggestedFilename: buildCleanFilename(fileName),
      beforeFieldCount: 0,
      afterFieldCount: 0,
      removedFieldNames: [],
      remainingFieldNames: [],
      categoryStatuses: categories.map((c) => ({ category: c, status: "sanitization_failed" })),
      overallStatus: "sanitization_failed",
      warnings: ["File exceeds 100 MiB browser sanitization buffer limit."],
    };
  }

  const caps = getSanitizationCapabilities(formatId);
  if (!caps.supported || caps.executionMode !== "local_browser") {
    return {
      formatId,
      outputBytes: new Uint8Array(0),
      mimeType: "application/octet-stream",
      suggestedFilename: buildCleanFilename(fileName),
      beforeFieldCount: 0,
      afterFieldCount: 0,
      removedFieldNames: [],
      remainingFieldNames: [],
      categoryStatuses: categories.map((c) => ({ category: c, status: "unsupported_metadata" })),
      overallStatus: "unsupported_metadata",
      warnings: caps.generalWarnings,
    };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (formatId === "jpeg") return sanitizeJpegBytes(bytes, fileName, categories);
  if (formatId === "png") return sanitizePngBytes(bytes, fileName, categories);
  if (formatId === "webp") return sanitizeWebpBytes(bytes, fileName, categories);
  if (formatId === "mp3") return sanitizeMp3Bytes(bytes, fileName, categories);
  if (formatId === "wav") return sanitizeWavBytes(bytes, fileName, categories);
  return sanitizeOfficeBytes(bytes, fileName, formatId, categories);
}

/** Package multiple cleaned outputs into a single deterministic ZIP archive. */
export function createSanitizedZipBundle(
  files: ReadonlyArray<{ filename: string; bytes: Uint8Array }>
): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  const seen = new Set<string>();
  for (const item of files) {
    let name = item.filename;
    let counter = 1;
    while (seen.has(name)) {
      counter++;
      name = `${counter}_${item.filename}`;
    }
    seen.add(name);
    entries[name] = item.bytes;
  }
  return zipSync(entries, { level: 6 });
}
