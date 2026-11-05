"""HTTP endpoints. Views validate input, call a service and present the result; no logic here."""

from __future__ import annotations

import logging
import time

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from django.utils.cache import patch_cache_control
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from . import presenters, providers
from .clients.tomtom import Place
from .domain.geo import LatLon
from .serializers import (
    MAX_DEPARTURE_AHEAD,
    CorridorSerializer,
    GeocodeQuerySerializer,
    ReverseGeocodeQuerySerializer,
    TripSerializer,
)
from .services.corridor import CorridorService
from .services.places import PlaceService
from .services.plan import DEPARTURE_OFFSETS_HOURS, PlanService, TripRequest
from .services.ports import WeatherProvider
from .services.provided_weather import PLAN_VARIABLES, RISK_VARIABLES, ProvidedWeather
from .services.routing_cache import CachedRouting

logger = logging.getLogger(__name__)


@api_view(["GET"])
def health(request: Request) -> Response:
    """Liveness check used by the hosting platform and the frontend."""
    return Response(
        {
            "status": "ok",
            "routing_configured": bool(settings.TOMTOM_API_KEY),
            "weather_source": settings.WEATHER_SOURCE,
        }
    )


@api_view(["GET"])
def risk_rules(request: Request) -> Response:
    """The risk thresholds and load rules, so the UI never duplicates them."""
    response = Response(presenters.risk_rules())
    patch_cache_control(response, public=True, max_age=3600)
    return response


def _place(data: dict) -> Place:
    point = LatLon(data["lat"], data["lon"])
    return Place(label=data["label"] or f"{point.lat:.4f}, {point.lon:.4f}", point=point)


def _weather(data: dict, variables: tuple[str, ...], extra_hours: int = 0) -> WeatherProvider:
    """Where forecasts come from: the visitor's browser (default) or the server itself."""
    if settings.WEATHER_SOURCE == "server":
        return providers.weather_client()
    return ProvidedWeather(data.get("weather") or {}, variables, extra_hours)


def _routing() -> CachedRouting:
    return CachedRouting(providers.routing_client(), cache)


def _trip(data: dict) -> TripRequest:
    return TripRequest(
        origin=_place(data["origin"]),
        destination=_place(data["destination"]),
        departure=data["departure_time"],
        load_lb=data["load_weight_lb"],
        interval_miles=int(data["checkpoint_interval_miles"]),
    )


class PlanView(APIView):
    """Three truck routes with weather-rated checkpoints and a recommendation."""

    throttle_scope = "plan"

    def post(self, request: Request) -> Response:
        serializer = TripSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        trip = _trip(serializer.validated_data)

        started = time.perf_counter()
        data = serializer.validated_data
        # Ask for the departure-options window too, so that request reuses these forecasts.
        weather = _weather(data, PLAN_VARIABLES, extra_hours=max(DEPARTURE_OFFSETS_HOURS))
        plan = PlanService(_routing(), weather).plan(trip)
        logger.info(
            "Planned %d routes, %d checkpoints in %.0f ms",
            len(plan.routes),
            sum(len(r.checkpoints) for r in plan.routes),
            (time.perf_counter() - started) * 1000,
        )
        return Response(presenters.trip_plan(plan, timezone.now()))


class DepartureOptionsView(APIView):
    """The safest time to leave: the trip re-rated for departures over the next 48 hours."""

    throttle_scope = "plan"

    def post(self, request: Request) -> Response:
        serializer = TripSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        trip = _trip(serializer.validated_data)

        weather = _weather(serializer.validated_data, RISK_VARIABLES)
        result = PlanService(_routing(), weather).departure_options(
            trip, latest_departure=timezone.now() + MAX_DEPARTURE_AHEAD
        )
        return Response(presenters.departure_options(result))


class CorridorWeatherView(APIView):
    """Hourly weather and risk on a grid around the routes, 0–48 h after departure."""

    throttle_scope = "corridor"

    def post(self, request: Request) -> Response:
        serializer = CorridorSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        started = time.perf_counter()
        result = CorridorService(_weather(data, RISK_VARIABLES)).corridor_weather(
            data["paths"], data["departure_time"], data["load_weight_lb"]
        )
        logger.info(
            "Corridor weather: %d cells in %.0f ms",
            len(result.cells),
            (time.perf_counter() - started) * 1000,
        )
        return Response(presenters.corridor(result))


class GeocodeView(APIView):
    """Address autocomplete."""

    throttle_scope = "geocode"

    def get(self, request: Request) -> Response:
        serializer = GeocodeQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        near = LatLon(data["lat"], data["lon"]) if "lat" in data and "lon" in data else None

        results = PlaceService(providers.routing_client(), cache).search(data["q"], near)
        return Response({"results": [presenters.place(p) for p in results]})


class ReverseGeocodeView(APIView):
    """The address nearest a point, used when the driver picks a place on the map."""

    throttle_scope = "geocode"

    def get(self, request: Request) -> Response:
        serializer = ReverseGeocodeQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        point = LatLon(serializer.validated_data["lat"], serializer.validated_data["lon"])

        place = PlaceService(providers.routing_client(), cache).reverse(point)
        return Response({"result": presenters.place(place)})
