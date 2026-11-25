import asyncio
import contextlib
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.analyze import router as analyze_router
from app.api.v1.feedback import router as feedback_router
from app.api.v1.health import router as health_router
from app.api.v1.sanitize import router as sanitize_router
from app.core.config import settings
from app.security.headers import SecurityHeadersMiddleware
from app.security.rate_limit import SlidingWindowRateLimitMiddleware
from app.services.scratch_manager import sweep_expired_jobs


async def _periodic_sweeper() -> None:
    while True:
        await asyncio.sleep(60)
        sweep_expired_jobs()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    sweep_expired_jobs()
    task = asyncio.create_task(_periodic_sweeper())
    try:
        yield
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        sweep_expired_jobs()


app = FastAPI(
    title="TRACE File Intelligence API",
    version="0.1.0",
    docs_url="/docs" if settings.env == "development" else None,
    redoc_url=None,
    lifespan=lifespan,
)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    SlidingWindowRateLimitMiddleware,
    max_requests_per_minute=settings.rate_limit_per_minute,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.allowed_origin_regex or None,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

app.include_router(health_router)
app.include_router(analyze_router)
app.include_router(sanitize_router)
app.include_router(feedback_router)
