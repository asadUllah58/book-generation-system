from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    supabase_url: str = ""
    supabase_service_key: str = ""
    google_api_key: str = ""
    groq_api_key: str = ""
    cerebras_api_key: str = ""
    teams_webhook_url: str = ""
    review_ui_base_url: str = "http://localhost:5173"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
