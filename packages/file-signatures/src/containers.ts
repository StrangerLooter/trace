import { formatHex, type BinaryReader } from "@trace/binary-core";
import type { IdentificationConfidence, SignatureEvidence } from "@trace/shared-types";
import { findBytesIndex, matchAsciiAt } from "./signatures";

export interface RefinedContainerMatch {
  formatId: string;
  containerFormat?: string;
  confidence: IdentificationConfidence;
  evidence: SignatureEvidence[];
  secondaryMatches: string[];
}

export async function refinePeSignature(
  header: Uint8Array,
  reader: BinaryReader,
  signal?: AbortSignal
): Promise<RefinedContainerMatch> {
  const mzEvidence: SignatureEvidence = {
    ruleId: "sig-mz-header",
    description: "DOS MZ signature at offset 0x00",
    byteRange: { start: 0, length: 2 },
    matchedHex: formatHex(header.subarray(0, 2)),
  };

  if (header.byteLength < 0x40) {
    return {
      formatId: "dos_mz",
      confidence: "probable",
      evidence: [mzEvidence],
      secondaryMatches: ["Truncated DOS header (< 64 bytes); cannot read e_lfanew"],
    };
  }

  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const eLfanew = view.getUint32(0x3c, true);

  if (eLfanew < 0x40 || eLfanew + 4 > reader.byteLength || eLfanew > 64 * 1024 * 1024) {
    return {
      formatId: "dos_mz",
      confidence: "probable",
      evidence: [mzEvidence],
      secondaryMatches: [`e_lfanew (0x${eLfanew.toString(16)}) outside valid PE bounds`],
    };
  }

  const peBytes = await reader.read(eLfanew, 4, signal);
  if (
    peBytes.byteLength === 4 &&
    peBytes[0] === 0x50 &&
    peBytes[1] === 0x45 &&
    peBytes[2] === 0x00 &&
    peBytes[3] === 0x00
  ) {
    return {
      formatId: "pe",
      confidence: "confirmed",
      evidence: [
        mzEvidence,
        {
          ruleId: "sig-pe-nt-header",
          description: `PE\\0\\0 NT header signature at e_lfanew=0x${eLfanew.toString(16)}`,
          byteRange: { start: eLfanew, length: 4 },
          matchedHex: formatHex(peBytes),
        },
      ],
      secondaryMatches: [],
    };
  }

  return {
    formatId: "dos_mz",
    confidence: "probable",
    evidence: [mzEvidence],
    secondaryMatches: ["MZ header without PE\\0\\0 NT signature"],
  };
}

export function refineIsoBmffSignature(header: Uint8Array): RefinedContainerMatch | null {
  if (header.byteLength < 12 || !matchAsciiAt(header, 4, "ftyp")) {
    return null;
  }

  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const boxSize = view.getUint32(0, false);
  if (boxSize < 12 || boxSize > 4096) {
    return null;
  }

  const majorBrand = String.fromCharCode(header[8], header[9], header[10], header[11]);
  let formatId = "mp4";
  if (majorBrand === "qt  ") {
    formatId = "mov";
  } else if (majorBrand === "M4A ") {
    formatId = "m4a";
  } else if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(majorBrand)) {
    formatId = "heic";
  } else if (majorBrand === "avif" || majorBrand === "avis") {
    formatId = "avif";
  }

  return {
    formatId,
    containerFormat: "isobmff",
    confidence: "confirmed",
    evidence: [
      {
        ruleId: "sig-isobmff-ftyp",
        description: `ISO BMFF ftyp box (major_brand='${majorBrand}', box_size=${boxSize})`,
        byteRange: { start: 0, length: Math.min(boxSize, header.byteLength) },
        matchedHex: formatHex(header.subarray(4, 12)),
      },
    ],
    secondaryMatches: [],
  };
}

export function refineRiffSignature(header: Uint8Array): RefinedContainerMatch | null {
  if (header.byteLength < 12 || !matchAsciiAt(header, 0, "RIFF")) {
    return null;
  }

  const formType = String.fromCharCode(header[8], header[9], header[10], header[11]);
  let formatId = "unknown";
  if (formType === "WEBP") formatId = "webp";
  else if (formType === "WAVE") formatId = "wav";
  else if (formType === "AVI ") formatId = "avi";

  if (formatId === "unknown") {
    return {
      formatId: "unknown",
      containerFormat: "riff",
      confidence: "ambiguous",
      evidence: [
        {
          ruleId: "sig-riff-generic",
          description: `RIFF container with unrecognized form '${formType}'`,
          byteRange: { start: 0, length: 12 },
          matchedHex: formatHex(header.subarray(0, 12)),
        },
      ],
      secondaryMatches: [`RIFF:${formType}`],
    };
  }

  return {
    formatId,
    containerFormat: "riff",
    confidence: "confirmed",
    evidence: [
      {
        ruleId: `sig-riff-${formatId}`,
        description: `RIFF container with '${formType}' form signature`,
        byteRange: { start: 0, length: 12 },
        matchedHex: formatHex(header.subarray(0, 12)),
      },
    ],
    secondaryMatches: [],
  };
}

export function refineZipSignature(windowBytes: Uint8Array): RefinedContainerMatch {
  const baseEvidence: SignatureEvidence = {
    ruleId: "sig-zip-local-header",
    description: "ZIP local file header / EOCD signature",
    byteRange: { start: 0, length: Math.min(4, windowBytes.byteLength) },
    matchedHex: formatHex(windowBytes.subarray(0, Math.min(4, windowBytes.byteLength))),
  };

  // Decode ASCII filenames safely from bounded window without inflating compressed streams
  const ascii = new TextDecoder("latin1").decode(windowBytes);

  if (ascii.includes("mimetypeapplication/epub+zip")) {
    return {
      formatId: "epub",
      containerFormat: "zip",
      confidence: "confirmed",
      evidence: [baseEvidence],
      secondaryMatches: ["zip"],
    };
  }
  if (ascii.includes("mimetypeapplication/vnd.oasis.opendocument.text")) {
    return {
      formatId: "odt",
      containerFormat: "zip",
      confidence: "confirmed",
      evidence: [baseEvidence],
      secondaryMatches: ["zip"],
    };
  }
  if (ascii.includes("mimetypeapplication/vnd.oasis.opendocument.spreadsheet")) {
    return {
      formatId: "ods",
      containerFormat: "zip",
      confidence: "confirmed",
      evidence: [baseEvidence],
      secondaryMatches: ["zip"],
    };
  }
  if (ascii.includes("mimetypeapplication/vnd.oasis.opendocument.presentation")) {
    return {
      formatId: "odp",
      containerFormat: "zip",
      confidence: "confirmed",
      evidence: [baseEvidence],
      secondaryMatches: ["zip"],
    };
  }

  if (ascii.includes("word/")) {
    return {
      formatId: "docx",
      containerFormat: "zip",
      confidence: "probable",
      evidence: [baseEvidence],
      secondaryMatches: ["zip"],
    };
  }
  if (ascii.includes("xl/")) {
    return {
      formatId: "xlsx",
      containerFormat: "zip",
      confidence: "probable",
      evidence: [baseEvidence],
      secondaryMatches: ["zip"],
    };
  }
  if (ascii.includes("ppt/")) {
    return {
      formatId: "pptx",
      containerFormat: "zip",
      confidence: "probable",
      evidence: [baseEvidence],
      secondaryMatches: ["zip"],
    };
  }

  return {
    formatId: "zip",
    containerFormat: "zip",
    confidence: "confirmed",
    evidence: [baseEvidence],
    secondaryMatches: [],
  };
}

export function refineEbmlSignature(windowBytes: Uint8Array): RefinedContainerMatch {
  const ebmlEvidence: SignatureEvidence = {
    ruleId: "sig-ebml-header",
    description: "EBML container signature (1A 45 DF A3)",
    byteRange: { start: 0, length: 4 },
    matchedHex: formatHex(windowBytes.subarray(0, 4)),
  };

  const webmIdx = findBytesIndex(windowBytes, [0x77, 0x65, 0x62, 0x6d], 256); // "webm"
  if (webmIdx >= 0) {
    return {
      formatId: "webm",
      containerFormat: "ebml",
      confidence: "confirmed",
      evidence: [ebmlEvidence],
      secondaryMatches: [],
    };
  }

  const mkvIdx = findBytesIndex(
    windowBytes,
    [0x6d, 0x61, 0x74, 0x72, 0x6f, 0x73, 0x6b, 0x61], // "matroska"
    256
  );
  if (mkvIdx >= 0) {
    return {
      formatId: "mkv",
      containerFormat: "ebml",
      confidence: "confirmed",
      evidence: [ebmlEvidence],
      secondaryMatches: [],
    };
  }

  return {
    formatId: "mkv",
    containerFormat: "ebml",
    confidence: "probable",
    evidence: [ebmlEvidence],
    secondaryMatches: ["EBML DocType not found in first 256 bytes"],
  };
}
