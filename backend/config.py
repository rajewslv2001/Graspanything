from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    openai_api_key: str
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440
    database_url: str = "sqlite+aiosqlite:///./voicetutor.db"
    chroma_persist_dir: str = "./chromadb_data"
    frontend_dir: str = "./frontend"
    cors_origins: str = "http://localhost:8000,http://127.0.0.1:8000,http://localhost:8080,http://127.0.0.1:8080"
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = "21m00Tcm4TlvDq8ikWAM"
    anthropic_api_key: str = ""
    deepgram_api_key: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    return Settings()
