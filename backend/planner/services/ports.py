"""Interfaces the services depend on. The real clients satisfy them; tests pass fakes."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from typing import Protocol

from ..clients.open_meteo import HourlyForecast
from ..clients.tomtom import Place, ProviderRoute
from ..domain.geo import LatLon


class RoutingProvider(Protocol):
    def truck_routes(
        self, origin: LatLon, destination: LatLon, *, depart_at: datetime, load_lb: float
    ) -> list[ProviderRoute]: ...


class GeocodingProvider(Protocol):
    def search(self, query: str, *, limit: int = 6, near: LatLon | None = None) -> list[Place]: ...

    def reverse_geocode(self, point: LatLon) -> Place | None: ...


class WeatherProvider(Protocol):
    def forecasts(
        self, points: Sequence[LatLon], start: datetime, end: datetime
    ) -> list[HourlyForecast | None]: ...
