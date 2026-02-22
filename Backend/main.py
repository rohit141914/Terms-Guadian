import hashlib
import json
import logging
import time

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from config import Settings
from schemas import SummarizeRequest, SummarizeResponse
from prompt import SYSTEM_PROMPT
from providers import get_provider
from cache import TTLCache

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("terms-guardian")

settings = Settings()
provider = get_provider(settings)
cache = TTLCache(ttl=settings.cache_ttl)

logger.info("=== Terms Guardian API ===")
logger.info("Provider: %s | Model: %s", settings.llm_provider, settings.llm_model)
logger.info("Cache TTL: %ds", settings.cache_ttl)

app = FastAPI(title="Terms Guardian API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/summarize", response_model=SummarizeResponse)
async def summarize(req: SummarizeRequest):
    content_len = len(req.content)
    content_preview = req.content[:100].replace("\n", " ")
    logger.info(">>> Request received | %d chars | '%s...'", content_len, content_preview)

    # Check cache first
    cache_key = hashlib.sha256(req.content.encode()).hexdigest()
    cached = cache.get(cache_key)
    if cached:
        logger.info("<<< Cache hit for %s | returning cached result", cache_key[:12])
        return cached

    logger.info("--- Sending to %s (%s)...", settings.llm_provider, settings.llm_model)
    start = time.time()

    try:
        result = await provider.analyze(req.content, SYSTEM_PROMPT)
    except json.JSONDecodeError as e:
        elapsed = time.time() - start
        logger.error("!!! LLM returned invalid JSON after %.1fs: %s", elapsed, e)
        raise HTTPException(
            status_code=502,
            detail="LLM returned a response that could not be parsed as JSON. Try again.",
        )
    except Exception as e:
        elapsed = time.time() - start
        logger.error("!!! LLM provider error after %.1fs: %s", elapsed, e)
        raise HTTPException(
            status_code=502,
            detail=f"LLM provider error: {str(e)}",
        )

    elapsed = time.time() - start
    logger.info("--- LLM responded in %.1fs", elapsed)

    # Normalize risk levels to ensure frontend compatibility
    valid_risks = {"high", "medium", "low"}
    if result.get("risk_level") not in valid_risks:
        result["risk_level"] = "medium"
    for clause in result.get("clauses", []):
        if clause.get("risk") not in valid_risks:
            clause["risk"] = "medium"

    # Cache the result
    cache.set(cache_key, result)
    clause_count = len(result.get("clauses", []))
    logger.info(
        "<<< Done | risk=%s | %d clauses | cached as %s",
        result["risk_level"],
        clause_count,
        cache_key[:12],
    )

    return result
