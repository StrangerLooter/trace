import exifr from "exifr";
import type { FormatParser, ParserContext, ParserOutput } from "@trace/parser-registry";
import type { DetectedStructure, ForensicFinding, MetadataField } from "@trace/shared-types";
import { createMetadataField, emitStructure, isSensitiveTagKey } from "./helpers";

export class WebpParser implements FormatParser {
  readonly id = "webp-riff-parser";
  readonly version = "0.1.0";
  readonly supportedFormatIds = ["webp"] as const;

  canParse(id: { formatId: string }): boolean {
    return id.formatId === "webp";
  }

  async parse(ctx: ParserContext): Promise<ParserOutput> {
    const fields: MetadataField[] = [];
    const structures: DetectedStructure[] = [];
    const findings: ForensicFinding[] = [];
    const warnings: string[] = [];
    const totalSize = ctx.reader.byteLength;

    if (totalSize < 12) {
      return { parserId: this.id, parserVersion: this.version, fields, structures, findings, warnings, coveragePatch: {} };
    }

    structures.push(
      emitStructure(ctx, this.id, {
        id: "webp-riff",
        name: "RIFF WEBP Header",
        type: "riff-header",
        byteRange: { start: 0, length: 12 },
      })
    );

    let offset = 12;
    let count = 0;

    while (offset + 8 <= totalSize && count < 512) {
      count++;
      const ch = await ctx.reader.read(offset, 8, ctx.signal);
      if (ch.byteLength < 8) break;
      const fourcc = String.fromCharCode(ch[0], ch[1], ch[2], ch[3]);
      const chunkSize = new DataView(ch.buffer, ch.byteOffset, 8).getUint32(4, true);
      const paddedSize = chunkSize + (chunkSize % 2);
      const fullLen = 8 + paddedSize;

      if (offset + 8 + chunkSize > totalSize) {
        warnings.push(`WebP chunk '${fourcc}' exceeds file size.`);
        break;
      }

      structures.push(
        emitStructure(ctx, this.id, {
          id: `webp-${fourcc}-${offset}`,
          name: `${fourcc.trim()} Chunk`,
          type: "riff-chunk",
          byteRange: { start: offset, length: Math.min(fullLen, totalSize - offset) },
        })
      );

      if (fourcc === "VP8X" && chunkSize >= 10) {
        const vp8x = await ctx.reader.read(offset + 8, 10, ctx.signal);
        const width = 1 + (vp8x[4] | (vp8x[5] << 8) | (vp8x[6] << 16));
        const height = 1 + (vp8x[7] | (vp8x[8] << 8) | (vp8x[9] << 16));
        fields.push(
          createMetadataField(ctx, {
            idSuffix: "width",
            fieldName: "Image Width",
            rawKey: "VP8X.CanvasWidth",
            value: width,
            displayValue: `${width} px`,
            dataType: "number",
            group: "general",
            parserId: this.id,
            byteRange: { start: offset + 12, length: 3 },
          }),
          createMetadataField(ctx, {
            idSuffix: "height",
            fieldName: "Image Height",
            rawKey: "VP8X.CanvasHeight",
            value: height,
            displayValue: `${height} px`,
            dataType: "number",
            group: "general",
            parserId: this.id,
            byteRange: { start: offset + 15, length: 3 },
          })
        );
      } else if (fourcc === "EXIF" && chunkSize > 0 && chunkSize <= 2 * 1024 * 1024) {
        const exifRaw = await ctx.reader.read(offset + 8, chunkSize, ctx.signal);
        try {
          const parsed = await exifr.parse(exifRaw, { tiff: true, exif: true, gps: true });
          if (parsed && typeof parsed === "object") {
            for (const [k, v] of Object.entries(parsed)) {
              if (v === undefined || v === null || ArrayBuffer.isView(v)) continue;
              const sens = isSensitiveTagKey(k);
              fields.push(
                createMetadataField(ctx, {
                  idSuffix: `exif-${k}`,
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
          warnings.push("Failed to parse WebP EXIF chunk.");
        }
      } else if (fourcc === "XMP " && chunkSize > 0 && chunkSize <= 1024 * 1024) {
        const xmpBytes = await ctx.reader.read(offset + 8, chunkSize, ctx.signal);
        const text = new TextDecoder("utf-8", { fatal: false }).decode(xmpBytes);
        fields.push(
          createMetadataField(ctx, {
            idSuffix: "xmp",
            fieldName: "XMP Packet",
            rawKey: "XMP",
            value: text.length > 2000 ? `${text.slice(0, 2000)}...` : text,
            dataType: "string",
            group: "xmp",
            parserId: this.id,
            byteRange: { start: offset + 8, length: chunkSize },
            isSensitive: true,
            sensitivityReason: "Embedded XMP metadata packet",
          })
        );
      }

      offset += fullLen;
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
        completeFileScanned: offset >= totalSize,
      },
    };
  }
}
