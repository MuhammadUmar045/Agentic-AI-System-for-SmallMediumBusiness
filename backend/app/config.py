from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_CONFIG_DIR = Path(__file__).resolve().parent
_BACKEND_DIR = _CONFIG_DIR.parent
_ROOT_DIR = _BACKEND_DIR.parent
_ENV_FILES = [
    str(_BACKEND_DIR / ".env"),
    str(_ROOT_DIR / ".env"),
    ".env",
]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_FILES, env_file_encoding="utf-8", extra="ignore")

    # Supabase connection settings
    supabase_url: str = ""
    supabase_key: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    supabase_service_role_jwt: str = ""
    supabase_service_jwt: str = ""

    jwt_secret: str = "change-me-before-production"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 60 * 24
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o"
    cors_origins: str = "http://localhost:5173,https://aicoo-smeo.netlify.app"

    # SMTP settings for email verification
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str = "noreply@vantage.app"

    # WhatsApp Cloud API settings
    whatsapp_verify_token: str = "ai_coo_whatsapp_verify"
    whatsapp_app_secret: str = ""
    whatsapp_phone_number_id: str = ""
    whatsapp_access_token: str = ""

    # Trial period
    trial_days: int = 10

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def effective_supabase_key(self) -> str:
        return (
            self.supabase_service_role_key
            or self.supabase_service_role_jwt
            or self.supabase_service_jwt
            or self.supabase_key
            or self.supabase_anon_key
        )

    @property
    def supabase_configured(self) -> bool:
        key = self.effective_supabase_key
        return bool(
            self.supabase_url
            and key
            and "supabase" in self.supabase_url
            and not self.supabase_url.startswith("https://your-project")
            # Accepts standard Supabase JWTs (eyJ...) or new secret/publishable key formats (sb_secret_..., sb_publishable_...)
            and (key.startswith("eyJ") or key.startswith("sb_") or len(key) >= 20)
        )

    @property
    def smtp_configured(self) -> bool:
        return bool(self.smtp_user and self.smtp_password)


@lru_cache
def get_settings() -> Settings:
    return Settings()
