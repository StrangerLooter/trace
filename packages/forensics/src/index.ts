import type {
  DetectedStructure,
  FileIdentificationResult,
  FindingSeverity,
  ForensicFinding,
  MetadataField,
} from "@trace/shared-types";

export interface ForensicEvaluationInput {
  fileId: string;
  fileSizeBytes: number;
  identification: FileIdentificationResult;
  fields: MetadataField[];
  structures: DetectedStructure[];
  parserFindings: ForensicFinding[];
  now?: Date;
}

export interface ForensicRiskSummary {
  highestSeverity: FindingSeverity | "none";
  countsBySeverity: Record<FindingSeverity, number>;
  privacyFindingCount: number;
  integrityFindingCount: number;
  deterministicSummary: string;
}

export interface ForensicEvaluationResult {
  findings: ForensicFinding[];
  summary: ForensicRiskSummary;
}

const SEVERITY_RANK: Record<FindingSeverity, number> = {
  informational: 1,
  low: 2,
  medium: 3,
  high: 4,
  critical: 5,
};

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function parseSafeDate(value: string | number | boolean | string[] | null): Date | null {
  if (typeof value !== "string") return null;
  // Handle EXIF format "YYYY:MM:DD HH:MM:SS" and ISO formats
  const normalized = /^\d{4}:\d{2}:\d{2}/.test(value)
    ? value.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3").replace(" ", "T")
    : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function evaluateForensicRules(input: ForensicEvaluationInput): ForensicEvaluationResult {
  const { fileId, identification, fields, parserFindings } = input;
  const now = input.now ?? new Date();
  const findings: ForensicFinding[] = [...parserFindings];

  // 1. Extension vs. Signature mismatch
  if (
    identification.extensionMismatch &&
    !findings.some((f) => f.ruleId === "rule-extension-mismatch")
  ) {
    findings.push({
      id: `${fileId}:ext-mismatch`,
      ruleId: "rule-extension-mismatch",
      category: "mismatch",
      title: "Filename extension does not match binary signature",
      severity: "high",
      explanation: `Declared extension '.${identification.declaredExtension}' conflicts with detected format ${identification.displayName} (${identification.detectedMime}).`,
      evidence: identification.evidence
        .map((e) => `${e.description} (${e.matchedHex})`)
        .join("; "),
      affectedFieldIds: [],
      byteRange: identification.evidence[0]?.byteRange,
      whyItMatters:
        "Files may be renamed intentionally to disguise their true type or mislabeled during transfer.",
      suggestedAction:
        "Inspect the file header in Hex Inspector and verify provenance before opening externally.",
      detectionMethod: "packages/file-signatures + packages/forensics",
      confidence: identification.confidence === "confirmed" ? "confirmed" : "probable",
    });
  }

  // 2. Weak or non-zero offset signature note
  if (identification.confidence === "probable") {
    findings.push({
      id: `${fileId}:weak-signature`,
      ruleId: "rule-weak-signature-confidence",
      category: "integrity",
      title: "File format identified with probable (non-exclusive) signature",
      severity: "informational",
      explanation: `${identification.displayName} matched via a heuristic or headerless pattern (${identification.secondaryMatches.join("; ") || "weak match"}).`,
      evidence: identification.evidence.map((e) => e.description).join("; "),
      affectedFieldIds: [],
      byteRange: identification.evidence[0]?.byteRange,
      whyItMatters:
        "Probable matches can occasionally occur by chance or in truncated streams and should be corroborated.",
      suggestedAction: "Verify structure and media playback/headers before relying on format classification.",
      detectionMethod: "packages/forensics",
      confidence: "probable",
    });
  }

  // 3. Privacy: GPS Location Exposure
  const gpsFields = fields.filter(
    (f) =>
      f.group === "gps" ||
      /^(gps|latitude|longitude)/i.test(f.rawKey ?? f.fieldName)
  );
  if (gpsFields.length > 0) {
    findings.push({
      id: `${fileId}:privacy-gps`,
      ruleId: "rule-privacy-gps-coordinates",
      category: "privacy",
      title: "Precise GPS location metadata present",
      severity: "high",
      explanation: `Detected ${gpsFields.length} geographic coordinate/location metadata field(s) (${gpsFields.map((f) => f.fieldName).slice(0, 4).join(", ")}).`,
      evidence: gpsFields.map((f) => `${f.fieldName}: ${f.displayValue}`).slice(0, 4).join("; "),
      affectedFieldIds: gpsFields.map((f) => f.id),
      byteRange: gpsFields.find((f) => f.byteRange)?.byteRange,
      whyItMatters:
        "GPS tags can pinpoint a user's home, workplace, or movement history when files are shared publicly.",
      suggestedAction: "Use TRACE Sanitizer to strip GPS/EXIF metadata before sharing.",
      detectionMethod: "packages/forensics",
      confidence: "confirmed",
    });
  }

  // 4. Privacy: Device / Camera Serial Numbers
  const serialFields = fields.filter((f) =>
    /serial|uniqueid/i.test(f.rawKey ?? f.fieldName)
  );
  if (serialFields.length > 0) {
    findings.push({
      id: `${fileId}:privacy-device-serial`,
      ruleId: "rule-privacy-device-serial",
      category: "privacy",
      title: "Hardware or device serial number embedded",
      severity: "medium",
      explanation: `Found ${serialFields.length} device identifier tag(s) (${serialFields.map((f) => f.fieldName).join(", ")}).`,
      evidence: serialFields.map((f) => `${f.fieldName}=${f.displayValue}`).join("; "),
      affectedFieldIds: serialFields.map((f) => f.id),
      byteRange: serialFields.find((f) => f.byteRange)?.byteRange,
      whyItMatters:
        "Serial numbers allow correlating multiple unrelated files back to the exact physical camera or lens.",
      suggestedAction: "Strip device metadata before anonymous or public distribution.",
      detectionMethod: "packages/forensics",
      confidence: "confirmed",
    });
  }

  // 5. Privacy: Author / Identity / Username fields
  const identityFields = fields.filter((f) =>
    /(author|artist|creator|owner|lastmodifiedby|company)/i.test(f.rawKey ?? f.fieldName) &&
    typeof f.value === "string" &&
    f.value.trim().length > 0
  );
  if (identityFields.length > 0) {
    findings.push({
      id: `${fileId}:privacy-author-identity`,
      ruleId: "rule-privacy-author-identity",
      category: "privacy",
      title: "Author, creator, or organization metadata present",
      severity: "medium",
      explanation: `Detected ${identityFields.length} identity-bearing metadata field(s) (${identityFields.map((f) => f.fieldName).join(", ")}).`,
      evidence: identityFields.map((f) => f.fieldName).join(", "),
      affectedFieldIds: identityFields.map((f) => f.id),
      byteRange: identityFields.find((f) => f.byteRange)?.byteRange,
      whyItMatters:
        "Document and media author tags frequently expose real names, OS account usernames, or employers.",
      suggestedAction: "Review and sanitize document/media properties before external sharing.",
      detectionMethod: "packages/forensics",
      confidence: "confirmed",
    });
  }

  // 6. Privacy: Email address pattern inside metadata values
  const emailFields = fields.filter(
    (f) => typeof f.value === "string" && EMAIL_PATTERN.test(f.value)
  );
  if (emailFields.length > 0) {
    findings.push({
      id: `${fileId}:privacy-email-pattern`,
      ruleId: "rule-privacy-email-address",
      category: "privacy",
      title: "Email address pattern found inside metadata",
      severity: "medium",
      explanation: `Detected email address string(s) inside ${emailFields.map((f) => f.fieldName).join(", ")}.`,
      evidence: `Matched in ${emailFields.length} metadata field(s)`,
      affectedFieldIds: emailFields.map((f) => f.id),
      byteRange: emailFields.find((f) => f.byteRange)?.byteRange,
      whyItMatters: "Embedded contact addresses expose personal or organizational identities.",
      suggestedAction: "Sanitize affected metadata tags before publishing.",
      detectionMethod: "packages/forensics",
      confidence: "confirmed",
    });
  }

  // 7. Privacy: Software / Toolchain Disclosure (Low/Informational — not exaggerated)
  const softwareFields = fields.filter((f) =>
    /(software|producer|creatortool|encoder|writingapp|tool)/i.test(f.rawKey ?? f.fieldName)
  );
  if (softwareFields.length > 0) {
    findings.push({
      id: `${fileId}:privacy-software`,
      ruleId: "rule-privacy-software-fingerprint",
      category: "privacy",
      title: "Software or encoder fingerprint disclosed",
      severity: "low",
      explanation: `File reveals creation/editing software (${softwareFields.map((f) => f.displayValue).slice(0, 3).join(", ")}).`,
      evidence: softwareFields.map((f) => `${f.fieldName}: ${f.displayValue}`).slice(0, 3).join("; "),
      affectedFieldIds: softwareFields.map((f) => f.id),
      byteRange: softwareFields.find((f) => f.byteRange)?.byteRange,
      whyItMatters:
        "Tool names and OS/version strings reveal your editing workflow and software environment.",
      suggestedAction: "Optional: strip software tags if minimizing operational fingerprint.",
      detectionMethod: "packages/forensics",
      confidence: "confirmed",
    });
  }

  // 8. Embedded Objects / Comments / Artwork
  const embeddedFields = fields.filter((f) => f.group === "embedded");
  if (embeddedFields.length > 0) {
    findings.push({
      id: `${fileId}:embedded-objects`,
      ruleId: "rule-embedded-content",
      category: "structure",
      title: "Embedded attachments, comments, or hidden sub-objects detected",
      severity: "medium",
      explanation: `Container references embedded content: ${embeddedFields.map((f) => f.fieldName).join(", ")}.`,
      evidence: embeddedFields.map((f) => `${f.fieldName}=${f.displayValue}`).join("; "),
      affectedFieldIds: embeddedFields.map((f) => f.id),
      whyItMatters:
        "Embedded files, reviewer comments, or OLE objects can carry unreviewed text or separate metadata.",
      suggestedAction: "Inspect embedded streams and remove reviewer comments prior to release.",
      detectionMethod: "packages/forensics",
      confidence: "confirmed",
    });
  }

  // 9. Integrity: Timestamp anomalies (future dates, zeroed PE timestamps, modify < create)
  const createField = fields.find((f) =>
    /^(datetimeoriginal|createdate|creationdate|created|mvhd\.creation_time)$/i.test(
      f.rawKey ?? f.fieldName
    )
  );
  const modifyField = fields.find((f) =>
    /^(modifydate|moddate|modified|lastmodified|time)$/i.test(f.rawKey ?? f.fieldName)
  );
  const createDate = createField ? parseSafeDate(createField.value) : null;
  const modifyDate = modifyField ? parseSafeDate(modifyField.value) : null;

  if (createDate && modifyDate && modifyDate.getTime() < createDate.getTime() - 60_000) {
    findings.push({
      id: `${fileId}:timestamp-order`,
      ruleId: "rule-integrity-timestamp-order",
      category: "integrity",
      title: "Modification timestamp precedes creation timestamp",
      severity: "low",
      explanation: `Modification date (${modifyDate.toISOString()}) is earlier than creation date (${createDate.toISOString()}).`,
      evidence: `${createField?.fieldName}=${createField?.displayValue}; ${modifyField?.fieldName}=${modifyField?.displayValue}`,
      affectedFieldIds: [createField!.id, modifyField!.id],
      whyItMatters:
        "Out-of-order timestamps can indicate clock drift, file copying across filesystems, or manual metadata editing.",
      suggestedAction: "Cross-check timestamps against external provenance.",
      detectionMethod: "packages/forensics",
      confidence: "confirmed",
    });
  }

  const maxFutureMs = now.getTime() + 365 * 24 * 60 * 60 * 1000;
  for (const field of fields) {
    if (field.dataType !== "date") continue;
    const d = parseSafeDate(field.value);
    if (!d) continue;
    if (field.rawKey === "PE.TimeDateStamp" && d.getTime() === 0) {
      findings.push({
        id: `${fileId}:pe-zero-timestamp`,
        ruleId: "rule-pe-zero-timestamp",
        category: "integrity",
        title: "PE linker timestamp is zeroed (1970-01-01)",
        severity: "informational",
        explanation: "COFF TimeDateStamp is 0x00000000.",
        evidence: "PE.TimeDateStamp = 0",
        affectedFieldIds: [field.id],
        byteRange: field.byteRange,
        whyItMatters:
          "Zeroed timestamps occur in reproducible builds, stripped binaries, or packed executables.",
        suggestedAction: "Evaluate alongside section entropy and signature verification.",
        detectionMethod: "packages/forensics",
        confidence: "confirmed",
      });
    } else if (d.getTime() > maxFutureMs) {
      findings.push({
        id: `${fileId}:future-timestamp-${field.id}`,
        ruleId: "rule-integrity-future-timestamp",
        category: "integrity",
        title: "Metadata timestamp is more than one year in the future",
        severity: "low",
        explanation: `${field.fieldName} reports ${d.toISOString()}.`,
        evidence: `${field.fieldName}=${field.displayValue}`,
        affectedFieldIds: [field.id],
        byteRange: field.byteRange,
        whyItMatters: "Future dates indicate misconfigured device clocks or altered metadata.",
        suggestedAction: "Treat chronological metadata cautiously.",
        detectionMethod: "packages/forensics",
        confidence: "confirmed",
      });
    }
  }

  // 10. Binary Overlay Note (never labeled malware automatically)
  const overlayField = fields.find((f) => f.rawKey === "PE.Overlay");
  if (overlayField) {
    findings.push({
      id: `${fileId}:pe-overlay`,
      ruleId: "rule-pe-overlay-present",
      category: "structure",
      title: "PE binary contains overlay bytes past last section",
      severity: "informational",
      explanation: `Detected ${overlayField.displayValue}.`,
      evidence: overlayField.displayValue,
      affectedFieldIds: [overlayField.id],
      byteRange: overlayField.byteRange,
      whyItMatters:
        "PE overlays commonly store Authenticode certificates or installer archives, or appended custom data.",
      suggestedAction: "Inspect overlay header bytes in Hex Inspector.",
      detectionMethod: "packages/forensics",
      confidence: "confirmed",
    });
  }

  // Sort deterministically from highest severity to lowest
  findings.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);

  const countsBySeverity: Record<FindingSeverity, number> = {
    informational: 0,
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };
  let privacyFindingCount = 0;
  let integrityFindingCount = 0;
  let highestRank = 0;
  let highestSeverity: ForensicRiskSummary["highestSeverity"] = "none";

  for (const f of findings) {
    countsBySeverity[f.severity]++;
    if (f.category === "privacy") privacyFindingCount++;
    else integrityFindingCount++;
    const rank = SEVERITY_RANK[f.severity];
    if (rank > highestRank) {
      highestRank = rank;
      highestSeverity = f.severity;
    }
  }

  const deterministicSummary =
    findings.length === 0
      ? "No privacy disclosures or structural anomalies detected across inspected regions."
      : `${findings.length} deterministic finding(s) (${privacyFindingCount} privacy, ${integrityFindingCount} integrity/structure); highest severity: ${highestSeverity}.`;

  return {
    findings,
    summary: {
      highestSeverity,
      countsBySeverity,
      privacyFindingCount,
      integrityFindingCount,
      deterministicSummary,
    },
  };
}
