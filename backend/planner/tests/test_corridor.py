from datetime import UTC, datetime

import pytest

from planner.domain.geo import LatLon, haversine_miles
from planner.domain.risk import RiskLevel
from planner.services.corridor import HOURS, CorridorService, corridor_grid

from .factories import FakeWeather, straight_line

DENVER = LatLon(39.74, -104.99)
OMAHA = LatLon(41.26, -95.93)
LOS_ANGELES = LatLon(34.05, -118.24)
NEW_YORK = LatLon(40.71, -74.01)


def min_distance(point: LatLon, path: list[LatLon]) -> float:
    return min(haversine_miles(point, p) for p in path)


def test_grid_stays_inside_the_corridor():
    path = straight_line(DENVER, OMAHA, steps=200)
    points, spacing = corridor_grid([path], buffer_miles=40)

    assert points
    assert spacing >= 6
    assert all(min_distance(p, path) <= 41 for p in points)


def test_grid_is_capped_for_cross_country_trips():
    path = straight_line(LOS_ANGELES, NEW_YORK, steps=400)
    points, _ = corridor_grid([path], max_points=300)

    assert 150 <= len(points) <= 300


def test_grid_covers_every_route():
    north = straight_line(DENVER, OMAHA)
    south = straight_line(LatLon(36, -105), LatLon(37, -96))
    points, _ = corridor_grid([north, south])

    near_south = [p for p in points if min_distance(p, south) < 20]
    assert near_south


def test_empty_paths_give_an_empty_grid():
    assert corridor_grid([]) == ([], 0.0)


def test_corridor_weather_has_49_hours_with_load_rules_applied():
    depart = datetime(2026, 11, 5, 14, 35, tzinfo=UTC)
    windy = FakeWeather(lambda p: {"wind": 40, "rain": 0.12})
    service = CorridorService(windy)

    light = service.corridor_weather([straight_line(DENVER, OMAHA)], depart, load_lb=10_000)
    heavy = service.corridor_weather([straight_line(DENVER, OMAHA)], depart, load_lb=45_000)

    assert light.start == datetime(2026, 11, 5, 14, 0, tzinfo=UTC)
    assert light.hours == HOURS == 48
    cell = light.cells[0]
    assert len(cell.risk) == len(cell.wind_mph) == len(cell.rain_in_hr) == HOURS + 1
    assert cell.risk[0] == RiskLevel.HIGH
    assert heavy.cells[0].risk[0] == RiskLevel.SEVERE
    assert cell.wind_mph[0] == 40 and cell.rain_in_hr[0] == pytest.approx(0.12)
    assert windy.calls == [len(light.cells), len(heavy.cells)]
