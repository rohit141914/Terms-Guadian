from abc import ABC, abstractmethod


class LLMProvider(ABC):
    """Base class all LLM providers must implement."""

    def __init__(self, api_key: str | None, model: str):
        self.api_key = api_key
        self.model = model

    @abstractmethod
    async def analyze(self, content: str, system_prompt: str) -> dict:
        """
        Send policy text to the LLM and return a parsed dict with:
          - summary: str
          - risk_level: "high" | "medium" | "low"
          - clauses: list[dict] each with text, risk, reason
        """
        ...
