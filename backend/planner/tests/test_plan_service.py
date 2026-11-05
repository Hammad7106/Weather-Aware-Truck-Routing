from datetime import UTC, datetime, timedelta

import pytest

from planner.clients.tomtom import Place
from planner.domain.geo import LatLon
from planner.domain.risk import RiskLevel
from planner.services.plan import PlanService, TripRequest

from .factories import FakeRouting, FakeWeather, provider_route, straight_line

DENVER = LatLon(39.74, -104.99)
OMAHA = LatLon(41.26, -95.93)
DETOUR = LatLon(39.0, -100.0)
DEPART = datetime(2026, 11, 5, 14, 0, tzinfo=UTC)

# Route A: the direct line (shorter, faster). Route B: a southern detour (longer).
DIRECT = straight_line(DENVER, OMAHA, steps=100)
SOUTHERN = straight_line(DENVER, DETOUR, steps=50) + straight_line(DETOUR, OMAHA, steps=50)[1:]


def blizzard_on_direct_route(point: LatLon) -> dict[str, float]:
    """Heavy snow (Severe) across central Nebraska north of 40°N; clear elsewhere."""
    return {"snow": 2.5} if -101 <= point.lon <= -99 and point.lat >= 40.0 else {}


def trip(interval: int = 25, load: int = 20_000) -> TripRequest:
    return TripRequest(Place("Denver", DENVER), Place("Omaha", OMAHA), DEPART, load, interval)


@pytest.fixture
def weather():
    return FakeWeather(blizzard_on_direct_route)


@pytest.fixture
def plan(weather):
    routing = FakeRouting([provider_route(DIRECT), provider_route(SOUTHERN)])
    return PlanService(routing, weather).plan(trip())


def test_routes_keep_provider_order_and_ids(plan):
    assert [r.id for r in plan.routes] == ["A", "B"]
    assert plan.routes[0].summary.duration_s < plan.routes[1].summary.duration_s


def test_weather_is_fetched_once_for_all_checkpoints(plan, weather):
    assert weather.calls == [sum(len(r.checkpoints) for r in plan.routes)]


def test_checkpoints_cover_the_route_at_the_chosen_interval(plan):
    route = plan.routes[0]
    miles = [cp.mile for cp in route.checkpoints]

    assert miles[0] == 0
    assert all(b - a == pytest.approx(25) for a, b in zip(miles[:-2], miles[1:-1], strict=True))
    assert miles[-1] == pytest.approx(route.summary.distance_miles)
    assert sum(cp.stretch_miles for cp in route.checkpoints) == pytest.approx(miles[-1])


def test_etas_increase_and_end_at_arrival(plan):
    route = plan.routes[0]
    etas = [cp.eta for cp in route.checkpoints]

    assert etas[0] == DEPART
    assert etas == sorted(etas)
    assert etas[-1] == route.arrival
    # Constant 60 mph in the fake route: mile 25 is reached after 25 minutes.
    elapsed = route.checkpoints[1].eta - DEPART
    assert abs(elapsed - timedelta(minutes=25)) < timedelta(seconds=1)


def test_segments_are_contiguous_and_coloured_by_checkpoint(plan):
    route = plan.routes[0]
    for before, after in zip(route.segments, route.segments[1:], strict=False):
        assert before.coordinates[-1] == pytest.approx(after.coordinates[0])
    levels = {s.checkpoint_index: s.level for s in route.segments}
    assert all(levels[cp.index] == cp.level for cp in route.checkpoints if cp.index in levels)


def test_geometry_timing_runs_from_departure_to_arrival(plan):
    offsets = plan.routes[0].geometry_offsets_s
    assert offsets[0] == 0
    assert list(offsets) == sorted(offsets)
    assert offsets[-1] == plan.routes[0].summary.duration_s


def test_blizzard_makes_the_slower_route_the_recommendation(plan):
    direct, southern = plan.routes

    assert direct.summary.miles(RiskLevel.SEVERE) > 0
    assert southern.summary.miles(RiskLevel.SEVERE) == 0
    assert plan.ranking == ("B", "A")
    assert plan.recommendation.best_index == 1
    assert plan.recommendation.decided_by == "severe_miles"


def test_storm_checkpoints_report_snow_as_the_driver(plan):
    stormy = [cp for cp in plan.routes[0].checkpoints if cp.level == RiskLevel.SEVERE]
    assert stormy
    assert all(cp.risk and cp.risk.drivers == ("snow",) for cp in stormy)


def test_load_rules_apply_to_checkpoints():
    windy = FakeWeather(lambda p: {"wind": 40})
    routing = FakeRouting([provider_route(DIRECT)])

    light = PlanService(routing, windy).plan(trip(load=40_000)).routes[0]
    heavy = PlanService(routing, windy).plan(trip(load=40_001)).routes[0]

    assert light.summary.peak_level == RiskLevel.HIGH
    assert heavy.summary.peak_level == RiskLevel.SEVERE
    assert heavy.checkpoints[1].risk and heavy.checkpoints[1].risk.load_rule is not None


def test_smaller_interval_means_more_checkpoints(weather):
    routing = FakeRouting([provider_route(DIRECT)])
    counts = [
        len(PlanService(routing, weather).plan(trip(interval=n)).routes[0].checkpoints)
        for n in (10, 25, 50)
    ]
    assert counts[0] > counts[1] > counts[2]


def test_missing_forecast_is_not_counted_as_low():
    class NoData:
        def forecasts(self, points, start, end):
            return [None] * len(points)

    route = PlanService(FakeRouting([provider_route(DIRECT)]), NoData()).plan(trip()).routes[0]

    assert all(cp.level is None for cp in route.checkpoints)
    assert route.summary.miles(RiskLevel.LOW) == 0
    assert route.summary.no_data_miles == pytest.approx(route.summary.distance_miles)
