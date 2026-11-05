import logging
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from django.conf import settings
from django.utils.log import configure_logging

from planner.clients.tomtom import TomTomClient
from planner.domain.geo import LatLon
from planner.errors import ConfigurationError, NoRouteFound, UpstreamError

from .factories import straight_line, tomtom_route_json

DENVER = LatLon(39.74, -104.99)
OMAHA = LatLon(41.26, -95.93)


def client(handler) -> TomTomClient:
    return TomTomClient("test-key", httpx.Client(transport=httpx.MockTransport(handler)))


def route_handler(requests: list[httpx.Request], routes: list[dict]):
    def handle(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"routes": routes})

    return handle


def test_requires_an_api_key():
    with pytest.raises(ConfigurationError):
        TomTomClient("", httpx.Client())


def test_truck_routes_sends_truck_parameters_and_parses_routes():
    requests: list[httpx.Request] = []
    line = straight_line(DENVER, OMAHA)
    payload = [tomtom_route_json(line, roads=("I-76", "I-80")), tomtom_route_json(line, mph=50)]
    depart = datetime.now(UTC) + timedelta(hours=3)

    routes = client(route_handler(requests, payload)).truck_routes(
        DENVER, OMAHA, depart_at=depart, load_lb=40_000
    )

    params = requests[0].url.params
    assert "/calculateRoute/39.74,-104.99:41.26,-95.93/json" in requests[0].url.path
    assert params["travelMode"] == "truck"
    assert params["maxAlternatives"] == "2"
    # Gross weight = 40,000 lb cargo + 35,000 lb tare, in kg.
    assert params["vehicleWeight"] == str(round(75_000 * 0.45359237))
    assert params["departAt"] == depart.strftime("%Y-%m-%dT%H:%M:%SZ")
    assert params["key"] == "test-key"

    assert len(routes) == 2
    first = routes[0]
    assert first.points[0] == DENVER and first.points[-1] == OMAHA
    assert first.length_miles == pytest.approx(500, rel=0.05)
    assert first.traffic_delay_s == 120
    anchor_miles = [m for m, _ in first.timing_anchors]
    assert anchor_miles == pytest.approx([0, first.length_miles / 2, first.length_miles], abs=2)
    assert first.major_roads == ("I-76", "I-80")


def test_departure_in_the_past_is_sent_as_now():
    requests: list[httpx.Request] = []
    line = straight_line(DENVER, OMAHA)
    client(route_handler(requests, [tomtom_route_json(line)])).truck_routes(
        DENVER, OMAHA, depart_at=datetime.now(UTC) - timedelta(minutes=10), load_lb=0
    )
    assert requests[0].url.params["departAt"] == "now"


def test_empty_route_list_means_no_route():
    with pytest.raises(NoRouteFound):
        client(route_handler([], [])).truck_routes(
            DENVER, OMAHA, depart_at=datetime.now(UTC), load_lb=0
        )


@pytest.mark.parametrize(
    ("status", "body", "error"),
    [
        (400, '{"detailedError":{"code":"NO_ROUTE_FOUND"}}', NoRouteFound),
        (403, "Developer Inactive", ConfigurationError),
        (429, "Too Many Requests", UpstreamError),
        (500, "Internal error", UpstreamError),
    ],
)
def test_error_responses_map_to_planner_errors(status, body, error):
    failing = client(lambda request: httpx.Response(status, text=body))
    with pytest.raises(error):
        failing.truck_routes(DENVER, OMAHA, depart_at=datetime.now(UTC), load_lb=0)


def test_network_failure_is_an_upstream_error():
    def refuse(request):
        raise httpx.ConnectError("connection refused")

    with pytest.raises(UpstreamError):
        client(refuse).search("Denver")


def test_malformed_route_is_an_upstream_error():
    with pytest.raises(UpstreamError):
        client(route_handler([], [{"summary": {}}])).truck_routes(
            DENVER, OMAHA, depart_at=datetime.now(UTC), load_lb=0
        )


def test_search_parses_addresses_and_pois_and_skips_incomplete_results():
    requests: list[httpx.Request] = []

    def handle(request):
        requests.append(request)
        return httpx.Response(
            200,
            json={
                "results": [
                    {
                        "address": {"freeformAddress": "Denver, CO"},
                        "position": {"lat": 39.7, "lon": -105.0},
                    },
                    {
                        "poi": {"name": "Pilot Travel Center"},
                        "address": {"freeformAddress": "Aurora, CO"},
                        "position": {"lat": 39.8, "lon": -104.7},
                    },
                    {"address": {}, "position": {"lat": 1, "lon": 1}},
                ]
            },
        )

    places = client(handle).search("den ver/co", near=LatLon(40, -100))

    assert [p.label for p in places] == ["Denver, CO", "Pilot Travel Center, Aurora, CO"]
    assert places[1].point == LatLon(39.8, -104.7)
    assert requests[0].url.raw_path.startswith(b"/search/2/search/den%20ver%2Fco.json")
    assert requests[0].url.params["countrySet"] == "US,CA,MX"
    assert requests[0].url.params["lat"] == "40"


def test_reverse_geocode():
    found = client(
        lambda r: httpx.Response(
            200, json={"addresses": [{"address": {"freeformAddress": "I-80, NE"}}]}
        )
    ).reverse_geocode(LatLon(41, -100))
    nothing = client(lambda r: httpx.Response(200, json={"addresses": []})).reverse_geocode(
        LatLon(41, -100)
    )

    assert found is not None and found.label == "I-80, NE"
    assert nothing is None


def test_api_key_is_never_logged(caplog):
    configure_logging(settings.LOGGING_CONFIG, settings.LOGGING)
    with caplog.at_level(logging.INFO):
        client(route_handler([], [tomtom_route_json(straight_line(DENVER, OMAHA))])).truck_routes(
            DENVER, OMAHA, depart_at=datetime.now(UTC), load_lb=0
        )
    assert "test-key" not in caplog.text
