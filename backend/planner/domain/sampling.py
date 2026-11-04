"""Checkpoint placement and ETA interpolation (see ASSUMPTIONS.md, section 3)."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from .geo import interpolate

ALLOWED_INTERVALS_MILES = (10, 25, 50)

# A final checkpoint closer than this to the previous one is merged into it, so a route of
# 50.01 miles does not get a 0.01-mile stub with its own weather lookup.
_MIN_GAP_MILES = 0.05


def checkpoint_miles(total_miles: float, interval_miles: float) -> list[float]:
    """Mile 0, then every `interval_miles`, then the destination."""
    if interval_miles <= 0:
        raise ValueError("interval_miles must be positive")
    if total_miles <= 0:
        return [0.0]

    marks = [0.0]
    mile = interval_miles
    while mile < total_miles - _MIN_GAP_MILES:
        marks.append(mile)
        mile += interval_miles
    marks.append(total_miles)
    return marks


def coverage(marks: Sequence[float]) -> list[tuple[float, float]]:
    """The stretch of road each checkpoint represents: halfway to each neighbour.

    The stretches are contiguous and add up exactly to the route length.
    """
    if len(marks) == 1:
        return [(marks[0], marks[0])]
    bounds = [marks[0], *((a + b) / 2 for a, b in zip(marks, marks[1:], strict=False)), marks[-1]]
    return list(zip(bounds, bounds[1:], strict=False))


@dataclass(frozen=True, slots=True)
class TravelTimeProfile:
    """Elapsed driving time as a function of distance along the route.

    Built from (miles, seconds) anchors, such as the routing provider's turn-by-turn
    guidance, and linearly interpolated between them.
    """

    miles: tuple[float, ...]
    seconds: tuple[float, ...]

    @classmethod
    def from_anchors(
        cls, anchors: Sequence[tuple[float, float]], total_miles: float, total_seconds: float
    ) -> TravelTimeProfile:
        points = sorted({(0.0, 0.0), (total_miles, total_seconds), *anchors})
        miles: list[float] = []
        seconds: list[float] = []
        for m, s in points:
            if not 0 <= m <= total_miles:
                continue
            # Keep both series non-decreasing; drop anchors that would make time run backwards.
            if miles and (m <= miles[-1] or s < seconds[-1]):
                continue
            miles.append(m)
            seconds.append(min(s, total_seconds))
        if miles[-1] != total_miles:
            miles.append(total_miles)
            seconds.append(total_seconds)
        return cls(tuple(miles), tuple(seconds))

    def seconds_at(self, mile: float) -> float:
        return interpolate(self.miles, self.seconds, mile)

    def mile_at(self, seconds: float) -> float:
        return interpolate(self.seconds, self.miles, seconds)
