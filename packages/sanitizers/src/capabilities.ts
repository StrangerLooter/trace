import type { SanitizationStatus } from "@trace/shared-types";

export type SanitizationCategoryId =
  | "exif_gps"
  | "iptc"
  | "icc_profile"
  | "comments"
  | "png_text"
  | "png_exif"
  | "png_time"
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
