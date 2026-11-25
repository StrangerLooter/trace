import { WavParser } from "@trace/parsers";
import {
  buildCleanFilename,
  type SanitizationCategoryId,
  type SanitizationResult,
  verifySanitizedBytes,
} from "./capabilities";

const METADATA_WAV_CHUNKS = new Set(["LIST", "bext", "id3 ", "ID3 ", "iXML", "axml", "JUNK"]);

/** Losslessly strips WAV RIFF metadata chunks while preserving fmt and raw audio data chunks. */
export async function sanitizeWavBytes(
  sourceBytes: Uint8Array,
  fileName: string,
  categories: readonly SanitizationCategoryId[]
): Promise<SanitizationResult> {
  if (sourceBytes.byteLength < 12) {
    return {
      formatId: "wav",
      outputBytes: new Uint8Array(0),
      mimeType: "audio/wav",
      suggestedFilename: buildCleanFilename(fileName),
      beforeFieldCount: 0,
      afterFieldCount: 0,
      removedFieldNames: [],
      remainingFieldNames: [],
      categoryStatuses: categories.map((c) => ({ category: c, status: "sanitization_failed" })),
      overallStatus: "sanitization_failed",
      warnings: ["Invalid RIFF WAVE header."],
    };
  }

  const kept: Uint8Array[] = [new Uint8Array(sourceBytes.subarray(0, 12))];
  const stripChunks = categories.includes("wav_chunks");
  let pos = 12;
  let bodyLen = 4;

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

    if (stripChunks && METADATA_WAV_CHUNKS.has(fourcc)) {
      pos += full;
      continue;
    }

    const slice = sourceBytes.subarray(pos, Math.min(pos + full, sourceBytes.byteLength));
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
  new DataView(outputBytes.buffer).setUint32(4, bodyLen, true);

  return verifySanitizedBytes({
    parser: new WavParser(),
    formatId: "wav",
    mimeType: "audio/wav",
    fileName,
    sourceBytes,
    outputBytes,
    categories,
    verifyRemoved: (after) =>
      !stripChunks ||
      !after.some((f) => (f.rawKey ?? "").startsWith("LIST.INFO.") || (f.rawKey ?? "").startsWith("bext.")),
  });
}
