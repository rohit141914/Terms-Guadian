from .base import LLMProvider
from config import Settings


def get_provider(settings: Settings) -> LLMProvider:
    """Factory that returns the correct LLMProvider based on LLM_PROVIDER env var."""
    name = settings.llm_provider.lower()

    if name == "openai":
        from .openai_provider import OpenAIProvider
        return OpenAIProvider(api_key=settings.openai_api_key, model=settings.llm_model)

    elif name == "anthropic":
        from .anthropic_provider import AnthropicProvider
        return AnthropicProvider(api_key=settings.anthropic_api_key, model=settings.llm_model, max_tokens=settings.llm_max_tokens)

    elif name == "gemini":
        from .gemini_provider import GeminiProvider
        return GeminiProvider(api_key=settings.gemini_api_key, model=settings.llm_model)

    elif name == "ollama":
        from .ollama_provider import OllamaProvider
        return OllamaProvider(
            api_key=None,
            model=settings.llm_model,
            base_url=settings.ollama_base_url,
        )

    else:
        raise ValueError(
            f"Unknown LLM_PROVIDER: '{settings.llm_provider}'. "
            f"Must be one of: openai, anthropic, gemini, ollama"
        )
