"""Trip planning: routes → checkpoints with ETAs → weather → risk → summary → recommendation."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta

from ..clients.tomtom import Place, ProviderRoute
from ..domain.geo import LatLon, cumulative_miles, point_at, simplify_indices, slice_line
from ..domain.ranking import Recommendation, RouteSummary, rank, recommend, summarize
from ..domain.risk import RiskAssessment, RiskLevel, Weather, assess
from ..domain.sampling import TravelTimeProfile, checkpoint_miles, coverage
from .ports import RoutingProvider, WeatherProvider

# About 30 m: removes redundant vertices without visible change at street zoom.
SIMPLIFY_TOLERANCE_DEG = 0.0003
ROUTE_IDS = "ABC"


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
        provider_routes = self._routing.truck_routes(
            trip.origin.point,
            trip.destination.point,
            depart_at=trip.departure,
            load_lb=trip.load_lb,
        )[: len(ROUTE_IDS)]
        layouts = [lay_out(route, trip.interval_miles) for route in provider_routes]

        # One batched weather lookup for every checkpoint on every route.
        all_points = [p for layout in layouts for p in layout.points]
        latest = max(trip.departure + timedelta(seconds=r.travel_time_s) for r in provider_routes)
        forecasts = iter(self._weather.forecasts(all_points, trip.departure, latest))

        routes = []
        for route_id, layout in zip(ROUTE_IDS, layouts, strict=False):
            checkpoints = []
            for index, (mile, stretch, point) in enumerate(
                zip(layout.marks, layout.stretches, layout.points, strict=True)
            ):
                eta = trip.departure + timedelta(seconds=layout.profile.seconds_at(mile))
                forecast = next(forecasts)
                weather = forecast.at(eta) if forecast else None
                risk = assess(weather, trip.load_lb) if weather else None
                checkpoints.append(Checkpoint(index, mile, point, eta, stretch, weather, risk))
            routes.append(build_route_plan(route_id, layout, checkpoints, trip.departure))

        summaries = [r.summary for r in routes]
        ranking = tuple(routes[i].id for i in rank(summaries))
        return TripPlan(trip, tuple(routes), ranking, recommend(summaries))


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
