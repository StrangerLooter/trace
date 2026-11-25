import io
from pathlib import Path

from fastapi.testclient import TestClient
from pypdf import PdfWriter

from app.core.config import settings
from app.main import app

client = TestClient(app)


def test_consented_analyze_pdf_and_deletes_scratch() -> None:
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    writer.add_metadata({"/Author": "Backend Deep Test"})
    buf = io.BytesIO()
    writer.write(buf)

    resp = client.post(
        "/api/v1/analyze",
        files={"file": ("deep.pdf", buf.getvalue(), "application/pdf")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "pypdf" in body["parsers_used"]
    assert any(f["rawKey"] == "PDF.PageCount" and f["value"] == 1 for f in body["fields"])
    assert any(
        f["rawKey"] == "PDF.Info.Author" and f["value"] == "Backend Deep Test"
        for f in body["fields"]
    )
    # Verify temporary job scratch directory was removed immediately
    assert not (Path(settings.scratch_dir) / body["job_id"]).exists()


def test_feedback_endpoint_validates_payload() -> None:
    ok = client.post(
        "/api/v1/feedback",
        json={"topic": "format-request", "message": "Please add JPEG XL parser support."},
    )
    assert ok.status_code == 200
    assert ok.json()["accepted"] is True


def test_malformed_pdf_and_elf_emit_warnings_without_crashing() -> None:
    pdf_bytes = b"%PDF-1.4\n1 0 obj<< /Type /Catalog >>endobj\n%%EOF"
    malformed_pdf = client.post(
        "/api/v1/analyze",
        files={"file": ("broken.pdf", pdf_bytes, "application/pdf")},
    )
    assert malformed_pdf.status_code == 200
    pdf_body = malformed_pdf.json()
    assert any(
        e["eventType"] == "PARSER_WARNING" and e["operation"] == "pypdf"
        for e in pdf_body["events"]
    )

    elf_bytes = b"\x7fELF\x02\x01\x01\x00truncated"
    malformed_elf = client.post(
        "/api/v1/analyze",
        files={"file": ("broken.elf", elf_bytes, "application/octet-stream")},
    )
    assert malformed_elf.status_code == 200
    elf_body = malformed_elf.json()
    assert any(
        e["eventType"] == "PARSER_WARNING" and e["operation"] == "pyelftools"
        for e in elf_body["events"]
    )
