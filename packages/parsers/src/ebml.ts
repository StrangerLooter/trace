import type { FormatParser, ParserContext, ParserOutput } from "@trace/parser-registry";
import type { DetectedStructure, ForensicFinding, MetadataField } from "@trace/shared-types";
import { createMetadataField, emitStructure, isSensitiveTagKey } from "./helpers";

const MATROSKA_EPOCH_MS = Date.UTC(2001, 0, 1, 0, 0, 0);

// Subset of EBML / Matroska / WebM element IDs
const ID_EBML = 0x1a45dfa3;
const ID_EBML_VERSION = 0x4286;
const ID_DOC_TYPE = 0x4282;
const ID_DOC_TYPE_VERSION = 0x4287;
const ID_SEGMENT = 0x18538067;
const ID_INFO = 0x1549a966;
const ID_TRACKS = 0x1654ae6b;
const ID_TAGS = 0x1254c367;
const ID_CLUSTER = 0x1f43b675;

const ID_TIMECODE_SCALE = 0x2ad7b1;
const ID_DURATION = 0x4489;
const ID_DATE_UTC = 0x4461;
const ID_TITLE = 0x7ba9;
const ID_MUXING_APP = 0x4d80;
const ID_WRITING_APP = 0x5741;

const ID_TRACK_ENTRY = 0xae;
const ID_TRACK_TYPE = 0x83;
const ID_CODEC_ID = 0x86;
const ID_VIDEO = 0xe0;
const ID_PIXEL_WIDTH = 0xb0;
const ID_PIXEL_HEIGHT = 0xba;
const ID_AUDIO = 0xe1;
const ID_SAMPLING_FREQ = 0xb5;
const ID_CHANNELS = 0x9f;

const ID_TAG = 0x7373;
const ID_SIMPLE_TAG = 0x67c8;
const ID_TAG_NAME = 0x45a3;
const ID_TAG_STRING = 0x4487;

const CONTAINER_IDS = new Set([
  ID_EBML,
  ID_INFO,
  ID_TRACKS,
  ID_TRACK_ENTRY,
  ID_VIDEO,
  ID_AUDIO,
  ID_TAGS,
  ID_TAG,
  ID_SIMPLE_TAG,
]);

interface EbmlHeaderRead {
  id: number;
  dataSize: number;
  unknownSize: boolean;
  headerSize: number;
}

function readEbmlId(bytes: Uint8Array, pos: number): { id: number; len: number } | null {
  if (pos >= bytes.byteLength) return null;
  const first = bytes[pos];
  if (first === 0) return null;
  let len = 1;
  let mask = 0x80;
  while ((first & mask) === 0 && len <= 4) {
    mask >>= 1;
    len++;
  }
  if (len > 4 || pos + len > bytes.byteLength) return null;
  let id = 0;
  for (let i = 0; i < len; i++) {
    id = id * 256 + bytes[pos + i];
  }
  return { id, len };
}

function readEbmlVintSize(bytes: Uint8Array, pos: number): { value: number; len: number; unknown: boolean } | null {
  if (pos >= bytes.byteLength) return null;
  const first = bytes[pos];
  if (first === 0) return null;
  let len = 1;
  let mask = 0x80;
  while ((first & mask) === 0 && len <= 8) {
    mask >>= 1;
    len++;
  }
  if (len > 8 || pos + len > bytes.byteLength) return null;

  let val = BigInt(first & (mask - 1));
  let allOnes = val === BigInt(mask - 1);
  for (let i = 1; i < len; i++) {
    const b = bytes[pos + i];
    if (b !== 0xff) allOnes = false;
    val = (val << 8n) | BigInt(b);
  }
  if (allOnes) return { value: 0, len, unknown: true };
  if (val > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return { value: Number(val), len, unknown: false };
}

async function readElementHeader(
  ctx: ParserContext,
  offset: number,
  endLimit: number
): Promise<EbmlHeaderRead | null> {
  const avail = Math.min(12, endLimit - offset);
  if (avail < 2) return null;
  const buf = await ctx.reader.read(offset, avail, ctx.signal);
  const idInfo = readEbmlId(buf, 0);
  if (!idInfo) return null;
  const sizeInfo = readEbmlVintSize(buf, idInfo.len);
  if (!sizeInfo) return null;
  return {
    id: idInfo.id,
    dataSize: sizeInfo.value,
    unknownSize: sizeInfo.unknown,
    headerSize: idInfo.len + sizeInfo.len,
  };
}

function decodeUint(bytes: Uint8Array): number {
  let v = 0;
  for (const b of bytes) {
    v = v * 256 + b;
  }
  return v;
}

function decodeFloat(bytes: Uint8Array): number | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength === 4) return dv.getFloat32(0, false);
  if (bytes.byteLength === 8) return dv.getFloat64(0, false);
  return null;
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\0+$/, "").trim();
}

export class EbmlParser implements FormatParser {
  readonly id = "ebml-mkv-parser";
  readonly version = "0.1.0";
  readonly supportedFormatIds = ["mkv", "webm"] as const;

  canParse(id: { formatId: string }): boolean {
    return id.formatId === "mkv" || id.formatId === "webm";
  }

  async parse(ctx: ParserContext): Promise<ParserOutput> {
    const fields: MetadataField[] = [];
    const structures: DetectedStructure[] = [];
    const findings: ForensicFinding[] = [];
    const warnings: string[] = [];
    const totalSize = ctx.reader.byteLength;

    let offset = 0;
    let elementCount = 0;
    let sawInfoOrTracks = false;
    let skippedClusterBytes = 0;
    let timecodeScaleNs = 1_000_000;

    while (offset + 2 <= totalSize && elementCount < 64) {
      elementCount++;
      const el = await readElementHeader(ctx, offset, totalSize);
      if (!el) break;

      const bodyStart = offset + el.headerSize;
      const bodyEnd = el.unknownSize ? totalSize : Math.min(totalSize, bodyStart + el.dataSize);
      const fullLen = bodyEnd - offset;

      if (el.id === ID_EBML) {
        const ebmlNode = emitStructure(ctx, this.id, {
          id: `ebml-header-${offset}`,
          name: "EBML Header",
          type: "ebml-element",
          byteRange: { start: offset, length: fullLen },
          children: [],
        });
        structures.push(ebmlNode);
        await this.walkChildren(ctx, bodyStart, bodyEnd, ebmlNode, fields, warnings, () => timecodeScaleNs, (v) => {
          timecodeScaleNs = v;
        }, 1);
      } else if (el.id === ID_SEGMENT) {
        const segNode = emitStructure(ctx, this.id, {
          id: `ebml-segment-${offset}`,
          name: "Segment",
          type: "ebml-segment",
          byteRange: { start: offset, length: fullLen },
          children: [],
        });
        structures.push(segNode);

        // Walk top-level children of Segment cleanly, skipping Cluster payloads in O(1)
        let pos = bodyStart;
        let segChildren = 0;
        while (pos + 2 <= bodyEnd && segChildren < 128) {
          segChildren++;
          const child = await readElementHeader(ctx, pos, bodyEnd);
          if (!child) break;
          const childBodyStart = pos + child.headerSize;
          const childBodyEnd = child.unknownSize
            ? bodyEnd
            : Math.min(bodyEnd, childBodyStart + child.dataSize);

          if (child.id === ID_CLUSTER) {
            const clusterLen = childBodyEnd - pos;
            skippedClusterBytes += clusterLen;
            segNode.children?.push(
              emitStructure(ctx, this.id, {
                id: `ebml-cluster-${pos}`,
                name: "Cluster (media stream skipped)",
                type: "ebml-cluster",
                byteRange: { start: pos, length: clusterLen },
                parentId: segNode.id,
              })
            );
            // Stop once media clusters begin if Info/Tracks already extracted (common OBS/WebM layout)
            if (sawInfoOrTracks) break;
          } else if (child.id === ID_INFO || child.id === ID_TRACKS || child.id === ID_TAGS) {
            if (child.id === ID_INFO || child.id === ID_TRACKS) sawInfoOrTracks = true;
            const label =
              child.id === ID_INFO ? "Segment Info" : child.id === ID_TRACKS ? "Tracks" : "Tags";
            const cNode = emitStructure(ctx, this.id, {
              id: `ebml-${label.toLowerCase().replace(/\s+/g, "-")}-${pos}`,
              name: label,
              type: "ebml-container",
              byteRange: { start: pos, length: childBodyEnd - pos },
              parentId: segNode.id,
              children: [],
            });
            segNode.children?.push(cNode);
            await this.walkChildren(
              ctx,
              childBodyStart,
              childBodyEnd,
              cNode,
              fields,
              warnings,
              () => timecodeScaleNs,
              (v) => {
                timecodeScaleNs = v;
              },
              1
            );
          }

          if (child.unknownSize || childBodyEnd <= pos) break;
          pos = childBodyEnd;
        }
        break;
      }

      if (el.unknownSize || bodyEnd <= offset) break;
      offset = bodyEnd;
    }

    const uninspectedReasons: string[] = [];
    if (skippedClusterBytes > 0) {
      uninspectedReasons.push(
        `EBML media clusters (${skippedClusterBytes} bytes) skipped in local container-header mode.`
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
        footerInspected: skippedClusterBytes === 0 && offset >= totalSize,
        containerIndexInspected: sawInfoOrTracks,
        completeFileScanned: skippedClusterBytes === 0 && offset >= totalSize,
        uninspectedReasons,
      },
    };
  }

  private async walkChildren(
    ctx: ParserContext,
    start: number,
    end: number,
    parent: DetectedStructure,
    fields: MetadataField[],
    warnings: string[],
    getScale: () => number,
    setScale: (ns: number) => void,
    depth: number,
    simpleTagState?: { name?: string }
  ): Promise<void> {
    if (depth > 5) return;
    let pos = start;
    let count = 0;
    const tagCtx = simpleTagState ?? {};

    while (pos + 2 <= end && count < 128) {
      count++;
      const el = await readElementHeader(ctx, pos, end);
      if (!el) break;
      const bodyStart = pos + el.headerSize;
      const bodyEnd = el.unknownSize ? end : Math.min(end, bodyStart + el.dataSize);
      const bodyLen = Math.max(0, bodyEnd - bodyStart);
      if (bodyLen > 4 * 1024 * 1024 && !CONTAINER_IDS.has(el.id)) {
        if (bodyEnd <= pos) break;
        pos = bodyEnd;
        continue;
      }

      if (CONTAINER_IDS.has(el.id)) {
        const node = emitStructure(ctx, this.id, {
          id: `ebml-el-${el.id.toString(16)}-${pos}`,
          name: `Element 0x${el.id.toString(16).toUpperCase()}`,
          type: "ebml-container",
          byteRange: { start: pos, length: bodyEnd - pos },
          parentId: parent.id,
          children: [],
        });
        parent.children?.push(node);
        const childTagCtx = el.id === ID_SIMPLE_TAG ? {} : tagCtx;
        await this.walkChildren(
          ctx,
          bodyStart,
          bodyEnd,
          node,
          fields,
          warnings,
          getScale,
          setScale,
          depth + 1,
          childTagCtx
        );
      } else if (bodyLen > 0 && bodyLen <= 65536) {
        const payload = await ctx.reader.read(bodyStart, bodyLen, ctx.signal);
        const range = { start: bodyStart, length: bodyLen };

        if (el.id === ID_DOC_TYPE) {
          fields.push(
            createMetadataField(ctx, {
              idSuffix: `doctype-${pos}`,
              fieldName: "EBML DocType",
              rawKey: "EBML.DocType",
              value: decodeText(payload),
              dataType: "string",
              group: "video",
              parserId: this.id,
              byteRange: range,
            })
          );
        } else if (el.id === ID_EBML_VERSION || el.id === ID_DOC_TYPE_VERSION) {
          fields.push(
            createMetadataField(ctx, {
              idSuffix: `ebml-ver-${el.id}-${pos}`,
              fieldName: el.id === ID_EBML_VERSION ? "EBML Version" : "DocType Version",
              rawKey: el.id === ID_EBML_VERSION ? "EBML.Version" : "EBML.DocTypeVersion",
              value: decodeUint(payload),
              dataType: "number",
              group: "video",
              parserId: this.id,
              byteRange: range,
            })
          );
        } else if (el.id === ID_TIMECODE_SCALE) {
          const scale = decodeUint(payload);
          if (scale > 0) setScale(scale);
        } else if (el.id === ID_DURATION) {
          const rawDur = decodeFloat(payload);
          if (rawDur !== null && Number.isFinite(rawDur) && rawDur >= 0) {
            const secs = Number(((rawDur * getScale()) / 1_000_000_000).toFixed(2));
            fields.push(
              createMetadataField(ctx, {
                idSuffix: `duration-${pos}`,
                fieldName: "Duration",
                rawKey: "Segment.Info.Duration",
                value: secs,
                displayValue: `${secs} s`,
                dataType: "number",
                group: "video",
                parserId: this.id,
                byteRange: range,
              })
            );
          }
        } else if (el.id === ID_DATE_UTC && payload.byteLength === 8) {
          const dv = new DataView(payload.buffer, payload.byteOffset, 8);
          const nsSince2001 = dv.getBigInt64(0, false);
          const msOffset = Number(nsSince2001 / 1_000_000n);
          const date = new Date(MATROSKA_EPOCH_MS + msOffset);
          if (!Number.isNaN(date.getTime())) {
            fields.push(
              createMetadataField(ctx, {
                idSuffix: `date-${pos}`,
                fieldName: "Segment DateUTC",
                rawKey: "Segment.Info.DateUTC",
                value: date.toISOString(),
                dataType: "date",
                group: "video",
                parserId: this.id,
                byteRange: range,
                isSensitive: true,
                sensitivityReason: "Reveals exact recording or muxing UTC timestamp",
              })
            );
          }
        } else if (el.id === ID_MUXING_APP || el.id === ID_WRITING_APP || el.id === ID_TITLE) {
          const text = decodeText(payload);
          if (text) {
            const name =
              el.id === ID_MUXING_APP ? "Muxing Application" : el.id === ID_WRITING_APP ? "Writing Application" : "Title";
            const rawKey =
              el.id === ID_MUXING_APP ? "Segment.Info.MuxingApp" : el.id === ID_WRITING_APP ? "Segment.Info.WritingApp" : "Segment.Info.Title";
            const sens = isSensitiveTagKey(rawKey);
            fields.push(
              createMetadataField(ctx, {
                idSuffix: `info-${el.id}-${pos}`,
                fieldName: name,
                rawKey,
                value: text,
                dataType: "string",
                group: "video",
                parserId: this.id,
                byteRange: range,
                isSensitive: sens.sensitive || el.id !== ID_TITLE,
                sensitivityReason: sens.reason ?? "Reveals screen recorder or muxing software stack",
              })
            );
          }
        } else if (el.id === ID_TRACK_TYPE) {
          const t = decodeUint(payload);
          const label = t === 1 ? "Video" : t === 2 ? "Audio" : t === 17 ? "Subtitle" : `Type ${t}`;
          fields.push(
            createMetadataField(ctx, {
              idSuffix: `track-type-${pos}`,
              fieldName: "Track Type",
              rawKey: "Tracks.TrackEntry.TrackType",
              value: label,
              dataType: "string",
              group: "video",
              parserId: this.id,
              byteRange: range,
            })
          );
        } else if (el.id === ID_CODEC_ID) {
          const codec = decodeText(payload);
          if (codec) {
            fields.push(
              createMetadataField(ctx, {
                idSuffix: `codec-${pos}`,
                fieldName: "Track Codec",
                rawKey: "Tracks.TrackEntry.CodecID",
                value: codec,
                dataType: "string",
                group: "video",
                parserId: this.id,
                byteRange: range,
              })
            );
          }
        } else if (el.id === ID_PIXEL_WIDTH || el.id === ID_PIXEL_HEIGHT) {
          const px = decodeUint(payload);
          fields.push(
            createMetadataField(ctx, {
              idSuffix: `px-${el.id}-${pos}`,
              fieldName: el.id === ID_PIXEL_WIDTH ? "Video Pixel Width" : "Video Pixel Height",
              rawKey: el.id === ID_PIXEL_WIDTH ? "Tracks.Video.PixelWidth" : "Tracks.Video.PixelHeight",
              value: px,
              dataType: "number",
              group: "video",
              parserId: this.id,
              byteRange: range,
            })
          );
        } else if (el.id === ID_SAMPLING_FREQ) {
          const hz = decodeFloat(payload);
          if (hz !== null && Number.isFinite(hz)) {
            fields.push(
              createMetadataField(ctx, {
                idSuffix: `hz-${pos}`,
                fieldName: "Audio Sampling Frequency",
                rawKey: "Tracks.Audio.SamplingFrequency",
                value: Math.round(hz),
                displayValue: `${Math.round(hz)} Hz`,
                dataType: "number",
                group: "audio",
                parserId: this.id,
                byteRange: range,
              })
            );
          }
        } else if (el.id === ID_CHANNELS) {
          fields.push(
            createMetadataField(ctx, {
              idSuffix: `ch-${pos}`,
              fieldName: "Audio Channels",
              rawKey: "Tracks.Audio.Channels",
              value: decodeUint(payload),
              dataType: "number",
              group: "audio",
              parserId: this.id,
              byteRange: range,
            })
          );
        } else if (el.id === ID_TAG_NAME) {
          tagCtx.name = decodeText(payload);
        } else if (el.id === ID_TAG_STRING) {
          const val = decodeText(payload);
          const tagName = tagCtx.name || "SimpleTag";
          if (val) {
            const sens = isSensitiveTagKey(tagName);
            fields.push(
              createMetadataField(ctx, {
                idSuffix: `tag-${tagName}-${pos}`,
                fieldName: `Tag: ${tagName}`,
                rawKey: `Tags.SimpleTag.${tagName}`,
                value: val,
                dataType: "string",
                group: "video",
                parserId: this.id,
                byteRange: range,
                isSensitive: sens.sensitive,
                sensitivityReason: sens.reason,
              })
            );
          }
        }
      }

      if (el.unknownSize || bodyEnd <= pos) break;
      pos = bodyEnd;
    }
  }
}
