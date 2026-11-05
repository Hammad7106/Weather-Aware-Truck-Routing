"""Trip planning: routes → checkpoints with ETAs → weather → risk → summary → recommendation."""

from __future__ import annotations

from collections.abc import Iterator, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta

from ..clients.open_meteo import HourlyForecast
from ..clients.tomtom import Place, ProviderRoute
from ..domain.geo import LatLon, cumulative_miles, point_at, simplify_indices, slice_line
from ..domain.ranking import Recommendation, RouteSummary, rank, recommend, risk_key, summarize
from ..domain.risk import RiskAssessment, RiskLevel, Weather, assess
from ..domain.sampling import TravelTimeProfile, checkpoint_miles, coverage
from .ports import RoutingProvider, WeatherProvider

# About 30 m: removes redundant vertices without visible change at street zoom.
SIMPLIFY_TOLERANCE_DEG = 0.0003
ROUTE_IDS = "ABC"
# Departure times compared by "best time to leave", in hours after the requested departure.
DEPARTURE_OFFSETS_HOURS = (0, 2, 4, 6, 9, 12, 18, 24, 36, 48)


@dataclass(frozen=True, slots=True)
class TripRequest:
    origin: Place
    destination: Place
    departure: datetime
    load_lb: int
    interval_miles: int


@dataclass(frozen=True, slots=True)
class Checkpoint:
    index: int
    mile: float
    point: LatLon
    eta: datetime
    covers: tuple[float, float]
    """Start and end mile of the stretch of road this checkpoint represents."""
    weather: Weather | None
    risk: RiskAssessment | None

    @property
    def level(self) -> RiskLevel | None:
        return self.risk.level if self.risk else None

    @property
    def stretch_miles(self) -> float:
        return self.covers[1] - self.covers[0]


@dataclass(frozen=True, slots=True)
class Segment:
    """The part of the route line represented by one checkpoint, for colouring the map."""

    checkpoint_index: int
    level: RiskLevel | None
    coordinates: tuple[LatLon, ...]


@dataclass(frozen=True, slots=True)
class RoutePlan:
    id: str
    major_roads: tuple[str, ...]
    departure: datetime
    arrival: datetime
    traffic_delay_s: int
    summary: RouteSummary
    checkpoints: tuple[Checkpoint, ...]
    segments: tuple[Segment, ...]
    geometry: tuple[LatLon, ...]
    geometry_offsets_s: tuple[int, ...]
    """Seconds after departure at which the truck reaches each geometry vertex."""


@dataclass(frozen=True, slots=True)
class TripPlan:
    trip: TripRequest
    routes: tuple[RoutePlan, ...]
    """In the provider's order (fastest first)."""
    ranking: tuple[str, ...]
    """Route ids, best first."""
    recommendation: Recommendation


@dataclass(frozen=True, slots=True)
class DepartureOption:
    """The best route if the truck left `offset_hours` after the requested departure."""

    offset_hours: int
    departure: datetime
    route_id: str
    arrival: datetime
    summary: RouteSummary


@dataclass(frozen=True, slots=True)
class DepartureOptions:
    options: tuple[DepartureOption, ...]
    best_offset_hours: int
    """Safest option (same risk order as routes), then earliest arrival."""


@dataclass(frozen=True, slots=True)
class _Layout:
    """A route's geometry and checkpoint positions, before weather is known."""

    route: ProviderRoute
    profile: TravelTimeProfile
    marks: tuple[float, ...]
    stretches: tuple[tuple[float, float], ...]
    points: tuple[LatLon, ...]
    geometry: tuple[LatLon, ...]
    geometry_miles: tuple[float, ...]


class PlanService:
    def __init__(self, routing: RoutingProvider, weather: WeatherProvider) -> None:
        self._routing = routing
        self._weather = weather

    def plan(self, trip: TripRequest) -> TripPlan:
        layouts = self._layouts(trip)

        # One batched weather lookup for every checkpoint on every route.
        all_points = [p for layout in layouts for p in layout.points]
        latest = trip.departure + timedelta(seconds=_longest_drive(layouts))
        forecasts = iter(self._weather.forecasts(all_points, trip.departure, latest))

        routes = [
            build_route_plan(
                route_id,
                layout,
                rate_checkpoints(layout, trip.departure, forecasts, trip.load_lb),
                trip.departure,
            )
            for route_id, layout in zip(ROUTE_IDS, layouts, strict=False)
        ]
        summaries = [r.summary for r in routes]
        ranking = tuple(routes[i].id for i in rank(summaries))
        return TripPlan(trip, tuple(routes), ranking, recommend(summaries))

    def departure_options(self, trip: TripRequest, latest_departure: datetime) -> DepartureOptions:
        """Re-rate the same routes for later departures to find the safest time to leave.

        The routes and their drive times are taken from the requested departure and reused
        for every option (traffic differences between departure times are ignored), so this
        costs one routing call and one batched weather lookup in total.
        """
        layouts = self._layouts(trip)
        offsets = [
            hours
            for hours in DEPARTURE_OFFSETS_HOURS
            if trip.departure + timedelta(hours=hours) <= latest_departure
        ]
        all_points = [p for layout in layouts for p in layout.points]
        last_arrival = trip.departure + timedelta(
            hours=offsets[-1], seconds=_longest_drive(layouts)
        )
        forecasts = self._weather.forecasts(all_points, trip.departure, last_arrival)

        options = []
        for hours in offsets:
            departure = trip.departure + timedelta(hours=hours)
            shared = iter(forecasts)
            summaries = [
                summarize(
                    (
                        (cp.stretch_miles, cp.level)
                        for cp in rate_checkpoints(layout, departure, shared, trip.load_lb)
                    ),
                    layout.route.length_miles,
                    layout.route.travel_time_s,
                )
                for layout in layouts
            ]
            best = recommend(summaries).best_index
            options.append(
                DepartureOption(
                    offset_hours=hours,
                    departure=departure,
                    route_id=ROUTE_IDS[best],
                    arrival=departure + timedelta(seconds=summaries[best].duration_s),
                    summary=summaries[best],
                )
            )

        best_option = min(options, key=lambda o: (*risk_key(o.summary), o.arrival))
        return DepartureOptions(tuple(options), best_option.offset_hours)

    def _layouts(self, trip: TripRequest) -> list[_Layout]:
        provider_routes = self._routing.truck_routes(
            trip.origin.point,
            trip.destination.point,
            depart_at=trip.departure,
            load_lb=trip.load_lb,
        )[: len(ROUTE_IDS)]
        return [lay_out(route, trip.interval_miles) for route in provider_routes]


def _longest_drive(layouts: Sequence[_Layout]) -> int:
    return max(layout.route.travel_time_s for layout in layouts)


def rate_checkpoints(
    layout: _Layout, departure: datetime, forecasts: Iterator[HourlyForecast | None], load_lb: int
) -> list[Checkpoint]:
    """Rate each checkpoint with the forecast for the hour the truck gets there.

    `forecasts` yields one forecast per checkpoint, in route order (see `PlanService.plan`).
    """
    checkpoints = []
    for index, (mile, stretch, point) in enumerate(
        zip(layout.marks, layout.stretches, layout.points, strict=True)
    ):
        eta = departure + timedelta(seconds=layout.profile.seconds_at(mile))
        forecast = next(forecasts)
        weather = forecast.at(eta) if forecast else None
        risk = assess(weather, load_lb) if weather else None
        checkpoints.append(Checkpoint(index, mile, point, eta, stretch, weather, risk))
    return checkpoints


def lay_out(route: ProviderRoute, interval_miles: int) -> _Layout:
    points = route.points
    measured = cumulative_miles(points)
    # Scale our haversine distances to the provider's road length so both share one scale.
    scale = route.length_miles / measured[-1] if measured[-1] > 0 else 1.0
    cum = [m * scale for m in measured]

    profile = TravelTimeProfile.from_anchors(
        route.timing_anchors, route.length_miles, route.travel_time_s
    )
    marks = checkpoint_miles(route.length_miles, interval_miles)
    keep = simplify_indices(points, SIMPLIFY_TOLERANCE_DEG)

    return _Layout(
        route=route,
        profile=profile,
        marks=tuple(marks),
        stretches=tuple(coverage(marks)),
        points=tuple(point_at(points, cum, m) for m in marks),
        geometry=tuple(points[i] for i in keep),
        geometry_miles=tuple(cum[i] for i in keep),
    )


def build_route_plan(
    route_id: str, layout: _Layout, checkpoints: Sequence[Checkpoint], departure: datetime
) -> RoutePlan:
    route = layout.route
    segments = tuple(
        Segment(
            cp.index,
            cp.level,
            tuple(slice_line(layout.geometry, layout.geometry_miles, *cp.covers)),
        )
        for cp in checkpoints
        if cp.stretch_miles > 0
    )
    summary = summarize(
        ((cp.stretch_miles, cp.level) for cp in checkpoints),
        route.length_miles,
        route.travel_time_s,
    )
    return RoutePlan(
        id=route_id,
        major_roads=route.major_roads[:2],
        departure=departure,
        arrival=departure + timedelta(seconds=route.travel_time_s),
        traffic_delay_s=route.traffic_delay_s,
        summary=summary,
        checkpoints=tuple(checkpoints),
        segments=segments,
        geometry=layout.geometry,
        geometry_offsets_s=tuple(
            round(layout.profile.seconds_at(m)) for m in layout.geometry_miles
        ),
    )
