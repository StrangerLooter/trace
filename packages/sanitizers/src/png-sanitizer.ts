import { BufferBinaryReader } from "@trace/binary-core";
import { BoundedEventEmitter } from "@trace/event-system";
import { detectFileSignature } from "@trace/file-signatures";
import { PngParser } from "@trace/parsers";
import type { SanitizationStatus } from "@trace/shared-types";
import {
  buildCleanFilename,
  type SanitizationCategoryId,
  type SanitizationResult,
} from "./capabilities";

export async function sanitizePngBytes(
  sourceBytes: Uint8Array,
  fileName: string,
  categories: readonly SanitizationCategoryId[]
): Promise<SanitizationResult> {
  const beforeReader = new BufferBinaryReader(sourceBytes);
  const id = await detectFileSignature(beforeReader, { fileName });
  const parser = new PngParser();

  if (id.formatId !== "png" || sourceBytes.byteLength < 8) {
    return {
      formatId: id.formatId,
      outputBytes: new Uint8Array(0),
      mimeType: "image/png",
      suggestedFilename: buildCleanFilename(fileName),
      beforeFieldCount: 0,
      afterFieldCount: 0,
      removedFieldNames: [],
      remainingFieldNames: [],
      categoryStatuses: categories.map((c) => ({ category: c, status: "sanitization_failed" })),
      overallStatus: "sanitization_failed",
      warnings: ["Input bytes are not a valid PNG signature."],
    };
  }

  const beforeOut = await parser.parse({
    fileId: "png-before",
    fileName,
    reader: beforeReader,
    identification: id,
    emitter: new BoundedEventEmitter(),
  });

  const stripTypes = new Set<string>();
  if (categories.includes("png_text")) {
    stripTypes.add("tEXt");
    stripTypes.add("zTXt");
    stripTypes.add("iTXt");
  }
  if (categories.includes("png_exif")) stripTypes.add("eXIf");
  if (categories.includes("png_time")) stripTypes.add("tIME");

  const chunks: Uint8Array[] = [sourceBytes.subarray(0, 8)];
  let offset = 8;
  let sawIend = false;

  while (offset + 12 <= sourceBytes.byteLength) {
    const dv = new DataView(sourceBytes.buffer, sourceBytes.byteOffset + offset, 8);
    const dataLen = dv.getUint32(0, false);
    const type = String.fromCharCode(
      sourceBytes[offset + 4],
      sourceBytes[offset + 5],
      sourceBytes[offset + 6],
      sourceBytes[offset + 7]
    );
    const fullLen = 12 + dataLen;
    if (offset + fullLen > sourceBytes.byteLength) break;

    if (!stripTypes.has(type)) {
      chunks.push(sourceBytes.subarray(offset, offset + fullLen));
    }

    offset += fullLen;
    if (type === "IEND") {
      sawIend = true;
      break;
    }
  }

  if (!sawIend) {
    return {
      formatId: "png",
      outputBytes: new Uint8Array(0),
      mimeType: "image/png",
      suggestedFilename: buildCleanFilename(fileName),
      beforeFieldCount: beforeOut.fields.length,
      afterFieldCount: beforeOut.fields.length,
      removedFieldNames: [],
      remainingFieldNames: beforeOut.fields.map((f) => f.fieldName),
      categoryStatuses: categories.map((c) => ({ category: c, status: "sanitization_failed" })),
      overallStatus: "sanitization_failed",
      warnings: ["PNG stream missing IEND terminator; aborted safely without modifying."],
    };
  }

  const totalOutLen = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const outputBytes = new Uint8Array(totalOutLen);
  let cursor = 0;
  for (const ch of chunks) {
    outputBytes.set(ch, cursor);
    cursor += ch.byteLength;
  }

  const afterReader = new BufferBinaryReader(outputBytes);
  const afterId = await detectFileSignature(afterReader, { fileName: buildCleanFilename(fileName) });
  const afterOut = await parser.parse({
    fileId: "png-after",
    fileName: buildCleanFilename(fileName),
    reader: afterReader,
    identification: afterId,
    emitter: new BoundedEventEmitter(),
  });

  const afterKeys = new Set(afterOut.fields.map((f) => f.rawKey ?? f.fieldName));
  const removedFieldNames = beforeOut.fields
    .filter((f) => !afterKeys.has(f.rawKey ?? f.fieldName))
    .map((f) => f.fieldName);
  const remainingFieldNames = afterOut.fields.map((f) => f.fieldName);

  const verifiedClean =
    (!categories.includes("png_text") ||
      !afterOut.fields.some((f) => /^(tEXt|zTXt|iTXt)\./.test(f.rawKey ?? ""))) &&
    (!categories.includes("png_exif") ||
      !afterOut.fields.some((f) => (f.rawKey ?? "").startsWith("eXIf."))) &&
    (!categories.includes("png_time") || !afterOut.fields.some((f) => f.rawKey === "tIME"));

  const overallStatus: SanitizationStatus = verifiedClean
    ? "removed_and_verified"
    : "attempted_verification_incomplete";

  return {
    formatId: "png",
    outputBytes,
    mimeType: "image/png",
    suggestedFilename: buildCleanFilename(fileName),
    beforeFieldCount: beforeOut.fields.length,
    afterFieldCount: afterOut.fields.length,
    removedFieldNames,
    remainingFieldNames,
    categoryStatuses: categories.map((c) => ({ category: c, status: overallStatus })),
    overallStatus,
    warnings: [],
  };
}
