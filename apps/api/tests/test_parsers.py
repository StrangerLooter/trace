from pathlib import Path

from pypdf import PdfWriter

from app.parsers.pdf_parser import parse_pdf_deep


def test_parse_pdf_deep_extracts_metadata_and_pages(tmp_path: Path) -> None:
    pdf_path = tmp_path / "sample.pdf"
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    writer.add_metadata({"/Author": "TRACE QA", "/Producer": "PyPDF Fixture"})
    with pdf_path.open("wb") as fh:
        writer.write(fh)

    result = parse_pdf_deep(pdf_path)
    assert result["parser"] == "pypdf"
    assert result["encrypted"] is False
    assert result["page_count"] == 1
    assert result["metadata"]["Author"] == "TRACE QA"
    assert result["metadata"]["Producer"] == "PyPDF Fixture"
