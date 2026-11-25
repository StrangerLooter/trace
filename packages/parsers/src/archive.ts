import type { FormatParser, ParserContext, ParserOutput } from "@trace/parser-registry";
import type { DetectedStructure, ForensicFinding, MetadataField } from "@trace/shared-types";
import { createMetadataField, emitStructure } from "./helpers";

/** Bounded header parser for 7-Zip (.7z) and RAR4/RAR5 (.rar) containers. */
export class ArchiveHeaderParser implements FormatParser {
  readonly id = "archive-header-parser";
  readonly version = "0.1.0";
  readonly supportedFormatIds = ["7z", "rar"] as const;

  canParse(id: { formatId: string }): boolean {
    return id.formatId === "7z" || id.formatId === "rar";
  }

  async parse(ctx: ParserContext): Promise<ParserOutput> {
    const fields: MetadataField[] = [];
    const structures: DetectedStructure[] = [];
    const findings: ForensicFinding[] = [];
    const warnings: string[] = [];
    const totalSize = ctx.reader.byteLength;

    if (ctx.identification.formatId === "7z" && totalSize >= 32) {
      const hdr = await ctx.reader.read(0, 32, ctx.signal);
      const dv = new DataView(hdr.buffer, hdr.byteOffset, 32);
      const majorVer = hdr[6];
      const minorVer = hdr[7];
      const nextHdrOffset = Number(dv.getBigUint64(12, true));
      const nextHdrSize = Number(dv.getBigUint64(20, true));

      structures.push(
        emitStructure(ctx, this.id, {
          id: "7z-start-header",
          name: "7-Zip Start Header",
          type: "7z-header",
          byteRange: { start: 0, length: 32 },
        })
      );

      fields.push(
        createMetadataField(ctx, {
          idSuffix: "7z-ver",
          fieldName: "7z Format Version",
          rawKey: "7z.Version",
          value: `${majorVer}.${minorVer}`,
          dataType: "string",
          group: "archive",
          parserId: this.id,
          byteRange: { start: 6, length: 2 },
        }),
        createMetadataField(ctx, {
          idSuffix: "7z-next-hdr",
          fieldName: "Encoded End Header Offset",
          rawKey: "7z.NextHeaderOffset",
          value: `0x${(32 + nextHdrOffset).toString(16).toUpperCase()} (${nextHdrSize} B)`,
          dataType: "string",
          group: "archive",
          parserId: this.id,
          byteRange: { start: 12, length: 16 },
        })
      );
    } else if (ctx.identification.formatId === "rar" && totalSize >= 8) {
      const hdr = await ctx.reader.read(0, Math.min(totalSize, 64), ctx.signal);
      const isRar5 = hdr[6] === 0x01 && hdr[7] === 0x00;

      structures.push(
        emitStructure(ctx, this.id, {
          id: "rar-sig",
          name: isRar5 ? "RAR 5.0 Signature" : "RAR 4.x Signature",
          type: "rar-header",
          byteRange: { start: 0, length: isRar5 ? 8 : 7 },
        })
      );

      fields.push(
        createMetadataField(ctx, {
          idSuffix: "rar-gen",
          fieldName: "RAR Generation",
          rawKey: "RAR.FormatVersion",
          value: isRar5 ? "RAR 5.0" : "RAR 4.x",
          dataType: "string",
          group: "archive",
          parserId: this.id,
          byteRange: { start: 0, length: isRar5 ? 8 : 7 },
        })
      );
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
        containerIndexInspected: false,
        uninspectedReasons: ["Compressed archive member tables require dedicated unpacking libraries not loaded locally."],
      },
    };
  }
}
