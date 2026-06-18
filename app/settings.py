from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_env: str = "local"
    timezone: str = "America/New_York"
    database_url: str = "postgresql+psycopg2://wardos:wardos_dev_password@postgres:5432/wardos"
    ollama_base_url: str = "http://host.docker.internal:11434"
    secret_key: str = "change-me-local-only"
    github_token: str = ""
    sample_mode: bool = False

    class Config:
        env_file = ".env"
        env_prefix = ""
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
