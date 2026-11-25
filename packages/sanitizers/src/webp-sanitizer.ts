import { WebpParser } from "@trace/parsers";
import {
  buildCleanFilename,
  type SanitizationCategoryId,
  type SanitizationResult,
  verifySanitizedBytes,
} from "./capabilities";

/** Losslessly strips EXIF, XMP, and ICCP RIFF chunks from WebP while recalculating RIFF size and VP8X flags. */
export async function sanitizeWebpBytes(
  sourceBytes: Uint8Array,
  fileName: string,
  categories: readonly SanitizationCategoryId[]
): Promise<SanitizationResult> {
  if (sourceBytes.byteLength < 12) {
    return {
      formatId: "webp",
      outputBytes: new Uint8Array(0),
      mimeType: "image/webp",
      suggestedFilename: buildCleanFilename(fileName),
      beforeFieldCount: 0,
      afterFieldCount: 0,
      removedFieldNames: [],
      remainingFieldNames: [],
      categoryStatuses: categories.map((c) => ({ category: c, status: "sanitization_failed" })),
      overallStatus: "sanitization_failed",
      warnings: ["File is shorter than a valid 12-byte RIFF WEBP header."],
    };
  }

  const kept: Uint8Array[] = [];
  kept.push(new Uint8Array(sourceBytes.subarray(0, 12)));

  const stripMeta = categories.includes("webp_metadata");
  let pos = 12;
  let bodyLen = 4; // "WEBP"

  while (pos + 8 <= sourceBytes.byteLength) {
    const fourcc = String.fromCharCode(
      sourceBytes[pos],
      sourceBytes[pos + 1],
      sourceBytes[pos + 2],
      sourceBytes[pos + 3]
    );
    const size = new DataView(sourceBytes.buffer, sourceBytes.byteOffset + pos, 8).getUint32(4, true);
    const padded = size + (size % 2);
    const full = 8 + padded;
    if (pos + 8 + size > sourceBytes.byteLength) break;

    if (stripMeta && (fourcc === "EXIF" || fourcc === "XMP " || fourcc === "ICCP")) {
      pos += full;
      continue;
    }

    const slice = new Uint8Array(sourceBytes.subarray(pos, Math.min(pos + full, sourceBytes.byteLength)));
    // Clear EXIF (bit 3=0x08), XMP (bit 2=0x04), ICCP (bit 5=0x20) feature flags in VP8X
    if (stripMeta && fourcc === "VP8X" && slice.byteLength >= 9) {
      slice[8] &= ~(0x04 | 0x08 | 0x20);
    }
    kept.push(slice);
    bodyLen += slice.byteLength;
    pos += full;
  }

  const totalOut = kept.reduce((acc, c) => acc + c.byteLength, 0);
  const outputBytes = new Uint8Array(totalOut);
  let cursor = 0;
  for (const ch of kept) {
    outputBytes.set(ch, cursor);
    cursor += ch.byteLength;
  }
  // Update outer RIFF chunk size
  new DataView(outputBytes.buffer).setUint32(4, bodyLen, true);

  return verifySanitizedBytes({
    parser: new WebpParser(),
    formatId: "webp",
    mimeType: "image/webp",
    fileName,
    sourceBytes,
    outputBytes,
    categories,
    verifyRemoved: (after) => !stripMeta || !after.some((f) => f.group === "exif" || f.group === "gps" || f.group === "xmp"),
  });
}
