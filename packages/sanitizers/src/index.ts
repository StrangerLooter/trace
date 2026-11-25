import {
  buildCleanFilename,
  getSanitizationCapabilities,
  type SanitizationCategoryId,
  type SanitizationResult,
} from "./capabilities";
import { sanitizeJpegBytes } from "./jpeg-sanitizer";
import { sanitizePngBytes } from "./png-sanitizer";

export * from "./capabilities";
export * from "./jpeg-sanitizer";
export * from "./png-sanitizer";

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
  if (formatId === "jpeg") {
    return sanitizeJpegBytes(bytes, fileName, categories);
  }
  return sanitizePngBytes(bytes, fileName, categories);
}
