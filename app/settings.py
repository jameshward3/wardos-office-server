from functools import lru_cache
from urllib.parse import quote_plus

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
    database_url: str = ""
    postgres_db: str = "wardos"
    postgres_user: str = "wardos"
    postgres_password: str = ""
    postgres_host: str = "postgres"
    postgres_port: int = 5432
    ollama_base_url: str = "http://host.docker.internal:11434"
    ollama_model: str = "llama3.1"
    secret_key: str = "change-me-local-only"
    github_token: str = ""
    sample_mode: bool = False
    allowed_origins_csv: str = ",".join(_default_allowed_origins())
    allow_local_unsafe_requests: bool = True
    # 172.16.0.0/12 covers Docker's default bridge network address pools, so
    # container-to-container calls (e.g. the nginx frontend calling this API)
    # are trusted the same way true loopback traffic is. The API itself stays
    # bound to 127.0.0.1 on the host (see docker-compose.yml API_BIND), so this
    # does not expose anything beyond the local Docker Compose stack.
    trusted_local_hosts_csv: str = "127.0.0.1,::1,localhost,host.docker.internal,172.16.0.0/12"
    trusted_proxy_ips_csv: str = "127.0.0.1,::1,172.16.0.0/12"
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

    @property
    def trusted_local_hosts(self) -> set[str]:
        return {item.strip() for item in self.trusted_local_hosts_csv.split(",") if item.strip()}

    @property
    def trusted_proxy_ips(self) -> set[str]:
        return {item.strip() for item in self.trusted_proxy_ips_csv.split(",") if item.strip()}

    @property
    def resolved_database_url(self) -> str:
        if self.database_url.strip():
            return self.database_url.strip()
        if not self.postgres_password.strip():
            raise RuntimeError("POSTGRES_PASSWORD or DATABASE_URL must be set in .env")
        user = quote_plus(self.postgres_user)
        password = quote_plus(self.postgres_password)
        host = self.postgres_host
        db = quote_plus(self.postgres_db)
        return f"postgresql+psycopg2://{user}:{password}@{host}:{self.postgres_port}/{db}"

    @property
    def is_local_env(self) -> bool:
        return self.app_env.lower() in {"local", "development", "dev", "test"}

    def validate_runtime(self) -> None:
        if self.is_local_env:
            return
        errors: list[str] = []
        if self.allow_local_unsafe_requests:
            errors.append("ALLOW_LOCAL_UNSAFE_REQUESTS must be false outside local development")
        if self.secret_key == "change-me-local-only":
            errors.append("SECRET_KEY must be set outside local development")
        if not self.api_bearer_token.strip():
            errors.append("API_BEARER_TOKEN must be set outside local development")
        if errors:
            raise RuntimeError("; ".join(errors))


@lru_cache
def get_settings() -> Settings:
    return Settings()
