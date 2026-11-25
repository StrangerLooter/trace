from pathlib import Path

from pypdf import PdfReader


def parse_pdf_deep(file_path: Path) -> dict:
    """Extract PDF document info, page count, and encryption status safely via pypdf."""
    reader = PdfReader(str(file_path), strict=False)
    is_encrypted = bool(reader.is_encrypted)
    info: dict[str, str] = {}

    if not is_encrypted and reader.metadata:
        for key, value in reader.metadata.items():
            clean_key = str(key).lstrip("/")
            if value is not None:
                info[clean_key] = str(value)

    page_count = len(reader.pages) if not is_encrypted else None
    return {
        "parser": "pypdf",
        "encrypted": is_encrypted,
        "page_count": page_count,
        "metadata": info,
    }
