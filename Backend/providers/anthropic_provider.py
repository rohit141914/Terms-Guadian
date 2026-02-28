import json

import anthropic

from .base import LLMProvider


class AnthropicProvider(LLMProvider):

    async def analyze(self, content: str, system_prompt: str) -> dict:
        client = anthropic.AsyncAnthropic(api_key=self.api_key)
        response = await client.messages.create(
            model=self.model,
            max_tokens=self.max_tokens,
            system=system_prompt,
            messages=[
                {"role": "user", "content": content},
            ],
            temperature=0.2,
        )
        raw = response.content[0].text
        # Claude sometimes wraps JSON in markdown code fences
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
        return json.loads(raw)
