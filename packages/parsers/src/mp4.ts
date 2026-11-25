import type { FormatParser, ParserContext, ParserOutput } from "@trace/parser-registry";
import type { DetectedStructure, ForensicFinding, MetadataField } from "@trace/shared-types";
import { createMetadataField, emitStructure, isSensitiveTagKey } from "./helpers";

const MP4_EPOCH_OFFSET_SECONDS = 2082844800; // Seconds between 1904-01-01 and 1970-01-01

function mp4TimeToIso(secondsSince1904: number): string | null {
  if (!Number.isFinite(secondsSince1904) || secondsSince1904 <= 0) return null;
  const unixMs = (secondsSince1904 - MP4_EPOCH_OFFSET_SECONDS) * 1000;
  if (unixMs < 0 || unixMs > 4102444800000) return null;
  return new Date(unixMs).toISOString();
}

const ILST_TAGS: Record<string, string> = {
  "\u00a9nam": "Title",
  "\u00a9ART": "Artist",
  "\u00a9alb": "Album",
  "\u00a9day": "Release / Creation Date",
  "\u00a9too": "Encoder Tool",
  "\u00a9cmt": "Comment",
  "\u00a9xyz": "GPS Location",
};

interface BoxHeader {
  type: string;
  size: number;
  headerSize: number;
}

async function readBoxHeader(
  ctx: ParserContext,
  offset: number,
  endLimit: number
): Promise<BoxHeader | null> {
  if (offset + 8 > endLimit) return null;
  const hdr = await ctx.reader.read(offset, 8, ctx.signal);
  if (hdr.byteLength < 8) return null;
  const dv = new DataView(hdr.buffer, hdr.byteOffset, 8);
  const size32 = dv.getUint32(0, false);
  const type = String.fromCharCode(hdr[4], hdr[5], hdr[6], hdr[7]);

  if (size32 === 1) {
    if (offset + 16 > endLimit) return null;
    const ext = await ctx.reader.read(offset + 8, 8, ctx.signal);
    const size64 = Number(new DataView(ext.buffer, ext.byteOffset, 8).getBigUint64(0, false));
    if (!Number.isSafeInteger(size64) || size64 < 16) return null;
    return { type, size: size64, headerSize: 16 };
  }
  if (size32 === 0) {
    return { type, size: endLimit - offset, headerSize: 8 };
  }
  if (size32 < 8) return null;
  return { type, size: size32, headerSize: 8 };
}

export class Mp4Parser implements FormatParser {
  readonly id = "isobmff-box-parser";
  readonly version = "0.1.0";
  readonly supportedFormatIds = ["mp4", "mov", "m4a"] as const;

  canParse(id: { formatId: string }): boolean {
    return id.formatId === "mp4" || id.formatId === "mov" || id.formatId === "m4a";
  }

  async parse(ctx: ParserContext): Promise<ParserOutput> {
    const fields: MetadataField[] = [];
    const structures: DetectedStructure[] = [];
    const findings: ForensicFinding[] = [];
    const warnings: string[] = [];
    const totalSize = ctx.reader.byteLength;

    let offset = 0;
    let topCount = 0;
    let sawMoov = false;
    let mdatBytes = 0;

    // Walk top-level boxes; skip mdat payloads via offset math so 5 GB files take milliseconds
    while (offset + 8 <= totalSize && topCount < 256) {
      topCount++;
      const box = await readBoxHeader(ctx, offset, totalSize);
      if (!box || offset + box.size > totalSize) {
        warnings.push(`ISOBMFF box parse stopped at 0x${offset.toString(16)}.`);
        break;
      }

      const boxNode = emitStructure(ctx, this.id, {
        id: `box-${box.type}-${offset}`,
        name: `${box.type} Box`,
        type: "isobmff-box",
        byteRange: { start: offset, length: box.size },
        children: [],
      });
      structures.push(boxNode);

      if (box.type === "ftyp" && box.size >= 12) {
        const ftyp = await ctx.reader.read(offset + box.headerSize, 4, ctx.signal);
        const majorBrand = String.fromCharCode(...ftyp);
        fields.push(
          createMetadataField(ctx, {
            idSuffix: "major-brand",
            fieldName: "Major Brand",
            rawKey: "ftyp.major_brand",
            value: majorBrand,
            dataType: "string",
            group: "video",
            parserId: this.id,
            byteRange: { start: offset + box.headerSize, length: 4 },
          })
        );
      } else if (box.type === "mdat") {
        mdatBytes += box.size;
      } else if (box.type === "moov") {
        sawMoov = true;
        await this.walkMoov(ctx, offset + box.headerSize, offset + box.size, boxNode, fields);
      }

      offset += box.size;
    }

    const uninspectedReasons: string[] = [];
    if (mdatBytes > 0) {
      uninspectedReasons.push(
        `Media mdat payload (${mdatBytes} bytes) skipped in local container-header mode.`
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
        footerInspected: offset === totalSize,
        containerIndexInspected: sawMoov,
        completeFileScanned: mdatBytes === 0 && offset === totalSize,
        uninspectedReasons,
      },
    };
  }

  private async walkMoov(
    ctx: ParserContext,
    start: number,
    end: number,
    parent: DetectedStructure,
    fields: MetadataField[],
    depth = 0
  ): Promise<void> {
    if (depth > 4) return;
    let pos = start;
    let count = 0;

    while (pos + 8 <= end && count < 128) {
      count++;
      const box = await readBoxHeader(ctx, pos, end);
      if (!box || pos + box.size > end) break;

      const node = emitStructure(ctx, this.id, {
        id: `box-${box.type}-${pos}`,
        name: `${box.type} Box`,
        type: "isobmff-box",
        byteRange: { start: pos, length: box.size },
        parentId: parent.id,
        children: [],
      });
      parent.children?.push(node);

      const payloadStart = pos + box.headerSize;
      const payloadLen = box.size - box.headerSize;

      if (box.type === "mvhd" && payloadLen >= 24) {
        const buf = await ctx.reader.read(payloadStart, Math.min(payloadLen, 36), ctx.signal);
        const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
        const version = buf[0];
        if (version === 0 && buf.byteLength >= 20) {
          const created = mp4TimeToIso(dv.getUint32(4, false));
          const timescale = dv.getUint32(12, false);
          const duration = dv.getUint32(16, false);
          if (created) {
            fields.push(
              createMetadataField(ctx, {
                idSuffix: "mvhd-created",
                fieldName: "Container Creation Time",
                rawKey: "mvhd.creation_time",
                value: created,
                dataType: "date",
                group: "video",
                parserId: this.id,
                byteRange: { start: payloadStart + 4, length: 4 },
                isSensitive: true,
                sensitivityReason: "Reveals media recording or muxing timestamp",
              })
            );
          }
          if (timescale > 0) {
            const secs = Number((duration / timescale).toFixed(2));
            fields.push(
              createMetadataField(ctx, {
                idSuffix: "duration",
                fieldName: "Duration",
                rawKey: "mvhd.duration",
                value: secs,
                displayValue: `${secs} s`,
                dataType: "number",
                group: "video",
                parserId: this.id,
                byteRange: { start: payloadStart + 12, length: 8 },
              })
            );
          }
        }
      } else if (box.type === "tkhd" && payloadLen >= 84) {
        const buf = await ctx.reader.read(payloadStart, Math.min(payloadLen, 84), ctx.signal);
        const version = buf[0];
        if (version === 0 && buf.byteLength >= 84) {
          const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
          const width = dv.getUint32(76, false) >>> 16;
          const height = dv.getUint32(80, false) >>> 16;
          if (width > 0 && height > 0) {
            fields.push(
              createMetadataField(ctx, {
                idSuffix: `tkhd-res-${pos}`,
                fieldName: "Track Dimensions",
                rawKey: "tkhd.dimensions",
                value: `${width}x${height}`,
                dataType: "string",
                group: "video",
                parserId: this.id,
                byteRange: { start: payloadStart + 76, length: 8 },
              })
            );
          }
        }
      } else if (box.type === "udta" || box.type === "trak" || box.type === "ilst") {
        await this.walkMoov(ctx, payloadStart, pos + box.size, node, fields, depth + 1);
      } else if (box.type === "meta" && payloadLen > 12) {
        // FullBox (4 bytes version/flags) before sub-boxes
        await this.walkMoov(ctx, payloadStart + 4, pos + box.size, node, fields, depth + 1);
      } else if (ILST_TAGS[box.type] && payloadLen > 16 && payloadLen <= 65536) {
        const item = await ctx.reader.read(payloadStart, payloadLen, ctx.signal);
        // Look for nested 'data' atom inside ilst entry
        const dataIdx = item.indexOf(0x64); // quick scan for 'data'
        if (
          dataIdx >= 4 &&
          dataIdx + 12 <= item.byteLength &&
          item[dataIdx + 1] === 0x61 &&
          item[dataIdx + 2] === 0x74 &&
          item[dataIdx + 3] === 0x61
        ) {
          const text = new TextDecoder("utf-8", { fatal: false })
            .decode(item.subarray(dataIdx + 12))
            .replace(/\0+$/, "")
            .trim();
          if (text) {
            const label = ILST_TAGS[box.type];
            const sens = isSensitiveTagKey(label);
            fields.push(
              createMetadataField(ctx, {
                idSuffix: `ilst-${pos}`,
                fieldName: label,
                rawKey: `ilst.${box.type}`,
                value: text,
                dataType: "string",
                group: box.type === "\u00a9xyz" ? "gps" : "video",
                parserId: this.id,
                byteRange: { start: pos, length: box.size },
                isSensitive: sens.sensitive || box.type === "\u00a9xyz",
                sensitivityReason: sens.reason ?? "Embedded location tag in video container",
              })
            );
          }
        }
      }

      pos += box.size;
    }
  }
}
