"""Forecasts supplied by the caller instead of fetched by the server.

Open-Meteo's free tier is limited per IP address, and free hosting shares outgoing addresses
between many apps, so a hosted server can find the quota used up by strangers. With
WEATHER_SOURCE=client each visitor's browser fetches the forecasts with its own quota and sends
them along; the server still applies every rule. See ASSUMPTIONS.md, section 4.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime, timedelta

from ..clients.open_meteo import HourlyForecast, ceil_hour, floor_hour, snap
from ..domain.geo import LatLon
from ..errors import WeatherRequired

# Open-Meteo hourly variables the client must fetch. Display-only ones are needed for the plan's
# checkpoint popups but not for departure options or the heatmap, which keeps uploads small.
PLAN_VARIABLES = (
    "wind_speed_10m",
    "wind_gusts_10m",
    "rain",
    "showers",
    "snowfall",
    "temperature_2m",
    "weather_code",
)
RISK_VARIABLES = ("wind_speed_10m", "rain", "showers", "snowfall")


def _hour(moment: datetime) -> str:
    """Open-Meteo's start_hour / end_hour format (UTC, with timezone=GMT)."""
    return f"{moment:%Y-%m-%dT%H:%M}"


class ProvidedWeather:
    """A WeatherProvider backed by forecasts the caller sent, keyed by 0.05° grid cell.

    `extra_hours` widens the window the caller is asked for. The plan asks for 48 extra hours
    so the browser's cache already covers the follow-up departure-options request, which then
    costs no further Open-Meteo calls (the free tier allows 600 locations per minute).
    """

    def __init__(
        self,
        cells: Mapping[LatLon, HourlyForecast],
        variables: Sequence[str],
        extra_hours: int = 0,
    ) -> None:
        self._cells = cells
        self._variables = tuple(variables)
        self._extra = timedelta(hours=extra_hours)

    def forecasts(
        self, points: Sequence[LatLon], start: datetime, end: datetime
    ) -> list[HourlyForecast | None]:
        cells = [snap(p) for p in points]
        missing = sorted({cell for cell in cells if cell not in self._cells})
        if missing:
            raise WeatherRequired(
                {
                    "cells": [[cell.lat, cell.lon] for cell in missing],
                    "start_hour": _hour(floor_hour(start)),
                    "end_hour": _hour(ceil_hour(end + self._extra)),
                    "variables": list(self._variables),
                }
            )
        return [self._cells[cell] for cell in cells]
