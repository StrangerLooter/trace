import type { FormatParser, ParserContext, ParserOutput } from "@trace/parser-registry";
import type { DetectedStructure, ForensicFinding, MetadataField } from "@trace/shared-types";
import { createMetadataField, emitStructure } from "./helpers";

const PE_MACHINES: Record<number, string> = {
  0x014c: "x86 (32-bit)",
  0x8664: "x86-64 (AMD64)",
  0x01c4: "ARMv7 Thumb-2",
  0xaa64: "ARM64 (AArch64)",
};

const ELF_MACHINES: Record<number, string> = {
  0x03: "x86",
  0x28: "ARM",
  0x3e: "x86-64",
  0xb7: "AArch64",
  0xf3: "RISC-V",
};

export class PeHeaderParser implements FormatParser {
  readonly id = "pe-header-parser";
  readonly version = "0.1.0";
  readonly supportedFormatIds = ["pe"] as const;

  canParse(id: { formatId: string }): boolean {
    return id.formatId === "pe";
  }

  async parse(ctx: ParserContext): Promise<ParserOutput> {
    const fields: MetadataField[] = [];
    const structures: DetectedStructure[] = [];
    const findings: ForensicFinding[] = [];
    const warnings: string[] = [];
    const totalSize = ctx.reader.byteLength;

    if (totalSize < 0x40) {
      return { parserId: this.id, parserVersion: this.version, fields, structures, findings, warnings, coveragePatch: {} };
    }

    const dos = await ctx.reader.read(0, 0x40, ctx.signal);
    const eLfanew = new DataView(dos.buffer, dos.byteOffset, 0x40).getUint32(0x3c, true);
    if (eLfanew + 24 > totalSize) {
      return { parserId: this.id, parserVersion: this.version, fields, structures, findings, warnings, coveragePatch: {} };
    }

    structures.push(
      emitStructure(ctx, this.id, {
        id: "pe-dos-header",
        name: "DOS Header",
        type: "pe-dos",
        byteRange: { start: 0, length: 0x40 },
      })
    );

    const coff = await ctx.reader.read(eLfanew, 24, ctx.signal);
    const cv = new DataView(coff.buffer, coff.byteOffset, 24);
    const machine = cv.getUint16(4, true);
    const numSections = cv.getUint16(6, true);
    const timestamp = cv.getUint32(8, true);
    const optHeaderSize = cv.getUint16(20, true);

    structures.push(
      emitStructure(ctx, this.id, {
        id: "pe-coff-header",
        name: "COFF File Header",
        type: "pe-coff",
        byteRange: { start: eLfanew, length: 24 },
      })
    );

    fields.push(
      createMetadataField(ctx, {
        idSuffix: "machine",
        fieldName: "Target Architecture",
        rawKey: "PE.Machine",
        value: PE_MACHINES[machine] ?? `0x${machine.toString(16)}`,
        dataType: "string",
        group: "binary",
        parserId: this.id,
        byteRange: { start: eLfanew + 4, length: 2 },
      }),
      createMetadataField(ctx, {
        idSuffix: "sections",
        fieldName: "Section Count",
        rawKey: "PE.NumberOfSections",
        value: numSections,
        dataType: "number",
        group: "binary",
        parserId: this.id,
        byteRange: { start: eLfanew + 6, length: 2 },
      }),
      createMetadataField(ctx, {
        idSuffix: "timestamp",
        fieldName: "COFF Linker Timestamp",
        rawKey: "PE.TimeDateStamp",
        value: new Date(timestamp * 1000).toISOString(),
        displayValue: `${new Date(timestamp * 1000).toISOString()} (0x${timestamp.toString(16)})`,
        dataType: "date",
        group: "binary",
        parserId: this.id,
        byteRange: { start: eLfanew + 8, length: 4 },
        isSensitive: true,
        sensitivityReason: "Reveals build timestamp (can also be zeroed/forged by packers)",
      })
    );

    const optOffset = eLfanew + 24;
    if (optHeaderSize >= 24 && optOffset + optHeaderSize <= totalSize) {
      const opt = await ctx.reader.read(optOffset, Math.min(optHeaderSize, 96), ctx.signal);
      const ov = new DataView(opt.buffer, opt.byteOffset, opt.byteLength);
      const magic = ov.getUint16(0, true);
      const entryPoint = ov.getUint32(16, true);
      fields.push(
        createMetadataField(ctx, {
          idSuffix: "pe-format",
          fieldName: "PE Format",
          rawKey: "PE.OptionalHeader.Magic",
          value: magic === 0x20b ? "PE32+ (64-bit)" : magic === 0x10b ? "PE32 (32-bit)" : `0x${magic.toString(16)}`,
          dataType: "string",
          group: "binary",
          parserId: this.id,
          byteRange: { start: optOffset, length: 2 },
        }),
        createMetadataField(ctx, {
          idSuffix: "entry-point",
          fieldName: "Entry Point RVA",
          rawKey: "PE.AddressOfEntryPoint",
          value: `0x${entryPoint.toString(16).toUpperCase()}`,
          dataType: "string",
          group: "binary",
          parserId: this.id,
          byteRange: { start: optOffset + 16, length: 4 },
        })
      );
    }

    const secTableOffset = optOffset + optHeaderSize;
    const cappedSections = Math.min(numSections, 96);
    if (cappedSections > 0 && secTableOffset + cappedSections * 40 <= totalSize) {
      const secBytes = await ctx.reader.read(secTableOffset, cappedSections * 40, ctx.signal);
      let maxSectionEnd = 0;
      for (let i = 0; i < cappedSections; i++) {
        const base = i * 40;
        const sv = new DataView(secBytes.buffer, secBytes.byteOffset + base, 40);
        const name = new TextDecoder("ascii").decode(secBytes.subarray(base, base + 8)).replace(/\0+$/, "");
        const rawSize = sv.getUint32(16, true);
        const rawPtr = sv.getUint32(20, true);
        if (rawPtr + rawSize > maxSectionEnd) maxSectionEnd = rawPtr + rawSize;
        structures.push(
          emitStructure(ctx, this.id, {
            id: `pe-sec-${i}`,
            name: `Section ${name || i} (header)`,
            type: "pe-section-header",
            byteRange: { start: secTableOffset + base, length: 40 },
          })
        );
      }

      if (maxSectionEnd > 0 && maxSectionEnd < totalSize) {
        const overlayLen = totalSize - maxSectionEnd;
        fields.push(
          createMetadataField(ctx, {
            idSuffix: "overlay",
            fieldName: "PE Overlay Data",
            rawKey: "PE.Overlay",
            value: overlayLen,
            displayValue: `${overlayLen} bytes past last section`,
            dataType: "number",
            group: "binary",
            parserId: this.id,
            byteRange: { start: maxSectionEnd, length: overlayLen },
            isSensitive: true,
            sensitivityReason: "Overlay bytes may hold Authenticode signatures, installers, or appended payloads",
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
        containerIndexInspected: true,
      },
    };
  }
}

export class ElfHeaderParser implements FormatParser {
  readonly id = "elf-header-parser";
  readonly version = "0.1.0";
  readonly supportedFormatIds = ["elf"] as const;

  canParse(id: { formatId: string }): boolean {
    return id.formatId === "elf";
  }

  async parse(ctx: ParserContext): Promise<ParserOutput> {
    const fields: MetadataField[] = [];
    const structures: DetectedStructure[] = [];
    const findings: ForensicFinding[] = [];
    const warnings: string[] = [];

    if (ctx.reader.byteLength < 52) {
      return { parserId: this.id, parserVersion: this.version, fields, structures, findings, warnings, coveragePatch: {} };
    }

    const ehdr = await ctx.reader.read(0, Math.min(ctx.reader.byteLength, 64), ctx.signal);
    const is64 = ehdr[4] === 2;
    const littleEndian = ehdr[5] === 1;
    const dv = new DataView(ehdr.buffer, ehdr.byteOffset, ehdr.byteLength);

    const eType = dv.getUint16(16, littleEndian);
    const eMachine = dv.getUint16(18, littleEndian);
    const eEntry = is64 && ehdr.byteLength >= 64 ? dv.getBigUint64(24, littleEndian) : BigInt(dv.getUint32(24, littleEndian));

    structures.push(
      emitStructure(ctx, this.id, {
        id: "elf-header",
        name: `ELF${is64 ? "64" : "32"} Header`,
        type: "elf-header",
        byteRange: { start: 0, length: is64 ? 64 : 52 },
      })
    );

    fields.push(
      createMetadataField(ctx, {
        idSuffix: "class",
        fieldName: "ELF Class",
        rawKey: "ELF.EI_CLASS",
        value: is64 ? "ELF64 (64-bit)" : "ELF32 (32-bit)",
        dataType: "string",
        group: "binary",
        parserId: this.id,
        byteRange: { start: 4, length: 1 },
      }),
      createMetadataField(ctx, {
        idSuffix: "endian",
        fieldName: "Endianness",
        rawKey: "ELF.EI_DATA",
        value: littleEndian ? "Little-Endian (LSB)" : "Big-Endian (MSB)",
        dataType: "string",
        group: "binary",
        parserId: this.id,
        byteRange: { start: 5, length: 1 },
      }),
      createMetadataField(ctx, {
        idSuffix: "machine",
        fieldName: "Machine Architecture",
        rawKey: "ELF.e_machine",
        value: ELF_MACHINES[eMachine] ?? `0x${eMachine.toString(16)}`,
        dataType: "string",
        group: "binary",
        parserId: this.id,
        byteRange: { start: 18, length: 2 },
      }),
      createMetadataField(ctx, {
        idSuffix: "type",
        fieldName: "Object Type",
        rawKey: "ELF.e_type",
        value: eType === 2 ? "Executable (ET_EXEC)" : eType === 3 ? "Shared Object / PIE (ET_DYN)" : `Type ${eType}`,
        dataType: "string",
        group: "binary",
        parserId: this.id,
        byteRange: { start: 16, length: 2 },
      }),
      createMetadataField(ctx, {
        idSuffix: "entry",
        fieldName: "Entry Point",
        rawKey: "ELF.e_entry",
        value: `0x${eEntry.toString(16)}`,
        dataType: "string",
        group: "binary",
        parserId: this.id,
        byteRange: { start: 24, length: is64 ? 8 : 4 },
      })
    );

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
