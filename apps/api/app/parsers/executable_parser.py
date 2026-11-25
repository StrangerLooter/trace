from pathlib import Path

import pefile
from elftools.elf.elffile import ELFFile


def parse_pe_deep(file_path: Path) -> dict:
    """Parse Windows PE headers, sections, and imports safely without executing binary."""
    pe = pefile.PE(str(file_path), fast_load=True)
    try:
        pe.parse_data_directories(
            directories=[pefile.DIRECTORY_ENTRY["IMAGE_DIRECTORY_ENTRY_IMPORT"]]
        )
        sections = [
            {
                "name": sec.Name.decode("ascii", errors="replace").rstrip("\x00"),
                "virtual_address": hex(sec.VirtualAddress),
                "raw_size": sec.SizeOfRawData,
            }
            for sec in pe.sections
        ]
        imports = []
        if hasattr(pe, "DIRECTORY_ENTRY_IMPORT"):
            for entry in pe.DIRECTORY_ENTRY_IMPORT:
                imports.append(entry.dll.decode("ascii", errors="replace"))

        return {
            "parser": "pefile",
            "machine": hex(pe.FILE_HEADER.Machine),
            "timestamp": pe.FILE_HEADER.TimeDateStamp,
            "entry_point": hex(pe.OPTIONAL_HEADER.AddressOfEntryPoint),
            "sections": sections,
            "imports": imports,
            "overlay_offset": pe.get_overlay_data_start_offset(),
        }
    finally:
        pe.close()


def parse_elf_deep(file_path: Path) -> dict:
    """Parse Linux ELF headers, sections, and dynamic library dependencies."""
    with file_path.open("rb") as fh:
        elf = ELFFile(fh)
        sections = [sec.name for sec in elf.iter_sections() if sec.name]
        needed: list[str] = []
        dynamic = elf.get_section_by_name(".dynamic")
        if dynamic is not None:
            for tag in dynamic.iter_tags():
                if tag.entry.d_tag == "DT_NEEDED":
                    needed.append(str(tag.needed))
        return {
            "parser": "pyelftools",
            "elf_class": elf.elfclass,
            "endianness": "little" if elf.little_endian else "big",
            "machine": elf["e_machine"],
            "entry_point": hex(elf["e_entry"]),
            "sections": sections,
            "needed_libraries": needed,
        }
