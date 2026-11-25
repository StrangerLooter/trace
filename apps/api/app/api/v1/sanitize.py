from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.core.config import settings
from app.sanitizers.pdf_sanitizer import sanitize_pdf_metadata
from app.services.scratch_manager import (
    cleanup_job_dir,
    create_job_dir,
    get_job_dir,
    sanitize_download_filename,
    sweep_expired_jobs,
)

router = APIRouter(prefix="/api/v1", tags=["sanitize"])


@router.post("/sanitize")
async def sanitize_uploaded_pdf(file: Annotated[UploadFile, File()]) -> dict:
    """Consented ephemeral PDF metadata scrubbing endpoint."""
    sweep_expired_jobs()
    max_bytes = settings.max_upload_mb * 1024 * 1024

    job_id, job_dir = create_job_dir()
    input_path = job_dir / "input.bin"
    output_path = job_dir / "output.bin"

    try:
        total = 0
        with input_path.open("wb") as fh:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise HTTPException(status_code=413, detail="File exceeds max upload limit")
                fh.write(chunk)

        if total < 5:
            raise HTTPException(status_code=400, detail="Empty or invalid file")

        with input_path.open("rb") as sig_fh:
            head = sig_fh.read(1024)
        if b"%PDF-" not in head:
            raise HTTPException(
                status_code=415,
                detail="Only PDF documents are supported on backend /sanitize",
            )

        report = sanitize_pdf_metadata(input_path, output_path)
        if report["status"] == "sanitization_failed":
            cleanup_job_dir(job_dir)
            raise HTTPException(status_code=422, detail=report["warnings"][0])

        # Remove original input immediately after sanitization; retain only output for 1x download
        input_path.unlink(missing_ok=True)
        safe_name = sanitize_download_filename(file.filename or "document.pdf")
        if safe_name.lower().endswith(".pdf"):
            download_name = f"{safe_name[:-4]}.clean.pdf"
        else:
            download_name = f"{safe_name}.clean.pdf"

        (job_dir / "filename.txt").write_text(download_name, encoding="utf-8")

        return {
            "job_id": job_id,
            "download_url": f"/api/v1/jobs/{job_id}/download",
            "download_filename": download_name,
            "status": report["status"],
            "removed_keys": report["removed_keys"],
            "before_metadata": report["before"]["metadata"],
            "after_metadata": report["after"]["metadata"],
            "warnings": report["warnings"],
        }
    except HTTPException:
        cleanup_job_dir(job_dir)
        raise
    except Exception as exc:
        cleanup_job_dir(job_dir)
        raise HTTPException(status_code=500, detail="Sanitization failed") from exc


@router.get("/jobs/{job_id}/download")
def download_sanitized_output(job_id: str, background_tasks: BackgroundTasks) -> FileResponse:
    """One-time safe attachment download with immediate post-transfer cleanup."""
    job_dir = get_job_dir(job_id)
    if job_dir is None:
        raise HTTPException(status_code=404, detail="Job not found or expired")

    output_path = job_dir / "output.bin"
    if not output_path.is_file():
        cleanup_job_dir(job_dir)
        raise HTTPException(status_code=404, detail="Job output not found")

    name_file = job_dir / "filename.txt"
    download_name = (
        sanitize_download_filename(name_file.read_text(encoding="utf-8"))
        if name_file.is_file()
        else "sanitized.clean.pdf"
    )

    background_tasks.add_task(cleanup_job_dir, job_dir)
    return FileResponse(
        path=output_path,
        media_type="application/pdf",
        filename=download_name,
        headers={
            "Content-Disposition": f'attachment; filename="{download_name}"',
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
    )
