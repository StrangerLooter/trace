from pathlib import Path

from pypdf import PdfReader, PdfWriter

from app.parsers.pdf_parser import parse_pdf_deep


def sanitize_pdf_metadata(input_path: Path, output_path: Path) -> dict:
    """
    Rewrite PDF stripping Info dictionary and root XMP /Metadata stream,
    then re-inspect the output to verify metadata removal.
    """
    before = parse_pdf_deep(input_path)
    if before["encrypted"]:
        return {
            "status": "sanitization_failed",
            "before": before,
            "after": before,
            "warnings": ["Encrypted PDF cannot be scrubbed without decryption."],
        }

    reader = PdfReader(str(input_path), strict=False)
    writer = PdfWriter()
    writer.append(reader)

    # Clear root XMP Metadata stream and Info dictionary (including pypdf default /Producer)
    if "/Metadata" in writer._root_object:
        del writer._root_object["/Metadata"]
    writer._info = None

    with output_path.open("wb") as out_fh:
        writer.write(out_fh)

    after = parse_pdf_deep(output_path)
    warnings: list[str] = [
        "PDF structural rewrite invalidates any prior digital signatures.",
        "Page text, annotations, and form fields remain; inspect before publishing.",
    ]

    removed_keys = [
        k for k in before["metadata"] if k not in after["metadata"] or not after["metadata"][k]
    ]
    status = (
        "removed_and_verified"
        if len(after["metadata"]) == 0
        else "attempted_verification_incomplete"
    )

    return {
        "status": status,
        "before": before,
        "after": after,
        "removed_keys": removed_keys,
        "warnings": warnings,
    }
