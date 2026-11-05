"""Weather heatmap along the trip corridor for 0–48 h after departure (ASSUMPTIONS.md §8)."""

from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta

from ..clients.open_meteo import floor_hour
from ..domain.geo import MILES_PER_DEGREE_LAT, LatLon, approx_miles, cumulative_miles, point_at
from ..domain.risk import assess
from .ports import WeatherProvider

HOURS = 48
BUFFER_MILES = 40.0
MAX_POINTS = 300
MIN_SPACING_MILES = 6.0
_PATH_SAMPLE_MILES = 5.0


@dataclass(frozen=True, slots=True)
class CorridorCell:
    point: LatLon
    risk: tuple[int | None, ...]
    wind_mph: tuple[float | None, ...]
    rain_in_hr: tuple[float | None, ...]
    snow_in_hr: tuple[float | None, ...]


@dataclass(frozen=True, slots=True)
class CorridorWeather:
    start: datetime
    """The hour that slider position 0 represents (departure, rounded down to the hour)."""
    hours: int
    spacing_miles: float
    cells: tuple[CorridorCell, ...]


def _sample_path(path: Sequence[LatLon]) -> list[LatLon]:
    if len(path) < 2:
        return list(path)
    cum = cumulative_miles(path)
    steps = max(1, math.ceil(cum[-1] / _PATH_SAMPLE_MILES))
    return [point_at(path, cum, cum[-1] * i / steps) for i in range(steps + 1)]


class _SpatialIndex:
    """Buckets points into cells about `cell_miles` wide, so a radius query checks 9 cells."""

    def __init__(self, points: Sequence[LatLon], cell_miles: float, ref_lat: float) -> None:
        self._dlat = cell_miles / MILES_PER_DEGREE_LAT
        self._dlon = self._dlat / max(0.2, math.cos(math.radians(ref_lat)))
        self._buckets: dict[tuple[int, int], list[LatLon]] = defaultdict(list)
        for p in points:
            self._buckets[self._key(p)].append(p)

    def _key(self, p: LatLon) -> tuple[int, int]:
        return math.floor(p.lat / self._dlat), math.floor(p.lon / self._dlon)

    def within(self, p: LatLon, miles: float) -> bool:
        row, col = self._key(p)
        return any(
            approx_miles(p, q) <= miles
            for dr in (-1, 0, 1)
            for dc in (-1, 0, 1)
            for q in self._buckets.get((row + dr, col + dc), ())
        )


def corridor_grid(
    paths: Sequence[Sequence[LatLon]],
    *,
    buffer_miles: float = BUFFER_MILES,
    max_points: int = MAX_POINTS,
) -> tuple[list[LatLon], float]:
    """Grid points within `buffer_miles` of any path, at most `max_points` of them.

    Returns the points and the grid spacing in miles.
    """
    samples = [p for path in paths for p in _sample_path(path)]
    if not samples:
        return [], 0.0

    lats = [p.lat for p in samples]
    lons = [p.lon for p in samples]
    ref_lat = (min(lats) + max(lats)) / 2
    lon_scale = max(0.2, math.cos(math.radians(ref_lat)))
    # Size longitude buckets at the highest latitude, where a degree of longitude is shortest,
    # so a 3×3 bucket search always covers the full radius.
    index = _SpatialIndex(samples, buffer_miles, max(abs(min(lats)), abs(max(lats))))

    # First guess: spread max_points over a band of 2 × buffer along the longest path.
    longest = max((cumulative_miles(path)[-1] for path in paths if len(path) > 1), default=0.0)
    band_area = max(1.0, (longest + 2 * buffer_miles) * 2 * buffer_miles * 1.3)
    spacing = max(MIN_SPACING_MILES, math.sqrt(band_area / max_points))

    pad_lat = buffer_miles / MILES_PER_DEGREE_LAT
    pad_lon = pad_lat / lon_scale
    while True:
        dlat = spacing / MILES_PER_DEGREE_LAT
        dlon = dlat / lon_scale
        rows = math.floor((max(lats) - min(lats) + 2 * pad_lat) / dlat) + 1
        cols = math.floor((max(lons) - min(lons) + 2 * pad_lon) / dlon) + 1
        points = [
            candidate
            for r in range(rows)
            for c in range(cols)
            if index.within(
                candidate := LatLon(min(lats) - pad_lat + r * dlat, min(lons) - pad_lon + c * dlon),
                buffer_miles,
            )
        ]
        if len(points) <= max_points:
            return points, spacing
        spacing *= 1.15


class CorridorService:
    def __init__(self, weather: WeatherProvider) -> None:
        self._weather = weather

    def corridor_weather(
        self, paths: Sequence[Sequence[LatLon]], departure: datetime, load_lb: int
    ) -> CorridorWeather:
        points, spacing = corridor_grid(paths)
        start = floor_hour(departure)
        hours = [start + timedelta(hours=h) for h in range(HOURS + 1)]
        forecasts = self._weather.forecasts(points, hours[0], hours[-1]) if points else []

        cells = []
        for point, forecast in zip(points, forecasts, strict=True):
            samples = [forecast.at(h) if forecast else None for h in hours]
            cells.append(
                CorridorCell(
                    point=point,
                    risk=tuple(int(assess(w, load_lb).level) if w else None for w in samples),
                    wind_mph=tuple(round(w.wind_mph, 1) if w else None for w in samples),
                    rain_in_hr=tuple(round(w.rain_in_hr, 2) if w else None for w in samples),
                    snow_in_hr=tuple(round(w.snow_in_hr, 2) if w else None for w in samples),
                )
            )
        return CorridorWeather(start, HOURS, round(spacing, 1), tuple(cells))
