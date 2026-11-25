import { XMLParser } from "fast-xml-parser";
import { inflateSync } from "fflate";
import type { FormatParser, ParserContext, ParserOutput } from "@trace/parser-registry";
import type { DetectedStructure, ForensicFinding, MetadataField } from "@trace/shared-types";
import { createMetadataField, emitAnomaly, emitStructure, isSensitiveTagKey } from "./helpers";

const MAX_ZIP_ENTRIES = 10_000;
const MAX_XML_ENTRY_BYTES = 1024 * 1024; // 1 MiB cap against decompression bombs
const BOMB_RATIO_THRESHOLD = 100;

interface ZipCentralEntry {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  isEncrypted: boolean;
  isSymlink: boolean;
}

export class ZipOfficeParser implements FormatParser {
  readonly id = "zip-office-parser";
  readonly version = "0.1.0";
  readonly supportedFormatIds = ["zip", "docx", "xlsx", "pptx", "odt", "ods", "odp", "epub"] as const;

  canParse(id: { formatId: string }): boolean {
    return this.supportedFormatIds.includes(id.formatId as (typeof this.supportedFormatIds)[number]);
  }

  async parse(ctx: ParserContext): Promise<ParserOutput> {
    const fields: MetadataField[] = [];
    const structures: DetectedStructure[] = [];
    const findings: ForensicFinding[] = [];
    const warnings: string[] = [];
    const totalSize = ctx.reader.byteLength;

    // Locate End of Central Directory (PK\x05\x06) in last 65,557 bytes
    const tailLen = Math.min(totalSize, 65557);
    const tailStart = totalSize - tailLen;
    const tail = await ctx.reader.read(tailStart, tailLen, ctx.signal);

    let eocdRel = -1;
    for (let i = tail.byteLength - 22; i >= 0; i--) {
      if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) {
        eocdRel = i;
        break;
      }
    }

    if (eocdRel < 0) {
      warnings.push("ZIP End of Central Directory (PK 05 06) not found in tail.");
      return { parserId: this.id, parserVersion: this.version, fields, structures, findings, warnings, coveragePatch: { headerInspected: true, footerInspected: true } };
    }

    const eocdOffset = tailStart + eocdRel;
    const eocdView = new DataView(tail.buffer, tail.byteOffset + eocdRel, 22);
    const totalEntries = eocdView.getUint16(10, true);
    const cdSize = eocdView.getUint32(12, true);
    const cdOffset = eocdView.getUint32(16, true);

    structures.push(
      emitStructure(ctx, this.id, {
        id: "zip-eocd",
        name: "ZIP End of Central Directory",
        type: "zip-eocd",
        byteRange: { start: eocdOffset, length: 22 },
      })
    );

    if (totalEntries > MAX_ZIP_ENTRIES) {
      findings.push(
        emitAnomaly(ctx, this.id, {
          id: `${ctx.fileId}:zip-entry-flood`,
          ruleId: "rule-zip-entry-limit",
          category: "integrity",
          title: "ZIP archive exceeds safe entry inspection cap",
          severity: "high",
          explanation: `Central directory declares ${totalEntries} entries (cap ${MAX_ZIP_ENTRIES}).`,
          evidence: `totalEntries=${totalEntries}`,
          affectedFieldIds: [],
          byteRange: { start: eocdOffset, length: 22 },
          whyItMatters: "Excessive entry counts can exhaust memory during archive parsing.",
          suggestedAction: "Inspect archive in an isolated environment.",
          detectionMethod: this.id,
          confidence: "confirmed",
        })
      );
      return { parserId: this.id, parserVersion: this.version, fields, structures, findings, warnings, coveragePatch: { headerInspected: true, footerInspected: true } };
    }

    if (cdOffset + cdSize > totalSize || cdSize > 16 * 1024 * 1024) {
      warnings.push("ZIP Central Directory offset/size exceeds bounds or 16 MiB cap.");
      return { parserId: this.id, parserVersion: this.version, fields, structures, findings, warnings, coveragePatch: { headerInspected: true, footerInspected: true } };
    }

    structures.push(
      emitStructure(ctx, this.id, {
        id: "zip-cd",
        name: `ZIP Central Directory (${totalEntries} entries)`,
        type: "zip-central-directory",
        byteRange: { start: cdOffset, length: cdSize },
      })
    );

    const cdBytes = await ctx.reader.read(cdOffset, cdSize, ctx.signal);
    const entries: ZipCentralEntry[] = [];
    let pos = 0;

    while (pos + 46 <= cdBytes.byteLength && entries.length < MAX_ZIP_ENTRIES) {
      const dv = new DataView(cdBytes.buffer, cdBytes.byteOffset + pos, 46);
      if (dv.getUint32(0, false) !== 0x504b0102) break;

      const flags = dv.getUint16(8, true);
      const compressionMethod = dv.getUint16(10, true);
      const compressedSize = dv.getUint32(20, true);
      const uncompressedSize = dv.getUint32(24, true);
      const nameLen = dv.getUint16(28, true);
      const extraLen = dv.getUint16(30, true);
      const commentLen = dv.getUint16(32, true);
      const externalAttrs = dv.getUint32(38, true);
      const localHeaderOffset = dv.getUint32(42, true);

      if (pos + 46 + nameLen > cdBytes.byteLength) break;
      const name = new TextDecoder("utf-8", { fatal: false }).decode(
        cdBytes.subarray(pos + 46, pos + 46 + nameLen)
      );
      const unixMode = (externalAttrs >>> 16) & 0xf000;

      entries.push({
        name,
        compressionMethod,
        compressedSize,
        uncompressedSize,
        localHeaderOffset,
        isEncrypted: (flags & 0x01) !== 0,
        isSymlink: unixMode === 0xa000,
      });

      pos += 46 + nameLen + extraLen + commentLen;
    }

    fields.push(
      createMetadataField(ctx, {
        idSuffix: "entry-count",
        fieldName: "Archive Entry Count",
        rawKey: "ZIP.EntryCount",
        value: entries.length,
        dataType: "number",
        group: "archive",
        parserId: this.id,
        byteRange: { start: eocdOffset + 10, length: 2 },
      })
    );

    // Security & integrity checks across entries without extracting to disk
    let bombSuspects = 0;
    const traversalNames: string[] = [];
    const symlinkNames: string[] = [];
    let encryptedCount = 0;

    for (const entry of entries) {
      if (entry.isEncrypted) encryptedCount++;
      if (entry.isSymlink) symlinkNames.push(entry.name);
      if (entry.name.includes("..") || entry.name.startsWith("/") || /^[A-Za-z]:/.test(entry.name)) {
        traversalNames.push(entry.name);
      }
      if (
        entry.compressedSize > 0 &&
        entry.uncompressedSize / entry.compressedSize > BOMB_RATIO_THRESHOLD &&
        entry.uncompressedSize > 10 * 1024 * 1024
      ) {
        bombSuspects++;
      }
    }

    if (traversalNames.length > 0) {
      findings.push(
        emitAnomaly(ctx, this.id, {
          id: `${ctx.fileId}:zip-traversal`,
          ruleId: "rule-zip-path-traversal",
          category: "structure",
          title: "Suspicious path traversal entry names inside archive",
          severity: "high",
          explanation: `Found ${traversalNames.length} entry path(s) containing '..' or rooted paths (ZipSlip pattern).`,
          evidence: traversalNames.slice(0, 5).join(", "),
          affectedFieldIds: [],
          whyItMatters: "Unsafe archive extractors can overwrite files outside the destination directory.",
          suggestedAction: "Do not extract with unvalidated archive utilities.",
          detectionMethod: this.id,
          confidence: "confirmed",
        })
      );
    }

    if (bombSuspects > 0) {
      findings.push(
        emitAnomaly(ctx, this.id, {
          id: `${ctx.fileId}:zip-bomb-ratio`,
          ruleId: "rule-zip-decompression-ratio",
          category: "structure",
          title: "Extreme compression ratio detected in archive entry",
          severity: "high",
          explanation: `${bombSuspects} archive entry(s) exceed ${BOMB_RATIO_THRESHOLD}:1 expansion ratio and 10 MB uncompressed size.`,
          evidence: `Flagged entries: ${bombSuspects}`,
          affectedFieldIds: [],
          whyItMatters: "High-ratio nested or sparse streams can exhaust memory/disk during decompression.",
          suggestedAction: "Keep bounded inspection limits active before decompressing entries.",
          detectionMethod: this.id,
          confidence: "confirmed",
        })
      );
    }

    if (symlinkNames.length > 0) {
      findings.push(
        emitAnomaly(ctx, this.id, {
          id: `${ctx.fileId}:zip-symlinks`,
          ruleId: "rule-zip-symlinks",
          category: "structure",
          title: "Symbolic link entries present in archive",
          severity: "medium",
          explanation: `Detected ${symlinkNames.length} POSIX symlink entry(s) inside ZIP attributes.`,
          evidence: symlinkNames.slice(0, 5).join(", "),
          affectedFieldIds: [],
          whyItMatters: "Symlinks inside untrusted archives can redirect extraction paths.",
          suggestedAction: "Review archive origin carefully.",
          detectionMethod: this.id,
          confidence: "confirmed",
        })
      );
    }

    if (encryptedCount > 0) {
      fields.push(
        createMetadataField(ctx, {
          idSuffix: "encrypted-entries",
          fieldName: "Encrypted Entries",
          rawKey: "ZIP.EncryptedEntries",
          value: encryptedCount,
          dataType: "number",
          group: "archive",
          parserId: this.id,
        })
      );
    }

    // Office OpenXML / ODF metadata XML extraction (bounded & XXE-safe)
    const xmlTargets = ["docProps/core.xml", "docProps/app.xml", "meta.xml"];
    for (const targetName of xmlTargets) {
      const entry = entries.find((e) => e.name === targetName);
      if (!entry || entry.isEncrypted || entry.uncompressedSize > MAX_XML_ENTRY_BYTES) continue;

      const xmlText = await this.readEntryText(ctx, entry);
      if (!xmlText || xmlText.includes("<!DOCTYPE") || xmlText.includes("<!ENTITY")) continue;

      try {
        const xmlParser = new XMLParser({
          ignoreAttributes: true,
          processEntities: false,
          removeNSPrefix: true,
        });
        const parsed = xmlParser.parse(xmlText) as Record<string, unknown>;
        const rootObj = (parsed.coreProperties ?? parsed.Properties ?? parsed.documentMeta ?? parsed) as Record<
          string,
          unknown
        >;
        if (rootObj && typeof rootObj === "object") {
          for (const [k, v] of Object.entries(rootObj)) {
            if (v === null || v === undefined || typeof v === "object") continue;
            const sens = isSensitiveTagKey(k);
            fields.push(
              createMetadataField(ctx, {
                idSuffix: `office-${targetName}-${k}`,
                fieldName: k,
                rawKey: `${targetName}:${k}`,
                value: String(v),
                dataType: k.toLowerCase().includes("date") || k.includes("created") || k.includes("modified") ? "date" : "string",
                group: "office",
                parserId: this.id,
                isSensitive: sens.sensitive || k === "creator" || k === "lastModifiedBy" || k === "Company",
                sensitivityReason: sens.reason ?? "Office document property may identify author or organization",
              })
            );
          }
        }
      } catch {
        warnings.push(`Failed to parse Office XML '${targetName}'.`);
      }
    }

    const hasComments = entries.some((e) => e.name.endsWith("comments.xml"));
    const hasEmbeddings = entries.some((e) => e.name.includes("/embeddings/"));
    if (hasComments || hasEmbeddings) {
      fields.push(
        createMetadataField(ctx, {
          idSuffix: "office-extras",
          fieldName: "Comments / Embedded Objects",
          rawKey: "Office.Extras",
          value: [hasComments ? "comments.xml" : null, hasEmbeddings ? "embeddings/" : null]
            .filter(Boolean)
            .join(", "),
          dataType: "string",
          group: "embedded",
          parserId: this.id,
          isSensitive: true,
          sensitivityReason: "Document contains reviewer comments or embedded OLE objects",
        })
      );
    }

    // Tracked changes & hidden Excel sheet checks (#19)
    const wordDocEntry = entries.find((e) => e.name === "word/document.xml");
    if (wordDocEntry && !wordDocEntry.isEncrypted && wordDocEntry.uncompressedSize <= MAX_XML_ENTRY_BYTES) {
      const docXml = await this.readEntryText(ctx, wordDocEntry);
      if (docXml) {
        const trackCount = (docXml.match(/<w:(?:ins|del)\b/g) ?? []).length;
        if (trackCount > 0) {
          const authorMatch = /w:author="([^"]{1,120})"/.exec(docXml);
          fields.push(
            createMetadataField(ctx, {
              idSuffix: "office-tracked-changes",
              fieldName: "Tracked Changes Revisions",
              rawKey: "Office.TrackedChanges",
              value: authorMatch ? `${trackCount} edit(s), author=${authorMatch[1]}` : `${trackCount} edit(s)`,
              dataType: "string",
              group: "embedded",
              parserId: this.id,
              isSensitive: true,
              sensitivityReason: "Tracked insertions/deletions expose deleted draft text and editor names",
            })
          );
        }
      }
    }

    const workbookEntry = entries.find((e) => e.name === "xl/workbook.xml");
    if (workbookEntry && !workbookEntry.isEncrypted && workbookEntry.uncompressedSize <= MAX_XML_ENTRY_BYTES) {
      const wbXml = await this.readEntryText(ctx, workbookEntry);
      if (wbXml) {
        const hiddenSheets = Array.from(wbXml.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*state="(hidden|veryHidden)"/gi)).map(
          (m) => m[1]
        );
        if (hiddenSheets.length > 0) {
          fields.push(
            createMetadataField(ctx, {
              idSuffix: "office-hidden-sheets",
              fieldName: "Hidden Workbook Sheets",
              rawKey: "Excel.HiddenSheets",
              value: hiddenSheets.join(", "),
              dataType: "string",
              group: "embedded",
              parserId: this.id,
              isSensitive: true,
              sensitivityReason: "Hidden Excel tabs are omitted from normal view but remain readable in XML",
            })
          );
        }
      }
    }

    return {
      parserId: this.id,
      parserVersion: this.version,
      fields,
      structures,
      findings,
      warnings,
      coveragePatch: {
        headerInspected: true,
        footerInspected: true,
        containerIndexInspected: true,
      },
    };
  }

  private async readEntryText(ctx: ParserContext, entry: ZipCentralEntry): Promise<string | null> {
    if (entry.localHeaderOffset + 30 > ctx.reader.byteLength) return null;
    const lfh = await ctx.reader.read(entry.localHeaderOffset, 30, ctx.signal);
    if (lfh.byteLength < 30) return null;
    const dv = new DataView(lfh.buffer, lfh.byteOffset, 30);
    if (dv.getUint32(0, false) !== 0x504b0304) return null;

    const nameLen = dv.getUint16(26, true);
    const extraLen = dv.getUint16(28, true);
    const dataOffset = entry.localHeaderOffset + 30 + nameLen + extraLen;
    if (entry.compressedSize > MAX_XML_ENTRY_BYTES || dataOffset + entry.compressedSize > ctx.reader.byteLength) {
      return null;
    }

    const compressed = await ctx.reader.read(dataOffset, entry.compressedSize, ctx.signal);
    if (entry.compressionMethod === 0) {
      return new TextDecoder("utf-8", { fatal: false }).decode(compressed);
    }
    if (entry.compressionMethod === 8) {
      const out = inflateSync(compressed, { out: new Uint8Array(MAX_XML_ENTRY_BYTES) });
      return new TextDecoder("utf-8", { fatal: false }).decode(out);
    }
    return null;
  }
}
