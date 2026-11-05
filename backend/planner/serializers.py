"""Request validation. Responses are built by `presenters` (faster for large nested data)."""

from __future__ import annotations

from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

from .clients.open_meteo import HourlyForecast, add_precipitation, snap
from .domain.geo import LatLon, haversine_miles
from .domain.sampling import ALLOWED_INTERVALS_MILES

MAX_LOAD_LB = 80_000
MAX_DEPARTURE_AHEAD = timedelta(days=7)
DEPARTURE_GRACE = timedelta(hours=1)
MAX_CORRIDOR_PATHS = 3
MAX_CORRIDOR_POINTS = 1_500
# Client-supplied forecasts: enough for 3 long routes at 10-mile spacing or the heatmap grid,
# and for a trip plus 48 h of departure options.
MAX_WEATHER_CELLS = 2_000
MAX_WEATHER_HOURS = 12 * 24


class PlaceSerializer(serializers.Serializer):
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lon = serializers.FloatField(min_value=-180, max_value=180)
    label = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")


def validate_departure(value):
    now = timezone.now()
    if value < now - DEPARTURE_GRACE:
        raise serializers.ValidationError("Departure time is in the past.")
    if value > now + MAX_DEPARTURE_AHEAD:
        raise serializers.ValidationError("Departure must be within the next 7 days.")
    return value


class WeatherField(serializers.Field):
    """Forecasts fetched by the browser: {"cells": [{lat, lon, start, wind, rain, …}]}.

    Each cell is one 0.05° grid cell; `start` is the Unix time of its first hour and every series
    has one value per hour (null for missing). Validated by hand because DRF's per-number list
    fields are far too slow for ~100,000 values.
    """

    REQUIRED = ("wind", "rain", "showers", "snow")
    OPTIONAL = ("gust", "temp", "code")

    def to_internal_value(self, data) -> dict[LatLon, HourlyForecast]:
        cells = data.get("cells") if isinstance(data, dict) else None
        if not isinstance(cells, list):
            raise serializers.ValidationError('Expected {"cells": [...]}.')
        if len(cells) > MAX_WEATHER_CELLS:
            raise serializers.ValidationError(f"At most {MAX_WEATHER_CELLS} cells.")
        return dict(self._cell(cell, i) for i, cell in enumerate(cells))

    def _cell(self, cell, i: int) -> tuple[LatLon, HourlyForecast]:
        def fail(message: str):
            raise serializers.ValidationError(f"cells[{i}]: {message}")

        if not isinstance(cell, dict):
            fail("expected an object.")
        lat, lon, start = cell.get("lat"), cell.get("lon"), cell.get("start")
        if not all(isinstance(v, int | float) and not isinstance(v, bool) for v in (lat, lon)):
            fail("lat and lon must be numbers.")
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            fail("coordinate out of range.")
        if not isinstance(start, int) or isinstance(start, bool) or start < 0:
            fail("start must be a Unix time in seconds.")

        series = {}
        for key in self.REQUIRED + self.OPTIONAL:
            values = cell.get(key)
            if values is None and key in self.OPTIONAL:
                continue
            if not isinstance(values, list) or not 0 < len(values) <= MAX_WEATHER_HOURS:
                fail(f"{key} must be a list of 1–{MAX_WEATHER_HOURS} hourly values.")
            if not all(
                v is None or (isinstance(v, int | float) and not isinstance(v, bool))
                for v in values
            ):
                fail(f"{key} must contain numbers or nulls.")
            series[key] = values

        hours = len(series["wind"])
        if any(len(values) != hours for values in series.values()):
            fail("every series must have the same number of hours.")
        missing = (None,) * hours
        forecast = HourlyForecast(
            start_epoch=start,
            wind_mph=tuple(series["wind"]),
            gust_mph=tuple(series.get("gust", missing)),
            rain_in=tuple(
                add_precipitation(r, s)
                for r, s in zip(series["rain"], series["showers"], strict=True)
            ),
            snow_in=tuple(series["snow"]),
            temperature_f=tuple(series.get("temp", missing)),
            weather_code=tuple(None if c is None else int(c) for c in series.get("code", missing)),
        )
        return snap(LatLon(lat, lon)), forecast


class TripSerializer(serializers.Serializer):
    origin = PlaceSerializer()
    destination = PlaceSerializer()
    departure_time = serializers.DateTimeField(validators=[validate_departure])
    load_weight_lb = serializers.IntegerField(min_value=0, max_value=MAX_LOAD_LB)
    checkpoint_interval_miles = serializers.ChoiceField(choices=ALLOWED_INTERVALS_MILES, default=25)
    weather = WeatherField(required=False)

    def validate(self, attrs):
        a, b = attrs["origin"], attrs["destination"]
        if haversine_miles(LatLon(a["lat"], a["lon"]), LatLon(b["lat"], b["lon"])) < 1:
            raise serializers.ValidationError(
                {"destination": "Destination must be at least 1 mile from the origin."}
            )
        return attrs


class CoordinateField(serializers.ListField):
    """A [lon, lat] pair (GeoJSON order)."""

    child = serializers.FloatField()

    def __init__(self, **kwargs):
        super().__init__(min_length=2, max_length=2, **kwargs)

    def to_internal_value(self, data):
        lon, lat = super().to_internal_value(data)
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            raise serializers.ValidationError("Coordinate out of range.")
        return LatLon(lat, lon)


class CorridorSerializer(serializers.Serializer):
    paths = serializers.ListField(
        child=serializers.ListField(child=CoordinateField(), min_length=2),
        min_length=1,
        max_length=MAX_CORRIDOR_PATHS,
    )
    departure_time = serializers.DateTimeField(validators=[validate_departure])
    load_weight_lb = serializers.IntegerField(min_value=0, max_value=MAX_LOAD_LB)
    weather = WeatherField(required=False)

    def validate_paths(self, paths):
        if sum(len(p) for p in paths) > MAX_CORRIDOR_POINTS:
            raise serializers.ValidationError(
                f"Too many points; send at most {MAX_CORRIDOR_POINTS} in total."
            )
        return paths


class GeocodeQuerySerializer(serializers.Serializer):
    q = serializers.CharField(min_length=2, max_length=120, trim_whitespace=True)
    lat = serializers.FloatField(min_value=-90, max_value=90, required=False)
    lon = serializers.FloatField(min_value=-180, max_value=180, required=False)


class ReverseGeocodeQuerySerializer(serializers.Serializer):
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lon = serializers.FloatField(min_value=-180, max_value=180)
