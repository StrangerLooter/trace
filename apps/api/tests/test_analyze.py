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
