import { BufferBinaryReader } from "@trace/binary-core";
import { BoundedEventEmitter } from "@trace/event-system";
import { detectFileSignature } from "@trace/file-signatures";
import { JpegParser } from "@trace/parsers";
import type { SanitizationStatus } from "@trace/shared-types";
import {
  buildCleanFilename,
  type SanitizationCategoryId,
  type SanitizationResult,
} from "./capabilities";

export async function sanitizeJpegBytes(
  sourceBytes: Uint8Array,
  fileName: string,
  categories: readonly SanitizationCategoryId[]
): Promise<SanitizationResult> {
  const beforeReader = new BufferBinaryReader(sourceBytes);
  const id = await detectFileSignature(beforeReader, { fileName });
  const parser = new JpegParser();

  if (id.formatId !== "jpeg" || sourceBytes.byteLength < 4 || sourceBytes[0] !== 0xff || sourceBytes[1] !== 0xd8) {
    return {
      formatId: id.formatId,
      outputBytes: new Uint8Array(0),
      mimeType: "image/jpeg",
      suggestedFilename: buildCleanFilename(fileName),
      beforeFieldCount: 0,
      afterFieldCount: 0,
      removedFieldNames: [],
      remainingFieldNames: [],
      categoryStatuses: categories.map((c) => ({ category: c, status: "sanitization_failed" })),
      overallStatus: "sanitization_failed",
      warnings: ["Input bytes do not start with a valid JPEG SOI marker."],
    };
  }

  const beforeOut = await parser.parse({
    fileId: "sanitize-before",
    fileName,
    reader: beforeReader,
    identification: id,
    emitter: new BoundedEventEmitter(),
  });

  const stripMarkers = new Set<number>();
  if (categories.includes("exif_gps")) stripMarkers.add(0xe1);
  if (categories.includes("icc_profile")) stripMarkers.add(0xe2);
  if (categories.includes("iptc")) stripMarkers.add(0xed);
  if (categories.includes("comments")) stripMarkers.add(0xfe);

  const chunks: Uint8Array[] = [sourceBytes.subarray(0, 2)]; // SOI
  let offset = 2;
  let reachedSos = false;

  while (offset + 2 <= sourceBytes.byteLength) {
    if (sourceBytes[offset] !== 0xff) {
      return {
        formatId: "jpeg",
        outputBytes: new Uint8Array(0),
        mimeType: "image/jpeg",
        suggestedFilename: buildCleanFilename(fileName),
        beforeFieldCount: beforeOut.fields.length,
        afterFieldCount: beforeOut.fields.length,
        removedFieldNames: [],
        remainingFieldNames: beforeOut.fields.map((f) => f.fieldName),
        categoryStatuses: categories.map((c) => ({ category: c, status: "sanitization_failed" })),
        overallStatus: "sanitization_failed",
        warnings: [`Invalid JPEG marker byte at offset 0x${offset.toString(16)}; aborted safely.`],
      };
    }

    let markerOffset = offset;
    while (markerOffset + 1 < sourceBytes.byteLength && sourceBytes[markerOffset + 1] === 0xff) {
      markerOffset++;
    }
    if (markerOffset + 1 >= sourceBytes.byteLength) break;
    const marker = sourceBytes[markerOffset + 1];

    // Standalone markers
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      chunks.push(sourceBytes.subarray(markerOffset, markerOffset + 2));
      offset = markerOffset + 2;
      if (marker === 0xd9) break;
      continue;
    }

    if (markerOffset + 4 > sourceBytes.byteLength) break;
    const segLen = (sourceBytes[markerOffset + 2] << 8) | sourceBytes[markerOffset + 3];
    const fullLen = 2 + segLen;
    if (segLen < 2 || markerOffset + fullLen > sourceBytes.byteLength) break;

    if (marker === 0xda) {
      // SOS: copy entropy-coded stream and EOI intact without altering image pixels
      chunks.push(sourceBytes.subarray(markerOffset));
      reachedSos = true;
      break;
    }

    if (!stripMarkers.has(marker)) {
      chunks.push(sourceBytes.subarray(markerOffset, markerOffset + fullLen));
    }

    offset = markerOffset + fullLen;
  }

  if (!reachedSos && offset < sourceBytes.byteLength) {
    chunks.push(sourceBytes.subarray(offset));
  }

  const totalOutLen = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const outputBytes = new Uint8Array(totalOutLen);
  let cursor = 0;
  for (const ch of chunks) {
    outputBytes.set(ch, cursor);
    cursor += ch.byteLength;
  }

  // Re-inspect cleaned output to verify removal
  const afterReader = new BufferBinaryReader(outputBytes);
  const afterId = await detectFileSignature(afterReader, { fileName: buildCleanFilename(fileName) });
  const afterOut = await parser.parse({
    fileId: "sanitize-after",
    fileName: buildCleanFilename(fileName),
    reader: afterReader,
    identification: afterId,
    emitter: new BoundedEventEmitter(),
  });

  const afterKeys = new Set(afterOut.fields.map((f) => `${f.group}:${f.fieldName}`));
  const removedFieldNames = beforeOut.fields
    .filter((f) => !afterKeys.has(`${f.group}:${f.fieldName}`))
    .map((f) => f.fieldName);
  const remainingFieldNames = afterOut.fields.map((f) => f.fieldName);

  const verifiedAllSelected =
    (!categories.includes("exif_gps") ||
      !afterOut.fields.some((f) => f.group === "exif" || f.group === "gps" || f.group === "camera" || f.group === "xmp")) &&
    (!categories.includes("comments") || !afterOut.fields.some((f) => f.rawKey === "COM"));

  const overallStatus: SanitizationStatus = verifiedAllSelected
    ? "removed_and_verified"
    : "attempted_verification_incomplete";

  return {
    formatId: "jpeg",
    outputBytes,
    mimeType: "image/jpeg",
    suggestedFilename: buildCleanFilename(fileName),
    beforeFieldCount: beforeOut.fields.length,
    afterFieldCount: afterOut.fields.length,
    removedFieldNames,
    remainingFieldNames,
    categoryStatuses: categories.map((c) => ({ category: c, status: overallStatus })),
    overallStatus,
    warnings: categories.includes("icc_profile")
      ? ["ICC profile removed; color appearance may shift slightly in color-managed viewers."]
      : [],
  };
}
