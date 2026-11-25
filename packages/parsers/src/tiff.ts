import exifr from "exifr";
import type { FormatParser, ParserContext, ParserOutput } from "@trace/parser-registry";
import type { DetectedStructure, ForensicFinding, MetadataField } from "@trace/shared-types";
import { createMetadataField, emitAnomaly, emitStructure, isSensitiveTagKey } from "./helpers";

export class TiffParser implements FormatParser {
  readonly id = "tiff-ifd-parser";
  readonly version = "0.1.0";
  readonly supportedFormatIds = ["tiff"] as const;

  canParse(id: { formatId: string }): boolean {
    return id.formatId === "tiff";
  }

  async parse(ctx: ParserContext): Promise<ParserOutput> {
    const fields: MetadataField[] = [];
    const structures: DetectedStructure[] = [];
    const findings: ForensicFinding[] = [];
    const warnings: string[] = [];

    if (ctx.reader.byteLength < 8) {
      return { parserId: this.id, parserVersion: this.version, fields, structures, findings, warnings, coveragePatch: {} };
    }

    const hdr = await ctx.reader.read(0, 8, ctx.signal);
    const littleEndian = hdr[0] === 0x49 && hdr[1] === 0x49;
    const ifd0Offset = new DataView(hdr.buffer, hdr.byteOffset, 8).getUint32(4, littleEndian);

    structures.push(
      emitStructure(ctx, this.id, {
        id: "tiff-header",
        name: `TIFF Header (${littleEndian ? "Little-Endian" : "Big-Endian"})`,
        type: "tiff-header",
        byteRange: { start: 0, length: 8 },
      })
    );

    fields.push(
      createMetadataField(ctx, {
        idSuffix: "byte-order",
        fieldName: "TIFF Byte Order",
        rawKey: "TIFF.ByteOrder",
        value: littleEndian ? "Little-Endian (II)" : "Big-Endian (MM)",
        dataType: "string",
        group: "exif",
        parserId: this.id,
        byteRange: { start: 0, length: 2 },
      })
    );

    // Cycle-protected IFD chain walk
    const visitedIfds = new Set<number>();
    let currentIfd = ifd0Offset;
    let ifdIndex = 0;

    while (currentIfd >= 8 && currentIfd + 2 <= ctx.reader.byteLength && ifdIndex < 16) {
      if (visitedIfds.has(currentIfd)) {
        findings.push(
          emitAnomaly(ctx, this.id, {
            id: `${ctx.fileId}:tiff-ifd-cycle`,
            ruleId: "rule-tiff-ifd-cycle",
            category: "integrity",
            title: "Circular TIFF IFD pointer loop detected",
            severity: "high",
            explanation: `IFD pointer cycles back to already-visited offset 0x${currentIfd.toString(16)}.`,
            evidence: `IFD offset 0x${currentIfd.toString(16)} repeated.`,
            affectedFieldIds: [],
            byteRange: { start: currentIfd, length: 2 },
            whyItMatters: "Circular IFD pointers are malformed and commonly crafted to hang naive parsers.",
            suggestedAction: "Treat file cautiously and inspect IFD offsets.",
            detectionMethod: this.id,
            confidence: "confirmed",
          })
        );
        break;
      }
      visitedIfds.add(currentIfd);

      const countBuf = await ctx.reader.read(currentIfd, 2, ctx.signal);
      if (countBuf.byteLength < 2) break;
      const entryCount = new DataView(countBuf.buffer, countBuf.byteOffset, 2).getUint16(0, littleEndian);
      if (entryCount > 4096) {
        warnings.push(`TIFF IFD${ifdIndex} entry count (${entryCount}) capped for safety.`);
        break;
      }

      const ifdByteLen = 2 + entryCount * 12 + 4;
      if (currentIfd + ifdByteLen > ctx.reader.byteLength) break;

      structures.push(
        emitStructure(ctx, this.id, {
          id: `tiff-ifd-${ifdIndex}`,
          name: `IFD${ifdIndex} (${entryCount} entries)`,
          type: "tiff-ifd",
          byteRange: { start: currentIfd, length: ifdByteLen },
        })
      );

      const nextBuf = await ctx.reader.read(currentIfd + 2 + entryCount * 12, 4, ctx.signal);
      currentIfd = new DataView(nextBuf.buffer, nextBuf.byteOffset, 4).getUint32(0, littleEndian);
      ifdIndex++;
    }

    if (ctx.reader.byteLength <= 8 * 1024 * 1024) {
      try {
        const raw = await ctx.reader.read(0, ctx.reader.byteLength, ctx.signal);
        const parsed = await exifr.parse(raw, { tiff: true, exif: true, gps: true, xmp: true, iptc: true });
        if (parsed && typeof parsed === "object") {
          for (const [k, v] of Object.entries(parsed)) {
            if (v === undefined || v === null || ArrayBuffer.isView(v)) continue;
            const sens = isSensitiveTagKey(k);
            fields.push(
              createMetadataField(ctx, {
                idSuffix: `exifr-${k}`,
                fieldName: k,
                rawKey: k,
                value: v instanceof Date ? v.toISOString() : (v as MetadataField["value"]),
                dataType: v instanceof Date ? "date" : typeof v === "number" ? "number" : "string",
                group: k.toLowerCase().includes("gps") ? "gps" : "exif",
                parserId: "exifr",
                isSensitive: sens.sensitive,
                sensitivityReason: sens.reason,
              })
            );
          }
        }
      } catch {
        warnings.push("exifr failed to decode TIFF tags.");
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
        containerIndexInspected: true,
      },
    };
  }
}
