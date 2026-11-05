from dataclasses import replace
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from django.core.cache import cache

from planner.clients.open_meteo import OpenMeteoClient, ceil_hour, floor_hour, snap
from planner.domain.geo import LatLon
from planner.errors import UpstreamError

from .factories import forecast, open_meteo_location

START = datetime(2026, 11, 5, 14, 0, tzinfo=UTC)


class Recorder:
    """Mock transport that answers each request with one location per requested latitude."""

    def __init__(self, **conditions):
        self.requests: list[httpx.Request] = []
        self.conditions = conditions

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        count = len(request.url.params["latitude"].split(","))
        items = [open_meteo_location(int(START.timestamp()), 6, **self.conditions)] * count
        return httpx.Response(200, json=items if count > 1 else items[0])


def make_client(handler, **kwargs) -> OpenMeteoClient:
    http = httpx.Client(transport=httpx.MockTransport(handler))
    return OpenMeteoClient(http, cache, base_url="https://weather.test/v1/forecast", **kwargs)


def test_snap_rounds_to_grid():
    assert snap(LatLon(39.7392, -104.9903)) == LatLon(39.75, -105.0)
    assert snap(LatLon(39.724, -104.976)) == LatLon(39.70, -105.0)


def test_hour_rounding():
    moment = datetime(2026, 11, 5, 14, 20, tzinfo=UTC)
    assert floor_hour(moment) == START
    assert ceil_hour(moment) == START + timedelta(hours=1)
    assert ceil_hour(START) == START


def test_forecasts_requests_units_and_window_and_keeps_input_order():
    recorder = Recorder(wind=30, rain=0.2)
    points = [LatLon(39.74, -104.99), LatLon(41.0, -100.0)]

    result = make_client(recorder).forecasts(points, START, START + timedelta(hours=4, minutes=10))

    params = recorder.requests[0].url.params
    assert params["wind_speed_unit"] == "mph"
    assert params["precipitation_unit"] == "inch"
    assert params["start_hour"] == "2026-11-05T14:00"
    assert params["end_hour"] == "2026-11-05T19:00"
    assert params["latitude"] == "39.75,41.00"
    weather = result[0].at(START)
    assert weather is not None and weather.wind_mph == 30 and weather.rain_in_hr == 0.2


def test_nearby_points_share_one_lookup_and_results_are_cached():
    recorder = Recorder()
    client = make_client(recorder)
    points = [LatLon(39.741, -104.99), LatLon(39.742, -104.991), LatLon(45, -100)]

    first = client.forecasts(points, START, START + timedelta(hours=2))
    second = client.forecasts(points, START, START + timedelta(hours=2))

    assert len(recorder.requests) == 1
    assert recorder.requests[0].url.params["latitude"] == "39.75,45.00"
    assert first[0] is first[1]
    assert [f.start_epoch for f in second] == [f.start_epoch for f in first]


def test_large_requests_are_batched():
    recorder = Recorder()
    points = [LatLon(30 + i, -100) for i in range(5)]

    result = make_client(recorder, batch_size=2).forecasts(points, START, START)

    assert len(recorder.requests) == 3
    assert len(result) == 5 and all(result)


def test_rain_and_showers_are_added():
    def handle(request):
        item = open_meteo_location(int(START.timestamp()), 2, rain=0.07)
        item["hourly"]["showers"] = [0.03, None]
        return httpx.Response(200, json=item)

    series = make_client(handle).forecasts([LatLon(40, -100)], START, START)[0]
    assert series is not None
    assert series.rain_in == (0.1, 0.07)


def test_error_reason_is_surfaced():
    failing = make_client(lambda r: httpx.Response(400, json={"error": True, "reason": "bad hour"}))
    with pytest.raises(UpstreamError, match="bad hour"):
        failing.forecasts([LatLon(40, -100)], START, START)


def test_mismatched_location_count_is_an_error():
    wrong = make_client(
        lambda r: httpx.Response(200, json=[open_meteo_location(int(START.timestamp()), 1)])
    )
    with pytest.raises(UpstreamError):
        wrong.forecasts([LatLon(40, -100), LatLon(41, -100)], START, START)


def test_at_uses_nearest_hour_and_handles_gaps():
    series = forecast(START, hours=3, wind=10)
    assert series.at(START + timedelta(minutes=29)) is not None
    assert series.at(START + timedelta(hours=2, minutes=29)) is not None
    assert series.at(START + timedelta(hours=2, minutes=31)) is None  # past the last hour
    assert series.at(START - timedelta(minutes=31)) is None

    gappy = replace(forecast(START, hours=2), wind_mph=(None, 5.0))
    assert gappy.at(START) is None
    assert gappy.at(START + timedelta(hours=1)) is not None
