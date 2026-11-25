import { BufferBinaryReader } from "@trace/binary-core";
import { BoundedEventEmitter } from "@trace/event-system";
import { detectFileSignature } from "@trace/file-signatures";
import type { FormatParser } from "@trace/parsers";
import type { MetadataField, SanitizationStatus } from "@trace/shared-types";

export type SanitizationCategoryId =
  | "exif_gps"
  | "iptc"
  | "icc_profile"
  | "comments"
  | "png_text"
  | "png_exif"
  | "png_time"
  | "webp_metadata"
  | "mp3_id3"
  | "wav_chunks"
  | "office_docprops"
  | "pdf_metadata";

export interface SanitizationCategoryOption {
  id: SanitizationCategoryId;
  label: string;
  description: string;
  sensitiveDefault: boolean;
  warning?: string;
}

export interface SanitizationCapabilities {
  supported: boolean;
  executionMode: "local_browser" | "consented_backend" | "unsupported";
  strategyName: string;
  categories: SanitizationCategoryOption[];
  generalWarnings: string[];
}

export interface SanitizationResult {
  formatId: string;
  outputBytes: Uint8Array;
  mimeType: string;
  suggestedFilename: string;
  beforeFieldCount: number;
  afterFieldCount: number;
  removedFieldNames: string[];
  remainingFieldNames: string[];
  categoryStatuses: Array<{ category: SanitizationCategoryId; status: SanitizationStatus }>;
  overallStatus: SanitizationStatus;
  warnings: string[];
}

export function buildCleanFilename(originalName: string): string {
  const safeBase = originalName.replace(/[/\\:*?"<>|\x00-\x1f]/g, "_");
  const dot = safeBase.lastIndexOf(".");
  if (dot <= 0) return `${safeBase}.clean`;
  return `${safeBase.slice(0, dot)}.clean${safeBase.slice(dot)}`;
}

export function getSanitizationCapabilities(formatId: string): SanitizationCapabilities {
  if (formatId === "jpeg") {
    return {
      supported: true,
      executionMode: "local_browser",
      strategyName: "Lossless JPEG APP/COM segment removal (preserves entropy-coded pixels)",
      categories: [
        {
          id: "exif_gps",
          label: "EXIF, GPS & XMP (APP1)",
          description: "Removes camera model, serials, GPS coordinates, timestamps, and XMP packets.",
          sensitiveDefault: true,
        },
        {
          id: "iptc",
          label: "IPTC / Photoshop (APP13)",
          description: "Removes editorial credits, captions, and Photoshop tags.",
          sensitiveDefault: true,
        },
        {
          id: "comments",
          label: "JPEG Comments (COM)",
          description: "Removes free-text comment segments.",
          sensitiveDefault: true,
        },
        {
          id: "icc_profile",
          label: "ICC Color Profile (APP2)",
          description: "Removes embedded color profile data.",
          sensitiveDefault: false,
          warning: "Removing ICC profiles may slightly alter color rendering in wide-gamut viewers.",
        },
      ],
      generalWarnings: [
        "Original file is preserved untouched; a clean copy will be downloaded.",
        "Visual watermarks or PII inside image pixels cannot be removed by metadata sanitization.",
      ],
    };
  }

  if (formatId === "png") {
    return {
      supported: true,
      executionMode: "local_browser",
      strategyName: "Lossless PNG ancillary metadata chunk filter (preserves IDAT pixels)",
      categories: [
        {
          id: "png_text",
          label: "Text & XMP Chunks (tEXt / zTXt / iTXt)",
          description: "Removes software tags, author comments, and embedded XMP.",
          sensitiveDefault: true,
        },
        {
          id: "png_exif",
          label: "Embedded EXIF Chunk (eXIf)",
          description: "Removes EXIF camera/GPS metadata stored in PNG.",
          sensitiveDefault: true,
        },
        {
          id: "png_time",
          label: "Modification Timestamp (tIME)",
          description: "Removes last-modified UTC timestamp chunk.",
          sensitiveDefault: true,
        },
      ],
      generalWarnings: [
        "Critical image chunks (IHDR, PLTE, IDAT, IEND) are preserved without re-encoding.",
        "Original file is preserved untouched.",
      ],
    };
  }

  if (formatId === "webp") {
    return {
      supported: true,
      executionMode: "local_browser",
      strategyName: "Lossless WebP RIFF metadata chunk removal (preserves VP8/VP8L/ALPH frames)",
      categories: [
        {
          id: "webp_metadata",
          label: "EXIF, XMP & ICCP RIFF Chunks",
          description: "Removes EXIF, XMP, and color profile chunks while recalculating RIFF length and VP8X flags.",
          sensitiveDefault: true,
        },
      ],
      generalWarnings: [
        "Image bitstream frames (VP8, VP8L, ALPH, ANIM) are preserved untouched without re-encoding.",
        "Original file is preserved untouched.",
      ],
    };
  }

  if (formatId === "mp3") {
    return {
      supported: true,
      executionMode: "local_browser",
      strategyName: "Lossless MP3 ID3v1 / ID3v2 frame strip (preserves MPEG audio frames)",
      categories: [
        {
          id: "mp3_id3",
          label: "ID3v2 Header & ID3v1 Footer Tags",
          description: "Strips embedded Title, Artist, Album, Encoder, and Artwork frames without re-encoding MP3 audio.",
          sensitiveDefault: true,
        },
      ],
      generalWarnings: [
        "Compressed MPEG audio frames are preserved bit-for-bit untouched.",
        "Original file is preserved untouched.",
      ],
    };
  }

  if (formatId === "wav") {
    return {
      supported: true,
      executionMode: "local_browser",
      strategyName: "Lossless WAV RIFF metadata chunk strip (preserves fmt & PCM data chunks)",
      categories: [
        {
          id: "wav_chunks",
          label: "LIST/INFO, Broadcast Wave (bext) & ID3 Chunks",
          description: "Removes DAW originators, recording dates, and tags while recalculating outer RIFF length.",
          sensitiveDefault: true,
        },
      ],
      generalWarnings: [
        "Audio fmt and raw PCM data chunks are preserved bit-for-bit untouched.",
        "Original file is preserved untouched.",
      ],
    };
  }

  if (formatId === "docx" || formatId === "xlsx" || formatId === "pptx") {
    return {
      supported: true,
      executionMode: "local_browser",
      strategyName: "Local OpenXML Property Scrubber (strips docProps XML entries)",
      categories: [
        {
          id: "office_docprops",
          label: "Document Properties (core.xml / app.xml / custom.xml)",
          description: "Neutralizes author, lastModifiedBy, company, timestamps, and revision counts inside OpenXML ZIP.",
          sensitiveDefault: true,
        },
      ],
      generalWarnings: [
        "Does not automatically delete visible document body text, comments.xml, or tracked-change revisions.",
        "Inspect Comments/Tracked Changes in Forensics before releasing confidential documents.",
      ],
    };
  }

  if (formatId === "pdf") {
    return {
      supported: true,
      executionMode: "consented_backend",
      strategyName: "Consented Backend PDF Structural Scrubbing (pypdf / pikepdf)",
      categories: [
        {
          id: "pdf_metadata",
          label: "Document Info & XMP Metadata",
          description: "Clears Author, Creator, Producer, dates, and XMP streams via backend PDF rewrite.",
          sensitiveDefault: true,
          warning: "Rewriting PDF structure invalidates any existing PDF digital signatures.",
        },
      ],
      generalWarnings: [
        "Requires explicit consent to upload temporarily to the isolated backend API.",
        "Visual text, annotations, form fields, and embedded files must be reviewed separately.",
      ],
    };
  }

  return {
    supported: false,
    executionMode: "unsupported",
    strategyName: "Unsupported for automated sanitization",
    categories: [],
    generalWarnings: [
      `Automated metadata sanitization is not supported for format '${formatId}'. TRACE refuses unsupported cleaning rather than altering files unpredictably.`,
    ],
  };
}

/** Shared before/after re-inspection helper used by lossless client sanitizers. */
export async function verifySanitizedBytes(args: {
  parser: FormatParser;
  formatId: string;
  mimeType: string;
  fileName: string;
  sourceBytes: Uint8Array;
  outputBytes: Uint8Array;
  categories: readonly SanitizationCategoryId[];
  verifyRemoved: (afterFields: Array<{ group: string; rawKey?: string; fieldName: string }>) => boolean;
  warnings?: string[];
}): Promise<SanitizationResult> {
  const cleanName = buildCleanFilename(args.fileName);
  const beforeReader = new BufferBinaryReader(args.sourceBytes);
  const beforeId = await detectFileSignature(beforeReader, { fileName: args.fileName });
  const beforeOut = await args.parser.parse({
    fileId: "sanitize-before",
    fileName: args.fileName,
    reader: beforeReader,
    identification: beforeId,
    emitter: new BoundedEventEmitter(),
  });

  const afterReader = new BufferBinaryReader(args.outputBytes);
  const afterId = await detectFileSignature(afterReader, { fileName: cleanName });
  const afterOut = await args.parser.parse({
    fileId: "sanitize-after",
    fileName: cleanName,
    reader: afterReader,
    identification: afterId,
    emitter: new BoundedEventEmitter(),
  });

  const afterKeys = new Set(afterOut.fields.map((f: MetadataField) => `${f.group}:${f.fieldName}`));
  const removedFieldNames = beforeOut.fields
    .filter((f: MetadataField) => !afterKeys.has(`${f.group}:${f.fieldName}`))
    .map((f: MetadataField) => f.fieldName);
  const remainingFieldNames = afterOut.fields.map((f: MetadataField) => f.fieldName);

  const ok = args.verifyRemoved(afterOut.fields);
  const overallStatus: SanitizationStatus = ok
    ? "removed_and_verified"
    : "attempted_verification_incomplete";

  return {
    formatId: args.formatId,
    outputBytes: args.outputBytes,
    mimeType: args.mimeType,
    suggestedFilename: cleanName,
    beforeFieldCount: beforeOut.fields.length,
    afterFieldCount: afterOut.fields.length,
    removedFieldNames,
    remainingFieldNames,
    categoryStatuses: args.categories.map((c) => ({ category: c, status: overallStatus })),
    overallStatus,
    warnings: args.warnings ?? [],
  };
}
