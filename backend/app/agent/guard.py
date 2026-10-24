"""Abuse protection for the public agent endpoints, which spend the operator's API key.

In-memory sliding windows per client IP plus a per-instance daily cap. On serverless each warm
instance keeps its own counters, so this is a brake, not a quota: pair it with a spend limit on
the Anthropic workspace (see docs/DEPLOYMENT.md).
"""

from __future__ import annotations

import os
import threading
import time
from collections import defaultdict, deque


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


class RateLimiter:
    def __init__(self, per_minute: int, per_hour: int, per_day_total: int, clock=time.monotonic) -> None:
        self.per_minute, self.per_hour, self.per_day_total = per_minute, per_hour, per_day_total
        self._clock = clock
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._all: deque[float] = deque()
        self._lock = threading.Lock()

    def check(self, client: str) -> str | None:
        """Record a request; return a human-readable reason if it must be refused, else None."""
        now = self._clock()
        with self._lock:
            hits = self._hits[client]
            while hits and now - hits[0] > 3600:
                hits.popleft()
            while self._all and now - self._all[0] > 86400:
                self._all.popleft()
            if len(self._all) >= self.per_day_total:
                return "The analyst has reached today's usage cap. Please try again tomorrow."
            if len(hits) >= self.per_hour:
                return "Hourly limit reached for the analyst. Please try again later."
            if sum(1 for t in hits if now - t <= 60) >= self.per_minute:
                return "Too many requests. Please wait a minute and try again."
            hits.append(now)
            self._all.append(now)
            if len(self._hits) > 10_000:  # bound memory under IP churn
                self._hits = defaultdict(deque, {k: v for k, v in self._hits.items() if v})
            return None


limiter = RateLimiter(
    per_minute=_env_int("AGENT_RATE_PER_MIN", 6),
    per_hour=_env_int("AGENT_RATE_PER_HOUR", 40),
    per_day_total=_env_int("AGENT_DAILY_CAP", 500),
)


def client_key(headers, fallback: str | None) -> str:
    """Vercel and our nginx both overwrite X-Real-IP with the connecting client, so it is trustworthy."""
    return headers.get("x-real-ip") or fallback or "unknown"
