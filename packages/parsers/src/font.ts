import { unzlibSync } from "fflate";
import type { FormatParser, ParserContext, ParserOutput } from "@trace/parser-registry";
import type { DetectedStructure, ForensicFinding, MetadataField } from "@trace/shared-types";
import { createMetadataField, emitStructure, isSensitiveTagKey } from "./helpers";

const SFNT_NAME_IDS: Record<number, string> = {
  0: "Copyright",
  1: "Font Family",
  2: "Subfamily",
  4: "Full Font Name",
  5: "Version",
  8: "Manufacturer / Designer",
  9: "Designer",
  11: "Vendor URL",
  13: "License Description",
  14: "License URL",
};

/** Extracts SFNT `name` table metadata from TTF, OTF, and WOFF fonts using bounded reads. */
export class FontMetadataParser implements FormatParser {
  readonly id = "font-sfnt-parser";
  readonly version = "0.1.0";
  readonly supportedFormatIds = ["ttf", "otf", "woff"] as const;

  canParse(id: { formatId: string }): boolean {
    return id.formatId === "ttf" || id.formatId === "otf" || id.formatId === "woff";
  }

  async parse(ctx: ParserContext): Promise<ParserOutput> {
    const fields: MetadataField[] = [];
    const structures: DetectedStructure[] = [];
    const findings: ForensicFinding[] = [];
    const warnings: string[] = [];
    const totalSize = ctx.reader.byteLength;
    const isWoff = ctx.identification.formatId === "woff";

    if (totalSize < (isWoff ? 44 : 12)) {
      return { parserId: this.id, parserVersion: this.version, fields, structures, findings, warnings, coveragePatch: { headerInspected: true } };
    }

    let nameTableOffset = 0;
    let nameTableCompLen = 0;
    let nameTableOrigLen = 0;

    if (isWoff) {
      const hdr = await ctx.reader.read(0, 44, ctx.signal);
      const dv = new DataView(hdr.buffer, hdr.byteOffset, 44);
      const numTables = dv.getUint16(12, false);
      structures.push(
        emitStructure(ctx, this.id, {
          id: "woff-header",
          name: `WOFF Header (${numTables} tables)`,
          type: "woff-header",
          byteRange: { start: 0, length: 44 },
        })
      );
      const dirBytesLen = Math.min(numTables, 64) * 20;
      if (44 + dirBytesLen <= totalSize) {
        const dir = await ctx.reader.read(44, dirBytesLen, ctx.signal);
        for (let i = 0; i < Math.min(numTables, 64); i++) {
          const base = i * 20;
          const tag = String.fromCharCode(dir[base], dir[base + 1], dir[base + 2], dir[base + 3]);
          if (tag === "name") {
            const tdv = new DataView(dir.buffer, dir.byteOffset + base, 20);
            nameTableOffset = tdv.getUint32(4, false);
            nameTableCompLen = tdv.getUint32(8, false);
            nameTableOrigLen = tdv.getUint32(12, false);
            break;
          }
        }
      }
    } else {
      const hdr = await ctx.reader.read(0, 12, ctx.signal);
      const numTables = new DataView(hdr.buffer, hdr.byteOffset, 12).getUint16(4, false);
      structures.push(
        emitStructure(ctx, this.id, {
          id: "sfnt-offset-table",
          name: `SFNT Offset Table (${numTables} tables)`,
          type: "sfnt-header",
          byteRange: { start: 0, length: 12 },
        })
      );
      const dirLen = Math.min(numTables, 64) * 16;
      if (12 + dirLen <= totalSize) {
        const dir = await ctx.reader.read(12, dirLen, ctx.signal);
        for (let i = 0; i < Math.min(numTables, 64); i++) {
          const base = i * 16;
          const tag = String.fromCharCode(dir[base], dir[base + 1], dir[base + 2], dir[base + 3]);
          if (tag === "name") {
            const tdv = new DataView(dir.buffer, dir.byteOffset + base, 16);
            nameTableOffset = tdv.getUint32(8, false);
            nameTableOrigLen = tdv.getUint32(12, false);
            nameTableCompLen = nameTableOrigLen;
            break;
          }
        }
      }
    }

    if (nameTableOffset > 0 && nameTableCompLen > 6 && nameTableOrigLen <= 512 * 1024 && nameTableOffset + nameTableCompLen <= totalSize) {
      const rawName = await ctx.reader.read(nameTableOffset, nameTableCompLen, ctx.signal);
      let tableBytes = rawName;
      if (isWoff && nameTableCompLen < nameTableOrigLen) {
        try {
          tableBytes = unzlibSync(rawName, { out: new Uint8Array(nameTableOrigLen) });
        } catch {
          warnings.push("Failed to decompress WOFF name table.");
          tableBytes = new Uint8Array(0);
        }
      }

      if (tableBytes.byteLength >= 6) {
        structures.push(
          emitStructure(ctx, this.id, {
            id: "font-name-table",
            name: "SFNT 'name' Metadata Table",
            type: "sfnt-table",
            byteRange: { start: nameTableOffset, length: nameTableCompLen },
          })
        );
        const ndv = new DataView(tableBytes.buffer, tableBytes.byteOffset, tableBytes.byteLength);
        const recCount = Math.min(ndv.getUint16(2, false), 128);
        const stringOffset = ndv.getUint16(4, false);
        const seen = new Set<number>();

        for (let i = 0; i < recCount && 6 + (i + 1) * 12 <= tableBytes.byteLength; i++) {
          const recPos = 6 + i * 12;
          const platformId = ndv.getUint16(recPos, false);
          const nameId = ndv.getUint16(recPos + 6, false);
          const len = ndv.getUint16(recPos + 8, false);
          const off = ndv.getUint16(recPos + 10, false);
          if (!SFNT_NAME_IDS[nameId] || seen.has(nameId)) continue;
          const absStrStart = stringOffset + off;
          if (absStrStart + len > tableBytes.byteLength || len === 0 || len > 4096) continue;

          const slice = tableBytes.subarray(absStrStart, absStrStart + len);
          let text = "";
          if (platformId === 3 || platformId === 0) {
            const chars: string[] = [];
            for (let k = 0; k + 1 < slice.byteLength; k += 2) {
              chars.push(String.fromCharCode((slice[k] << 8) | slice[k + 1]));
            }
            text = chars.join("").trim();
          } else {
            text = new TextDecoder("latin1").decode(slice).trim();
          }
          if (!text) continue;
          seen.add(nameId);
          const label = SFNT_NAME_IDS[nameId];
          const sens = isSensitiveTagKey(label);
          fields.push(
            createMetadataField(ctx, {
              idSuffix: `name-${nameId}`,
              fieldName: label,
              rawKey: `Font.name.${nameId}`,
              value: text,
              dataType: "string",
              group: "general",
              parserId: this.id,
              byteRange: isWoff ? undefined : { start: nameTableOffset + absStrStart, length: len },
              isSensitive: sens.sensitive || nameId === 8 || nameId === 9,
              sensitivityReason: sens.reason ?? "Font table may reveal designer or vendor licensing terms",
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
        containerIndexInspected: nameTableOffset > 0,
      },
    };
  }
}
