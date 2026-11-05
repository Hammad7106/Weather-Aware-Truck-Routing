"""TomTom Routing (truck mode) and Search APIs.

Docs: https://developer.tomtom.com/routing-api/documentation/routing/calculate-route
      https://developer.tomtom.com/search-api/documentation/search-service/fuzzy-search
"""

from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import quote

import httpx

from ..domain.geo import METERS_PER_MILE, LatLon
from ..errors import ConfigurationError, NoRouteFound, UpstreamError

logger = logging.getLogger(__name__)

SERVICE = "TomTom"
POUNDS_TO_KG = 0.45359237
# Typical empty weight of a tractor-trailer, added to the cargo to get gross vehicle weight.
TRUCK_TARE_LB = 35_000
_NO_ROUTE_MARKERS = ("NO_ROUTE_FOUND", "MAP_MATCHING_FAILURE", "CANNOT_RESTORE_BASEROUTE")


@dataclass(frozen=True, slots=True)
class Place:
    label: str
    point: LatLon


@dataclass(frozen=True, slots=True)
class ProviderRoute:
    """One route as returned by the provider, before any weather is applied."""

    points: tuple[LatLon, ...]
    length_miles: float
    travel_time_s: int
    traffic_delay_s: int
    timing_anchors: tuple[tuple[float, float], ...]
    """(miles along route, seconds since departure) at each guidance instruction."""
    major_roads: tuple[str, ...]
    """Road numbers ordered by how many miles the route spends on them."""


class TomTomClient:
    def __init__(
        self, api_key: str, http: httpx.Client, base_url: str = "https://api.tomtom.com"
    ) -> None:
        if not api_key:
            raise ConfigurationError("Routing is not configured: TOMTOM_API_KEY is missing.")
        self._key = api_key
        self._http = http
        self._base = base_url.rstrip("/")

    # --- Search -------------------------------------------------------------------------

    def search(self, query: str, *, limit: int = 6, near: LatLon | None = None) -> list[Place]:
        params: dict[str, Any] = {
            "typeahead": "true",
            "limit": limit,
            "countrySet": "US,CA,MX",
        }
        if near is not None:
            params |= {"lat": near.lat, "lon": near.lon}
        data = self._get(f"/search/2/search/{quote(query, safe='')}.json", params)
        return [place for r in data.get("results", []) if (place := _parse_search_result(r))]

    def reverse_geocode(self, point: LatLon) -> Place | None:
        data = self._get(f"/search/2/reverseGeocode/{point.lat},{point.lon}.json", {})
        for item in data.get("addresses", []):
            label = item.get("address", {}).get("freeformAddress")
            if label:
                return Place(label=label, point=point)
        return None

    # --- Routing ------------------------------------------------------------------------

    def truck_routes(
        self,
        origin: LatLon,
        destination: LatLon,
        *,
        depart_at: datetime,
        load_lb: float,
        alternatives: int = 2,
    ) -> list[ProviderRoute]:
        gross_kg = round((load_lb + TRUCK_TARE_LB) * POUNDS_TO_KG)
        params: dict[str, Any] = {
            "travelMode": "truck",
            "vehicleCommercial": "true",
            "vehicleWeight": gross_kg,
            "maxAlternatives": alternatives,
            "instructionsType": "coded",
            "routeRepresentation": "polyline",
            "traffic": "true",
        }
        path = (
            f"/routing/1/calculateRoute/"
            f"{origin.lat},{origin.lon}:{destination.lat},{destination.lon}/json"
        )

        # TomTom rejects past departure times, so only future ones are sent.
        future_departure = depart_at > datetime.now(UTC) + timedelta(minutes=1)
        departure = {"departAt": depart_at.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")}
        routes = self._routes(path, params | departure if future_departure else params)

        # With a future departAt, TomTom sometimes returns fewer alternatives (e.g. 1 instead of
        # 3 for Seattle → Salt Lake City). The brief needs 3 options, so ask again for routes
        # with current traffic and keep whichever answer offers more choice.
        if future_departure and len(routes) < alternatives + 1:
            fallback = self._routes(path, params)
            if len(fallback) > len(routes):
                logger.info("TomTom: %d → %d routes without departAt", len(routes), len(fallback))
                routes = fallback

        if not routes:
            raise NoRouteFound("No truck route was found between these places.")
        return routes

    def _routes(self, path: str, params: dict[str, Any]) -> list[ProviderRoute]:
        return [_parse_route(r) for r in self._get(path, params).get("routes", [])]

    # --- Internals ----------------------------------------------------------------------

    def _get(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        try:
            response = self._http.get(f"{self._base}{path}", params={**params, "key": self._key})
        except httpx.HTTPError as exc:
            logger.warning("TomTom request failed: %s", exc)
            raise UpstreamError(SERVICE, "the routing service could not be reached") from exc

        if response.status_code == 200:
            try:
                return response.json()
            except ValueError as exc:
                raise UpstreamError(SERVICE, "returned an invalid response") from exc

        body = response.text[:500]
        if any(marker in body for marker in _NO_ROUTE_MARKERS):
            raise NoRouteFound("No truck route was found between these places.")
        logger.warning("TomTom %s on %s: %s", response.status_code, path, body)
        if response.status_code == 401:
            raise ConfigurationError("The TomTom API key is invalid.")
        if response.status_code == 403:
            # Each TomTom product (Routing, Search, Reverse Geocoding) is enabled per key.
            raise ConfigurationError(
                f"The TomTom API key is not enabled for {_product(path)}. "
                "Enable it for this key in the TomTom developer dashboard."
            )
        if response.status_code == 429:
            raise UpstreamError(SERVICE, "rate limit reached, please try again shortly")
        raise UpstreamError(SERVICE, f"request failed with status {response.status_code}")


def _product(path: str) -> str:
    if "/reverseGeocode/" in path:
        return "the Reverse Geocoding API"
    if path.startswith("/search/"):
        return "the Search API"
    return "the Routing API"


def _parse_search_result(result: dict[str, Any]) -> Place | None:
    position = result.get("position") or {}
    address = (result.get("address") or {}).get("freeformAddress")
    if "lat" not in position or "lon" not in position or not address:
        return None
    name = (result.get("poi") or {}).get("name")
    label = f"{name}, {address}" if name else address
    return Place(label=label, point=LatLon(float(position["lat"]), float(position["lon"])))


def _parse_route(route: dict[str, Any]) -> ProviderRoute:
    try:
        summary = route["summary"]
        points = tuple(
            LatLon(float(p["latitude"]), float(p["longitude"]))
            for leg in route["legs"]
            for p in leg["points"]
        )
        length_m = float(summary["lengthInMeters"])
        travel_time = int(summary["travelTimeInSeconds"])
    except (KeyError, TypeError, ValueError) as exc:
        raise UpstreamError(SERVICE, "returned a route in an unexpected format") from exc
    if len(points) < 2:
        raise UpstreamError(SERVICE, "returned a route without geometry")

    instructions = (route.get("guidance") or {}).get("instructions") or []
    anchors: list[tuple[float, float]] = []
    road_miles: dict[str, float] = defaultdict(float)
    for current, following in zip(instructions, [*instructions[1:], None], strict=True):
        offset = current.get("routeOffsetInMeters")
        elapsed = current.get("travelTimeInSeconds")
        if offset is None or elapsed is None:
            continue
        anchors.append((offset / METERS_PER_MILE, float(elapsed)))
        # An instruction's road numbers describe the road driven after that manoeuvre.
        next_offset = (following or {}).get("routeOffsetInMeters", length_m)
        for road in current.get("roadNumbers") or []:
            road_miles[road] += max(0.0, next_offset - offset) / METERS_PER_MILE

    major_roads = tuple(sorted(road_miles, key=road_miles.__getitem__, reverse=True))
    return ProviderRoute(
        points=points,
        length_miles=length_m / METERS_PER_MILE,
        travel_time_s=travel_time,
        traffic_delay_s=int(summary.get("trafficDelayInSeconds", 0)),
        timing_anchors=tuple(anchors),
        major_roads=major_roads,
    )
