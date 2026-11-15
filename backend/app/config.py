from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Supabase connection settings
    supabase_url: str = ""
    supabase_key: str = ""
    supabase_service_role_key: str = ""

    jwt_secret: str = "change-me-before-production"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 60 * 24
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o"
    cors_origins: str = "http://localhost:5173"

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
        return self.supabase_service_role_key or self.supabase_key

    @property
    def supabase_configured(self) -> bool:
        return bool(
            self.supabase_url
            and self.effective_supabase_key
            and "supabase" in self.supabase_url
            and not self.supabase_url.startswith("https://your-project")
        )

    @property
    def smtp_configured(self) -> bool:
        return bool(self.smtp_user and self.smtp_password)


@lru_cache
def get_settings() -> Settings:
    return Settings()
