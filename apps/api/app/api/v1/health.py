import shutil

from fastapi import APIRouter

from app.core.config import settings

router = APIRouter(prefix="/api/v1", tags=["health"])


@router.get("/health")
def health_check() -> dict:
    """Report service liveness and availability of optional isolated CLI tools."""
    return {
        "status": "ok",
        "service": "trace-api",
        "env": settings.env,
        "tools": {
            "exiftool": shutil.which("exiftool") is not None,
            "ffprobe": shutil.which("ffprobe") is not None,
            "qpdf": shutil.which("qpdf") is not None,
        },
    }
