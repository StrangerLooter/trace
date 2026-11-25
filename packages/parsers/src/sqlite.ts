import type { FormatParser, ParserContext, ParserOutput } from "@trace/parser-registry";
import type { DetectedStructure, ForensicFinding, MetadataField } from "@trace/shared-types";
import { createMetadataField, emitStructure } from "./helpers";

const SQLITE_ENCODINGS: Record<number, string> = {
  1: "UTF-8",
  2: "UTF-16le",
  3: "UTF-16be",
};

/** Bounded read-only SQLite 3 header inspector (never executes SQL or loads tables). */
export class SqliteHeaderParser implements FormatParser {
  readonly id = "sqlite-header-parser";
  readonly version = "0.1.0";
  readonly supportedFormatIds = ["sqlite"] as const;

  canParse(id: { formatId: string }): boolean {
    return id.formatId === "sqlite";
  }

  async parse(ctx: ParserContext): Promise<ParserOutput> {
    const fields: MetadataField[] = [];
    const structures: DetectedStructure[] = [];
    const findings: ForensicFinding[] = [];
    const warnings: string[] = [];

    if (ctx.reader.byteLength < 100) {
      warnings.push("SQLite database header truncated (< 100 bytes).");
      return { parserId: this.id, parserVersion: this.version, fields, structures, findings, warnings, coveragePatch: { headerInspected: true } };
    }

    const hdr = await ctx.reader.read(0, 100, ctx.signal);
    const dv = new DataView(hdr.buffer, hdr.byteOffset, 100);
    const rawPageSize = dv.getUint16(16, false);
    const pageSize = rawPageSize === 1 ? 65536 : rawPageSize;
    const writeFormat = hdr[18];
    const readFormat = hdr[19];
    const pageCount = dv.getUint32(28, false);
    const freelistPages = dv.getUint32(36, false);
    const schemaCookie = dv.getUint32(40, false);
    const textEncoding = dv.getUint32(56, false);
    const userVersion = dv.getUint32(60, false);
    const applicationId = dv.getUint32(68, false);
    const sqliteVersion = dv.getUint32(96, false);

    structures.push(
      emitStructure(ctx, this.id, {
        id: "sqlite-db-header",
        name: "SQLite 3 Database File Header",
        type: "sqlite-header",
        byteRange: { start: 0, length: 100 },
      })
    );

    fields.push(
      createMetadataField(ctx, {
        idSuffix: "page-size",
        fieldName: "Page Size",
        rawKey: "SQLite.PageSize",
        value: pageSize,
        displayValue: `${pageSize} bytes`,
        dataType: "number",
        group: "binary",
        parserId: this.id,
        byteRange: { start: 16, length: 2 },
      }),
      createMetadataField(ctx, {
        idSuffix: "journal-mode",
        fieldName: "Format Version (Write/Read)",
        rawKey: "SQLite.FormatVersion",
        value: `${writeFormat === 2 ? "WAL (2)" : `Rollback (${writeFormat})`} / ${readFormat}`,
        dataType: "string",
        group: "binary",
        parserId: this.id,
        byteRange: { start: 18, length: 2 },
      }),
      createMetadataField(ctx, {
        idSuffix: "page-count",
        fieldName: "Database Page Count",
        rawKey: "SQLite.PageCount",
        value: pageCount,
        dataType: "number",
        group: "binary",
        parserId: this.id,
        byteRange: { start: 28, length: 4 },
      }),
      createMetadataField(ctx, {
        idSuffix: "freelist",
        fieldName: "Freelist (Deleted) Pages",
        rawKey: "SQLite.FreelistPages",
        value: freelistPages,
        dataType: "number",
        group: "binary",
        parserId: this.id,
        byteRange: { start: 36, length: 4 },
        isSensitive: freelistPages > 0,
        sensitivityReason: freelistPages > 0 ? "Unvacuumed SQLite freelist pages can retain deleted row fragments" : undefined,
      }),
      createMetadataField(ctx, {
        idSuffix: "encoding",
        fieldName: "Text Encoding",
        rawKey: "SQLite.TextEncoding",
        value: SQLITE_ENCODINGS[textEncoding] ?? `Code ${textEncoding}`,
        dataType: "string",
        group: "binary",
        parserId: this.id,
        byteRange: { start: 56, length: 4 },
      }),
      createMetadataField(ctx, {
        idSuffix: "schema-cookie",
        fieldName: "Schema Cookie / User Version",
        rawKey: "SQLite.Versions",
        value: `cookie=${schemaCookie}, user_version=${userVersion}, app_id=0x${applicationId.toString(16).toUpperCase()}`,
        dataType: "string",
        group: "binary",
        parserId: this.id,
        byteRange: { start: 40, length: 32 },
      }),
      createMetadataField(ctx, {
        idSuffix: "sqlite-version",
        fieldName: "SQLite Library Version",
        rawKey: "SQLite.SQLiteVersionNumber",
        value: sqliteVersion,
        dataType: "number",
        group: "general",
        parserId: this.id,
        byteRange: { start: 96, length: 4 },
        isSensitive: true,
        sensitivityReason: "Reveals SQLite engine version used during last write",
      })
    );

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
        uninspectedReasons: ["SQLite B-tree table pages are not queried in static header mode."],
      },
    };
  }
}
