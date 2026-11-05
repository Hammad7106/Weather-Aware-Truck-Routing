"""Builders for realistic provider payloads and domain objects used across tests."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from datetime import datetime

from planner.clients.open_meteo import HourlyForecast, snap
from planner.clients.tomtom import ProviderRoute
from planner.domain.geo import METERS_PER_MILE, LatLon, cumulative_miles


def straight_line(start: LatLon, end: LatLon, steps: int = 50) -> list[LatLon]:
    return [
        LatLon(
            start.lat + (end.lat - start.lat) * i / steps,
            start.lon + (end.lon - start.lon) * i / steps,
        )
        for i in range(steps + 1)
    ]


def tomtom_route_json(
    points: Sequence[LatLon], *, mph: float = 60.0, roads: Sequence[str] = ("I-80",)
) -> dict:
    """A TomTom calculateRoute `routes[]` item driving the line at a constant speed."""
    length_m = cumulative_miles(points)[-1] * METERS_PER_MILE
    travel_s = round(length_m / METERS_PER_MILE / mph * 3600)
    half = len(points) // 2
    half_m = cumulative_miles(points[: half + 1])[-1] * METERS_PER_MILE
    return {
        "summary": {
            "lengthInMeters": round(length_m),
            "travelTimeInSeconds": travel_s,
            "trafficDelayInSeconds": 120,
        },
        "legs": [{"points": [{"latitude": p.lat, "longitude": p.lon} for p in points]}],
        "guidance": {
            "instructions": [
                {
                    "routeOffsetInMeters": 0,
                    "travelTimeInSeconds": 0,
                    "roadNumbers": [roads[0]],
                    "maneuver": "DEPART",
                },
                {
                    "routeOffsetInMeters": round(half_m),
                    "travelTimeInSeconds": round(travel_s * half_m / length_m),
                    "roadNumbers": [roads[-1]],
                    "maneuver": "KEEP_LEFT",
                },
                {
                    "routeOffsetInMeters": round(length_m),
                    "travelTimeInSeconds": travel_s,
                    "maneuver": "ARRIVE",
                },
            ]
        },
    }


def provider_route(points: Sequence[LatLon], *, mph: float = 60.0) -> ProviderRoute:
    miles = cumulative_miles(points)[-1]
    travel_s = round(miles / mph * 3600)
    return ProviderRoute(
        points=tuple(points),
        length_miles=miles,
        travel_time_s=travel_s,
        traffic_delay_s=0,
        timing_anchors=(),
        major_roads=("I-70",),
    )


def open_meteo_location(
    start_epoch: int, hours: int, *, wind: float = 5.0, rain: float = 0.0, snow: float = 0.0
) -> dict:
    return {
        "latitude": 0,
        "longitude": 0,
        "hourly": {
            "time": [start_epoch + 3600 * h for h in range(hours)],
            "wind_speed_10m": [wind] * hours,
            "wind_gusts_10m": [wind * 1.5] * hours,
            "rain": [rain] * hours,
            "showers": [0.0] * hours,
            "snowfall": [snow] * hours,
            "temperature_2m": [40.0] * hours,
            "weather_code": [3] * hours,
        },
    }


def forecast(start: datetime, hours: int = 200, **conditions: float) -> HourlyForecast:
    wind = conditions.get("wind", 5.0)
    return HourlyForecast(
        start_epoch=int(start.timestamp()),
        wind_mph=(wind,) * hours,
        gust_mph=(wind * 1.5,) * hours,
        rain_in=(conditions.get("rain", 0.0),) * hours,
        snow_in=(conditions.get("snow", 0.0),) * hours,
        temperature_f=(40.0,) * hours,
        weather_code=(3,) * hours,
    )


class FakeWeather:
    """Weather provider whose conditions depend on the location, via `conditions_at`."""

    def __init__(self, conditions_at: Callable[[LatLon], dict[str, float]]) -> None:
        self.conditions_at = conditions_at
        self.calls: list[int] = []

    def forecasts(self, points, start, end):
        self.calls.append(len(points))
        return [forecast(start, **self.conditions_at(snap(p))) for p in points]


class FakeRouting:
    def __init__(self, routes: Sequence[ProviderRoute]) -> None:
        self.routes = list(routes)
        self.calls: list[dict] = []

    def truck_routes(self, origin, destination, *, depart_at, load_lb):
        self.calls.append({"origin": origin, "destination": destination, "load_lb": load_lb})
        return self.routes


class TimedWeather:
    """Weather provider whose conditions depend on the hour since the requested start."""

    def __init__(self, conditions_at_hour: Callable[[int], dict[str, float]], hours: int = 200):
        self.conditions_at_hour = conditions_at_hour
        self.hours = hours
        self.calls = 0

    def forecasts(self, points, start, end):
        self.calls += 1
        hourly = [self.conditions_at_hour(h) for h in range(self.hours)]
        series = HourlyForecast(
            start_epoch=int(start.timestamp()),
            wind_mph=tuple(c.get("wind", 5.0) for c in hourly),
            gust_mph=tuple(c.get("wind", 5.0) * 1.5 for c in hourly),
            rain_in=tuple(c.get("rain", 0.0) for c in hourly),
            snow_in=tuple(c.get("snow", 0.0) for c in hourly),
            temperature_f=(30.0,) * self.hours,
            weather_code=(71,) * self.hours,
        )
        return [series] * len(points)
