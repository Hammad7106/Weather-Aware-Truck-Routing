"""Shared HTTP client: one connection pool for the whole process."""

from __future__ import annotations

from functools import cache

import httpx
from django.conf import settings


@cache
def shared_http_client() -> httpx.Client:
    """httpx.Client is thread-safe, so a single pool is shared by all requests and threads."""
    return httpx.Client(
        timeout=httpx.Timeout(settings.HTTP_TIMEOUT_SECONDS, connect=5.0),
        limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        headers={"User-Agent": "weather-aware-truck-routing/1.0"},
        follow_redirects=True,
    )
