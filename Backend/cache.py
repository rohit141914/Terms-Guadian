import time
from threading import Lock


class TTLCache:
    """Simple in-memory cache with TTL expiry. Thread-safe."""

    def __init__(self, ttl: int = 3600):
        self.ttl = ttl
        self._store: dict[str, tuple[float, dict]] = {}
        self._lock = Lock()

    def get(self, key: str) -> dict | None:
        if self.ttl <= 0:
            return None
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            timestamp, value = entry
            if time.time() - timestamp > self.ttl:
                del self._store[key]
                return None
            return value

    def set(self, key: str, value: dict) -> None:
        if self.ttl <= 0:
            return
        with self._lock:
            self._store[key] = (time.time(), value)
