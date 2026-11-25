import type { FormatCategory } from "@trace/shared-types";

export interface ExtensionExpectation {
  formatId: string;
  displayName: string;
  category: FormatCategory;
  mime: string;
  extensions: readonly string[];
}

export const FORMAT_DEFINITIONS: Record<string, ExtensionExpectation> = {
  jpeg: {
    formatId: "jpeg",
    displayName: "JPEG Image",
    category: "image",
    mime: "image/jpeg",
    extensions: ["jpg", "jpeg", "jpe", "jfif"],
  },
  png: {
    formatId: "png",
    displayName: "PNG Image",
    category: "image",
    mime: "image/png",
    extensions: ["png"],
  },
  gif: {
    formatId: "gif",
    displayName: "GIF Image",
    category: "image",
    mime: "image/gif",
    extensions: ["gif"],
  },
  webp: {
    formatId: "webp",
    displayName: "WebP Image",
    category: "image",
    mime: "image/webp",
    extensions: ["webp"],
  },
  tiff: {
    formatId: "tiff",
    displayName: "TIFF Image",
    category: "image",
    mime: "image/tiff",
    extensions: ["tif", "tiff"],
  },
  heic: {
    formatId: "heic",
    displayName: "HEIC / HEIF Image",
    category: "image",
    mime: "image/heic",
    extensions: ["heic", "heif"],
  },
  avif: {
    formatId: "avif",
    displayName: "AVIF Image",
    category: "image",
    mime: "image/avif",
    extensions: ["avif"],
  },
  pdf: {
    formatId: "pdf",
    displayName: "PDF Document",
    category: "document",
    mime: "application/pdf",
    extensions: ["pdf"],
  },
  epub: {
    formatId: "epub",
    displayName: "EPUB eBook",
    category: "document",
    mime: "application/epub+zip",
    extensions: ["epub"],
  },
  docx: {
    formatId: "docx",
    displayName: "Word Document (DOCX)",
    category: "office",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extensions: ["docx"],
  },
  xlsx: {
    formatId: "xlsx",
    displayName: "Excel Workbook (XLSX)",
    category: "office",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extensions: ["xlsx"],
  },
  pptx: {
    formatId: "pptx",
    displayName: "PowerPoint Presentation (PPTX)",
    category: "office",
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    extensions: ["pptx"],
  },
  odt: {
    formatId: "odt",
    displayName: "OpenDocument Text (ODT)",
    category: "office",
    mime: "application/vnd.oasis.opendocument.text",
    extensions: ["odt"],
  },
  ods: {
    formatId: "ods",
    displayName: "OpenDocument Spreadsheet (ODS)",
    category: "office",
    mime: "application/vnd.oasis.opendocument.spreadsheet",
    extensions: ["ods"],
  },
  odp: {
    formatId: "odp",
    displayName: "OpenDocument Presentation (ODP)",
    category: "office",
    mime: "application/vnd.oasis.opendocument.presentation",
    extensions: ["odp"],
  },
  zip: {
    formatId: "zip",
    displayName: "ZIP Archive",
    category: "archive",
    mime: "application/zip",
    extensions: ["zip"],
  },
  rar: {
    formatId: "rar",
    displayName: "RAR Archive",
    category: "archive",
    mime: "application/vnd.rar",
    extensions: ["rar"],
  },
  "7z": {
    formatId: "7z",
    displayName: "7-Zip Archive",
    category: "archive",
    mime: "application/x-7z-compressed",
    extensions: ["7z"],
  },
  gzip: {
    formatId: "gzip",
    displayName: "GZIP Compressed Stream",
    category: "archive",
    mime: "application/gzip",
    extensions: ["gz", "gzip", "tgz"],
  },
  bzip2: {
    formatId: "bzip2",
    displayName: "BZIP2 Compressed Stream",
    category: "archive",
    mime: "application/x-bzip2",
    extensions: ["bz2"],
  },
  tar: {
    formatId: "tar",
    displayName: "POSIX TAR Archive",
    category: "archive",
    mime: "application/x-tar",
    extensions: ["tar"],
  },
  mp3: {
    formatId: "mp3",
    displayName: "MP3 Audio",
    category: "audio",
    mime: "audio/mpeg",
    extensions: ["mp3"],
  },
  wav: {
    formatId: "wav",
    displayName: "WAV Audio",
    category: "audio",
    mime: "audio/wav",
    extensions: ["wav"],
  },
  flac: {
    formatId: "flac",
    displayName: "FLAC Audio",
    category: "audio",
    mime: "audio/flac",
    extensions: ["flac"],
  },
  ogg: {
    formatId: "ogg",
    displayName: "OGG Container",
    category: "audio",
    mime: "audio/ogg",
    extensions: ["ogg", "oga", "opus", "ogv"],
  },
  m4a: {
    formatId: "m4a",
    displayName: "MPEG-4 Audio (M4A)",
    category: "audio",
    mime: "audio/mp4",
    extensions: ["m4a", "mp4"],
  },
  mp4: {
    formatId: "mp4",
    displayName: "MP4 Video",
    category: "video",
    mime: "video/mp4",
    extensions: ["mp4", "m4v"],
  },
  mov: {
    formatId: "mov",
    displayName: "QuickTime Movie (MOV)",
    category: "video",
    mime: "video/quicktime",
    extensions: ["mov", "qt"],
  },
  mkv: {
    formatId: "mkv",
    displayName: "Matroska Video (MKV)",
    category: "video",
    mime: "video/x-matroska",
    extensions: ["mkv"],
  },
  webm: {
    formatId: "webm",
    displayName: "WebM Video",
    category: "video",
    mime: "video/webm",
    extensions: ["webm"],
  },
  avi: {
    formatId: "avi",
    displayName: "AVI Video",
    category: "video",
    mime: "video/x-msvideo",
    extensions: ["avi"],
  },
  pe: {
    formatId: "pe",
    displayName: "Windows PE Executable",
    category: "executable",
    mime: "application/vnd.microsoft.portable-executable",
    extensions: ["exe", "dll", "sys", "scr"],
  },
  dos_mz: {
    formatId: "dos_mz",
    displayName: "DOS MZ Executable (Unverified PE)",
    category: "executable",
    mime: "application/x-dosexec",
    extensions: ["exe", "com", "dos"],
  },
  elf: {
    formatId: "elf",
    displayName: "Linux ELF Executable",
    category: "executable",
    mime: "application/x-elf",
    extensions: ["elf", "so", "o", "bin", "out"],
  },
  macho: {
    formatId: "macho",
    displayName: "macOS Mach-O Binary",
    category: "executable",
    mime: "application/x-mach-binary",
    extensions: ["dylib", "bundle", "o", "bin"],
  },
  sqlite: {
    formatId: "sqlite",
    displayName: "SQLite 3 Database",
    category: "other",
    mime: "application/vnd.sqlite3",
    extensions: ["db", "sqlite", "sqlite3"],
  },
  ttf: {
    formatId: "ttf",
    displayName: "TrueType Font (TTF)",
    category: "other",
    mime: "font/ttf",
    extensions: ["ttf", "ttc"],
  },
  otf: {
    formatId: "otf",
    displayName: "OpenType Font (OTF)",
    category: "other",
    mime: "font/otf",
    extensions: ["otf"],
  },
  woff: {
    formatId: "woff",
    displayName: "Web Open Font Format (WOFF)",
    category: "other",
    mime: "font/woff",
    extensions: ["woff"],
  },
  woff2: {
    formatId: "woff2",
    displayName: "Web Open Font Format 2 (WOFF2)",
    category: "other",
    mime: "font/woff2",
    extensions: ["woff2"],
  },
  unknown: {
    formatId: "unknown",
    displayName: "Unknown Binary Format",
    category: "unknown",
    mime: "application/octet-stream",
    extensions: [],
  },
};

export function extractExtension(filename: string | null | undefined): string | null {
  if (!filename) return null;
  const base = filename.split(/[/\\]/).pop() ?? "";
  const dotIdx = base.lastIndexOf(".");
  if (dotIdx <= 0 || dotIdx === base.length - 1) return null;
  return base.slice(dotIdx + 1).toLowerCase();
}

export function matchBytesAt(
  buf: Uint8Array,
  offset: number,
  signature: readonly number[]
): boolean {
  if (offset < 0 || buf.byteLength < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (buf[offset + i] !== signature[i]) return false;
  }
  return true;
}

export function matchAsciiAt(buf: Uint8Array, offset: number, text: string): boolean {
  if (offset < 0 || buf.byteLength < offset + text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (buf[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

export function findBytesIndex(
  haystack: Uint8Array,
  needle: readonly number[],
  maxSearchBytes = haystack.byteLength
): number {
  const limit = Math.min(haystack.byteLength, maxSearchBytes) - needle.length;
  for (let i = 0; i <= limit; i++) {
    let matched = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        matched = false;
        break;
      }
    }
    if (matched) return i;
  }
  return -1;
}
