"""Weather risk classification (see ASSUMPTIONS.md, section 5).

Each condition maps to a level through a table of bands. A checkpoint's level is the worst of
its wind, rain and snow levels, then raised (never lowered) by the load rules.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum


class RiskLevel(IntEnum):
    LOW = 0
    MODERATE = 1
    HIGH = 2
    SEVERE = 3
    NO_TRAVEL = 4

    @property
    def label(self) -> str:
        return self.name.replace("_", " ").title()

    @property
    def key(self) -> str:
        return self.name.lower()


@dataclass(frozen=True, slots=True)
class Band:
    """The lower edge of one risk level. `inclusive=False` means the edge itself is excluded."""

    level: RiskLevel
    lower: float
    inclusive: bool = True

    def reached_by(self, value: float) -> bool:
        return value >= self.lower if self.inclusive else value > self.lower


# Bands are listed from mildest to worst; anything below the first band is LOW.
WIND_BANDS_MPH = (
    Band(RiskLevel.MODERATE, 25),
    Band(RiskLevel.HIGH, 35),
    Band(RiskLevel.SEVERE, 45),
    Band(RiskLevel.NO_TRAVEL, 55),
)
RAIN_BANDS_IN_HR = (
    Band(RiskLevel.MODERATE, 0.10),
    Band(RiskLevel.HIGH, 0.25),
    Band(RiskLevel.SEVERE, 0.50),
    Band(RiskLevel.NO_TRAVEL, 1.00, inclusive=False),
)
SNOW_BANDS_IN_HR = (
    Band(RiskLevel.MODERATE, 0.5),
    Band(RiskLevel.HIGH, 1.0),
    Band(RiskLevel.SEVERE, 2.0),
    Band(RiskLevel.NO_TRAVEL, 3.0, inclusive=False),
)


def level_for(value: float, bands: tuple[Band, ...]) -> RiskLevel:
    level = RiskLevel.LOW
    for band in bands:
        if band.reached_by(value):
            level = band.level
    return level


@dataclass(frozen=True, slots=True)
class Weather:
    """Forecast conditions at one place and hour, in US units."""

    wind_mph: float
    rain_in_hr: float
    snow_in_hr: float
    gust_mph: float | None = None
    temperature_f: float | None = None
    weather_code: int | None = None


@dataclass(frozen=True, slots=True)
class LoadRule:
    """Heavier loads are more exposed to wind: min_wind <= wind < max_wind and load > load_over."""

    min_wind_mph: float
    max_wind_mph: float
    load_over_lb: int
    level: RiskLevel

    def applies(self, wind_mph: float, load_lb: float) -> bool:
        return self.min_wind_mph <= wind_mph < self.max_wind_mph and load_lb > self.load_over_lb

    @property
    def description(self) -> str:
        return (
            f"Wind {self.min_wind_mph:g}–{self.max_wind_mph - 1:g} mph with load over "
            f"{self.load_over_lb:,} lb → {self.level.label}"
        )


# "Wind >= 55 mph → No Travel for any load" is already covered by WIND_BANDS_MPH.
LOAD_RULES = (
    LoadRule(45, 55, 30_000, RiskLevel.NO_TRAVEL),
    LoadRule(35, 45, 40_000, RiskLevel.SEVERE),
)


@dataclass(frozen=True, slots=True)
class RiskAssessment:
    level: RiskLevel
    wind: RiskLevel
    rain: RiskLevel
    snow: RiskLevel
    drivers: tuple[str, ...]
    """Which inputs set the final level: any of "wind", "rain", "snow", "load"."""
    load_rule: LoadRule | None
    """The load rule that raised the level, if one did."""


def matching_load_rule(wind_mph: float, load_lb: float) -> LoadRule | None:
    return next((rule for rule in LOAD_RULES if rule.applies(wind_mph, load_lb)), None)


def assess(weather: Weather, load_lb: float) -> RiskAssessment:
    wind = level_for(weather.wind_mph, WIND_BANDS_MPH)
    rain = level_for(weather.rain_in_hr, RAIN_BANDS_IN_HR)
    snow = level_for(weather.snow_in_hr, SNOW_BANDS_IN_HR)
    weather_level = max(wind, rain, snow)

    rule = matching_load_rule(weather.wind_mph, load_lb)
    if rule is not None and rule.level > weather_level:
        return RiskAssessment(rule.level, wind, rain, snow, drivers=("load",), load_rule=rule)

    drivers = tuple(
        name
        for name, lvl in (("wind", wind), ("rain", rain), ("snow", snow))
        if lvl == weather_level and lvl > RiskLevel.LOW
    )
    return RiskAssessment(weather_level, wind, rain, snow, drivers=drivers, load_rule=None)
