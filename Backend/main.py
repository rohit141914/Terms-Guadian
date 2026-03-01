import hashlib
import json
import logging
import time

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from config import Settings
from schemas import SummarizeRequest, SummarizeResponse, IdentifyLinksRequest, IdentifyLinksResponse, PolicyLink
from prompt import SYSTEM_PROMPT
from providers import get_provider
from cache import TTLCache
from database import init_db, db_get, db_set

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("read-rules")

class _NoHealthCheck(logging.Filter):
    def filter(self, record):
        return "GET /health" not in record.getMessage()

logging.getLogger("uvicorn.access").addFilter(_NoHealthCheck())

settings = Settings()
provider = get_provider(settings)
cache = TTLCache(ttl=settings.cache_ttl, clean_interval=settings.cache_clean_interval)
init_db(settings.mongo_uri, settings.mongo_db_name)

logger.info("=== Read Rules API ===")
logger.info("Provider: %s | Model: %s", settings.llm_provider, settings.llm_model)
logger.info("Cache TTL: %ds | MongoDB: %s/%s", settings.cache_ttl, settings.mongo_uri, settings.mongo_db_name)

app = FastAPI(title="Read Rules API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["chrome-extension://*"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


IDENTIFY_PROMPT = (
    "You are given a list of links from a webpage in the format 'Label | URL'.\n"
    "Return ONLY the links that are privacy policies, terms of service, cookie policies, "
    "legal notices, user agreements, or similar legal/consent documents.\n"
    "Respond with a JSON object: {\"links\": [{\"label\": \"...\", \"url\": \"...\"}]}\n"
    "If none are relevant, return {\"links\": []}."
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/identify-links", response_model=IdentifyLinksResponse)
async def identify_links(req: IdentifyLinksRequest):
    logger.info(">>> Identify links | domain=%s | %d links", req.domain, len(req.links))
    links_text = "\n".join(f"{l.label} | {l.url}" for l in req.links[:200])
    try:
        result = await provider.analyze(links_text, IDENTIFY_PROMPT)
    except Exception as e:
        logger.error("!!! identify-links error: %s", e)
        raise HTTPException(status_code=502, detail=f"LLM provider error: {str(e)}")

    raw_links = result.get("links", [])
    policy_links = [PolicyLink(label=l.get("label", ""), url=l.get("url", "")) for l in raw_links if l.get("url")]
    logger.info("<<< Identified %d policy links", len(policy_links))
    return IdentifyLinksResponse(links=policy_links)


@app.post("/summarize", response_model=SummarizeResponse)
async def summarize(req: SummarizeRequest):
    content_len = len(req.content)
    content_preview = req.content[:100].replace("\n", " ")
    logger.info(">>> Request received | domain=%s | %d chars | '%s...'", req.domain, content_len, content_preview)

    content_hash = hashlib.sha256(req.content.encode()).hexdigest()

    # 1. Check in-memory cache (keyed by content hash — auto-invalidates when policy changes)
    cached = cache.get(content_hash)
    if cached:
        logger.info("<<< Cache hit (memory) for %s", req.domain or content_hash)
        return cached

    # 2. Check MongoDB (keyed by domain — skipped if domain is unknown)
    if req.domain:
        db_doc = await db_get(req.domain)
        if db_doc:
            stored_hash = db_doc.get("content_hash")
            if stored_hash == content_hash:
                logger.info("<<< Cache hit (database) for %s | populating memory cache", req.domain)
                result = db_doc["result"]
                cache.set(content_hash, result)
                return result
            logger.info("--- Policy changed for %s | re-analyzing...", req.domain)

    # 3. Call LLM
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
    _risk_order = {"high": 0, "medium": 1, "low": 2}
    valid_risks = set(_risk_order.keys())
    if result.get("risk_level") not in valid_risks:
        result["risk_level"] = "medium"
    for clause in result.get("clauses", []):
        if clause.get("risk") not in valid_risks:
            clause["risk"] = "medium"

    # Sort clauses: high → medium → low
    result["clauses"] = sorted(
        result.get("clauses", []),
        key=lambda c: _risk_order.get(c.get("risk"), 1),
    )

    # Store in MongoDB and memory cache
    if req.domain:
        await db_set(req.domain, result, links=[l.model_dump() for l in req.links], content_hash=content_hash)
    cache.set(content_hash, result)

    clause_count = len(result.get("clauses", []))
    logger.info(
        "<<< Done | risk=%s | %d clauses | saved to DB + memory cache as %s",
        result["risk_level"],
        clause_count,
        req.domain or content_hash,
    )

    return result
