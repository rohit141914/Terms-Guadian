from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorCollection

_collection: AsyncIOMotorCollection | None = None


def init_db(mongo_uri: str, db_name: str) -> None:
    from motor.motor_asyncio import AsyncIOMotorClient
    global _collection
    client = AsyncIOMotorClient(mongo_uri)
    _collection = client[db_name]["summaries"]


async def db_get(cache_key: str) -> dict | None:
    doc = await _collection.find_one({"_id": cache_key})
    return doc["result"] if doc else None


async def db_set(cache_key: str, result: dict, domain: str | None = None, links: list | None = None) -> None:
    doc = {
        "result": result,
        "saved_at": datetime.now(timezone.utc),
    }
    if domain:
        doc["domain"] = domain
    if links:
        doc["links"] = links
    await _collection.update_one(
        {"_id": cache_key},
        {"$set": doc},
        upsert=True,
    )
