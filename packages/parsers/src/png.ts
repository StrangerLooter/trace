import exifr from "exifr";
import { unzlibSync } from "fflate";
import type { FormatParser, ParserContext, ParserOutput } from "@trace/parser-registry";
import type { DetectedStructure, ForensicFinding, MetadataField } from "@trace/shared-types";
import { createMetadataField, emitAnomaly, emitStructure, extractXmpFields, isSensitiveTagKey } from "./helpers";

const PNG_COLOR_TYPES: Record<number, string> = {
  0: "Grayscale",
  2: "RGB",
  3: "Indexed Palette",
  4: "Grayscale + Alpha",
  6: "RGBA",
};

export class PngParser implements FormatParser {
  readonly id = "png-chunk-parser";
  readonly version = "0.1.0";
  readonly supportedFormatIds = ["png"] as const;

  canParse(id: { formatId: string }): boolean {
    return id.formatId === "png";
  }

  async parse(ctx: ParserContext): Promise<ParserOutput> {
    const fields: MetadataField[] = [];
    const structures: DetectedStructure[] = [];
    const findings: ForensicFinding[] = [];
    const warnings: string[] = [];
    const totalSize = ctx.reader.byteLength;

    structures.push(
      emitStructure(ctx, this.id, {
        id: "png-sig",
        name: "PNG Signature",
        type: "png-header",
        byteRange: { start: 0, length: 8 },
      })
    );

    let offset = 8;
    let sawIend = false;
    let chunkIndex = 0;

    while (offset + 12 <= totalSize && chunkIndex < 2048) {
      chunkIndex++;
      const hdr = await ctx.reader.read(offset, 8, ctx.signal);
      if (hdr.byteLength < 8) break;

      const view = new DataView(hdr.buffer, hdr.byteOffset, 8);
      const dataLen = view.getUint32(0, false);
      const type = String.fromCharCode(hdr[4], hdr[5], hdr[6], hdr[7]);
      const fullChunkLen = 12 + dataLen;

      if (dataLen > 256 * 1024 * 1024 || offset + fullChunkLen > totalSize) {
        findings.push(
          emitAnomaly(ctx, this.id, {
            id: `${ctx.fileId}:png-truncated-${offset}`,
            ruleId: "rule-png-truncated-chunk",
            category: "integrity",
            title: `Truncated or oversized PNG chunk '${type}'`,
            severity: "medium",
            explanation: `Chunk '${type}' at 0x${offset.toString(16)} declares ${dataLen} payload bytes exceeding remaining file length.`,
            evidence: `offset=0x${offset.toString(16)}, declared=${fullChunkLen}, totalSize=${totalSize}`,
            affectedFieldIds: [],
            byteRange: { start: offset, length: totalSize - offset },
            whyItMatters: "Corrupted chunk lengths indicate truncated or malformed PNG files.",
            suggestedAction: "Inspect chunk header in Hex Inspector.",
            detectionMethod: this.id,
            confidence: "confirmed",
          })
        );
        break;
      }

      structures.push(
        emitStructure(ctx, this.id, {
          id: `png-${type}-${offset}`,
          name: `${type} Chunk`,
          type: "png-chunk",
          byteRange: { start: offset, length: fullChunkLen },
        })
      );

      const payloadStart = offset + 8;

      if (type === "IHDR" && dataLen === 13) {
        const ihdr = await ctx.reader.read(payloadStart, 13, ctx.signal);
        const iv = new DataView(ihdr.buffer, ihdr.byteOffset, 13);
        const width = iv.getUint32(0, false);
        const height = iv.getUint32(4, false);
        const bitDepth = ihdr[8];
        const colorType = ihdr[9];
        fields.push(
          createMetadataField(ctx, {
            idSuffix: "width",
            fieldName: "Image Width",
            rawKey: "IHDR.Width",
            value: width,
            displayValue: `${width} px`,
            dataType: "number",
            group: "general",
            parserId: this.id,
            byteRange: { start: payloadStart, length: 4 },
          }),
          createMetadataField(ctx, {
            idSuffix: "height",
            fieldName: "Image Height",
            rawKey: "IHDR.Height",
            value: height,
            displayValue: `${height} px`,
            dataType: "number",
            group: "general",
            parserId: this.id,
            byteRange: { start: payloadStart + 4, length: 4 },
          }),
          createMetadataField(ctx, {
            idSuffix: "color-type",
            fieldName: "Color Format",
            rawKey: "IHDR.ColorType",
            value: PNG_COLOR_TYPES[colorType] ?? `Type ${colorType}`,
            displayValue: `${PNG_COLOR_TYPES[colorType] ?? `Type ${colorType}`} (${bitDepth}-bit)`,
            dataType: "string",
            group: "general",
            parserId: this.id,
            byteRange: { start: payloadStart + 8, length: 2 },
          })
        );
      } else if (type === "tIME" && dataLen === 7) {
        const t = await ctx.reader.read(payloadStart, 7, ctx.signal);
        const year = (t[0] << 8) | t[1];
        const iso = `${year.toString().padStart(4, "0")}-${String(t[2]).padStart(2, "0")}-${String(t[3]).padStart(2, "0")}T${String(t[4]).padStart(2, "0")}:${String(t[5]).padStart(2, "0")}:${String(t[6]).padStart(2, "0")}Z`;
        fields.push(
          createMetadataField(ctx, {
            idSuffix: "time",
            fieldName: "Last Modified Time",
            rawKey: "tIME",
            value: iso,
            dataType: "date",
            group: "general",
            parserId: this.id,
            byteRange: { start: payloadStart, length: 7 },
            isSensitive: true,
            sensitivityReason: "Reveals file modification timestamp",
          })
        );
      } else if ((type === "tEXt" || type === "zTXt" || type === "iTXt") && dataLen > 0 && dataLen <= 1024 * 1024) {
        const buf = await ctx.reader.read(payloadStart, dataLen, ctx.signal);
        const nulIdx = buf.indexOf(0);
        if (nulIdx > 0) {
          const keyword = new TextDecoder("latin1").decode(buf.subarray(0, nulIdx));
          let valueStr = "";
          if (type === "tEXt") {
            valueStr = new TextDecoder("latin1").decode(buf.subarray(nulIdx + 1));
          } else if (type === "zTXt" && nulIdx + 2 <= buf.byteLength) {
            try {
              const inflated = unzlibSync(buf.subarray(nulIdx + 2), { out: new Uint8Array(2 * 1024 * 1024) });
              valueStr = new TextDecoder("latin1").decode(inflated);
            } catch {
              warnings.push(`Failed to decompress PNG zTXt chunk '${keyword}'.`);
            }
          } else if (type === "iTXt") {
            // keyword \0 compFlag compMethod langTag \0 translatedKey \0 text
            const rest = buf.subarray(nulIdx + 1);
            if (rest.byteLength >= 2) {
              const compFlag = rest[0];
              const afterLang = rest.indexOf(0, 2);
              const afterTrans = afterLang >= 0 ? rest.indexOf(0, afterLang + 1) : -1;
              if (afterTrans >= 0) {
                const textBytes = rest.subarray(afterTrans + 1);
                if (compFlag === 1) {
                  try {
                    const inflated = unzlibSync(textBytes, { out: new Uint8Array(2 * 1024 * 1024) });
                    valueStr = new TextDecoder("utf-8", { fatal: false }).decode(inflated);
                  } catch {
                    warnings.push(`Failed to decompress PNG iTXt chunk '${keyword}'.`);
                  }
                } else {
                  valueStr = new TextDecoder("utf-8", { fatal: false }).decode(textBytes);
                }
              }
            }
          }

          if (valueStr) {
            const sens = isSensitiveTagKey(keyword);
            const isXmp = keyword === "XML:com.adobe.xmp";
            fields.push(
              createMetadataField(ctx, {
                idSuffix: `txt-${offset}-${keyword}`,
                fieldName: isXmp ? "XMP Packet" : keyword,
                rawKey: `${type}.${keyword}`,
                value: valueStr.length > 2000 ? `${valueStr.slice(0, 2000)}...` : valueStr,
                dataType: "string",
                group: isXmp ? "xmp" : "general",
                parserId: this.id,
                byteRange: { start: payloadStart, length: dataLen },
                isSensitive: sens.sensitive || isXmp,
                sensitivityReason: sens.reason ?? (isXmp ? "Embedded XMP XML metadata packet" : undefined),
              })
            );
            if (isXmp) {
              extractXmpFields(valueStr, ctx, this.id, fields, { start: payloadStart, length: dataLen });
            } else if (
              keyword === "parameters" ||
              keyword === "prompt" ||
              keyword === "workflow" ||
              valueStr.includes("Steps:") ||
              valueStr.includes("Sampler:")
            ) {
              // Decode Stable Diffusion / ComfyUI generation parameters cleanly
              const modelMatch = /\bModel:\s*([^,\n]+)/i.exec(valueStr);
              const seedMatch = /\bSeed:\s*(\d+)/i.exec(valueStr);
              const samplerMatch = /\bSampler:\s*([^,\n]+)/i.exec(valueStr);
              if (modelMatch || seedMatch || samplerMatch || keyword === "prompt" || keyword === "workflow") {
                fields.push(
                  createMetadataField(ctx, {
                    idSuffix: `ai-gen-${offset}`,
                    fieldName: "AI Generation Prompt/Workflow",
                    rawKey: `AI.${keyword}`,
                    value: [
                      modelMatch ? `Model=${modelMatch[1].trim()}` : null,
                      samplerMatch ? `Sampler=${samplerMatch[1].trim()}` : null,
                      seedMatch ? `Seed=${seedMatch[1]}` : null,
                    ]
                      .filter(Boolean)
                      .join(", ") || `${keyword} (${valueStr.length} chars)`,
                    dataType: "string",
                    group: "embedded",
                    parserId: this.id,
                    byteRange: { start: payloadStart, length: dataLen },
                    isSensitive: true,
                    sensitivityReason: "Reveals AI generation workflow, model, seed, or prompt",
                  })
                );
              }
            }
          }
        }
      } else if (type === "iCCP" && dataLen > 0 && dataLen <= 512 * 1024) {
        const icc = await ctx.reader.read(payloadStart, Math.min(dataLen, 128), ctx.signal);
        const nul = icc.indexOf(0);
        const profileName = nul > 0 ? new TextDecoder("latin1").decode(icc.subarray(0, nul)) : "Embedded ICC Profile";
        fields.push(
          createMetadataField(ctx, {
            idSuffix: `iccp-${offset}`,
            fieldName: "ICC Color Profile",
            rawKey: "PNG.iCCP",
            value: profileName,
            dataType: "string",
            group: "general",
            parserId: this.id,
            byteRange: { start: payloadStart, length: dataLen },
          })
        );
      } else if (type === "caBX") {
        fields.push(
          createMetadataField(ctx, {
            idSuffix: `c2pa-${offset}`,
            fieldName: "Content Credentials (C2PA)",
            rawKey: "C2PA.caBX",
            value: `Present (${dataLen} bytes)`,
            dataType: "string",
            group: "embedded",
            parserId: this.id,
            byteRange: { start: offset, length: fullChunkLen },
          })
        );
      } else if (type === "eXIf" && dataLen > 0 && dataLen <= 2 * 1024 * 1024) {
        const exifRaw = await ctx.reader.read(payloadStart, dataLen, ctx.signal);
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
                  rawKey: `eXIf.${k}`,
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
          warnings.push("Failed to parse PNG eXIf chunk with exifr.");
        }
      }

      offset += fullChunkLen;
      if (type === "IEND") {
        sawIend = true;
        break;
      }
    }

    if (sawIend && offset < totalSize) {
      const trailingLen = totalSize - offset;
      findings.push(
        emitAnomaly(ctx, this.id, {
          id: `${ctx.fileId}:png-trailing-bytes`,
          ruleId: "rule-png-trailing-bytes",
          category: "structure",
          title: "Unexpected trailing bytes after PNG IEND chunk",
          severity: "medium",
          explanation: `Found ${trailingLen} byte(s) past the PNG IEND terminator at 0x${offset.toString(16)}.`,
          evidence: `IEND ended at 0x${offset.toString(16)}; file size is ${totalSize} bytes.`,
          affectedFieldIds: [],
          byteRange: { start: offset, length: trailingLen },
          whyItMatters: "Appended data past IEND may reflect concatenated data or custom payloads requiring inspection.",
          suggestedAction: "Inspect trailing bytes in Hex Inspector.",
          detectionMethod: this.id,
          confidence: "confirmed",
        })
      );
    } else if (!sawIend) {
      findings.push(
        emitAnomaly(ctx, this.id, {
          id: `${ctx.fileId}:png-missing-iend`,
          ruleId: "rule-png-missing-iend",
          category: "integrity",
          title: "PNG IEND chunk not found",
          severity: "low",
          explanation: "PNG stream ended without a valid IEND terminator chunk.",
          evidence: `Walked ${chunkIndex} chunks up to offset 0x${offset.toString(16)}.`,
          affectedFieldIds: [],
          whyItMatters: "Indicates truncated or malformed PNG structure.",
          suggestedAction: "Check file integrity.",
          detectionMethod: this.id,
          confidence: "confirmed",
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
        footerInspected: sawIend,
        containerIndexInspected: true,
        completeFileScanned: sawIend && offset === totalSize,
      },
    };
  }
}
