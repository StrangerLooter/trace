import exifr from "exifr";
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
  "\u00a9mak": "Device Make",
  "\u00a9mod": "Device Model",
  "\u00a9swr": "Recording Software",
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
  readonly version = "0.2.0";
  readonly supportedFormatIds = ["mp4", "mov", "m4a", "heic", "avif"] as const;

  canParse(id: { formatId: string }): boolean {
    return ["mp4", "mov", "m4a", "heic", "avif"].includes(id.formatId);
  }

  async parse(ctx: ParserContext): Promise<ParserOutput> {
    const fields: MetadataField[] = [];
    const structures: DetectedStructure[] = [];
    const findings: ForensicFinding[] = [];
    const warnings: string[] = [];
    const totalSize = ctx.reader.byteLength;
    const isImageContainer =
      ctx.identification.formatId === "heic" || ctx.identification.formatId === "avif";
    const defaultGroup = isImageContainer ? "camera" : "video";

    let offset = 0;
    let topCount = 0;
    let sawContainerMeta = false;
    let mdatBytes = 0;
    let firstMdatOffset = -1;
    let firstMdatSize = 0;

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
            group: defaultGroup,
            parserId: this.id,
            byteRange: { start: offset + box.headerSize, length: 4 },
          })
        );
      } else if (box.type === "mdat") {
        if (firstMdatOffset < 0) {
          firstMdatOffset = offset + box.headerSize;
          firstMdatSize = box.size - box.headerSize;
        }
        mdatBytes += box.size;
      } else if (box.type === "moov") {
        sawContainerMeta = true;
        await this.walkMoov(ctx, offset + box.headerSize, offset + box.size, boxNode, fields, 0, defaultGroup);
      } else if (box.type === "meta" && box.size > box.headerSize + 4) {
        sawContainerMeta = true;
        await this.walkMoov(
          ctx,
          offset + box.headerSize + 4,
          offset + box.size,
          boxNode,
          fields,
          0,
          defaultGroup
        );
      }

      offset += box.size;
    }

    // Extract embedded TIFF/EXIF from HEIC/AVIF bounded window without buffering huge media streams
    if (isImageContainer && totalSize <= 25 * 1024 * 1024) {
      const scanRanges: Array<{ start: number; len: number }> = [
        { start: 0, len: Math.min(totalSize, 512 * 1024) },
      ];
      if (firstMdatOffset > 0 && firstMdatOffset < totalSize && firstMdatSize > 0) {
        scanRanges.push({
          start: firstMdatOffset,
          len: Math.min(firstMdatSize, 256 * 1024),
        });
      }
      for (const range of scanRanges) {
        const slice = await ctx.reader.read(range.start, range.len, ctx.signal);
        const exifHeaderOffset = this.findTiffAfterExifMarker(slice);
        if (exifHeaderOffset >= 0) {
          const tiffBytes = slice.subarray(exifHeaderOffset);
          await this.parseEmbeddedExifTiff(ctx, tiffBytes, fields, warnings);
          break;
        }
      }
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
        containerIndexInspected: sawContainerMeta,
        completeFileScanned: mdatBytes === 0 && offset === totalSize,
        uninspectedReasons,
      },
    };
  }

  private findTiffAfterExifMarker(bytes: Uint8Array): number {
    for (let i = 0; i + 10 < bytes.byteLength; i++) {
      if (
        bytes[i] === 0x45 && // E
        bytes[i + 1] === 0x78 && // x
        bytes[i + 2] === 0x69 && // i
        bytes[i + 3] === 0x66 && // f
        bytes[i + 4] === 0x00 &&
        bytes[i + 5] === 0x00
      ) {
        const t = i + 6;
        if (
          (bytes[t] === 0x49 && bytes[t + 1] === 0x49 && bytes[t + 2] === 0x2a && bytes[t + 3] === 0x00) ||
          (bytes[t] === 0x4d && bytes[t + 1] === 0x4d && bytes[t + 2] === 0x00 && bytes[t + 3] === 0x2a)
        ) {
          return t;
        }
      }
    }
    return -1;
  }

  private async parseEmbeddedExifTiff(
    ctx: ParserContext,
    tiffBytes: Uint8Array,
    fields: MetadataField[],
    warnings: string[]
  ): Promise<void> {
    try {
      const parsed = await exifr.parse(tiffBytes, {
        tiff: true,
        exif: true,
        gps: true,
        xmp: false,
        makerNote: false,
      });
      if (!parsed || typeof parsed !== "object") return;
      for (const [key, rawVal] of Object.entries(parsed)) {
        if (rawVal === undefined || rawVal === null) continue;
        if (rawVal instanceof Uint8Array || ArrayBuffer.isView(rawVal)) continue;

        const sens = isSensitiveTagKey(key);
        let group: MetadataField["group"] = "exif";
        if (key.toLowerCase().includes("gps") || key === "latitude" || key === "longitude") {
          group = "gps";
        } else if (["Make", "Model", "LensModel", "LensMake", "BodySerialNumber", "SerialNumber"].includes(key)) {
          group = "camera";
        }
        const valueStr = rawVal instanceof Date ? rawVal.toISOString() : String(rawVal);
        fields.push(
          createMetadataField(ctx, {
            idSuffix: `heic-exifr-${key}`,
            fieldName: key,
            rawKey: `EXIF.${key}`,
            value: rawVal instanceof Date ? rawVal.toISOString() : (rawVal as MetadataField["value"]),
            displayValue: valueStr,
            dataType:
              rawVal instanceof Date
                ? "date"
                : typeof rawVal === "number"
                  ? "number"
                  : typeof rawVal === "boolean"
                    ? "boolean"
                    : "string",
            group,
            parserId: "exifr",
            isSensitive: sens.sensitive,
            sensitivityReason: sens.reason,
          })
        );
      }
    } catch (err) {
      warnings.push(`HEIC/AVIF EXIF decode warning: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  private async walkMoov(
    ctx: ParserContext,
    start: number,
    end: number,
    parent: DetectedStructure,
    fields: MetadataField[],
    depth = 0,
    defaultGroup: MetadataField["group"] = "video"
  ): Promise<void> {
    if (depth > 5) return;
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

      if (box.type === "ispe" && payloadLen >= 12) {
        const buf = await ctx.reader.read(payloadStart, 12, ctx.signal);
        const dv = new DataView(buf.buffer, buf.byteOffset, 12);
        const width = dv.getUint32(4, false);
        const height = dv.getUint32(8, false);
        if (width > 0 && height > 0) {
          fields.push(
            createMetadataField(ctx, {
              idSuffix: `ispe-${pos}`,
              fieldName: "Image Dimensions",
              rawKey: "ispe.dimensions",
              value: `${width}x${height}`,
              dataType: "string",
              group: defaultGroup,
              parserId: this.id,
              byteRange: { start: payloadStart + 4, length: 8 },
            })
          );
        }
      } else if (box.type === "irot" && payloadLen >= 1) {
        const buf = await ctx.reader.read(payloadStart, 1, ctx.signal);
        const degrees = (buf[0] & 0x03) * 90;
        fields.push(
          createMetadataField(ctx, {
            idSuffix: `irot-${pos}`,
            fieldName: "Image Rotation",
            rawKey: "irot.angle",
            value: degrees,
            displayValue: `${degrees}°`,
            dataType: "number",
            group: defaultGroup,
            parserId: this.id,
            byteRange: { start: payloadStart, length: 1 },
          })
        );
      } else if (box.type === "mvhd" && payloadLen >= 24) {
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
      } else if (["udta", "trak", "ilst", "iprp", "ipco", "mdia", "minf", "stbl"].includes(box.type)) {
        await this.walkMoov(ctx, payloadStart, pos + box.size, node, fields, depth + 1, defaultGroup);
      } else if (box.type === "stsd" && payloadLen >= 16) {
        const stsd = await ctx.reader.read(payloadStart, Math.min(payloadLen, 32), ctx.signal);
        const codec = String.fromCharCode(stsd[12], stsd[13], stsd[14], stsd[15]).trim();
        if (/^[a-zA-Z0-9 ._-]{3,4}$/.test(codec)) {
          fields.push(
            createMetadataField(ctx, {
              idSuffix: `stsd-codec-${pos}`,
              fieldName: "Sample Entry Codec",
              rawKey: "stsd.codec",
              value: codec,
              dataType: "string",
              group: defaultGroup,
              parserId: this.id,
              byteRange: { start: payloadStart + 12, length: 4 },
            })
          );
        }
      } else if (box.type === "jumb" || box.type === "c2pa") {
        fields.push(
          createMetadataField(ctx, {
            idSuffix: `c2pa-${pos}`,
            fieldName: "Content Credentials (C2PA)",
            rawKey: `C2PA.${box.type}`,
            value: `Present (${box.size} bytes)`,
            dataType: "string",
            group: "embedded",
            parserId: this.id,
            byteRange: { start: pos, length: box.size },
          })
        );
      } else if (box.type === "meta" && payloadLen > 12) {
        // FullBox (4 bytes version/flags) before sub-boxes
        await this.walkMoov(ctx, payloadStart + 4, pos + box.size, node, fields, depth + 1, defaultGroup);
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
