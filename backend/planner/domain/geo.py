"""Small, dependency-free geometry helpers for polylines on the Earth's surface."""

from __future__ import annotations

import math
from bisect import bisect_right
from collections.abc import Sequence
from typing import NamedTuple

EARTH_RADIUS_MILES = 3958.7613
METERS_PER_MILE = 1609.344
MILES_PER_DEGREE_LAT = 69.055


class LatLon(NamedTuple):
    lat: float
    lon: float

    def as_lon_lat(self, ndigits: int = 5) -> list[float]:
        """GeoJSON coordinate order, rounded (5 digits is about 1 m)."""
        return [round(self.lon, ndigits), round(self.lat, ndigits)]


def haversine_miles(a: LatLon, b: LatLon) -> float:
    lat1, lat2 = math.radians(a.lat), math.radians(b.lat)
    dlat = lat2 - lat1
    dlon = math.radians(b.lon - a.lon)
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_MILES * math.asin(min(1.0, math.sqrt(h)))


def cumulative_miles(points: Sequence[LatLon]) -> list[float]:
    """Distance along the line at each vertex, starting at 0."""
    out = [0.0]
    for prev, cur in zip(points, points[1:], strict=False):
        out.append(out[-1] + haversine_miles(prev, cur))
    return out


def _lerp(a: LatLon, b: LatLon, t: float) -> LatLon:
    return LatLon(a.lat + (b.lat - a.lat) * t, a.lon + (b.lon - a.lon) * t)


def point_at(points: Sequence[LatLon], cum: Sequence[float], miles: float) -> LatLon:
    """The point `miles` along the line (clamped to its ends)."""
    if miles <= 0 or len(points) == 1:
        return points[0]
    if miles >= cum[-1]:
        return points[-1]
    i = bisect_right(cum, miles) - 1
    span = cum[i + 1] - cum[i]
    return _lerp(points[i], points[i + 1], (miles - cum[i]) / span if span else 0.0)


def slice_line(
    points: Sequence[LatLon], cum: Sequence[float], start: float, end: float
) -> list[LatLon]:
    """The part of the line between two distances, with interpolated end points."""
    start, end = max(0.0, start), min(cum[-1], end)
    if end <= start:
        p = point_at(points, cum, start)
        return [p, p]
    first = bisect_right(cum, start)
    last = bisect_right(cum, end)
    inner = [points[i] for i in range(first, last) if start < cum[i] < end]
    return [point_at(points, cum, start), *inner, point_at(points, cum, end)]


def simplify_indices(points: Sequence[LatLon], tolerance_deg: float) -> list[int]:
    """Douglas–Peucker simplification. Returns the indices of the vertices to keep.

    Planar in degrees, which is accurate enough for display at the tolerances used here.
    """
    n = len(points)
    if n <= 2:
        return list(range(n))

    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    tol2 = tolerance_deg * tolerance_deg

    while stack:
        first, last = stack.pop()
        a, b = points[first], points[last]
        dx, dy = b.lon - a.lon, b.lat - a.lat
        seg2 = dx * dx + dy * dy
        worst, worst_d2 = -1, tol2
        for i in range(first + 1, last):
            p = points[i]
            if seg2 == 0:
                d2 = (p.lon - a.lon) ** 2 + (p.lat - a.lat) ** 2
            else:
                t = max(0.0, min(1.0, ((p.lon - a.lon) * dx + (p.lat - a.lat) * dy) / seg2))
                ex, ey = a.lon + t * dx - p.lon, a.lat + t * dy - p.lat
                d2 = ex * ex + ey * ey
            if d2 > worst_d2:
                worst, worst_d2 = i, d2
        if worst != -1:
            keep[worst] = True
            stack.append((first, worst))
            stack.append((worst, last))

    return [i for i, kept in enumerate(keep) if kept]


def interpolate(xs: Sequence[float], ys: Sequence[float], x: float) -> float:
    """Piecewise-linear interpolation of y at x; xs must be ascending. Clamps outside the range."""
    if x <= xs[0]:
        return ys[0]
    if x >= xs[-1]:
        return ys[-1]
    i = bisect_right(xs, x) - 1
    span = xs[i + 1] - xs[i]
    t = (x - xs[i]) / span if span else 0.0
    return ys[i] + (ys[i + 1] - ys[i]) * t


def approx_miles(a: LatLon, b: LatLon) -> float:
    """Fast equirectangular distance; good to well under 1% over tens of miles."""
    x = (b.lon - a.lon) * math.cos(math.radians((a.lat + b.lat) / 2))
    y = b.lat - a.lat
    return math.hypot(x, y) * MILES_PER_DEGREE_LAT
