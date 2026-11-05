"""Address search and reverse geocoding, cached because place lookups rarely change."""

from __future__ import annotations

import hashlib

from django.core.cache import BaseCache

from ..clients.tomtom import Place
from ..domain.geo import LatLon
from .ports import GeocodingProvider

CACHE_SECONDS = 24 * 60 * 60


class PlaceService:
    def __init__(self, geocoder: GeocodingProvider, cache: BaseCache) -> None:
        self._geocoder = geocoder
        self._cache = cache

    def search(self, query: str, near: LatLon | None = None) -> list[Place]:
        # Round the bias point so nearby map positions share a cache entry.
        bias = f"{near.lat:.1f},{near.lon:.1f}" if near else "-"
        digest = hashlib.sha256(f"{query.strip().lower()}|{bias}".encode()).hexdigest()[:32]
        key = f"geo:v1:{digest}"
        cached = self._cache.get(key)
        if cached is not None:
            return cached
        results = self._geocoder.search(query, near=near)
        self._cache.set(key, results, CACHE_SECONDS)
        return results

    def reverse(self, point: LatLon) -> Place:
        key = f"rgeo:v1:{point.lat:.4f},{point.lon:.4f}"
        cached = self._cache.get(key)
        if cached is not None:
            return cached
        # Open country may have no address; fall back to the coordinates themselves.
        place = self._geocoder.reverse_geocode(point) or Place(
            label=f"{point.lat:.4f}, {point.lon:.4f}", point=point
        )
        self._cache.set(key, place, CACHE_SECONDS)
        return place
