import { ParserRegistry } from "@trace/parser-registry";
import { Mp3Parser, WavParser } from "./audio";
import { ElfHeaderParser, PeHeaderParser } from "./executable";
import { JpegParser } from "./jpeg";
import { Mp4Parser } from "./mp4";
import { PdfParser } from "./pdf";
import { PngParser } from "./png";
import { TiffParser } from "./tiff";
import { WebpParser } from "./webp";
import { ZipOfficeParser } from "./zip";

export * from "./audio";
export * from "./executable";
export * from "./helpers";
export * from "./jpeg";
export * from "./mp4";
export * from "./pdf";
export * from "./png";
export * from "./tiff";
export * from "./webp";
export * from "./zip";

export function createDefaultParserRegistry(): ParserRegistry {
  const registry = new ParserRegistry();
  registry.register(new JpegParser());
  registry.register(new PngParser());
  registry.register(new WebpParser());
  registry.register(new TiffParser());
  registry.register(new Mp3Parser());
  registry.register(new WavParser());
  registry.register(new Mp4Parser());
  registry.register(new PdfParser());
  registry.register(new ZipOfficeParser());
  registry.register(new PeHeaderParser());
  registry.register(new ElfHeaderParser());
  return registry;
}
