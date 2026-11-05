"""Browser-supplied weather (WEATHER_SOURCE=client): the 409 → fetch → retry exchange."""

from datetime import UTC, datetime, timedelta

import pytest
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from planner import providers
from planner.domain.geo import LatLon
from planner.errors import WeatherRequired
from planner.services.provided_weather import PLAN_VARIABLES, RISK_VARIABLES, ProvidedWeather
from planner.services.routing_cache import CachedRouting

from .factories import FakeRouting, forecast, provider_route, straight_line

DENVER = LatLon(39.74, -104.99)
OMAHA = LatLon(41.26, -95.93)


@pytest.fixture(autouse=True)
def _client_weather(settings):
    settings.WEATHER_SOURCE = "client"


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def routing(monkeypatch):
    fake = FakeRouting([provider_route(straight_line(DENVER, OMAHA, steps=80))])
    monkeypatch.setattr(providers, "routing_client", lambda: fake)
    return fake


def trip_body(**overrides):
    body = {
        "origin": {"lat": DENVER.lat, "lon": DENVER.lon, "label": "Denver, CO"},
        "destination": {"lat": OMAHA.lat, "lon": OMAHA.lon, "label": "Omaha, NE"},
        "departure_time": (timezone.now() + timedelta(hours=2)).isoformat(),
        "load_weight_lb": 35_000,
        "checkpoint_interval_miles": 25,
    }
    return {**body, **overrides}


def browser_fetch(weather_request, wind=40.0):
    """What the frontend does: fetch every requested cell for the requested hours."""
    start = datetime.fromisoformat(weather_request["start_hour"]).replace(tzinfo=UTC)
    end = datetime.fromisoformat(weather_request["end_hour"]).replace(tzinfo=UTC)
    hours = int((end - start).total_seconds() // 3600) + 1
    cells = []
    for lat, lon in weather_request["cells"]:
        cell = {"lat": lat, "lon": lon, "start": int(start.timestamp())}
        cell |= {
            "wind": [wind] * hours,
            "rain": [0.0] * hours,
            "showers": [0.0] * hours,
            "snow": [0.0] * hours,
        }
        if "temperature_2m" in weather_request["variables"]:
            cell |= {"gust": [wind * 1.4] * hours, "temp": [35.0] * hours, "code": [3] * hours}
        cells.append(cell)
    return {"cells": cells}


def test_plan_asks_for_weather_then_rates_with_what_the_browser_sent(api, routing):
    first = api.post("/api/plan", trip_body(), format="json")

    assert first.status_code == 409
    body = first.json()
    assert body["code"] == "weather_required"
    request = body["weather_request"]
    assert request["variables"] == list(PLAN_VARIABLES)
    assert len(request["cells"]) > 10
    # The plan asks for the departure-options window too (48 h more), so that request is free.
    span = datetime.fromisoformat(request["end_hour"]) - datetime.fromisoformat(
        request["start_hour"]
    )
    assert span > timedelta(hours=48)

    second = api.post("/api/plan", trip_body(weather=browser_fetch(request)), format="json")

    assert second.status_code == 200
    checkpoint = second.json()["routes"][0]["checkpoints"][3]
    # 40 mph with 35,000 lb: High (the >40,000 lb rule does not apply).
    assert checkpoint["level"] == 2
    assert checkpoint["weather"]["wind_mph"] == 40.0
    assert checkpoint["weather"]["gust_mph"] == 56.0


def test_routes_are_fetched_once_for_the_whole_exchange(api, routing):
    request = api.post("/api/plan", trip_body(), format="json").json()["weather_request"]
    body = trip_body(weather=browser_fetch(request))
    api.post("/api/plan", body, format="json")
    api.post("/api/departure-options", body, format="json")

    assert len(routing.calls) == 1


def test_departure_options_and_corridor_ask_only_for_risk_variables(api, routing):
    options = api.post("/api/departure-options", trip_body(), format="json")
    corridor = api.post(
        "/api/corridor-weather",
        {
            "paths": [[[DENVER.lon, DENVER.lat], [OMAHA.lon, OMAHA.lat]]],
            "departure_time": (timezone.now() + timedelta(hours=1)).isoformat(),
            "load_weight_lb": 10_000,
        },
        format="json",
    )

    for response in (options, corridor):
        assert response.status_code == 409
        assert response.json()["weather_request"]["variables"] == list(RISK_VARIABLES)


def test_corridor_completes_with_browser_weather(api):
    body = {
        "paths": [[[DENVER.lon, DENVER.lat], [OMAHA.lon, OMAHA.lat]]],
        "departure_time": (timezone.now() + timedelta(hours=1)).isoformat(),
        "load_weight_lb": 45_000,
    }
    request = api.post("/api/corridor-weather", body, format="json").json()["weather_request"]
    response = api.post(
        "/api/corridor-weather", {**body, "weather": browser_fetch(request)}, format="json"
    )

    assert response.status_code == 200
    # 40 mph with 45,000 lb: Severe under the load rule.
    assert response.json()["cells"][0]["risk"][0] == 3


def cell(**overrides):
    base = {"lat": 40, "lon": -100, "start": 0, "wind": [1], "rain": [0], "showers": [0]}
    return {"cells": [{**base, "snow": [0], **overrides}]}


@pytest.mark.parametrize(
    ("weather", "message"),
    [
        ({"cells": "nope"}, "Expected"),
        (cell(lat=99), "out of range"),
        (cell(wind=[1, 2]), "same number"),
        (cell(wind=["x"]), "numbers or nulls"),
        (cell(wind=None), "wind"),
    ],
)
def test_invalid_weather_is_rejected(api, routing, weather, message):
    response = api.post("/api/plan", trip_body(weather=weather), format="json")

    assert response.status_code == 400
    assert message in str(response.json()["errors"]["weather"])


def test_health_reports_the_weather_source(api):
    assert api.get("/api/health").json()["weather_source"] == "client"


def test_provided_weather_snaps_points_and_lists_only_missing_cells():
    start = datetime(2026, 11, 8, 21, 0, tzinfo=UTC)
    known = forecast(start, wind=12)
    provider = ProvidedWeather({LatLon(40.0, -100.0): known}, RISK_VARIABLES)

    assert provider.forecasts([LatLon(40.01, -100.02)], start, start) == [known]
    with pytest.raises(WeatherRequired) as raised:
        provider.forecasts(
            [LatLon(40.0, -100.0), LatLon(41.0, -99.0)], start, start + timedelta(minutes=90)
        )

    assert raised.value.weather_request == {
        "cells": [[41.0, -99.0]],
        "start_hour": "2026-11-08T21:00",
        "end_hour": "2026-11-08T23:00",
        "variables": list(RISK_VARIABLES),
    }


def test_cached_routing_reuses_routes_for_the_same_trip():
    fake = FakeRouting([provider_route(straight_line(DENVER, OMAHA))])
    routing = CachedRouting(fake, cache)
    depart = datetime(2026, 11, 8, 21, 0, tzinfo=UTC)

    first = routing.truck_routes(DENVER, OMAHA, depart_at=depart, load_lb=35_000)
    again = routing.truck_routes(DENVER, OMAHA, depart_at=depart, load_lb=35_000)
    heavier = routing.truck_routes(DENVER, OMAHA, depart_at=depart, load_lb=45_000)

    assert first == again == heavier
    assert len(fake.calls) == 2  # a different load is a different trip
