from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str

    # JWT
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_HOURS: int = 8

    # Admin account — set in .env, never hardcoded in source
    ADMIN_PASSWORD: str = ""   # empty = skip admin seed (safe default for CI)

    # Redis — used by the public API for response caching
    REDIS_URL: str = "redis://localhost:6379/0"

    # App
    APP_NAME: str = "STEG Délestage API"
    DEBUG: bool = False
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000", "http://localhost:5174"]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
