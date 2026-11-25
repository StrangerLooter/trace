import re
import shutil
import time
import uuid
from pathlib import Path

from app.core.config import settings

UUID_V4_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
)


def is_valid_job_id(job_id: str) -> bool:
    return bool(UUID_V4_RE.match(job_id))


def sanitize_download_filename(filename: str) -> str:
    """Strip path traversal, quotes, control chars, and CR/LF for Content-Disposition."""
    base = Path(filename).name
    cleaned = re.sub(r'[^A-Za-z0-9._-]', "_", base).strip("._")
    return cleaned or "sanitized_output.bin"


def create_job_dir() -> tuple[str, Path]:
    base = Path(settings.scratch_dir)
    base.mkdir(parents=True, exist_ok=True)
    job_id = str(uuid.uuid4())
    job_dir = base / job_id
    job_dir.mkdir(mode=0o700, parents=False, exist_ok=False)
    return job_id, job_dir


def get_job_dir(job_id: str) -> Path | None:
    if not is_valid_job_id(job_id):
        return None
    base = Path(settings.scratch_dir).resolve()
    target = (base / job_id).resolve()
    if target.parent != base or not target.is_dir():
        return None
    return target


def cleanup_job_dir(job_dir: Path) -> None:
    shutil.rmtree(job_dir, ignore_errors=True)


def sweep_expired_jobs() -> int:
    """Remove any orphaned temporary job directory older than TRACE_JOB_TTL_SECONDS."""
    base = Path(settings.scratch_dir)
    if not base.is_dir():
        return 0
    now = time.time()
    removed = 0
    for child in base.iterdir():
        if not child.is_dir():
            continue
        try:
            age = now - child.stat().st_mtime
            if age > settings.job_ttl_seconds:
                shutil.rmtree(child, ignore_errors=True)
                removed += 1
        except OSError:
            continue
    return removed
