"""Short-lived cache of routes, so repeated requests for the same trip see the same roads.

With browser-supplied weather a plan takes two requests (ask which forecasts are needed, then
send them); departure options for the same trip follow. Caching keeps all of these on identical
routes and spends one TomTom call instead of three.
"""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime

from django.core.cache import BaseCache

from ..clients.tomtom import ProviderRoute
from ..domain.geo import LatLon
from .ports import RoutingProvider

CACHE_SECONDS = 10 * 60


class CachedRouting:
    def __init__(self, routing: RoutingProvider, cache: BaseCache) -> None:
        self._routing = routing
        self._cache = cache

    def truck_routes(
        self, origin: LatLon, destination: LatLon, *, depart_at: datetime, load_lb: float
    ) -> list[ProviderRoute]:
        trip = (
            f"{origin.lat:.5f},{origin.lon:.5f}|{destination.lat:.5f},{destination.lon:.5f}|"
            f"{depart_at.astimezone(UTC):%Y%m%d%H%M}|{round(load_lb)}"
        )
        key = "routes:v1:" + hashlib.sha256(trip.encode()).hexdigest()[:32]
        cached = self._cache.get(key)
        if cached is not None:
            return cached
        routes = self._routing.truck_routes(
            origin, destination, depart_at=depart_at, load_lb=load_lb
        )
        self._cache.set(key, routes, CACHE_SECONDS)
        return routes
