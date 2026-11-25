export interface ByteRange {
  start: number;
  length: number;
}

export type FormatCategory =
  | "image"
  | "audio"
  | "video"
  | "document"
  | "office"
  | "archive"
  | "executable"
  | "other"
  | "unknown";

export type IdentificationConfidence =
  | "confirmed"
  | "probable"
  | "ambiguous"
  | "unknown";

export type FormatSupportStatus =
  | "fully_supported"
  | "partially_supported"
  | "identification_only"
  | "experimental"
  | "unsupported";

export interface SignatureEvidence {
  ruleId: string;
  description: string;
  byteRange: ByteRange;
  matchedHex: string;
}

export interface FileIdentificationResult {
  formatId: string;
  displayName: string;
  category: FormatCategory;
  detectedMime: string;
  declaredExtension: string | null;
  declaredMime: string | null;
  extensionMismatch: boolean;
  confidence: IdentificationConfidence;
  supportStatus: FormatSupportStatus;
  containerFormat?: string;
  evidence: SignatureEvidence[];
  secondaryMatches: string[];
}

export type MetadataGroup =
  | "general"
  | "exif"
  | "iptc"
  | "xmp"
  | "gps"
  | "camera"
  | "audio"
  | "video"
  | "pdf"
  | "office"
  | "archive"
  | "binary"
  | "embedded";

export type FieldStatus = "valid" | "missing" | "malformed" | "suspicious";

export interface MetadataField {
  id: string;
  fieldName: string;
  rawKey?: string;
  value: string | number | boolean | string[] | null;
  displayValue: string;
  dataType:
    | "string"
    | "number"
    | "boolean"
    | "date"
    | "coordinates"
    | "bytes"
    | "array"
    | "object";
  group: MetadataGroup;
  sourceParser: string;
  byteRange?: ByteRange;
  confidence: "confirmed" | "probable" | "inferred";
  isSensitive: boolean;
  sensitivityReason?: string;
  status: FieldStatus;
}

export interface DetectedStructure {
  id: string;
  name: string;
  type: string;
  byteRange: ByteRange;
  parentId?: string;
  children?: DetectedStructure[];
  summary?: string;
}

export type FindingSeverity =
  | "informational"
  | "low"
  | "medium"
  | "high"
  | "critical";

export interface ForensicFinding {
  id: string;
  ruleId: string;
  category: "privacy" | "integrity" | "structure" | "mismatch";
  title: string;
  severity: FindingSeverity;
  explanation: string;
  evidence: string;
  affectedFieldIds: string[];
  byteRange?: ByteRange;
  whyItMatters: string;
  suggestedAction: string;
  detectionMethod: string;
  confidence: "confirmed" | "probable";
}

export interface AnalysisCoverage {
  mode: "local_browser" | "consented_backend";
  headerInspected: boolean;
  footerInspected: boolean;
  containerIndexInspected: boolean;
  completeFileScanned: boolean;
  fullHashComputed: boolean;
  uninspectedReasons: string[];
}

export type SanitizationStatus =
  | "removed_and_verified"
  | "attempted_verification_incomplete"
  | "unsupported_metadata"
  | "sanitization_failed"
  | "file_integrity_changed"
  | "original_preserved";

export const FORMAT_SUPPORT_STATUS_MAP: Record<string, FormatSupportStatus> = {
  jpeg: "fully_supported",
  png: "fully_supported",
  webp: "partially_supported",
  tiff: "partially_supported",
  gif: "partially_supported",
  heic: "partially_supported",
  avif: "partially_supported",
  pdf: "partially_supported",
  mp4: "partially_supported",
  mov: "partially_supported",
  mkv: "partially_supported",
  webm: "partially_supported",
  zip: "partially_supported",
  docx: "partially_supported",
  xlsx: "partially_supported",
  pptx: "partially_supported",
  odt: "partially_supported",
  ods: "partially_supported",
  odp: "partially_supported",
  mp3: "partially_supported",
  wav: "partially_supported",
  flac: "partially_supported",
  ogg: "partially_supported",
  m4a: "partially_supported",
  pe: "identification_only",
  dos_mz: "identification_only",
  elf: "identification_only",
  macho: "identification_only",
  rar: "identification_only",
  "7z": "identification_only",
  gzip: "identification_only",
  bzip2: "identification_only",
  tar: "identification_only",
  avi: "identification_only",
  epub: "identification_only",
  sqlite: "identification_only",
  unknown: "unsupported",
};

export function getFormatSupportStatus(formatId: string): FormatSupportStatus {
  return FORMAT_SUPPORT_STATUS_MAP[formatId] ?? "unsupported";
}
