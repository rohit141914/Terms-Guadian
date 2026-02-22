from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Which provider to use: openai | anthropic | gemini | ollama
    llm_provider: str = "openai"

    # Model name (provider-specific)
    llm_model: str = "gpt-4o-mini"

    # API keys (only the one matching llm_provider needs to be set)
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    gemini_api_key: str | None = None

    # Ollama settings
    ollama_base_url: str = "http://localhost:11434"

    # Cache TTL in seconds (0 = disabled)
    cache_ttl: int = 3600

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}
