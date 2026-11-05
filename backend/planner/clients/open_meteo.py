"""Open-Meteo hourly forecast client (https://open-meteo.com/en/docs).

Points are snapped to a 0.05° grid and de-duplicated, cached per grid cell and time window, and
fetched in batched multi-location requests that run in parallel.
"""

from __future__ import annotations

import logging
import math
from collections.abc import Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from django.core.cache import BaseCache

from ..domain.geo import LatLon
from ..domain.risk import Weather
from ..errors import UpstreamError

logger = logging.getLogger(__name__)

SERVICE = "Open-Meteo"
GRID_DEGREES = 0.05
TIMEZONE_CACHE_SECONDS = 30 * 24 * 60 * 60
HOUR = 3600
HOURLY_VARIABLES = (
    "wind_speed_10m",
    "wind_gusts_10m",
    "rain",
    "showers",
    "snowfall",
    "temperature_2m",
    "weather_code",
)


def snap(point: LatLon) -> LatLon:
    """Round to the forecast grid so nearby points share one lookup and one cache entry."""

    def to_grid(value: float) -> float:
        return round(round(value / GRID_DEGREES) * GRID_DEGREES, 2)

    return LatLon(to_grid(point.lat), to_grid(point.lon))


def floor_hour(moment: datetime) -> datetime:
    return moment.astimezone(UTC).replace(minute=0, second=0, microsecond=0)


def ceil_hour(moment: datetime) -> datetime:
    floored = floor_hour(moment)
    return floored if floored == moment.astimezone(UTC) else floored + timedelta(hours=1)


@dataclass(frozen=True, slots=True)
class HourlyForecast:
    """Hourly series for one grid cell. Index i is the hour starting at `start_epoch + i*3600`."""

    start_epoch: int
    wind_mph: tuple[float | None, ...]
    gust_mph: tuple[float | None, ...]
    rain_in: tuple[float | None, ...]
    snow_in: tuple[float | None, ...]
    temperature_f: tuple[float | None, ...]
    weather_code: tuple[int | None, ...]

    def at(self, moment: datetime) -> Weather | None:
        """Conditions for the hour nearest `moment`, or None when outside the series or missing."""
        index = math.floor((moment.timestamp() - self.start_epoch) / HOUR + 0.5)
        if not 0 <= index < len(self.wind_mph):
            return None
        wind, rain, snow = self.wind_mph[index], self.rain_in[index], self.snow_in[index]
        if wind is None or rain is None or snow is None:
            return None
        return Weather(
            wind_mph=wind,
            rain_in_hr=rain,
            snow_in_hr=snow,
            gust_mph=self.gust_mph[index],
            temperature_f=self.temperature_f[index],
            weather_code=self.weather_code[index],
        )


class OpenMeteoClient:
    def __init__(
        self,
        http: httpx.Client,
        cache: BaseCache,
        *,
        base_url: str = "https://api.open-meteo.com/v1/forecast",
        cache_seconds: int = 30 * 60,
        batch_size: int = 100,
        max_workers: int = 4,
    ) -> None:
        self._http = http
        self._cache = cache
        self._url = base_url
        self._ttl = cache_seconds
        self._batch_size = batch_size
        self._max_workers = max_workers

    def forecasts(
        self, points: Sequence[LatLon], start: datetime, end: datetime
    ) -> list[HourlyForecast | None]:
        """Hourly forecasts covering [start, end] for each point, in the same order."""
        window = (floor_hour(start), ceil_hour(end))
        cells = [snap(p) for p in points]
        unique = list(dict.fromkeys(cells))

        keys = {cell: self._cache_key(cell, window) for cell in unique}
        cached: dict[str, HourlyForecast] = self._cache.get_many(list(keys.values()))
        found = {cell: cached[key] for cell, key in keys.items() if key in cached}
        missing = [cell for cell in unique if cell not in found]

        if missing:
            batches = [
                missing[i : i + self._batch_size] for i in range(0, len(missing), self._batch_size)
            ]
            with ThreadPoolExecutor(max_workers=min(self._max_workers, len(batches))) as pool:
                for batch, results in zip(
                    batches, pool.map(lambda b: self._fetch(b, window), batches), strict=True
                ):
                    found.update(zip(batch, results, strict=True))
            self._cache.set_many({keys[cell]: found[cell] for cell in missing}, self._ttl)

        return [found.get(cell) for cell in cells]

    def timezone(self, point: LatLon) -> str | None:
        """IANA time zone of a point (e.g. "America/Denver"), or None if unknown.

        Time zones change rarely, so lookups are cached for 30 days per grid cell.
        """
        cell = snap(point)
        key = f"om:tz:v1:{cell.lat:.2f},{cell.lon:.2f}"
        cached = self._cache.get(key)
        if cached is not None:
            return cached or None
        try:
            response = self._http.get(
                self._url,
                params={
                    "latitude": f"{cell.lat:.2f}",
                    "longitude": f"{cell.lon:.2f}",
                    "timezone": "auto",
                    "forecast_days": 1,
                },
            )
        except httpx.HTTPError as exc:
            raise UpstreamError(SERVICE, "the weather service could not be reached") from exc
        if response.status_code != 200:
            raise UpstreamError(SERVICE, _error_reason(response) or "time zone lookup failed")
        zone = response.json().get("timezone")
        name = zone if isinstance(zone, str) and "/" in zone else ""
        self._cache.set(key, name, TIMEZONE_CACHE_SECONDS)
        return name or None

    @staticmethod
    def _cache_key(cell: LatLon, window: tuple[datetime, datetime]) -> str:
        return f"om:v1:{cell.lat:.2f},{cell.lon:.2f}:{window[0]:%Y%m%d%H}:{window[1]:%Y%m%d%H}"

    def _fetch(
        self, cells: Sequence[LatLon], window: tuple[datetime, datetime]
    ) -> list[HourlyForecast]:
        params = {
            "latitude": ",".join(f"{c.lat:.2f}" for c in cells),
            "longitude": ",".join(f"{c.lon:.2f}" for c in cells),
            "hourly": ",".join(HOURLY_VARIABLES),
            "wind_speed_unit": "mph",
            "precipitation_unit": "inch",
            "temperature_unit": "fahrenheit",
            "timeformat": "unixtime",
            "timezone": "GMT",
            "start_hour": f"{window[0]:%Y-%m-%dT%H:%M}",
            "end_hour": f"{window[1]:%Y-%m-%dT%H:%M}",
        }
        try:
            response = self._http.get(self._url, params=params)
        except httpx.HTTPError as exc:
            logger.warning("Open-Meteo request failed: %s", exc)
            raise UpstreamError(SERVICE, "the weather service could not be reached") from exc

        if response.status_code != 200:
            reason = _error_reason(response)
            logger.warning("Open-Meteo %s: %s", response.status_code, reason)
            raise UpstreamError(SERVICE, reason or f"request failed ({response.status_code})")

        payload = response.json()
        items = payload if isinstance(payload, list) else [payload]
        if len(items) != len(cells):
            raise UpstreamError(SERVICE, "returned a different number of locations than requested")
        return [_parse_hourly(item) for item in items]


def _error_reason(response: httpx.Response) -> str:
    try:
        return str(response.json().get("reason", ""))
    except ValueError:
        return ""


def _parse_hourly(item: dict[str, Any]) -> HourlyForecast:
    try:
        hourly = item["hourly"]
        times = hourly["time"]
        rain = [_add(r, s) for r, s in zip(hourly["rain"], hourly["showers"], strict=True)]
        return HourlyForecast(
            start_epoch=int(times[0]) if times else 0,
            wind_mph=tuple(hourly["wind_speed_10m"]),
            gust_mph=tuple(hourly["wind_gusts_10m"]),
            rain_in=tuple(rain),
            snow_in=tuple(hourly["snowfall"]),
            temperature_f=tuple(hourly["temperature_2m"]),
            weather_code=tuple(hourly["weather_code"]),
        )
    except (KeyError, TypeError, ValueError, IndexError) as exc:
        raise UpstreamError(SERVICE, "returned a forecast in an unexpected format") from exc


def _add(a: float | None, b: float | None) -> float | None:
    """Sum two precipitation values. Rounded to the API's 3-decimal precision so float noise
    (0.07 + 0.03 = 0.0999…) cannot drop a value below a risk threshold."""
    if a is None and b is None:
        return None
    return round((a or 0.0) + (b or 0.0), 3)
