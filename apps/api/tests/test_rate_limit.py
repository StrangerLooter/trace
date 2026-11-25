from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.security.rate_limit import SlidingWindowRateLimitMiddleware


def test_rate_limiter_enforces_429_and_retry_after() -> None:
    test_app = FastAPI()
    test_app.add_middleware(SlidingWindowRateLimitMiddleware, max_requests_per_minute=2)

    @test_app.post("/api/v1/ping")
    def ping() -> dict:
        return {"ok": True}

    local_client = TestClient(test_app)
    assert local_client.post("/api/v1/ping").status_code == 200
    assert local_client.post("/api/v1/ping").status_code == 200
    third = local_client.post("/api/v1/ping")
    assert third.status_code == 429
    assert third.headers["retry-after"] == "60"
