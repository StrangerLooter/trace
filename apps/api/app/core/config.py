import os
import tempfile

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for the TRACE backend API."""

    model_config = SettingsConfigDict(env_prefix="TRACE_", env_file=".env", extra="ignore")

    env: str = "development"
    scratch_dir: str = os.path.join(tempfile.gettempdir(), "trace-jobs")
    max_upload_mb: int = 100
    job_ttl_seconds: int = 600
    parser_timeout_seconds: int = 15
    rate_limit_per_minute: int = 30
    allowed_origins: str = "http://localhost:3000,http://localhost:3015,https://trace-opal-gamma.vercel.app"
    allowed_origin_regex: str = r"^https://trace(-[a-z0-9-]+)?\.vercel\.app$"
    custom_rules_path: str = ""

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()
