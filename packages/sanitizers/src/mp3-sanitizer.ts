import { Mp3Parser } from "@trace/parsers";
import {
  buildCleanFilename,
  type SanitizationCategoryId,
  type SanitizationResult,
  verifySanitizedBytes,
} from "./capabilities";

/** Losslessly strips prepended ID3v2 header and trailing 128-byte ID3v1 tag from MP3 streams. */
export async function sanitizeMp3Bytes(
  sourceBytes: Uint8Array,
  fileName: string,
  categories: readonly SanitizationCategoryId[]
): Promise<SanitizationResult> {
  if (sourceBytes.byteLength < 4) {
    return {
      formatId: "mp3",
      outputBytes: new Uint8Array(0),
      mimeType: "audio/mpeg",
      suggestedFilename: buildCleanFilename(fileName),
      beforeFieldCount: 0,
      afterFieldCount: 0,
      removedFieldNames: [],
      remainingFieldNames: [],
      categoryStatuses: categories.map((c) => ({ category: c, status: "sanitization_failed" })),
      overallStatus: "sanitization_failed",
      warnings: ["File too short to sanitize as MP3."],
    };
  }

  let start = 0;
  let end = sourceBytes.byteLength;

  if (categories.includes("mp3_id3")) {
    if (
      sourceBytes.byteLength >= 10 &&
      sourceBytes[0] === 0x49 &&
      sourceBytes[1] === 0x44 &&
      sourceBytes[2] === 0x33
    ) {
      const flags = sourceBytes[5];
      const tagSize =
        ((sourceBytes[6] & 0x7f) << 21) |
        ((sourceBytes[7] & 0x7f) << 14) |
        ((sourceBytes[8] & 0x7f) << 7) |
        (sourceBytes[9] & 0x7f);
      const hasFooter = (flags & 0x10) !== 0;
      start = Math.min(end, 10 + tagSize + (hasFooter ? 10 : 0));
    }
    if (end - start >= 128) {
      const tailStart = end - 128;
      if (
        sourceBytes[tailStart] === 0x54 &&
        sourceBytes[tailStart + 1] === 0x41 &&
        sourceBytes[tailStart + 2] === 0x47
      ) {
        end = tailStart;
      }
    }
  }

  const outputBytes = sourceBytes.slice(start, end);
  return verifySanitizedBytes({
    parser: new Mp3Parser(),
    formatId: "mp3",
    mimeType: "audio/mpeg",
    fileName,
    sourceBytes,
    outputBytes,
    categories,
    verifyRemoved: (after) =>
      !categories.includes("mp3_id3") || !after.some((f) => (f.rawKey ?? "").startsWith("ID3.")),
  });
}
