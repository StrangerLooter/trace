import io
from pathlib import Path

from fastapi.testclient import TestClient
from pypdf import PdfReader, PdfWriter

from app.main import app

client = TestClient(app)


def _make_pdf_bytes() -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    writer.add_metadata({"/Author": "Confidential User", "/Creator": "SecretApp"})
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def test_sanitize_pdf_and_one_time_download_lifecycle() -> None:
    pdf_bytes = _make_pdf_bytes()
    response = client.post(
        "/api/v1/sanitize",
        files={"file": ("../../evil/report.pdf", pdf_bytes, "application/pdf")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "removed_and_verified"
    assert body["download_filename"] == "report.clean.pdf"
    assert "Author" in body["removed_keys"]
    assert body["after_metadata"] == {}

    # Download cleaned copy and inspect it independently with pypdf
    dl = client.get(body["download_url"])
    assert dl.status_code == 200
    assert "attachment" in dl.headers["content-disposition"]
    assert dl.headers["x-content-type-options"] == "nosniff"
    assert "sandbox" in dl.headers["content-security-policy"]

    cleaned_reader = PdfReader(io.BytesIO(dl.content))
    assert not cleaned_reader.metadata or len(cleaned_reader.metadata) == 0

    # Second download attempt must fail with 404 because file was unlinked after 1x transfer
    second_dl = client.get(body["download_url"])
    assert second_dl.status_code == 404


def test_sanitize_rejects_non_pdf_and_invalid_job_id() -> None:
    bad = client.post(
        "/api/v1/sanitize",
        files={"file": ("fake.pdf", b"MZ\x90\x00not_a_pdf", "application/pdf")},
    )
    assert bad.status_code == 415

    missing = client.get("/api/v1/jobs/not-a-uuid/download")
    assert missing.status_code == 404
    assert Path("evil").exists() is False
