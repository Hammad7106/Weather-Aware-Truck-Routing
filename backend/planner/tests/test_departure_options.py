from datetime import UTC, datetime, timedelta

import pytest

from planner.clients.tomtom import Place
from planner.domain.geo import LatLon
from planner.domain.risk import RiskLevel
from planner.services.plan import DEPARTURE_OFFSETS_HOURS, PlanService, TripRequest

from .factories import FakeRouting, TimedWeather, provider_route, straight_line

DENVER = LatLon(39.74, -104.99)
OMAHA = LatLon(41.26, -95.93)
DEPART = datetime(2026, 11, 5, 14, 0, tzinfo=UTC)
FAR_FUTURE = DEPART + timedelta(days=7)


def blizzard_for(hours: int):
    """Severe snow everywhere for the first `hours` hours, then clear."""
    return TimedWeather(lambda h: {"snow": 2.5} if h < hours else {})


def trip(**overrides) -> TripRequest:
    fields = dict(
        origin=Place("Denver", DENVER),
        destination=Place("Omaha", OMAHA),
        departure=DEPART,
        load_lb=20_000,
        interval_miles=25,
    )
    return TripRequest(**{**fields, **overrides})


@pytest.fixture
def routing():
    # ~500 miles at 60 mph: about 8.3 hours of driving.
    return FakeRouting([provider_route(straight_line(DENVER, OMAHA, steps=100))])


def test_finds_the_first_departure_after_the_storm(routing):
    weather = blizzard_for(5)
    result = PlanService(routing, weather).departure_options(trip(), FAR_FUTURE)

    by_offset = {o.offset_hours: o for o in result.options}
    assert [o.offset_hours for o in result.options] == list(DEPARTURE_OFFSETS_HOURS)
    assert by_offset[0].summary.miles(RiskLevel.SEVERE) > by_offset[2].summary.miles(
        RiskLevel.SEVERE
    )
    assert by_offset[6].summary.peak_level == RiskLevel.LOW
    # 6 h is the earliest clear option; later clear options arrive later, so 6 h wins.
    assert result.best_offset_hours == 6


def test_one_routing_call_and_one_weather_lookup_for_all_options(routing):
    weather = blizzard_for(0)
    PlanService(routing, weather).departure_options(trip(), FAR_FUTURE)

    assert len(routing.calls) == 1
    assert weather.calls == 1


def test_leaving_now_wins_when_the_weather_is_calm(routing):
    result = PlanService(routing, blizzard_for(0)).departure_options(trip(), FAR_FUTURE)
    assert result.best_offset_hours == 0


def test_options_stop_at_the_forecast_window(routing):
    result = PlanService(routing, blizzard_for(0)).departure_options(
        trip(), latest_departure=DEPART + timedelta(hours=10)
    )
    assert [o.offset_hours for o in result.options] == [0, 2, 4, 6, 9]


def test_option_times_follow_the_departure(routing):
    option = PlanService(routing, blizzard_for(0)).departure_options(trip(), FAR_FUTURE).options[3]

    assert option.departure == DEPART + timedelta(hours=6)
    assert option.arrival - option.departure == timedelta(seconds=option.summary.duration_s)
    assert option.route_id == "A"
