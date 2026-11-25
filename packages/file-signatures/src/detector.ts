import { formatHex, type BinaryReader } from "@trace/binary-core";
import {
  getFormatSupportStatus,
  type FileIdentificationResult,
  type IdentificationConfidence,
  type SignatureEvidence,
} from "@trace/shared-types";
import {
  refineEbmlSignature,
  refineIsoBmffSignature,
  refinePeSignature,
  refineRiffSignature,
  refineZipSignature,
} from "./containers";
import {
  extractExtension,
  findBytesIndex,
  FORMAT_DEFINITIONS,
  matchAsciiAt,
  matchBytesAt,
} from "./signatures";

export interface DetectionOptions {
  fileName?: string | null;
  declaredMime?: string | null;
  signal?: AbortSignal;
}

function buildResult(
  formatId: string,
  confidence: IdentificationConfidence,
  evidence: SignatureEvidence[],
  options: DetectionOptions,
  containerFormat?: string,
  secondaryMatches: string[] = []
): FileIdentificationResult {
  const def = FORMAT_DEFINITIONS[formatId] ?? FORMAT_DEFINITIONS.unknown;
  const declaredExtension = extractExtension(options.fileName);

  let extensionMismatch = false;
  if (declaredExtension && def.formatId !== "unknown") {
    const extMatchesDetected = def.extensions.includes(declaredExtension);
    const zipContainerCompatible =
      containerFormat === "zip" &&
      ["zip", "docx", "xlsx", "pptx", "odt", "ods", "odp", "epub"].includes(formatId) &&
      ["zip", "docx", "xlsx", "pptx", "odt", "ods", "odp", "epub"].includes(declaredExtension) &&
      formatId === "zip"; // Plain ZIP wrapper may match OpenXML only if office entries weren't in first 64KB
    extensionMismatch = !extMatchesDetected && !zipContainerCompatible;
  }

  return {
    formatId: def.formatId,
    displayName: def.displayName,
    category: def.category,
    detectedMime: def.mime,
    declaredExtension,
    declaredMime: options.declaredMime || null,
    extensionMismatch,
    confidence,
    supportStatus: getFormatSupportStatus(def.formatId),
    containerFormat,
    evidence,
    secondaryMatches,
  };
}

function isMpegAudioSync(header: Uint8Array): boolean {
  if (header.byteLength < 2) return false;
  // MPEG-1/2 frame sync: 11 bits set (0xFF followed by 0xE0 mask), layer != 00
  return header[0] === 0xff && (header[1] & 0xe0) === 0xe0 && (header[1] & 0x06) !== 0;
}

export async function detectFileSignature(
  reader: BinaryReader,
  options: DetectionOptions = {}
): Promise<FileIdentificationResult> {
  if (reader.byteLength === 0) {
    return buildResult("unknown", "unknown", [], options, undefined, ["Empty file (0 bytes)"]);
  }

  const headerWindowLen = Math.min(reader.byteLength, 65536);
  const header = await reader.read(0, headerWindowLen, options.signal);

  // 1. Fixed zero-offset high-confidence magic numbers
  if (matchBytesAt(header, 0, [0xff, 0xd8, 0xff])) {
    return buildResult(
      "jpeg",
      "confirmed",
      [
        {
          ruleId: "sig-jpeg-soi",
          description: "JPEG SOI + marker prefix (FF D8 FF)",
          byteRange: { start: 0, length: 3 },
          matchedHex: formatHex(header.subarray(0, 3)),
        },
      ],
      options
    );
  }

  if (matchBytesAt(header, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return buildResult(
      "png",
      "confirmed",
      [
        {
          ruleId: "sig-png",
          description: "PNG 8-byte signature",
          byteRange: { start: 0, length: 8 },
          matchedHex: formatHex(header.subarray(0, 8)),
        },
      ],
      options
    );
  }

  if (matchAsciiAt(header, 0, "GIF87a") || matchAsciiAt(header, 0, "GIF89a")) {
    return buildResult(
      "gif",
      "confirmed",
      [
        {
          ruleId: "sig-gif",
          description: `GIF header (${String.fromCharCode(...header.subarray(0, 6))})`,
          byteRange: { start: 0, length: 6 },
          matchedHex: formatHex(header.subarray(0, 6)),
        },
      ],
      options
    );
  }

  if (
    matchBytesAt(header, 0, [0x49, 0x49, 0x2a, 0x00]) ||
    matchBytesAt(header, 0, [0x4d, 0x4d, 0x00, 0x2a])
  ) {
    return buildResult(
      "tiff",
      "confirmed",
      [
        {
          ruleId: "sig-tiff",
          description: header[0] === 0x49 ? "TIFF Little-Endian (II*)" : "TIFF Big-Endian (MM*)",
          byteRange: { start: 0, length: 4 },
          matchedHex: formatHex(header.subarray(0, 4)),
        },
      ],
      options
    );
  }

  // 2. PDF (offset 0 or within first 1024 bytes per PDF spec)
  const pdfOffset = findBytesIndex(header, [0x25, 0x50, 0x44, 0x46, 0x2d], 1024);
  if (pdfOffset >= 0) {
    const secondary =
      pdfOffset > 0 ? [`%PDF- header starts at non-zero offset 0x${pdfOffset.toString(16)}`] : [];
    return buildResult(
      "pdf",
      "confirmed",
      [
        {
          ruleId: "sig-pdf",
          description: "%PDF- header signature",
          byteRange: { start: pdfOffset, length: 5 },
          matchedHex: formatHex(header.subarray(pdfOffset, pdfOffset + 5)),
        },
      ],
      options,
      undefined,
      secondary
    );
  }

  // 3. Container signatures requiring deeper inspection
  if (
    matchBytesAt(header, 0, [0x50, 0x4b, 0x03, 0x04]) ||
    matchBytesAt(header, 0, [0x50, 0x4b, 0x05, 0x06]) ||
    matchBytesAt(header, 0, [0x50, 0x4b, 0x07, 0x08])
  ) {
    const zipRefined = refineZipSignature(header);
    return buildResult(
      zipRefined.formatId,
      zipRefined.confidence,
      zipRefined.evidence,
      options,
      zipRefined.containerFormat,
      zipRefined.secondaryMatches
    );
  }

  const riffRefined = refineRiffSignature(header);
  if (riffRefined) {
    return buildResult(
      riffRefined.formatId,
      riffRefined.confidence,
      riffRefined.evidence,
      options,
      riffRefined.containerFormat,
      riffRefined.secondaryMatches
    );
  }

  const isoRefined = refineIsoBmffSignature(header);
  if (isoRefined) {
    return buildResult(
      isoRefined.formatId,
      isoRefined.confidence,
      isoRefined.evidence,
      options,
      isoRefined.containerFormat,
      isoRefined.secondaryMatches
    );
  }

  if (matchBytesAt(header, 0, [0x1a, 0x45, 0xdf, 0xa3])) {
    const ebmlRefined = refineEbmlSignature(header);
    return buildResult(
      ebmlRefined.formatId,
      ebmlRefined.confidence,
      ebmlRefined.evidence,
      options,
      ebmlRefined.containerFormat,
      ebmlRefined.secondaryMatches
    );
  }

  // 4. Archives
  if (
    matchBytesAt(header, 0, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]) ||
    matchBytesAt(header, 0, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00])
  ) {
    return buildResult(
      "rar",
      "confirmed",
      [
        {
          ruleId: "sig-rar",
          description: "RAR4/RAR5 archive signature",
          byteRange: { start: 0, length: 7 },
          matchedHex: formatHex(header.subarray(0, 7)),
        },
      ],
      options
    );
  }

  if (matchBytesAt(header, 0, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) {
    return buildResult(
      "7z",
      "confirmed",
      [
        {
          ruleId: "sig-7z",
          description: "7-Zip archive signature",
          byteRange: { start: 0, length: 6 },
          matchedHex: formatHex(header.subarray(0, 6)),
        },
      ],
      options
    );
  }

  if (matchBytesAt(header, 0, [0x1f, 0x8b])) {
    return buildResult(
      "gzip",
      "confirmed",
      [
        {
          ruleId: "sig-gzip",
          description: "GZIP magic bytes (1F 8B)",
          byteRange: { start: 0, length: 2 },
          matchedHex: formatHex(header.subarray(0, 2)),
        },
      ],
      options
    );
  }

  if (matchAsciiAt(header, 0, "BZh")) {
    return buildResult(
      "bzip2",
      "confirmed",
      [
        {
          ruleId: "sig-bzip2",
          description: "BZIP2 magic bytes (BZh)",
          byteRange: { start: 0, length: 3 },
          matchedHex: formatHex(header.subarray(0, 3)),
        },
      ],
      options
    );
  }

  if (matchAsciiAt(header, 257, "ustar")) {
    return buildResult(
      "tar",
      "confirmed",
      [
        {
          ruleId: "sig-tar-ustar",
          description: "POSIX TAR 'ustar' signature at offset 257",
          byteRange: { start: 257, length: 5 },
          matchedHex: formatHex(header.subarray(257, 262)),
        },
      ],
      options
    );
  }

  // 5. Audio
  if (matchAsciiAt(header, 0, "ID3")) {
    return buildResult(
      "mp3",
      "confirmed",
      [
        {
          ruleId: "sig-mp3-id3",
          description: "MP3 ID3v2 container tag header",
          byteRange: { start: 0, length: 3 },
          matchedHex: formatHex(header.subarray(0, 3)),
        },
      ],
      options
    );
  }

  if (matchAsciiAt(header, 0, "fLaC")) {
    return buildResult(
      "flac",
      "confirmed",
      [
        {
          ruleId: "sig-flac",
          description: "FLAC stream marker (fLaC)",
          byteRange: { start: 0, length: 4 },
          matchedHex: formatHex(header.subarray(0, 4)),
        },
      ],
      options
    );
  }

  if (matchAsciiAt(header, 0, "OggS")) {
    return buildResult(
      "ogg",
      "confirmed",
      [
        {
          ruleId: "sig-ogg",
          description: "OGG page capture pattern (OggS)",
          byteRange: { start: 0, length: 4 },
          matchedHex: formatHex(header.subarray(0, 4)),
        },
      ],
      options
    );
  }

  // 6. Executables & Databases
  if (matchBytesAt(header, 0, [0x7f, 0x45, 0x4c, 0x46])) {
    return buildResult(
      "elf",
      "confirmed",
      [
        {
          ruleId: "sig-elf",
          description: "ELF magic header (7F 45 4C 46)",
          byteRange: { start: 0, length: 4 },
          matchedHex: formatHex(header.subarray(0, 4)),
        },
      ],
      options
    );
  }

  if (matchBytesAt(header, 0, [0x4d, 0x5a])) {
    const peRefined = await refinePeSignature(header, reader, options.signal);
    return buildResult(
      peRefined.formatId,
      peRefined.confidence,
      peRefined.evidence,
      options,
      peRefined.containerFormat,
      peRefined.secondaryMatches
    );
  }

  if (
    matchBytesAt(header, 0, [0xfe, 0xed, 0xfa, 0xce]) ||
    matchBytesAt(header, 0, [0xfe, 0xed, 0xfa, 0xcf]) ||
    matchBytesAt(header, 0, [0xce, 0xfa, 0xed, 0xfe]) ||
    matchBytesAt(header, 0, [0xcf, 0xfa, 0xed, 0xfe])
  ) {
    return buildResult(
      "macho",
      "confirmed",
      [
        {
          ruleId: "sig-macho",
          description: "Mach-O 32/64-bit magic header",
          byteRange: { start: 0, length: 4 },
          matchedHex: formatHex(header.subarray(0, 4)),
        },
      ],
      options
    );
  }

  if (matchAsciiAt(header, 0, "SQLite format 3\0")) {
    return buildResult(
      "sqlite",
      "confirmed",
      [
        {
          ruleId: "sig-sqlite3",
          description: "SQLite format 3 header",
          byteRange: { start: 0, length: 16 },
          matchedHex: formatHex(header.subarray(0, 16)),
        },
      ],
      options
    );
  }

  // 7. Weak signatures (lower confidence)
  if (isMpegAudioSync(header)) {
    return buildResult(
      "mp3",
      "probable",
      [
        {
          ruleId: "sig-mpeg-sync-weak",
          description: "Raw MPEG audio frame sync (no ID3 header; weak 11-bit pattern)",
          byteRange: { start: 0, length: 2 },
          matchedHex: formatHex(header.subarray(0, 2)),
        },
      ],
      options,
      undefined,
      ["Weak frame sync match; verify stream frames before assuming valid MP3"]
    );
  }

  return buildResult("unknown", "unknown", [], options);
}
