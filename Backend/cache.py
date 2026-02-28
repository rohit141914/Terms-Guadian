import time
import threading
from threading import Lock


class TTLCache:
    """Simple in-memory cache with TTL expiry. Thread-safe."""

    def __init__(self, ttl: int = 3600, clean_interval: int = 3600):
        self.ttl = ttl
        self._clean_interval = clean_interval
        self._store: dict[str, tuple[float, dict]] = {}
        self._lock = Lock()

        if ttl > 0:
            cleaner = threading.Thread(target=self._auto_clean, daemon=True)
            cleaner.start()

    def _auto_clean(self):
        while True:
            time.sleep(self._clean_interval)
            now = time.time()
            with self._lock:
                expired = [k for k, (ts, _) in self._store.items() if now - ts > self.ttl]
                for k in expired:
                    del self._store[k]

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
