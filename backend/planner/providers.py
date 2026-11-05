"""Factories that wire API clients from settings. Tests replace these to inject fakes."""

from __future__ import annotations

from django.conf import settings
from django.core.cache import cache

from .clients.http import shared_http_client
from .clients.open_meteo import OpenMeteoClient
from .clients.tomtom import TomTomClient


def routing_client() -> TomTomClient:
    return TomTomClient(settings.TOMTOM_API_KEY, shared_http_client(), settings.TOMTOM_BASE_URL)


def weather_client() -> OpenMeteoClient:
    return OpenMeteoClient(shared_http_client(), cache, base_url=settings.OPEN_METEO_BASE_URL)
