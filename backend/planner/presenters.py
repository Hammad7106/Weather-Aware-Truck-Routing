"""JSON shapes returned by the API. Coordinates are GeoJSON order: [lon, lat]."""

from __future__ import annotations

import math
from datetime import datetime
from typing import Any

from .clients.tomtom import Place
from .domain.ranking import RouteSummary
from .domain.risk import (
    LOAD_RULES,
    RAIN_BANDS_IN_HR,
    SNOW_BANDS_IN_HR,
    WIND_BANDS_MPH,
    Band,
    RiskLevel,
)
from .services.corridor import CorridorWeather
from .services.plan import Checkpoint, DepartureOptions, RoutePlan, TripPlan


def iso(moment: datetime) -> str:
    return moment.isoformat().replace("+00:00", "Z")


def _num(value: float | None, ndigits: int) -> float | None:
    if value is None or not math.isfinite(value):
        return None
    return round(value, ndigits)


def place(p: Place) -> dict[str, Any]:
    return {"label": p.label, "lat": round(p.point.lat, 6), "lon": round(p.point.lon, 6)}


def summary(s: RouteSummary) -> dict[str, Any]:
    return {
        "distance_miles": round(s.distance_miles, 1),
        "duration_s": s.duration_s,
        "miles_by_level": {lvl.key: round(miles, 1) for lvl, miles in s.miles_by_level.items()},
        "no_data_miles": round(s.no_data_miles, 1),
        "average_risk": _num(s.average_risk, 2),
        "peak_level": None if s.peak_level is None else int(s.peak_level),
    }


def checkpoint(cp: Checkpoint, departure: datetime) -> dict[str, Any]:
    w, r = cp.weather, cp.risk
    return {
        "index": cp.index,
        "mile": round(cp.mile, 1),
        "lon": round(cp.point.lon, 5),
        "lat": round(cp.point.lat, 5),
        "eta": iso(cp.eta),
        "eta_offset_s": round((cp.eta - departure).total_seconds()),
        "covers": [round(cp.covers[0], 2), round(cp.covers[1], 2)],
        "level": None if r is None else int(r.level),
        "factors": None
        if r is None
        else {"wind": int(r.wind), "rain": int(r.rain), "snow": int(r.snow)},
        "drivers": [] if r is None else list(r.drivers),
        "load_rule": r.load_rule.description if r and r.load_rule else None,
        "weather": None
        if w is None
        else {
            "wind_mph": _num(w.wind_mph, 1),
            "gust_mph": _num(w.gust_mph, 1),
            "rain_in_hr": _num(w.rain_in_hr, 3),
            "snow_in_hr": _num(w.snow_in_hr, 2),
            "temperature_f": _num(w.temperature_f, 0),
            "weather_code": w.weather_code,
        },
    }


def route(r: RoutePlan, rank: int) -> dict[str, Any]:
    return {
        "id": r.id,
        "name": f"Route {r.id}",
        "rank": rank,
        "via": list(r.major_roads),
        "departure_time": iso(r.departure),
        "arrival_time": iso(r.arrival),
        "traffic_delay_s": r.traffic_delay_s,
        "summary": summary(r.summary),
        "geometry": [p.as_lon_lat() for p in r.geometry],
        "geometry_offsets_s": list(r.geometry_offsets_s),
        "segments": [
            {
                "checkpoint_index": s.checkpoint_index,
                "level": None if s.level is None else int(s.level),
                "coordinates": [p.as_lon_lat() for p in s.coordinates],
            }
            for s in r.segments
        ],
        "checkpoints": [checkpoint(cp, r.departure) for cp in r.checkpoints],
    }


def trip_plan(plan: TripPlan, generated_at: datetime) -> dict[str, Any]:
    rec = plan.recommendation
    ids = [r.id for r in plan.routes]
    return {
        "generated_at": iso(generated_at),
        "origin": place(plan.trip.origin),
        "destination": place(plan.trip.destination),
        "departure_time": iso(plan.trip.departure),
        "load_weight_lb": plan.trip.load_lb,
        "checkpoint_interval_miles": plan.trip.interval_miles,
        "recommendation": {
            "route_id": ids[rec.best_index],
            "runner_up_id": None if rec.runner_up_index is None else ids[rec.runner_up_index],
            "decided_by": rec.decided_by,
            "no_safe_route": rec.no_safe_route,
            "comparisons": [
                {
                    "criterion": c.criterion,
                    "label": c.label,
                    "winner": _num(c.winner, 2),
                    "runner_up": _num(c.runner_up, 2),
                    "decisive": c.decisive,
                }
                for c in rec.comparisons
            ],
        },
        "routes": [route(r, plan.ranking.index(r.id) + 1) for r in plan.routes],
    }


def corridor(c: CorridorWeather) -> dict[str, Any]:
    return {
        "start_time": iso(c.start),
        "hours": c.hours,
        "spacing_miles": c.spacing_miles,
        "cells": [
            {
                "lon": round(cell.point.lon, 4),
                "lat": round(cell.point.lat, 4),
                "risk": list(cell.risk),
                "wind": list(cell.wind_mph),
                "rain": list(cell.rain_in_hr),
                "snow": list(cell.snow_in_hr),
            }
            for cell in c.cells
        ],
    }


def _bands(bands: tuple[Band, ...]) -> list[dict[str, Any]]:
    return [{"level": int(b.level), "min": b.lower, "inclusive": b.inclusive} for b in bands]


def risk_rules() -> dict[str, Any]:
    """The rule tables, so the UI can explain scoring without duplicating the numbers."""
    return {
        "levels": [{"level": int(lvl), "key": lvl.key, "label": lvl.label} for lvl in RiskLevel],
        "conditions": [
            {"key": "wind", "label": "Wind", "unit": "mph", "bands": _bands(WIND_BANDS_MPH)},
            {"key": "rain", "label": "Rain", "unit": "in/h", "bands": _bands(RAIN_BANDS_IN_HR)},
            {"key": "snow", "label": "Snow", "unit": "in/h", "bands": _bands(SNOW_BANDS_IN_HR)},
        ],
        "load_rules": [
            {
                "min_wind_mph": rule.min_wind_mph,
                "max_wind_mph": rule.max_wind_mph,
                "load_over_lb": rule.load_over_lb,
                "level": int(rule.level),
                "description": rule.description,
            }
            for rule in LOAD_RULES
        ],
    }


def departure_options(result: DepartureOptions) -> dict[str, Any]:
    return {
        "best_offset_hours": result.best_offset_hours,
        "options": [
            {
                "offset_hours": o.offset_hours,
                "departure_time": iso(o.departure),
                "arrival_time": iso(o.arrival),
                "route_id": o.route_id,
                "summary": summary(o.summary),
            }
            for o in result.options
        ],
    }
