import type { BinaryReader } from "@trace/binary-core";
import type { BoundedEventEmitter, TraceEvent } from "@trace/event-system";
import {
  getFormatSupportStatus,
  type AnalysisCoverage,
  type DetectedStructure,
  type FileIdentificationResult,
  type ForensicFinding,
  type FormatSupportStatus,
  type MetadataField,
} from "@trace/shared-types";

export { getFormatSupportStatus };

export interface ParserContext {
  fileId: string;
  fileName: string;
  reader: BinaryReader;
  identification: FileIdentificationResult;
  emitter: BoundedEventEmitter;
  onEvent?: (event: TraceEvent) => void;
  signal?: AbortSignal;
}

export interface ParserOutput {
  parserId: string;
  parserVersion: string;
  fields: MetadataField[];
  structures: DetectedStructure[];
  findings: ForensicFinding[];
  warnings: string[];
  coveragePatch: Partial<AnalysisCoverage>;
}

export interface FormatParser {
  readonly id: string;
  readonly version: string;
  readonly supportedFormatIds: readonly string[];
  canParse(identification: FileIdentificationResult): boolean;
  parse(context: ParserContext): Promise<ParserOutput>;
}

export interface FormatRegistryEntry {
  formatId: string;
  displayName: string;
  supportStatus: FormatSupportStatus;
  clientParsable: boolean;
  requiresBackendForFull: boolean;
  sanitizable: boolean;
  notes: string;
}

export const FORMAT_SUPPORT_REGISTRY: Record<string, FormatRegistryEntry> = {
  jpeg: {
    formatId: "jpeg",
    displayName: "JPEG Image",
    supportStatus: "fully_supported",
    clientParsable: true,
    requiresBackendForFull: false,
    sanitizable: true,
    notes: "EXIF/IPTC/XMP/GPS and lossless segment stripping run locally; proprietary MakerNotes require backend ExifTool.",
  },
  png: {
    formatId: "png",
    displayName: "PNG Image",
    supportStatus: "fully_supported",
    clientParsable: true,
    requiresBackendForFull: false,
    sanitizable: true,
    notes: "IHDR, ancillary text/eXIf/pHYs chunks, trailing byte checks, and lossless chunk filtering run locally.",
  },
  webp: {
    formatId: "webp",
    displayName: "WebP Image",
    supportStatus: "partially_supported",
    clientParsable: true,
    requiresBackendForFull: false,
    sanitizable: false,
    notes: "RIFF/WEBP chunk inspection supported; sanitization scheduled for P2.",
  },
  tiff: {
    formatId: "tiff",
    displayName: "TIFF Image",
    supportStatus: "partially_supported",
    clientParsable: true,
    requiresBackendForFull: false,
    sanitizable: false,
    notes: "IFD header and EXIF tag extraction supported.",
  },
  gif: {
    formatId: "gif",
    displayName: "GIF Image",
    supportStatus: "partially_supported",
    clientParsable: true,
    requiresBackendForFull: false,
    sanitizable: false,
    notes: "Header dimensions and comment extension inspection.",
  },
  pdf: {
    formatId: "pdf",
    displayName: "PDF Document",
    supportStatus: "partially_supported",
    clientParsable: true,
    requiresBackendForFull: true,
    sanitizable: true,
    notes: "Basic metadata/JS/encryption inspection locally; deep structural scrubbing requires consented backend pikepdf/qpdf.",
  },
  mp4: {
    formatId: "mp4",
    displayName: "MP4 Video",
    supportStatus: "partially_supported",
    clientParsable: true,
    requiresBackendForFull: true,
    sanitizable: false,
    notes: "Container box headers walk via bounded slices locally; deep stream inspection requires consented backend FFprobe.",
  },
  mov: {
    formatId: "mov",
    displayName: "QuickTime MOV",
    supportStatus: "partially_supported",
    clientParsable: true,
    requiresBackendForFull: true,
    sanitizable: false,
    notes: "QuickTime atoms inspected locally; deep streams via consented FFprobe.",
  },
  zip: {
    formatId: "zip",
    displayName: "ZIP Archive",
    supportStatus: "partially_supported",
    clientParsable: true,
    requiresBackendForFull: false,
    sanitizable: false,
    notes: "Central directory entry inspection with bomb/traversal guards; never extracted to disk.",
  },
  docx: {
    formatId: "docx",
    displayName: "Word Document (DOCX)",
    supportStatus: "partially_supported",
    clientParsable: true,
    requiresBackendForFull: false,
    sanitizable: false,
    notes: "OpenXML docProps metadata inspection via bounded ZIP reads.",
  },
  xlsx: {
    formatId: "xlsx",
    displayName: "Excel Workbook (XLSX)",
    supportStatus: "partially_supported",
    clientParsable: true,
    requiresBackendForFull: false,
    sanitizable: false,
    notes: "OpenXML docProps metadata inspection via bounded ZIP reads.",
  },
  pptx: {
    formatId: "pptx",
    displayName: "PowerPoint Presentation (PPTX)",
    supportStatus: "partially_supported",
    clientParsable: true,
    requiresBackendForFull: false,
    sanitizable: false,
    notes: "OpenXML docProps metadata inspection via bounded ZIP reads.",
  },
  mp3: {
    formatId: "mp3",
    displayName: "MP3 Audio",
    supportStatus: "partially_supported",
    clientParsable: true,
    requiresBackendForFull: false,
    sanitizable: false,
    notes: "ID3v1/v2 tag inspection planned in P1.",
  },
  wav: {
    formatId: "wav",
    displayName: "WAV Audio",
    supportStatus: "partially_supported",
    clientParsable: true,
    requiresBackendForFull: false,
    sanitizable: false,
    notes: "RIFF fmt/LIST/INFO chunk inspection planned in P1.",
  },
  flac: {
    formatId: "flac",
    displayName: "FLAC Audio",
    supportStatus: "partially_supported",
    clientParsable: true,
    requiresBackendForFull: false,
    sanitizable: false,
    notes: "STREAMINFO and Vorbis comments planned in P1.",
  },
  ogg: {
    formatId: "ogg",
    displayName: "OGG Container",
    supportStatus: "partially_supported",
    clientParsable: true,
    requiresBackendForFull: false,
    sanitizable: false,
    notes: "Vorbis/Opus stream header inspection planned in P1.",
  },
  pe: {
    formatId: "pe",
    displayName: "Windows PE Executable",
    supportStatus: "identification_only",
    clientParsable: false,
    requiresBackendForFull: true,
    sanitizable: false,
    notes: "Signature/DOS-PE header verification in P0; full sections/imports in P2.",
  },
  elf: {
    formatId: "elf",
    displayName: "Linux ELF Executable",
    supportStatus: "identification_only",
    clientParsable: false,
    requiresBackendForFull: true,
    sanitizable: false,
    notes: "Signature identification in P0; full ELF section/dynamic table parsing in P2.",
  },
  macho: {
    formatId: "macho",
    displayName: "macOS Mach-O Binary",
    supportStatus: "identification_only",
    clientParsable: false,
    requiresBackendForFull: true,
    sanitizable: false,
    notes: "Signature identification only; deep Mach-O parsing in P2.",
  },
  rar: {
    formatId: "rar",
    displayName: "RAR Archive",
    supportStatus: "identification_only",
    clientParsable: false,
    requiresBackendForFull: true,
    sanitizable: false,
    notes: "Signature identification only.",
  },
  "7z": {
    formatId: "7z",
    displayName: "7-Zip Archive",
    supportStatus: "identification_only",
    clientParsable: false,
    requiresBackendForFull: true,
    sanitizable: false,
    notes: "Signature identification only.",
  },
  gzip: {
    formatId: "gzip",
    displayName: "GZIP Compressed Stream",
    supportStatus: "identification_only",
    clientParsable: false,
    requiresBackendForFull: false,
    sanitizable: false,
    notes: "Signature identification only.",
  },
  unknown: {
    formatId: "unknown",
    displayName: "Unknown Binary Format",
    supportStatus: "unsupported",
    clientParsable: false,
    requiresBackendForFull: false,
    sanitizable: false,
    notes: "Unsupported binary signature; SHA-256 hashing and Hex Inspector remain available.",
  },
};

export interface AnalysisPlan {
  formatId: string;
  supportStatus: FormatSupportStatus;
  selectedParserIds: string[];
  largeFileMode: boolean;
  requiresConsentForFull: boolean;
  warnings: string[];
}

export class ParserRegistry {
  private readonly parsers: FormatParser[] = [];

  register(parser: FormatParser): void {
    this.parsers.push(parser);
  }

  getAll(): readonly FormatParser[] {
    return this.parsers;
  }

  plan(identification: FileIdentificationResult, fileSizeBytes: number): AnalysisPlan {
    const entry = FORMAT_SUPPORT_REGISTRY[identification.formatId] ?? FORMAT_SUPPORT_REGISTRY.unknown;
    const matchingParsers = this.parsers
      .filter((p) => p.canParse(identification))
      .map((p) => p.id);

    const largeFileMode = fileSizeBytes > 100 * 1024 * 1024; // > 100 MiB triggers slice-first plan
    const warnings: string[] = [];

    if (entry.supportStatus === "unsupported") {
      warnings.push("Format is unsupported for semantic metadata extraction; hex and hash inspection remain active.");
    } else if (entry.supportStatus === "identification_only") {
      warnings.push(`${entry.displayName} currently supports binary identification only in local mode.`);
    }

    if (largeFileMode) {
      warnings.push("Large file (>100 MiB): local mode inspects bounded header/footer/index slices without loading the full file.");
    }

    return {
      formatId: identification.formatId,
      supportStatus: entry.supportStatus,
      selectedParserIds: matchingParsers,
      largeFileMode,
      requiresConsentForFull: entry.requiresBackendForFull,
      warnings,
    };
  }
}
