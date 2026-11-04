"""Route summaries and the recommendation order (see ASSUMPTIONS.md, sections 6 and 7)."""

from __future__ import annotations

import math
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass, field

from .risk import RiskLevel


@dataclass(frozen=True, slots=True)
class RouteSummary:
    distance_miles: float
    duration_s: int
    miles_by_level: dict[RiskLevel, float]
    no_data_miles: float
    average_risk: float | None
    """Distance-weighted mean level (0–4) over the miles that have forecast data."""
    peak_level: RiskLevel | None

    def miles(self, level: RiskLevel) -> float:
        return self.miles_by_level.get(level, 0.0)


def summarize(
    stretches: Iterable[tuple[float, RiskLevel | None]], distance_miles: float, duration_s: int
) -> RouteSummary:
    """Summarize a route from (miles, level) stretches; `None` means no forecast data."""
    miles_by_level = dict.fromkeys(RiskLevel, 0.0)
    no_data = 0.0
    weighted = 0.0
    peak: RiskLevel | None = None

    for miles, level in stretches:
        if level is None:
            no_data += miles
            continue
        miles_by_level[level] += miles
        weighted += miles * level
        peak = level if peak is None else max(peak, level)

    rated = sum(miles_by_level.values())
    average = weighted / rated if rated > 0 else (0.0 if peak is not None else None)
    return RouteSummary(
        distance_miles=distance_miles,
        duration_s=duration_s,
        miles_by_level=miles_by_level,
        no_data_miles=no_data,
        average_risk=average,
        peak_level=peak,
    )


@dataclass(frozen=True, slots=True)
class Criterion:
    key: str
    label: str
    value: Callable[[RouteSummary], float]
    """Lower is better. Values are rounded so float noise cannot decide a ranking."""


def _miles_at(level: RiskLevel) -> Callable[[RouteSummary], float]:
    return lambda s: round(s.miles(level), 1)


CRITERIA: tuple[Criterion, ...] = (
    Criterion("no_travel_miles", "No Travel miles", _miles_at(RiskLevel.NO_TRAVEL)),
    Criterion("severe_miles", "Severe miles", _miles_at(RiskLevel.SEVERE)),
    Criterion("high_miles", "High miles", _miles_at(RiskLevel.HIGH)),
    Criterion(
        "average_risk",
        "Average risk",
        lambda s: math.inf if s.average_risk is None else round(s.average_risk, 2),
    ),
    Criterion("travel_time", "Travel time", lambda s: s.duration_s),
)


def ranking_key(summary: RouteSummary) -> tuple[float, ...]:
    return tuple(criterion.value(summary) for criterion in CRITERIA)


def rank(summaries: Sequence[RouteSummary]) -> list[int]:
    """Indices of `summaries`, best first. Ties keep the provider's order (fastest first)."""
    return sorted(range(len(summaries)), key=lambda i: ranking_key(summaries[i]))


@dataclass(frozen=True, slots=True)
class Comparison:
    criterion: str
    label: str
    winner: float
    runner_up: float
    decisive: bool


@dataclass(frozen=True, slots=True)
class Recommendation:
    best_index: int
    runner_up_index: int | None
    decided_by: str | None
    """Key of the criterion that separated the top two routes; None if only one route or a tie."""
    comparisons: tuple[Comparison, ...] = field(default=())
    no_safe_route: bool = False
    """True when even the best route has No Travel miles."""


def recommend(summaries: Sequence[RouteSummary]) -> Recommendation:
    if not summaries:
        raise ValueError("at least one route is required")

    order = rank(summaries)
    best = summaries[order[0]]
    no_safe_route = best.miles(RiskLevel.NO_TRAVEL) > 0

    if len(order) == 1:
        return Recommendation(order[0], None, None, (), no_safe_route)

    runner_up = summaries[order[1]]
    comparisons: list[Comparison] = []
    decided_by: str | None = None
    for criterion in CRITERIA:
        a, b = criterion.value(best), criterion.value(runner_up)
        decisive = a != b
        comparisons.append(Comparison(criterion.key, criterion.label, a, b, decisive))
        if decisive:
            decided_by = criterion.key
            break

    return Recommendation(order[0], order[1], decided_by, tuple(comparisons), no_safe_route)
