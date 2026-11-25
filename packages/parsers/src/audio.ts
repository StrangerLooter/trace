import { parseBuffer } from "music-metadata";
import type { FormatParser, ParserContext, ParserOutput } from "@trace/parser-registry";
import type { DetectedStructure, ForensicFinding, MetadataField } from "@trace/shared-types";
import { createMetadataField, emitStructure, isSensitiveTagKey } from "./helpers";

const ID3_FRAME_LABELS: Record<string, string> = {
  TIT2: "Title",
  TPE1: "Artist",
  TALB: "Album",
  TCON: "Genre",
  TYER: "Year",
  TDRC: "Recording Time",
  TRCK: "Track Number",
  TSSE: "Encoder",
  TENC: "Encoded By",
  COMM: "Comment",
  APIC: "Embedded Artwork",
};

const WAV_INFO_LABELS: Record<string, string> = {
  INAM: "Title",
  IART: "Artist",
  IPRD: "Album / Product",
  ICRD: "Creation Date",
  ISFT: "Software / Encoder",
  ICMT: "Comment",
  IGNR: "Genre",
  ICOP: "Copyright",
};

export class Mp3Parser implements FormatParser {
  readonly id = "mp3-id3-parser";
  readonly version = "0.1.0";
  readonly supportedFormatIds = ["mp3"] as const;

  canParse(id: { formatId: string }): boolean {
    return id.formatId === "mp3";
  }

  async parse(ctx: ParserContext): Promise<ParserOutput> {
    const fields: MetadataField[] = [];
    const structures: DetectedStructure[] = [];
    const findings: ForensicFinding[] = [];
    const warnings: string[] = [];
    const totalSize = ctx.reader.byteLength;

    const head = await ctx.reader.read(0, Math.min(totalSize, 10), ctx.signal);
    let tagEnd = 0;

    if (head.byteLength === 10 && head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) {
      const majorVer = head[3];
      const tagSize =
        ((head[6] & 0x7f) << 21) |
        ((head[7] & 0x7f) << 14) |
        ((head[8] & 0x7f) << 7) |
        (head[9] & 0x7f);
      tagEnd = Math.min(totalSize, 10 + tagSize);

      structures.push(
        emitStructure(ctx, this.id, {
          id: "mp3-id3v2",
          name: `ID3v2.${majorVer} Tag Header`,
          type: "id3v2",
          byteRange: { start: 0, length: tagEnd },
        })
      );

      // Parse bounded ID3v2.3 / v2.4 frames directly for exact byte offsets
      if ((majorVer === 3 || majorVer === 4) && tagEnd > 10) {
        let pos = 10;
        let frameCount = 0;
        const scanEnd = Math.min(tagEnd, 256 * 1024);
        while (pos + 10 <= scanEnd && frameCount < 256) {
          frameCount++;
          const fh = await ctx.reader.read(pos, 10, ctx.signal);
          if (fh.byteLength < 10 || fh[0] === 0x00) break;
          const frameId = String.fromCharCode(fh[0], fh[1], fh[2], fh[3]);
          if (!/^[A-Z0-9]{4}$/.test(frameId)) break;

          const frameSize =
            majorVer === 4
              ? ((fh[4] & 0x7f) << 21) | ((fh[5] & 0x7f) << 14) | ((fh[6] & 0x7f) << 7) | (fh[7] & 0x7f)
              : new DataView(fh.buffer, fh.byteOffset, 10).getUint32(4, false);

          if (frameSize <= 0 || pos + 10 + frameSize > tagEnd) break;

          if (frameId === "APIC") {
            fields.push(
              createMetadataField(ctx, {
                idSuffix: `apic-${pos}`,
                fieldName: "Embedded Artwork",
                rawKey: "ID3.APIC",
                value: `Present (${frameSize} bytes)`,
                dataType: "bytes",
                group: "audio",
                parserId: this.id,
                byteRange: { start: pos, length: 10 + frameSize },
                isSensitive: false,
              })
            );
          } else if (frameId.startsWith("T") && frameSize <= 8192) {
            const payload = await ctx.reader.read(pos + 10, frameSize, ctx.signal);
            const enc = payload[0];
            const rawText = payload.subarray(1);
            const decoded =
              enc === 1 || enc === 2
                ? new TextDecoder("utf-16le", { fatal: false }).decode(rawText.subarray(rawText[0] === 0xff && rawText[1] === 0xfe ? 2 : 0))
                : new TextDecoder("utf-8", { fatal: false }).decode(rawText);
            const cleanVal = decoded.replace(/\0+$/, "").trim();
            if (cleanVal) {
              const label = ID3_FRAME_LABELS[frameId] ?? frameId;
              const sens = isSensitiveTagKey(label);
              fields.push(
                createMetadataField(ctx, {
                  idSuffix: `id3-${frameId}-${pos}`,
                  fieldName: label,
                  rawKey: `ID3.${frameId}`,
                  value: cleanVal,
                  dataType: "string",
                  group: "audio",
                  parserId: this.id,
                  byteRange: { start: pos, length: 10 + frameSize },
                  isSensitive: sens.sensitive,
                  sensitivityReason: sens.reason,
                })
              );
            }
          }
          pos += 10 + frameSize;
        }
      }
    }

    // Check ID3v1 tail (last 128 bytes)
    if (totalSize >= 128) {
      const tailOffset = totalSize - 128;
      const tail = await ctx.reader.read(tailOffset, 128, ctx.signal);
      if (tail.byteLength === 128 && tail[0] === 0x54 && tail[1] === 0x41 && tail[2] === 0x47) {
        structures.push(
          emitStructure(ctx, this.id, {
            id: "mp3-id3v1",
            name: "ID3v1 Footer Tag",
            type: "id3v1",
            byteRange: { start: tailOffset, length: 128 },
          })
        );
      }
    }

    // Technical stream metadata via music-metadata on bounded slice (<= 2 MB)
    const sampleSize = Math.min(totalSize, 2 * 1024 * 1024);
    try {
      const sample = await ctx.reader.read(0, sampleSize, ctx.signal);
      const mm = await parseBuffer(sample, { mimeType: "audio/mpeg", size: totalSize }, { duration: false });
      if (mm.format.sampleRate) {
        fields.push(
          createMetadataField(ctx, {
            idSuffix: "sample-rate",
            fieldName: "Sample Rate",
            rawKey: "format.sampleRate",
            value: mm.format.sampleRate,
            displayValue: `${mm.format.sampleRate} Hz`,
            dataType: "number",
            group: "audio",
            parserId: "music-metadata",
          })
        );
      }
      if (mm.format.numberOfChannels) {
        fields.push(
          createMetadataField(ctx, {
            idSuffix: "channels",
            fieldName: "Audio Channels",
            rawKey: "format.numberOfChannels",
            value: mm.format.numberOfChannels,
            dataType: "number",
            group: "audio",
            parserId: "music-metadata",
          })
        );
      }
      if (mm.format.bitrate) {
        fields.push(
          createMetadataField(ctx, {
            idSuffix: "bitrate",
            fieldName: "Bitrate",
            rawKey: "format.bitrate",
            value: Math.round(mm.format.bitrate / 1000),
            displayValue: `${Math.round(mm.format.bitrate / 1000)} kbps`,
            dataType: "number",
            group: "audio",
            parserId: "music-metadata",
          })
        );
      }
    } catch {
      warnings.push("music-metadata could not parse MPEG audio frame parameters.");
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
        footerInspected: totalSize >= 128,
        containerIndexInspected: true,
      },
    };
  }
}

export class WavParser implements FormatParser {
  readonly id = "wav-riff-parser";
  readonly version = "0.1.0";
  readonly supportedFormatIds = ["wav"] as const;

  canParse(id: { formatId: string }): boolean {
    return id.formatId === "wav";
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
        id: "wav-riff",
        name: "RIFF WAVE Header",
        type: "riff-header",
        byteRange: { start: 0, length: 12 },
      })
    );

    let offset = 12;
    let count = 0;

    while (offset + 8 <= totalSize && count < 256) {
      count++;
      const hdr = await ctx.reader.read(offset, 8, ctx.signal);
      if (hdr.byteLength < 8) break;
      const fourcc = String.fromCharCode(hdr[0], hdr[1], hdr[2], hdr[3]);
      const chunkSize = new DataView(hdr.buffer, hdr.byteOffset, 8).getUint32(4, true);
      const padded = chunkSize + (chunkSize % 2);
      if (offset + 8 + chunkSize > totalSize) break;

      structures.push(
        emitStructure(ctx, this.id, {
          id: `wav-${fourcc}-${offset}`,
          name: `${fourcc.trim()} Chunk`,
          type: "wav-chunk",
          byteRange: { start: offset, length: Math.min(8 + padded, totalSize - offset) },
        })
      );

      if (fourcc === "fmt " && chunkSize >= 16) {
        const fmt = await ctx.reader.read(offset + 8, 16, ctx.signal);
        const fv = new DataView(fmt.buffer, fmt.byteOffset, 16);
        const channels = fv.getUint16(2, true);
        const sampleRate = fv.getUint32(4, true);
        const bitsPerSample = fv.getUint16(14, true);
        fields.push(
          createMetadataField(ctx, {
            idSuffix: "channels",
            fieldName: "Audio Channels",
            rawKey: "fmt.nChannels",
            value: channels,
            dataType: "number",
            group: "audio",
            parserId: this.id,
            byteRange: { start: offset + 10, length: 2 },
          }),
          createMetadataField(ctx, {
            idSuffix: "sample-rate",
            fieldName: "Sample Rate",
            rawKey: "fmt.nSamplesPerSec",
            value: sampleRate,
            displayValue: `${sampleRate} Hz`,
            dataType: "number",
            group: "audio",
            parserId: this.id,
            byteRange: { start: offset + 12, length: 4 },
          }),
          createMetadataField(ctx, {
            idSuffix: "bit-depth",
            fieldName: "Bit Depth",
            rawKey: "fmt.wBitsPerSample",
            value: bitsPerSample,
            displayValue: `${bitsPerSample}-bit`,
            dataType: "number",
            group: "audio",
            parserId: this.id,
            byteRange: { start: offset + 22, length: 2 },
          })
        );
      } else if (fourcc === "LIST" && chunkSize >= 4 && chunkSize <= 256 * 1024) {
        const listBuf = await ctx.reader.read(offset + 8, chunkSize, ctx.signal);
        const listType = String.fromCharCode(listBuf[0], listBuf[1], listBuf[2], listBuf[3]);
        if (listType === "INFO") {
          let subPos = 4;
          while (subPos + 8 <= listBuf.byteLength) {
            const tagId = String.fromCharCode(
              listBuf[subPos],
              listBuf[subPos + 1],
              listBuf[subPos + 2],
              listBuf[subPos + 3]
            );
            const subLen = new DataView(listBuf.buffer, listBuf.byteOffset + subPos + 4, 4).getUint32(0, true);
            if (subPos + 8 + subLen > listBuf.byteLength) break;
            const val = new TextDecoder("utf-8", { fatal: false })
              .decode(listBuf.subarray(subPos + 8, subPos + 8 + subLen))
              .replace(/\0+$/, "")
              .trim();
            if (val) {
              const label = WAV_INFO_LABELS[tagId] ?? tagId;
              const sens = isSensitiveTagKey(label);
              fields.push(
                createMetadataField(ctx, {
                  idSuffix: `info-${tagId}-${subPos}`,
                  fieldName: label,
                  rawKey: `LIST.INFO.${tagId}`,
                  value: val,
                  dataType: "string",
                  group: "audio",
                  parserId: this.id,
                  byteRange: { start: offset + 8 + subPos, length: 8 + subLen },
                  isSensitive: sens.sensitive,
                  sensitivityReason: sens.reason,
                })
              );
            }
            subPos += 8 + subLen + (subLen % 2);
          }
        }
      }

      offset += 8 + padded;
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
