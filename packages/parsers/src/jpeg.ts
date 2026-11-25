import exifr from "exifr";
import type { FormatParser, ParserContext, ParserOutput } from "@trace/parser-registry";
import type { DetectedStructure, ForensicFinding, MetadataField } from "@trace/shared-types";
import { createMetadataField, emitAnomaly, emitStructure, extractXmpFields, isSensitiveTagKey } from "./helpers";

const STD_LUMA_QTABLE = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55,
  14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92,
  49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
];

function estimateJpegQualityFromLumaTable(table: Uint8Array): number | null {
  if (table.byteLength < 64) return null;
  let sumRatio = 0;
  for (let i = 0; i < 64; i++) {
    sumRatio += (table[i] * 100) / STD_LUMA_QTABLE[i];
  }
  const avgScale = sumRatio / 64;
  if (avgScale <= 1) return 100;
  const q = avgScale <= 100 ? Math.round((200 - avgScale) / 2) : Math.round(5000 / avgScale);
  return Math.max(1, Math.min(100, q));
}

const JPEG_MARKER_NAMES: Record<number, string> = {
  0xd8: "SOI (Start of Image)",
  0xd9: "EOI (End of Image)",
  0xda: "SOS (Start of Scan)",
  0xdb: "DQT (Quantization Table)",
  0xc0: "SOF0 (Baseline DCT)",
  0xc2: "SOF2 (Progressive DCT)",
  0xc4: "DHT (Huffman Table)",
  0xe0: "APP0 (JFIF)",
  0xe1: "APP1 (EXIF / XMP)",
  0xe2: "APP2 (ICC Profile / MPF)",
  0xed: "APP13 (IPTC / Photoshop)",
  0xee: "APP14 (Adobe)",
  0xfe: "COM (Comment)",
};

function getMarkerLabel(markerByte: number): string {
  if (JPEG_MARKER_NAMES[markerByte]) return JPEG_MARKER_NAMES[markerByte];
  if (markerByte >= 0xe0 && markerByte <= 0xef) return `APP${markerByte - 0xe0}`;
  return `Marker 0xFF${markerByte.toString(16).toUpperCase().padStart(2, "0")}`;
}

export class JpegParser implements FormatParser {
  readonly id = "jpeg-segment-parser";
  readonly version = "0.1.0";
  readonly supportedFormatIds = ["jpeg"] as const;

  canParse(id: { formatId: string }): boolean {
    return id.formatId === "jpeg";
  }

  async parse(ctx: ParserContext): Promise<ParserOutput> {
    const fields: MetadataField[] = [];
    const structures: DetectedStructure[] = [];
    const findings: ForensicFinding[] = [];
    const warnings: string[] = [];

    const totalSize = ctx.reader.byteLength;
    const soi = await ctx.reader.read(0, 2, ctx.signal);
    if (soi.byteLength < 2 || soi[0] !== 0xff || soi[1] !== 0xd8) {
      warnings.push("Missing JPEG SOI marker (FF D8).");
      return { parserId: this.id, parserVersion: this.version, fields, structures, findings, warnings, coveragePatch: {} };
    }

    structures.push(
      emitStructure(ctx, this.id, {
        id: "jpeg-soi",
        name: "SOI (Start of Image)",
        type: "jpeg-marker",
        byteRange: { start: 0, length: 2 },
      })
    );

    let offset = 2;
    let sosOffset: number | null = null;
    const exifChunks: Uint8Array[] = [];
    let segmentCount = 0;

    while (offset + 2 <= totalSize && segmentCount < 512) {
      segmentCount++;
      const markerBuf = await ctx.reader.read(offset, 2, ctx.signal);
      if (markerBuf.byteLength < 2) break;

      if (markerBuf[0] !== 0xff) {
        warnings.push(`Expected 0xFF JPEG marker sync at offset 0x${offset.toString(16)}.`);
        break;
      }

      // Skip fill 0xFF bytes
      let markerOffset = offset;
      let markerByte = markerBuf[1];
      while (markerByte === 0xff && markerOffset + 2 <= totalSize) {
        markerOffset += 1;
        const nextB = await ctx.reader.read(markerOffset, 2, ctx.signal);
        if (nextB.byteLength < 2) break;
        markerByte = nextB[1];
      }

      // Standalone markers (TEM / RSTn / EOI)
      if (markerByte === 0x00 || markerByte === 0x01 || (markerByte >= 0xd0 && markerByte <= 0xd9)) {
        structures.push(
          emitStructure(ctx, this.id, {
            id: `jpeg-m-${markerOffset}`,
            name: getMarkerLabel(markerByte),
            type: "jpeg-marker",
            byteRange: { start: markerOffset, length: 2 },
          })
        );
        offset = markerOffset + 2;
        if (markerByte === 0xd9) break;
        continue;
      }

      if (markerOffset + 4 > totalSize) {
        findings.push(
          emitAnomaly(ctx, this.id, {
            id: `${ctx.fileId}:jpeg-truncated-seg`,
            ruleId: "rule-jpeg-truncated-segment",
            category: "integrity",
            title: "Truncated JPEG segment header",
            severity: "medium",
            explanation: `JPEG marker at 0x${markerOffset.toString(16)} lacks a 2-byte length header before EOF.`,
            evidence: `Offset 0x${markerOffset.toString(16)}, file size ${totalSize}`,
            affectedFieldIds: [],
            byteRange: { start: markerOffset, length: totalSize - markerOffset },
            whyItMatters: "Truncated headers indicate file corruption or incomplete transfer.",
            suggestedAction: "Verify file completeness against the original source.",
            detectionMethod: this.id,
            confidence: "confirmed",
          })
        );
        break;
      }

      const lenBuf = await ctx.reader.read(markerOffset + 2, 2, ctx.signal);
      const segLen = (lenBuf[0] << 8) | lenBuf[1];
      if (segLen < 2 || markerOffset + 2 + segLen > totalSize) {
        warnings.push(`JPEG segment length (${segLen}) at 0x${markerOffset.toString(16)} exceeds file bounds.`);
        break;
      }

      const fullLen = 2 + segLen;
      const label = getMarkerLabel(markerByte);
      structures.push(
        emitStructure(ctx, this.id, {
          id: `jpeg-seg-${markerOffset}`,
          name: label,
          type: "jpeg-segment",
          byteRange: { start: markerOffset, length: fullLen },
        })
      );

      // Extract SOF0/SOF2 dimensions directly with exact byte offsets
      if ((markerByte === 0xc0 || markerByte === 0xc2) && segLen >= 7) {
        const sofData = await ctx.reader.read(markerOffset + 4, 5, ctx.signal);
        if (sofData.byteLength === 5) {
          const bitsPerSample = sofData[0];
          const height = (sofData[1] << 8) | sofData[2];
          const width = (sofData[3] << 8) | sofData[4];
          fields.push(
            createMetadataField(ctx, {
              idSuffix: "width",
              fieldName: "Image Width",
              rawKey: "SOF.SamplesPerLine",
              value: width,
              displayValue: `${width} px`,
              dataType: "number",
              group: "general",
              parserId: this.id,
              byteRange: { start: markerOffset + 7, length: 2 },
            }),
            createMetadataField(ctx, {
              idSuffix: "height",
              fieldName: "Image Height",
              rawKey: "SOF.Lines",
              value: height,
              displayValue: `${height} px`,
              dataType: "number",
              group: "general",
              parserId: this.id,
              byteRange: { start: markerOffset + 5, length: 2 },
            }),
            createMetadataField(ctx, {
              idSuffix: "precision",
              fieldName: "Bit Depth",
              rawKey: "SOF.Precision",
              value: bitsPerSample,
              displayValue: `${bitsPerSample} bits/channel`,
              dataType: "number",
              group: "general",
              parserId: this.id,
              byteRange: { start: markerOffset + 4, length: 1 },
            })
          );
        }
      }

      // Extract COM text comment with exact offset
      if (markerByte === 0xfe && segLen > 2) {
        const comPayload = await ctx.reader.read(markerOffset + 4, Math.min(segLen - 2, 4096), ctx.signal);
        const text = new TextDecoder("utf-8", { fatal: false }).decode(comPayload).replace(/\0+$/, "");
        fields.push(
          createMetadataField(ctx, {
            idSuffix: `com-${markerOffset}`,
            fieldName: "JPEG Comment",
            rawKey: "COM",
            value: text,
            dataType: "string",
            group: "general",
            parserId: this.id,
            byteRange: { start: markerOffset + 4, length: segLen - 2 },
            isSensitive: true,
            sensitivityReason: "Free-text comment block may contain author or software notes",
          })
        );
      }

      // Collect bounded APP1/APP2/APP13 bytes for exifr without reading entropy scan payload
      if ([0xe1, 0xe2, 0xed].includes(markerByte) && fullLen <= 4 * 1024 * 1024) {
        const segBytes = await ctx.reader.read(markerOffset, fullLen, ctx.signal);
        exifChunks.push(segBytes);
        if (markerByte === 0xe1 && segLen > 32) {
          const textHead = new TextDecoder("latin1").decode(segBytes.subarray(4, Math.min(segBytes.byteLength, 48)));
          if (textHead.startsWith("http://ns.adobe.com/xap/1.0/")) {
            const xmpStr = new TextDecoder("utf-8", { fatal: false }).decode(segBytes.subarray(33));
            extractXmpFields(xmpStr, ctx, this.id, fields, { start: markerOffset + 4, length: segLen - 2 });
          }
        }
        if (markerByte === 0xe2 && segLen > 20) {
          const iccStr = new TextDecoder("latin1").decode(segBytes.subarray(4, Math.min(segBytes.byteLength, 256)));
          if (iccStr.startsWith("ICC_PROFILE")) {
            const mDesc = /desc\0{4}[\s\S]{4,16}?([A-Za-z0-9 _().-]{4,48})/.exec(iccStr);
            fields.push(
              createMetadataField(ctx, {
                idSuffix: `icc-${markerOffset}`,
                fieldName: "ICC Color Profile",
                rawKey: "ICC.Description",
                value: mDesc ? mDesc[1].trim() : "Embedded ICC Profile",
                dataType: "string",
                group: "general",
                parserId: this.id,
                byteRange: { start: markerOffset, length: fullLen },
              })
            );
          }
        }
      }

      // Quantization Table (DQT) quality estimate (#16)
      if (markerByte === 0xdb && segLen >= 67) {
        const dqt = await ctx.reader.read(markerOffset + 4, 65, ctx.signal);
        const pq = (dqt[0] >> 4) & 0x0f;
        const tq = dqt[0] & 0x0f;
        if (pq === 0 && tq === 0) {
          const estQ = estimateJpegQualityFromLumaTable(dqt.subarray(1, 65));
          if (estQ !== null) {
            fields.push(
              createMetadataField(ctx, {
                idSuffix: `dqt-q-${markerOffset}`,
                fieldName: "Estimated JPEG Quality (DQT)",
                rawKey: "JPEG.EstimatedQuality",
                value: estQ,
                displayValue: `~${estQ}%`,
                dataType: "number",
                group: "general",
                parserId: this.id,
                byteRange: { start: markerOffset + 4, length: 65 },
              })
            );
          }
        }
      }

      // C2PA Content Credentials in APP11 JUMBF (#6)
      if (markerByte === 0xeb && segLen > 8) {
        const app11 = await ctx.reader.read(markerOffset + 4, Math.min(segLen - 2, 64), ctx.signal);
        const ascii = new TextDecoder("latin1").decode(app11);
        if (ascii.includes("c2pa") || ascii.includes("jumb")) {
          fields.push(
            createMetadataField(ctx, {
              idSuffix: `c2pa-${markerOffset}`,
              fieldName: "Content Credentials (C2PA)",
              rawKey: "C2PA.APP11",
              value: `Present (${segLen} bytes)`,
              dataType: "string",
              group: "embedded",
              parserId: this.id,
              byteRange: { start: markerOffset, length: fullLen },
            })
          );
        }
      }

      if (markerByte === 0xda) {
        sosOffset = markerOffset;
        break;
      }

      offset = markerOffset + fullLen;
    }

    // Parse collected APP segments with exifr
    if (exifChunks.length > 0) {
      const totalAppLen = 2 + exifChunks.reduce((acc, c) => acc + c.byteLength, 0) + 2;
      const syntheticJpeg = new Uint8Array(totalAppLen);
      syntheticJpeg.set([0xff, 0xd8], 0);
      let cursor = 2;
      for (const chunk of exifChunks) {
        syntheticJpeg.set(chunk, cursor);
        cursor += chunk.byteLength;
      }
      syntheticJpeg.set([0xff, 0xd9], cursor);

      try {
        const parsed = await exifr.parse(syntheticJpeg, {
          tiff: true,
          exif: true,
          gps: true,
          iptc: true,
          xmp: true,
          icc: true,
          jfif: false,
          makerNote: false,
        });

        if (parsed && typeof parsed === "object") {
          for (const [key, rawVal] of Object.entries(parsed)) {
            if (rawVal === undefined || rawVal === null) continue;
            if (rawVal instanceof Uint8Array || ArrayBuffer.isView(rawVal)) continue;

            const sensitivity = isSensitiveTagKey(key);
            let group: MetadataField["group"] = "exif";
            if (key.toLowerCase().includes("gps") || key === "latitude" || key === "longitude") {
              group = "gps";
            } else if (["Make", "Model", "LensModel", "LensMake", "BodySerialNumber", "SerialNumber"].includes(key)) {
              group = "camera";
            }

            const valueStr = rawVal instanceof Date ? rawVal.toISOString() : String(rawVal);
            fields.push(
              createMetadataField(ctx, {
                idSuffix: `exifr-${key}`,
                fieldName: key,
                rawKey: key,
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
                // byteRange omitted intentionally: exifr does not expose exact tag coordinates
                confidence: "confirmed",
                isSensitive: sensitivity.sensitive,
                sensitivityReason: sensitivity.reason,
              })
            );
          }
        }
      } catch (err) {
        warnings.push(`exifr failed on APP segments: ${err instanceof Error ? err.message : "unknown error"}`);
      }

      try {
        const thumb = await exifr.thumbnail(syntheticJpeg);
        if (thumb && thumb.byteLength > 0) {
          fields.push(
            createMetadataField(ctx, {
              idSuffix: "exif-thumbnail",
              fieldName: "Embedded EXIF Thumbnail",
              rawKey: "JPEG.EmbeddedThumbnail",
              value: `${thumb.byteLength} bytes`,
              dataType: "bytes",
              group: "embedded",
              parserId: this.id,
              isSensitive: true,
              sensitivityReason: "EXIF IFD1 thumbnails can retain uncropped/uncensored versions of the original photo",
            })
          );
        }
      } catch {
        // Ignore missing/invalid EXIF thumbnail
      }
    }

    // Check EOF / trailing bytes past EOI (FF D9) in tail window
    let footerInspected = false;
    if (sosOffset !== null || totalSize >= 2) {
      const tailLen = Math.min(totalSize, 65536);
      const tailStart = totalSize - tailLen;
      const tail = await ctx.reader.read(tailStart, tailLen, ctx.signal);
      footerInspected = true;

      let lastEoiRelative = -1;
      for (let i = tail.byteLength - 2; i >= 0; i--) {
        if (tail[i] === 0xff && tail[i + 1] === 0xd9) {
          lastEoiRelative = i;
          break;
        }
      }

      if (lastEoiRelative >= 0) {
        const eoiEnd = tailStart + lastEoiRelative + 2;
        if (eoiEnd < totalSize) {
          const trailingLen = totalSize - eoiEnd;
          findings.push(
            emitAnomaly(ctx, this.id, {
              id: `${ctx.fileId}:jpeg-trailing-bytes`,
              ruleId: "rule-jpeg-trailing-bytes",
              category: "structure",
              title: "Unexpected trailing bytes after JPEG EOI (FF D9)",
              severity: "medium",
              explanation: `Found ${trailingLen} byte(s) after the final JPEG End-of-Image marker at 0x${eoiEnd.toString(16)}.`,
              evidence: `EOI ends at 0x${eoiEnd.toString(16)}; file size is ${totalSize} bytes.`,
              affectedFieldIds: [],
              byteRange: { start: eoiEnd, length: trailingLen },
              whyItMatters:
                "Appended data past EOI may indicate concatenated thumbnails, camera quirks, transfer padding, or deliberately appended payloads requiring inspection.",
              suggestedAction:
                "Inspect the trailing offset in Hex Inspector. Do not assume malicious intent without additional evidence.",
              detectionMethod: this.id,
              confidence: "confirmed",
            })
          );
        }
      } else if (totalSize <= 65536) {
        findings.push(
          emitAnomaly(ctx, this.id, {
            id: `${ctx.fileId}:jpeg-missing-eoi`,
            ruleId: "rule-jpeg-missing-eoi",
            category: "integrity",
            title: "JPEG End-of-Image (FF D9) marker not found",
            severity: "low",
            explanation: "The file ended without a valid FF D9 EOI marker.",
            evidence: `Inspected ${totalSize} bytes; no FF D9 terminator.`,
            affectedFieldIds: [],
            whyItMatters: "May indicate file truncation or incomplete download.",
            suggestedAction: "Verify image renders completely and compare against source.",
            detectionMethod: this.id,
            confidence: "confirmed",
          })
        );
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
        footerInspected,
        containerIndexInspected: true,
      },
    };
  }
}
