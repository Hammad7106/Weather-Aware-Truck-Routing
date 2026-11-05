"""Request validation. Responses are built by `presenters` (faster for large nested data)."""

from __future__ import annotations

from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

from .domain.geo import LatLon, haversine_miles
from .domain.sampling import ALLOWED_INTERVALS_MILES

MAX_LOAD_LB = 80_000
MAX_DEPARTURE_AHEAD = timedelta(days=7)
DEPARTURE_GRACE = timedelta(hours=1)
MAX_CORRIDOR_PATHS = 3
MAX_CORRIDOR_POINTS = 1_500


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


class TripSerializer(serializers.Serializer):
    origin = PlaceSerializer()
    destination = PlaceSerializer()
    departure_time = serializers.DateTimeField(validators=[validate_departure])
    load_weight_lb = serializers.IntegerField(min_value=0, max_value=MAX_LOAD_LB)
    checkpoint_interval_miles = serializers.ChoiceField(choices=ALLOWED_INTERVALS_MILES, default=25)

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


class PointQuerySerializer(serializers.Serializer):
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lon = serializers.FloatField(min_value=-180, max_value=180)
