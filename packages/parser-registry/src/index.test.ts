import { describe, expect, it } from "vitest";
import { BufferBinaryReader } from "@trace/binary-core";
import { detectFileSignature } from "@trace/file-signatures";
import { getFormatSupportStatus, ParserRegistry, type FormatParser } from "./index";

describe("ParserRegistry", () => {
  it("reports accurate support statuses and builds size-aware analysis plans", async () => {
    expect(getFormatSupportStatus("jpeg")).toBe("fully_supported");
    expect(getFormatSupportStatus("webp")).toBe("fully_supported");
    expect(getFormatSupportStatus("pdf")).toBe("partially_supported");
    expect(getFormatSupportStatus("pe")).toBe("partially_supported");
    expect(getFormatSupportStatus("macho")).toBe("identification_only");
    expect(getFormatSupportStatus("nonexistent")).toBe("unsupported");

    const registry = new ParserRegistry();
    const mockJpegParser: FormatParser = {
      id: "jpeg-segment-parser",
      version: "0.1.0",
      supportedFormatIds: ["jpeg"],
      canParse: (id) => id.formatId === "jpeg",
      parse: async () => ({
        parserId: "jpeg-segment-parser",
        parserVersion: "0.1.0",
        fields: [],
        structures: [],
        findings: [],
        warnings: [],
        coveragePatch: {},
      }),
    };
    registry.register(mockJpegParser);

    const jpegId = await detectFileSignature(
      new BufferBinaryReader(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])),
      { fileName: "test.jpg" }
    );
    const smallPlan = registry.plan(jpegId, 50_000);
    expect(smallPlan.selectedParserIds).toEqual(["jpeg-segment-parser"]);
    expect(smallPlan.largeFileMode).toBe(false);
    expect(smallPlan.requiresConsentForFull).toBe(false);

    const mp4Id = await detectFileSignature(
      new BufferBinaryReader(
        new Uint8Array([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0])
      ),
      { fileName: "big.mp4" }
    );
    const largePlan = registry.plan(mp4Id, 5 * 1024 * 1024 * 1024);
    expect(largePlan.largeFileMode).toBe(true);
    expect(largePlan.requiresConsentForFull).toBe(true);
    expect(largePlan.warnings.some((w) => w.includes("Large file"))).toBe(true);
  });
});
