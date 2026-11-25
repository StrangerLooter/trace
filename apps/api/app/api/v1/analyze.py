import hashlib
import json
import shutil
from datetime import datetime, timezone
from typing import Annotated

from elftools.common.exceptions import ELFError
from fastapi import APIRouter, File, HTTPException, UploadFile
from pypdf.errors import PyPdfError

from app.core.config import settings
from app.parsers.executable_parser import parse_elf_deep, parse_pe_deep, run_optional_pattern_rules
from app.parsers.pdf_parser import parse_pdf_deep
from app.parsers.subprocess_runner import SubprocessExecutionError, run_isolated_cli
from app.services.scratch_manager import cleanup_job_dir, create_job_dir, sweep_expired_jobs

router = APIRouter(prefix="/api/v1", tags=["analyze"])


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.post("/analyze")
async def analyze_consented_file(file: Annotated[UploadFile, File()]) -> dict:
    """
    Consented deep backend inspection endpoint.
    Streams into an isolated UUIDv4 scratch file, runs format-appropriate parsers,
    and deterministically removes all temporary files in finally.
    """
    sweep_expired_jobs()
    max_bytes = settings.max_upload_mb * 1024 * 1024
    job_id, job_dir = create_job_dir()
    input_path = job_dir / "input.bin"

    try:
        sha256 = hashlib.sha256()
        total = 0
        with input_path.open("wb") as fh:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise HTTPException(status_code=413, detail="File exceeds max upload limit")
                sha256.update(chunk)
                fh.write(chunk)

        if total == 0:
            raise HTTPException(status_code=400, detail="Empty file")

        with input_path.open("rb") as head_fh:
            head = head_fh.read(1024)

        fields: list[dict] = []
        events: list[dict] = [
            {
                "eventType": "FILE_RECEIVED",
                "severity": "info",
                "operation": "backend.ingest",
                "message": f"Backend sandbox received {total} bytes (ephemeral job {job_id})",
                "timestampIso": _now_iso(),
            }
        ]
        parsers_used: list[str] = []

        if b"%PDF-" in head:
            try:
                pdf_res = parse_pdf_deep(input_path)
                parsers_used.append("pypdf")
                fields.append(
                    {
                        "id": f"{job_id}:pdf:pages",
                        "fieldName": "Page Count (Deep PDF)",
                        "rawKey": "PDF.PageCount",
                        "value": pdf_res["page_count"],
                        "displayValue": (
                            str(pdf_res["page_count"])
                            if pdf_res["page_count"] is not None
                            else "Encrypted"
                        ),
                        "dataType": "number",
                        "group": "pdf",
                        "sourceParser": "backend:pypdf",
                        "confidence": "confirmed",
                        "isSensitive": False,
                        "status": "valid",
                    }
                )
                for k, v in pdf_res["metadata"].items():
                    fields.append(
                        {
                            "id": f"{job_id}:pdf:{k}",
                            "fieldName": k,
                            "rawKey": f"PDF.Info.{k}",
                            "value": v,
                            "displayValue": v,
                            "dataType": "string",
                            "group": "pdf",
                            "sourceParser": "backend:pypdf",
                            "confidence": "confirmed",
                            "isSensitive": k.lower() in {"author", "creator", "producer"},
                            "status": "valid",
                        }
                    )
            except (PyPdfError, ValueError) as exc:
                events.append(
                    {
                        "eventType": "PARSER_WARNING",
                        "severity": "warn",
                        "operation": "pypdf",
                        "message": f"Deep PDF parse skipped: {type(exc).__name__}",
                        "timestampIso": _now_iso(),
                    }
                )
        elif head.startswith(b"MZ"):
            try:
                pe_res = parse_pe_deep(input_path)
                parsers_used.append("pefile")
                fields.append(
                    {
                        "id": f"{job_id}:pe:imports",
                        "fieldName": "Imported DLLs",
                        "rawKey": "PE.Imports",
                        "value": pe_res["imports"],
                        "displayValue": ", ".join(pe_res["imports"]) or "None",
                        "dataType": "array",
                        "group": "binary",
                        "sourceParser": "backend:pefile",
                        "confidence": "confirmed",
                        "isSensitive": False,
                        "status": "valid",
                    }
                )
            except Exception:
                events.append(
                    {
                        "eventType": "PARSER_WARNING",
                        "severity": "warn",
                        "operation": "pefile",
                        "message": "MZ file is not a valid PE binary",
                        "timestampIso": _now_iso(),
                    }
                )
        elif head.startswith(b"\x7fELF"):
            try:
                elf_res = parse_elf_deep(input_path)
                parsers_used.append("pyelftools")
                fields.append(
                    {
                        "id": f"{job_id}:elf:needed",
                        "fieldName": "Dynamic Libraries (DT_NEEDED)",
                        "rawKey": "ELF.Needed",
                        "value": elf_res["needed_libraries"],
                        "displayValue": (
                            ", ".join(elf_res["needed_libraries"]) or "Statically linked"
                        ),
                        "dataType": "array",
                        "group": "binary",
                        "sourceParser": "backend:pyelftools",
                        "confidence": "confirmed",
                        "isSensitive": False,
                        "status": "valid",
                    }
                )
            except (ELFError, ValueError, EOFError) as exc:
                events.append(
                    {
                        "eventType": "PARSER_WARNING",
                        "severity": "warn",
                        "operation": "pyelftools",
                        "message": f"Deep ELF parse skipped: {type(exc).__name__}",
                        "timestampIso": _now_iso(),
                    }
                )

        # Optional ExifTool enrichment when installed inside container
        exiftool_bin = shutil.which("exiftool")
        if exiftool_bin:
            try:
                proc = run_isolated_cli(
                    exiftool_bin,
                    ["-json", "-G1"],
                    input_path,
                    timeout_seconds=settings.parser_timeout_seconds,
                )
                if proc.returncode == 0 and proc.stdout.strip():
                    parsed_list = json.loads(proc.stdout)
                    if isinstance(parsed_list, list) and parsed_list:
                        parsers_used.append("exiftool")
                        for k, v in list(parsed_list[0].items())[:100]:
                            if k == "SourceFile":
                                continue
                            fields.append(
                                {
                                    "id": f"{job_id}:exiftool:{k}",
                                    "fieldName": k,
                                    "rawKey": k,
                                    "value": str(v),
                                    "displayValue": str(v),
                                    "dataType": "string",
                                    "group": "general",
                                    "sourceParser": "backend:exiftool",
                                    "confidence": "confirmed",
                                    "isSensitive": False,
                                    "status": "valid",
                                }
                            )
            except SubprocessExecutionError as exc:
                events.append(
                    {
                        "eventType": "PARSER_WARNING",
                        "severity": "warn",
                        "operation": "exiftool",
                        "message": str(exc),
                        "timestampIso": _now_iso(),
                    }
                )

        for hit in run_optional_pattern_rules(input_path, settings.custom_rules_path):
            parsers_used.append("custom_rules")
            fields.append(
                {
                    "id": f"{job_id}:rule:{hit['id']}",
                    "fieldName": f"Custom Rule Match ({hit['name']})",
                    "rawKey": f"CustomRule.{hit['id']}",
                    "value": hit["name"],
                    "displayValue": hit["name"],
                    "dataType": "string",
                    "group": "embedded",
                    "sourceParser": "backend:custom_rules",
                    "confidence": "confirmed",
                    "isSensitive": True,
                    "status": "valid",
                }
            )

        events.append(
            {
                "eventType": "ANALYSIS_COMPLETED",
                "severity": "info",
                "operation": "backend.cleanup",
                "message": (
                    f"Backend analysis finished ({len(fields)} deep fields); scratch deleted"
                ),
                "timestampIso": _now_iso(),
            }
        )

        return {
            "job_id": job_id,
            "sha256": sha256.hexdigest(),
            "size_bytes": total,
            "parsers_used": parsers_used,
            "fields": fields,
            "events": events,
        }
    finally:
        cleanup_job_dir(job_dir)
