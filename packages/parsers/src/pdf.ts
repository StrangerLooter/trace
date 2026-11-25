import { XMLParser } from "fast-xml-parser";
import type { FormatParser, ParserContext, ParserOutput } from "@trace/parser-registry";
import type { DetectedStructure, ForensicFinding, MetadataField } from "@trace/shared-types";
import { createMetadataField, emitAnomaly, emitStructure, extractXmpFields, isSensitiveTagKey } from "./helpers";

const INFO_KEYS = ["Title", "Author", "Subject", "Keywords", "Creator", "Producer", "CreationDate", "ModDate"] as const;

export class PdfParser implements FormatParser {
  readonly id = "pdf-structure-parser";
  readonly version = "0.1.0";
  readonly supportedFormatIds = ["pdf"] as const;

  canParse(id: { formatId: string }): boolean {
    return id.formatId === "pdf";
  }

  async parse(ctx: ParserContext): Promise<ParserOutput> {
    const fields: MetadataField[] = [];
    const structures: DetectedStructure[] = [];
    const findings: ForensicFinding[] = [];
    const warnings: string[] = [];
    const totalSize = ctx.reader.byteLength;

    const headLen = Math.min(totalSize, 512 * 1024);
    const headBytes = await ctx.reader.read(0, headLen, ctx.signal);
    const headText = new TextDecoder("latin1").decode(headBytes);

    // Track primary PDF structural regions
    const verMatch = /%PDF-(\d+\.\d+)/.exec(headText.slice(0, 1024));
    if (verMatch) {
      const startOffset = verMatch.index;
      structures.push(
        emitStructure(ctx, this.id, {
          id: "pdf-header",
          name: `PDF ${verMatch[1]} Header`,
          type: "pdf-header",
          byteRange: { start: startOffset, length: verMatch[0].length },
        })
      );
      fields.push(
        createMetadataField(ctx, {
          idSuffix: "version",
          fieldName: "PDF Version",
          rawKey: "PDF.HeaderVersion",
          value: verMatch[1],
          dataType: "string",
          group: "pdf",
          parserId: this.id,
          byteRange: { start: startOffset, length: verMatch[0].length },
        })
      );
    }

    const tailLen = Math.min(totalSize, 512 * 1024);
    const tailStart = totalSize - tailLen;
    const tailBytes = tailStart === 0 ? headBytes : await ctx.reader.read(tailStart, tailLen, ctx.signal);
    const tailText = new TextDecoder("latin1").decode(tailBytes);

    // Structural object: File Body / Object Stream
    if (totalSize > 0) {
      structures.push(
        emitStructure(ctx, this.id, {
          id: "pdf-body",
          name: "PDF Object Catalog & Body",
          type: "pdf-body",
          byteRange: { start: 0, length: totalSize },
        })
      );
    }

    // Check %%EOF and trailing bytes
    const eofIdx = tailText.lastIndexOf("%%EOF");
    if (eofIdx >= 0) {
      const eofAbsStart = tailStart + eofIdx;
      let eofEnd = eofAbsStart + 5;
      while (eofEnd < totalSize && (tailBytes[eofEnd - tailStart] === 0x0d || tailBytes[eofEnd - tailStart] === 0x0a)) {
        eofEnd++;
      }
      structures.push(
        emitStructure(ctx, this.id, {
          id: "pdf-eof",
          name: "%%EOF Marker",
          type: "pdf-trailer",
          byteRange: { start: eofAbsStart, length: eofEnd - eofAbsStart },
        })
      );
      if (eofEnd < totalSize) {
        const trailing = totalSize - eofEnd;
        findings.push(
          emitAnomaly(ctx, this.id, {
            id: `${ctx.fileId}:pdf-trailing`,
            ruleId: "rule-pdf-trailing-bytes",
            category: "structure",
            title: "Unexpected bytes past PDF %%EOF",
            severity: "medium",
            explanation: `Found ${trailing} byte(s) after the final %%EOF marker at 0x${eofEnd.toString(16)}.`,
            evidence: `%%EOF ends at 0x${eofEnd.toString(16)}; total file size is ${totalSize} bytes.`,
            affectedFieldIds: [],
            byteRange: { start: eofEnd, length: trailing },
            whyItMatters: "Appended data after %%EOF is outside the standard PDF cross-reference structure.",
            suggestedAction: "Inspect trailing bytes in Hex Inspector.",
            detectionMethod: this.id,
            confidence: "confirmed",
          })
        );
      }
    }

    const combinedText = tailStart === 0 ? headText : `${headText}\n${tailText}`;

    // Extract Info dictionary tags when stored uncompressed
    for (const key of INFO_KEYS) {
      const regex = new RegExp(`/${key}\\s*\\(([^)]{1,512})\\)`);
      const m = regex.exec(combinedText);
      if (m) {
        const val = m[1].replace(/\\([()\\])/g, "$1");
        const sens = isSensitiveTagKey(key);
        // Estimate byteRange within scanned slice when found in headText
        let offsetInRange: { start: number; length: number } | undefined = undefined;
        const localIdx = headText.indexOf(m[0]);
        if (localIdx >= 0) {
          offsetInRange = { start: localIdx, length: m[0].length };
        } else if (tailStart > 0) {
          const tailIdx = tailText.indexOf(m[0]);
          if (tailIdx >= 0) {
            offsetInRange = { start: tailStart + tailIdx, length: m[0].length };
          }
        }

        fields.push(
          createMetadataField(ctx, {
            idSuffix: `info-${key}`,
            fieldName: key,
            rawKey: `Info.${key}`,
            value: val,
            dataType: key.includes("Date") ? "date" : "string",
            group: "pdf",
            parserId: this.id,
            byteRange: offsetInRange,
            isSensitive: sens.sensitive,
            sensitivityReason: sens.reason,
          })
        );
      }
    }

    // Structural & capability indicators
    const isEncrypted = /\/Encrypt\b/.test(combinedText);
    const hasJs = /\/(?:JavaScript|JS)\b/.test(combinedText);
    const hasLaunchOrOpen = /\/(?:Launch|OpenAction)\b/.test(combinedText);
    const hasEmbeddedFiles = /\/EmbeddedFile\b/.test(combinedText);
    const hasForms = /\/AcroForm\b/.test(combinedText);
    const hasSignatures = /\/ByteRange\b/.test(combinedText) && /\/Sig\b/.test(combinedText);

    fields.push(
      createMetadataField(ctx, {
        idSuffix: "encrypted",
        fieldName: "Encryption",
        rawKey: "PDF.Encrypt",
        value: isEncrypted,
        displayValue: isEncrypted ? "Encrypted" : "Unencrypted",
        dataType: "boolean",
        group: "pdf",
        parserId: this.id,
      }),
      createMetadataField(ctx, {
        idSuffix: "javascript",
        fieldName: "JavaScript Indicators",
        rawKey: "PDF.JavaScript",
        value: hasJs,
        displayValue: hasJs ? "Detected (/JS or /JavaScript)" : "None detected in scanned regions",
        dataType: "boolean",
        group: "pdf",
        parserId: this.id,
        isSensitive: hasJs,
        sensitivityReason: hasJs ? "Active PDF JavaScript actions warrant inspection" : undefined,
      }),
      createMetadataField(ctx, {
        idSuffix: "forms",
        fieldName: "Interactive Forms (AcroForm)",
        rawKey: "PDF.AcroForm",
        value: hasForms,
        dataType: "boolean",
        group: "pdf",
        parserId: this.id,
      }),
      createMetadataField(ctx, {
        idSuffix: "signatures",
        fieldName: "Digital Signature Objects",
        rawKey: "PDF.Sig",
        value: hasSignatures,
        dataType: "boolean",
        group: "pdf",
        parserId: this.id,
      })
    );

    if (hasJs || hasLaunchOrOpen) {
      findings.push(
        emitAnomaly(ctx, this.id, {
          id: `${ctx.fileId}:pdf-active-actions`,
          ruleId: "rule-pdf-active-actions",
          category: "structure",
          title: "PDF contains active script or action dictionaries",
          severity: hasLaunchOrOpen ? "high" : "medium",
          explanation: "Detected /JavaScript, /JS, /OpenAction, or /Launch tokens inside the PDF object structure.",
          evidence: [
            hasJs ? "/JavaScript or /JS present" : null,
            hasLaunchOrOpen ? "/OpenAction or /Launch present" : null,
          ]
            .filter(Boolean)
            .join("; "),
          affectedFieldIds: [],
          whyItMatters: "Automatic open actions and embedded JavaScript can execute unintended behavior in permissive PDF viewers.",
          suggestedAction: "Inspect object definitions before opening in a standard PDF viewer.",
          detectionMethod: this.id,
          confidence: "probable",
        })
      );
    }

    if (hasEmbeddedFiles) {
      fields.push(
        createMetadataField(ctx, {
          idSuffix: "embedded-files",
          fieldName: "Embedded Files",
          rawKey: "PDF.EmbeddedFile",
          value: true,
          displayValue: "Present (/EmbeddedFile)",
          dataType: "boolean",
          group: "embedded",
          parserId: this.id,
          isSensitive: true,
          sensitivityReason: "PDF contains embedded file attachment streams",
        })
      );
    }

    // Extract uncompressed XMP packet if present (safe XML parsing, entities disabled)
    const xmpStart = combinedText.indexOf("<x:xmpmeta");
    const xmpEnd = xmpStart >= 0 ? combinedText.indexOf("</x:xmpmeta>", xmpStart) : -1;
    if (xmpStart >= 0 && xmpEnd > xmpStart && xmpEnd - xmpStart <= 256 * 1024) {
      const xmpXml = combinedText.slice(xmpStart, xmpEnd + "</x:xmpmeta>".length);
      if (!xmpXml.includes("<!DOCTYPE") && !xmpXml.includes("<!ENTITY")) {
        try {
          const xmlParser = new XMLParser({
            ignoreAttributes: false,
            processEntities: false,
          });
          const parsedXmp = xmlParser.parse(xmpXml);
          if (parsedXmp) {
            const xmpAbsRange = xmpStart < headText.length ? { start: xmpStart, length: xmpXml.length } : undefined;
            fields.push(
              createMetadataField(ctx, {
                idSuffix: "xmp-present",
                fieldName: "XMP Metadata Stream",
                rawKey: "PDF.XMP",
                value: true,
                displayValue: `Present (${xmpXml.length} chars)`,
                dataType: "boolean",
                group: "xmp",
                parserId: this.id,
                byteRange: xmpAbsRange,
                isSensitive: true,
                sensitivityReason: "PDF embeds an XMP XML metadata packet",
              })
            );
            extractXmpFields(xmpXml, ctx, this.id, fields, xmpAbsRange);
          }
        } catch {
          warnings.push("Failed to parse embedded PDF XMP XML safely.");
        }
      }
    }

    // Incremental update count (#15) & external /URI links (#18)
    const revMatches = combinedText.match(/\bstartxref\b/g);
    const revCount = revMatches ? revMatches.length : 1;
    if (revCount > 1) {
      fields.push(
        createMetadataField(ctx, {
          idSuffix: "revisions",
          fieldName: "Incremental Revision Count",
          rawKey: "PDF.RevisionCount",
          value: revCount,
          displayValue: `${revCount} revision(s) (incremental updates present)`,
          dataType: "number",
          group: "pdf",
          parserId: this.id,
          isSensitive: true,
          sensitivityReason: "Multiple startxref blocks indicate incremental edits where older object versions may persist",
        })
      );
    }

    const uriSet = new Set<string>();
    for (const m of combinedText.matchAll(/\/URI\s*\((https?:\/\/[^)\r\n]{1,256})\)/gi)) {
      uriSet.add(m[1]);
      if (uriSet.size >= 15) break;
    }
    if (uriSet.size > 0) {
      fields.push(
        createMetadataField(ctx, {
          idSuffix: "external-uris",
          fieldName: "External URI Links",
          rawKey: "PDF.ExternalURIs",
          value: Array.from(uriSet),
          displayValue: Array.from(uriSet).slice(0, 5).join(", "),
          dataType: "array",
          group: "pdf",
          parserId: this.id,
          isSensitive: true,
          sensitivityReason: "External URI targets inside PDF actions or annotations warrant inspection before clicking",
        })
      );
    }

    const fullyScanned = tailStart === 0;
    return {
      parserId: this.id,
      parserVersion: this.version,
      fields,
      structures,
      findings,
      warnings,
      coveragePatch: {
        headerInspected: true,
        footerInspected: eofIdx >= 0,
        containerIndexInspected: true,
        completeFileScanned: fullyScanned,
        uninspectedReasons: fullyScanned
          ? []
          : ["Compressed PDF object streams (FlateDecode) require consented backend pikepdf/qpdf for full object graph extraction."],
      },
    };
  }
}
