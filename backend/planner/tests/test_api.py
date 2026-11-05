"""Endpoint tests: real URL routing, validation and error handling, with fake providers."""

from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from planner import providers
from planner.clients.tomtom import Place
from planner.domain.geo import LatLon
from planner.errors import ConfigurationError, NoRouteFound, UpstreamError

from .factories import FakeRouting, FakeWeather, provider_route, straight_line

DENVER = LatLon(39.74, -104.99)
OMAHA = LatLon(41.26, -95.93)


class FakeGeocoder:
    def __init__(self):
        self.searches = 0

    def search(self, query, *, limit=6, near=None):
        self.searches += 1
        return [Place(f"{query.title()}, CO", DENVER)]

    def reverse_geocode(self, point):
        return None


@pytest.fixture
def api():
    return APIClient()


@pytest.fixture
def fakes(monkeypatch):
    routing = FakeRouting([provider_route(straight_line(DENVER, OMAHA, steps=80))])
    weather = FakeWeather(lambda p: {"wind": 30})
    monkeypatch.setattr(providers, "routing_client", lambda: routing)
    monkeypatch.setattr(providers, "weather_client", lambda: weather)
    return routing, weather


def trip_body(**overrides):
    body = {
        "origin": {"lat": DENVER.lat, "lon": DENVER.lon, "label": "Denver, CO"},
        "destination": {"lat": OMAHA.lat, "lon": OMAHA.lon, "label": "Omaha, NE"},
        "departure_time": (timezone.now() + timedelta(hours=2)).isoformat(),
        "load_weight_lb": 35_000,
        "checkpoint_interval_miles": 25,
    }
    return {**body, **overrides}


def test_plan_returns_routes_checkpoints_and_recommendation(api, fakes):
    response = api.post("/api/plan", trip_body(), format="json")

    assert response.status_code == 200
    data = response.json()
    assert data["origin"]["label"] == "Denver, CO"
    assert data["recommendation"]["route_id"] == "A"
    route = data["routes"][0]
    assert route["name"] == "Route A" and route["rank"] == 1
    assert route["summary"]["miles_by_level"]["moderate"] == pytest.approx(
        route["summary"]["distance_miles"], abs=0.2
    )
    cp = route["checkpoints"][1]
    assert set(cp) >= {"mile", "lat", "lon", "eta", "level", "weather", "drivers", "covers"}
    assert cp["level"] == 1 and cp["drivers"] == ["wind"]
    assert cp["weather"]["wind_mph"] == 30
    assert route["geometry"][0] == [DENVER.lon, DENVER.lat]  # GeoJSON order
    assert len(route["geometry"]) == len(route["geometry_offsets_s"])
    assert route["segments"][0]["coordinates"][0] == [DENVER.lon, DENVER.lat]


def test_plan_passes_load_to_routing(api, fakes):
    routing, _ = fakes
    api.post("/api/plan", trip_body(load_weight_lb=12_345), format="json")
    assert routing.calls[0]["load_lb"] == 12_345


def test_plan_uses_coordinates_when_label_is_blank(api, fakes):
    body = trip_body(origin={"lat": DENVER.lat, "lon": DENVER.lon, "label": ""})
    assert (
        api.post("/api/plan", body, format="json").json()["origin"]["label"] == "39.7400, -104.9900"
    )


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"departure_time": "2001-01-01T00:00:00Z"}, "departure_time"),
        ({"departure_time": (timezone.now() + timedelta(days=8)).isoformat()}, "departure_time"),
        ({"load_weight_lb": 90_000}, "load_weight_lb"),
        ({"load_weight_lb": -1}, "load_weight_lb"),
        ({"checkpoint_interval_miles": 15}, "checkpoint_interval_miles"),
        ({"destination": {"lat": 39.741, "lon": -104.991}}, "destination"),
        ({"origin": {"lat": 120, "lon": 0}}, "origin"),
    ],
)
def test_plan_validation_errors(api, fakes, overrides, field):
    response = api.post("/api/plan", trip_body(**overrides), format="json")

    assert response.status_code == 400
    body = response.json()
    assert body["code"] == "invalid"
    assert field in body["errors"]


@pytest.mark.parametrize(
    ("error", "status", "code"),
    [
        (NoRouteFound("No truck route"), 422, "no_route"),
        (ConfigurationError("Key missing"), 503, "not_configured"),
        (UpstreamError("TomTom", "down"), 502, "upstream_error"),
    ],
)
def test_plan_maps_provider_errors(api, monkeypatch, error, status, code):
    def failing():
        raise error

    monkeypatch.setattr(providers, "routing_client", failing)
    response = api.post("/api/plan", trip_body(), format="json")

    assert response.status_code == status
    assert response.json()["code"] == code
    assert response.json()["detail"]


def test_corridor_weather(api, fakes):
    body = {
        "paths": [[[DENVER.lon, DENVER.lat], [OMAHA.lon, OMAHA.lat]]],
        "departure_time": (timezone.now() + timedelta(hours=1)).isoformat(),
        "load_weight_lb": 10_000,
    }
    response = api.post("/api/corridor-weather", body, format="json")

    assert response.status_code == 200
    data = response.json()
    assert data["hours"] == 48
    assert data["cells"]
    assert len(data["cells"][0]["risk"]) == 49
    assert data["cells"][0]["wind"][0] == 30


def test_corridor_rejects_too_many_points(api, fakes):
    path = [[-100 + i * 0.001, 40] for i in range(1_501)]
    body = {
        "paths": [path],
        "departure_time": timezone.now().isoformat(),
        "load_weight_lb": 0,
    }
    assert api.post("/api/corridor-weather", body, format="json").status_code == 400


def test_geocode_is_cached(api, monkeypatch):
    geocoder = FakeGeocoder()
    monkeypatch.setattr(providers, "routing_client", lambda: geocoder)

    first = api.get("/api/geocode", {"q": "denver"})
    api.get("/api/geocode", {"q": "  DENVER "})

    assert first.status_code == 200
    assert first.json()["results"][0]["label"] == "Denver, CO"
    assert geocoder.searches == 1


def test_geocode_requires_a_query(api):
    assert api.get("/api/geocode", {"q": "d"}).status_code == 400


def test_reverse_geocode_falls_back_to_coordinates(api, monkeypatch):
    monkeypatch.setattr(providers, "routing_client", FakeGeocoder)
    response = api.get("/api/reverse-geocode", {"lat": 41.5, "lon": -100.25})

    assert response.status_code == 200
    assert response.json()["result"] == {"label": "41.5000, -100.2500", "lat": 41.5, "lon": -100.25}


def test_risk_rules_expose_the_tables(api):
    response = api.get("/api/risk-rules")

    assert response.status_code == 200
    assert "max-age=3600" in response["Cache-Control"]
    data = response.json()
    assert [lvl["label"] for lvl in data["levels"]] == [
        "Low",
        "Moderate",
        "High",
        "Severe",
        "No Travel",
    ]
    wind = next(c for c in data["conditions"] if c["key"] == "wind")
    assert [b["min"] for b in wind["bands"]] == [25, 35, 45, 55]
    assert {r["load_over_lb"] for r in data["load_rules"]} == {30_000, 40_000}


def test_wrong_method_uses_the_standard_error_shape(api):
    response = api.get("/api/plan")
    assert response.status_code == 405
    assert set(response.json()) == {"detail", "code"}
