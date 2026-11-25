import { XMLParser } from "fast-xml-parser";
export { unzipSync, zipSync } from "fflate";
import type { ParserContext } from "@trace/parser-registry";
import type {
  ByteRange,
  DetectedStructure,
  ForensicFinding,
  MetadataField,
  MetadataGroup,
} from "@trace/shared-types";

export function emitStructure(
  ctx: ParserContext,
  parserId: string,
  structure: DetectedStructure
): DetectedStructure {
  ctx.emitter.emit(
    {
      eventType: "STRUCTURE_DETECTED",
      severity: "debug",
      fileId: ctx.fileId,
      parserId,
      operation: `${parserId}.structure`,
      message: `${structure.name} @ 0x${structure.byteRange.start.toString(16)} (${structure.byteRange.length} B)`,
      byteRange: structure.byteRange,
      payload: {
        name: structure.name,
        start: structure.byteRange.start,
        length: structure.byteRange.length,
      },
    },
    ctx.onEvent
  );
  return structure;
}

export interface AddFieldInput {
  idSuffix: string;
  fieldName: string;
  rawKey?: string;
  value: MetadataField["value"];
  displayValue?: string;
  dataType: MetadataField["dataType"];
  group: MetadataGroup;
  parserId: string;
  byteRange?: ByteRange;
  confidence?: MetadataField["confidence"];
  isSensitive?: boolean;
  sensitivityReason?: string;
  status?: MetadataField["status"];
}

export function createMetadataField(
  ctx: ParserContext,
  input: AddFieldInput
): MetadataField {
  const isSensitive = Boolean(input.isSensitive);
  const field: MetadataField = {
    id: `${ctx.fileId}:${input.parserId}:${input.idSuffix}`,
    fieldName: input.fieldName,
    rawKey: input.rawKey,
    value: input.value,
    displayValue:
      input.displayValue ??
      (input.value === null ? "null" : Array.isArray(input.value) ? input.value.join(", ") : String(input.value)),
    dataType: input.dataType,
    group: input.group,
    sourceParser: input.parserId,
    ...(input.byteRange ? { byteRange: input.byteRange } : {}),
    confidence: input.confidence ?? "confirmed",
    isSensitive,
    ...(input.sensitivityReason ? { sensitivityReason: input.sensitivityReason } : {}),
    status: input.status ?? "valid",
  };

  ctx.emitter.emit(
    {
      eventType: isSensitive ? "SENSITIVE_FIELD_FOUND" : "METADATA_FIELD_FOUND",
      severity: isSensitive ? "finding" : "debug",
      fileId: ctx.fileId,
      parserId: input.parserId,
      operation: `${input.parserId}.extract`,
      // Never log raw sensitive field values into diagnostic events
      message: isSensitive
        ? `Sensitive field ${input.group}.${input.fieldName} detected`
        : `Extracted ${input.group}.${input.fieldName}`,
      ...(input.byteRange ? { byteRange: input.byteRange } : {}),
      payload: {
        group: input.group,
        fieldName: input.fieldName,
        sensitive: isSensitive,
      },
    },
    ctx.onEvent
  );

  return field;
}

export function emitAnomaly(
  ctx: ParserContext,
  parserId: string,
  finding: ForensicFinding
): ForensicFinding {
  ctx.emitter.emit(
    {
      eventType: "ANOMALY_DETECTED",
      severity: finding.severity === "high" || finding.severity === "critical" ? "error" : "warn",
      fileId: ctx.fileId,
      parserId,
      operation: `${parserId}.integrity`,
      message: finding.title,
      ...(finding.byteRange ? { byteRange: finding.byteRange } : {}),
      payload: { ruleId: finding.ruleId, severity: finding.severity },
    },
    ctx.onEvent
  );
  return finding;
}

export function isSensitiveTagKey(rawKey: string): { sensitive: boolean; reason?: string } {
  const k = rawKey.toLowerCase();
  if (k.includes("gps") || k.includes("latitude") || k.includes("longitude")) {
    return { sensitive: true, reason: "Reveals geographic capture location" };
  }
  if (k.includes("serial") || k.includes("bodyserial") || k.includes("lensserial") || k.includes("uniqueid")) {
    return { sensitive: true, reason: "Hardware identifier that can link files to a specific device" };
  }
  if (k.includes("author") || k.includes("artist") || k.includes("creator") || k.includes("owner") || k.includes("lastmodifiedby") || k.includes("copyright")) {
    return { sensitive: true, reason: "May reveal personal identity, author name, or username" };
  }
  if (k.includes("software") || k.includes("producer") || k.includes("writingapp") || k.includes("encoder")) {
    return { sensitive: true, reason: "Reveals editing toolchain and software version" };
  }
  if (k.includes("date") || k.includes("time")) {
    return { sensitive: true, reason: "Reveals creation or modification timeline" };
  }
  return { sensitive: false };
}

const XMP_TARGET_KEYS = new Set([
  "CreatorTool",
  "CreateDate",
  "ModifyDate",
  "MetadataDate",
  "DocumentID",
  "InstanceID",
  "OriginalDocumentID",
  "creator",
  "rights",
  "title",
  "description",
  "softwareAgent",
  "action",
  "when",
  "Make",
  "Model",
]);

/** Safely parse an XMP XML packet (XXE disabled) into normalized 'xmp' MetadataFields. */
export function extractXmpFields(
  xml: string,
  ctx: ParserContext,
  parserId: string,
  fields: MetadataField[],
  byteRange?: ByteRange
): number {
  if (!xml || xml.length > 512 * 1024 || xml.includes("<!DOCTYPE") || xml.includes("<!ENTITY")) {
    return 0;
  }
  let added = 0;
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      processEntities: false,
      removeNSPrefix: true,
    });
    const doc = parser.parse(xml) as Record<string, unknown>;
    const seen = new Set<string>();

    const walk = (node: unknown, depth: number) => {
      if (depth > 8 || added >= 40 || node === null || node === undefined) return;
      if (Array.isArray(node)) {
        for (const item of node.slice(0, 12)) walk(item, depth + 1);
        return;
      }
      if (typeof node !== "object") return;
      for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
        if (added >= 40) break;
        if (val === null || val === undefined) continue;
        if (typeof val === "object") {
          walk(val, depth + 1);
          continue;
        }
        const cleanKey = key.replace(/^@/, "");
        if (!XMP_TARGET_KEYS.has(cleanKey)) continue;
        const valStr = String(val).trim();
        if (!valStr || seen.has(`${cleanKey}=${valStr}`)) continue;
        seen.add(`${cleanKey}=${valStr}`);
        const sens = isSensitiveTagKey(cleanKey);
        added++;
        fields.push(
          createMetadataField(ctx, {
            idSuffix: `xmp-${cleanKey}-${added}`,
            fieldName: `XMP ${cleanKey}`,
            rawKey: `XMP.${cleanKey}`,
            value: valStr.length > 512 ? `${valStr.slice(0, 512)}...` : valStr,
            dataType: cleanKey.toLowerCase().includes("date") || cleanKey === "when" ? "date" : "string",
            group: "xmp",
            parserId,
            byteRange,
            isSensitive: sens.sensitive || cleanKey === "DocumentID" || cleanKey === "creator",
            sensitivityReason: sens.reason ?? "Embedded XMP provenance or edit history tag",
          })
        );
      }
    };
    walk(doc, 0);
  } catch {
    return 0;
  }
  return added;
}
