import time
from collections import defaultdict, deque

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


class SlidingWindowRateLimitMiddleware(BaseHTTPMiddleware):
    """Per-IP sliding-window rate limiter for state-changing processing endpoints."""

    def __init__(self, app, max_requests_per_minute: int = 30) -> None:
        super().__init__(app)
        self.max_requests = max_requests_per_minute
        self._buckets: dict[str, deque[float]] = defaultdict(deque)

    def reset(self) -> None:
        self._buckets.clear()

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.method == "POST" and request.url.path.startswith("/api/v1/"):
            client_ip = request.client.host if request.client else "unknown"
            now = time.monotonic()
            window_start = now - 60.0
            bucket = self._buckets[client_ip]

            while bucket and bucket[0] < window_start:
                bucket.popleft()

            if len(bucket) >= self.max_requests:
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Rate limit exceeded. Retry shortly."},
                    headers={"Retry-After": "60"},
                )
            bucket.append(now)

        return await call_next(request)
