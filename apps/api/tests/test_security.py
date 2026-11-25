import concurrent.futures
import io
import sys
from pathlib import Path

import defusedxml.ElementTree as DET
import pytest
from defusedxml.common import DTDForbidden, EntitiesForbidden
from fastapi.testclient import TestClient
from pypdf import PdfWriter

from app.api.v1 import analyze as analyze_module
from app.core.config import settings
from app.main import app
from app.parsers.subprocess_runner import SubprocessExecutionError, run_isolated_cli
from app.services.scratch_manager import sanitize_download_filename

client = TestClient(app)


def test_upload_size_limit_returns_413_and_cleans_scratch(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "max_upload_mb", 0)
    resp = client.post(
        "/api/v1/analyze",
        files={"file": ("big.pdf", b"%PDF-1.7\nhello", "application/pdf")},
    )
    assert resp.status_code == 413
    scratch = Path(settings.scratch_dir)
    if scratch.exists():
        assert list(scratch.iterdir()) == []


def test_backend_crash_still_cleans_up_scratch(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(_path: Path) -> dict:
        raise RuntimeError("Simulated parser crash")

    monkeypatch.setattr(analyze_module, "parse_pdf_deep", boom)
    with pytest.raises(RuntimeError, match="Simulated parser crash"):
        client.post(
            "/api/v1/analyze",
            files={"file": ("crash.pdf", b"%PDF-1.7\nbody", "application/pdf")},
        )

    scratch = Path(settings.scratch_dir)
    if scratch.exists():
        assert list(scratch.iterdir()) == []


def test_subprocess_timeout_raises_execution_error(tmp_path: Path) -> None:
    dummy = tmp_path / "input.bin"
    dummy.write_bytes(b"data")
    with pytest.raises(SubprocessExecutionError, match="timed out"):
        run_isolated_cli(
            sys.executable,
            ["-c", "import time; time.sleep(3)"],
            dummy,
            timeout_seconds=1,
        )


def test_filename_sanitization_blocks_crlf_and_traversal() -> None:
    cleaned = sanitize_download_filename('../../etc/passwd\r\nSet-Cookie: evil=1".pdf')
    assert "/" not in cleaned
    assert "\\" not in cleaned
    assert "\r" not in cleaned
    assert "\n" not in cleaned
    assert '"' not in cleaned


def test_defusedxml_blocks_xxe_entities() -> None:
    xxe = '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><r>&e;</r>'
    with pytest.raises((DTDForbidden, EntitiesForbidden)):
        DET.fromstring(xxe)


def test_concurrent_analyze_requests_isolate_and_cleanup() -> None:
    writer = PdfWriter()
    writer.add_blank_page(width=100, height=100)
    buf = io.BytesIO()
    writer.write(buf)
    pdf_bytes = buf.getvalue()

    def run_req(idx: int) -> tuple[int, str]:
        r = client.post(
            "/api/v1/analyze",
            files={"file": (f"c{idx}.pdf", pdf_bytes, "application/pdf")},
        )
        return r.status_code, r.json()["job_id"]

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(run_req, range(6)))

    job_ids = [jid for _, jid in results]
    assert all(code == 200 for code, _ in results)
    assert len(set(job_ids)) == 6
    for jid in job_ids:
        assert not (Path(settings.scratch_dir) / jid).exists()
