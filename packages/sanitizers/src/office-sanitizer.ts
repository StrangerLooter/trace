import { unzipSync, ZipOfficeParser, zipSync } from "@trace/parsers";
import {
  buildCleanFilename,
  type SanitizationCategoryId,
  type SanitizationResult,
  verifySanitizedBytes,
} from "./capabilities";

const OFFICE_MIMES: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const BLANK_CORE_XML = new TextEncoder().encode(
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"/>'
);
const BLANK_APP_XML = new TextEncoder().encode(
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"/>'
);

/** Neutralizes docProps metadata XML inside DOCX/XLSX/PPTX packages locally with ZIP-bomb guards. */
export async function sanitizeOfficeBytes(
  sourceBytes: Uint8Array,
  fileName: string,
  formatId: string,
  categories: readonly SanitizationCategoryId[]
): Promise<SanitizationResult> {
  const mimeType = OFFICE_MIMES[formatId] ?? "application/zip";
  if (sourceBytes.byteLength > 50 * 1024 * 1024) {
    return {
      formatId,
      outputBytes: new Uint8Array(0),
      mimeType,
      suggestedFilename: buildCleanFilename(fileName),
      beforeFieldCount: 0,
      afterFieldCount: 0,
      removedFieldNames: [],
      remainingFieldNames: [],
      categoryStatuses: categories.map((c) => ({ category: c, status: "sanitization_failed" })),
      overallStatus: "sanitization_failed",
      warnings: ["Office package exceeds 50 MiB local repackaging cap."],
    };
  }

  let entries: Record<string, Uint8Array>;
  try {
    let entryCount = 0;
    let totalUncompressed = 0;
    entries = unzipSync(sourceBytes, {
      filter(file) {
        entryCount++;
        totalUncompressed += file.originalSize;
        return entryCount <= 5000 && totalUncompressed <= 128 * 1024 * 1024;
      },
    });
  } catch {
    return {
      formatId,
      outputBytes: new Uint8Array(0),
      mimeType,
      suggestedFilename: buildCleanFilename(fileName),
      beforeFieldCount: 0,
      afterFieldCount: 0,
      removedFieldNames: [],
      remainingFieldNames: [],
      categoryStatuses: categories.map((c) => ({ category: c, status: "sanitization_failed" })),
      overallStatus: "sanitization_failed",
      warnings: ["Could not safely inflate OpenXML ZIP entries (or archive exceeded safety bounds)."],
    };
  }

  if (categories.includes("office_docprops")) {
    if ("docProps/core.xml" in entries) entries["docProps/core.xml"] = BLANK_CORE_XML;
    if ("docProps/app.xml" in entries) entries["docProps/app.xml"] = BLANK_APP_XML;
    delete entries["docProps/custom.xml"];
  }

  const outputBytes = zipSync(entries, { level: 6 });

  return verifySanitizedBytes({
    parser: new ZipOfficeParser(),
    formatId,
    mimeType,
    fileName,
    sourceBytes,
    outputBytes,
    categories,
    verifyRemoved: (after) =>
      !categories.includes("office_docprops") || !after.some((f) => f.group === "office"),
    warnings: [
      "docProps/core.xml, app.xml, and custom.xml neutralized. Document body, comments, and tracked changes require manual review.",
    ],
  });
}
