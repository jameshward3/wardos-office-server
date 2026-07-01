from functools import lru_cache
from pydantic_settings import BaseSettings
from pydantic import Field


def _default_allowed_origins() -> list[str]:
    return [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://wardos.jw4o.com",
    ]


class Settings(BaseSettings):
    app_env: str = "local"
    timezone: str = "America/New_York"
    database_url: str = "postgresql+psycopg2://wardos:wardos_dev_password@postgres:5432/wardos"
    ollama_base_url: str = "http://host.docker.internal:11434"
    secret_key: str = "change-me-local-only"
    github_token: str = ""
    sample_mode: bool = False
    allowed_origins_csv: str = ",".join(_default_allowed_origins())
    allow_local_unsafe_requests: bool = True
    api_bearer_token: str = ""
    rate_limit_per_minute: int = 120
    login_rate_limit_per_minute: int = 10
    security_log_level: str = "INFO"
    enable_security_headers: bool = True
    backup_retention_days: int = 30
    max_export_rows: int = 20000
    request_timeout_seconds: int = 30
    trusted_google_sheet_id: str = Field(default="", alias="WARDOS_MEMORY_SHEET_ID")

    class Config:
        env_file = ".env"
        env_prefix = ""
        extra = "ignore"

    @property
    def allowed_origins(self) -> list[str]:
        raw = [item.strip() for item in self.allowed_origins_csv.split(",")]
        return [item for item in raw if item]


@lru_cache
def get_settings() -> Settings:
    return Settings()
