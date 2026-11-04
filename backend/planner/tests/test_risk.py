import pytest

from planner.domain.risk import (
    RAIN_BANDS_IN_HR,
    SNOW_BANDS_IN_HR,
    WIND_BANDS_MPH,
    RiskLevel,
    Weather,
    assess,
    level_for,
)

L, M, H, S, N = (
    RiskLevel.LOW,
    RiskLevel.MODERATE,
    RiskLevel.HIGH,
    RiskLevel.SEVERE,
    RiskLevel.NO_TRAVEL,
)


def calm(**overrides) -> Weather:
    return Weather(**{"wind_mph": 0.0, "rain_in_hr": 0.0, "snow_in_hr": 0.0, **overrides})


@pytest.mark.parametrize(
    ("mph", "expected"),
    [(0, L), (24.9, L), (25, M), (34, M), (34.9, M), (35, H), (44.9, H), (45, S), (54.9, S),
     (55, N), (80, N)],
)  # fmt: skip
def test_wind_bands(mph, expected):
    assert level_for(mph, WIND_BANDS_MPH) == expected


@pytest.mark.parametrize(
    ("inches", "expected"),
    [(0, L), (0.09, L), (0.10, M), (0.24, M), (0.25, H), (0.49, H), (0.50, S), (1.00, S),
     (1.01, N)],
)  # fmt: skip
def test_rain_bands(inches, expected):
    assert level_for(inches, RAIN_BANDS_IN_HR) == expected


@pytest.mark.parametrize(
    ("inches", "expected"),
    [(0, L), (0.49, L), (0.5, M), (0.99, M), (1.0, H), (1.99, H), (2.0, S), (3.0, S), (3.01, N)],
)
def test_snow_bands(inches, expected):
    assert level_for(inches, SNOW_BANDS_IN_HR) == expected


def test_worst_condition_wins_and_is_reported():
    result = assess(calm(wind_mph=30, rain_in_hr=0.3, snow_in_hr=0.6), load_lb=0)

    assert result.level == H
    assert (result.wind, result.rain, result.snow) == (M, H, M)
    assert result.drivers == ("rain",)
    assert result.load_rule is None


def test_ties_report_every_driver():
    assert assess(calm(wind_mph=36, snow_in_hr=1.5), load_lb=0).drivers == ("wind", "snow")


def test_calm_weather_has_no_drivers():
    result = assess(calm(), load_lb=80_000)
    assert result.level == L
    assert result.drivers == ()


@pytest.mark.parametrize(
    ("mph", "load", "expected", "raised_by_load"),
    [
        # Wind >= 55 is No Travel for any load (via the wind band, not a load rule).
        (55, 0, N, False),
        (60, 80_000, N, False),
        # 45–54 mph: No Travel only when the load is strictly over 30,000 lb.
        (45, 30_000, S, False),
        (45, 30_001, N, True),
        (54.9, 45_000, N, True),
        # 35–44 mph: Severe only when the load is strictly over 40,000 lb.
        (35, 40_000, H, False),
        (35, 40_001, S, True),
        (44.9, 79_000, S, True),
        # Below 35 mph the load does not matter.
        (34.9, 80_000, M, False),
    ],
)
def test_load_rules(mph, load, expected, raised_by_load):
    result = assess(calm(wind_mph=mph), load_lb=load)

    assert result.level == expected
    assert (result.load_rule is not None) is raised_by_load
    assert ("load" in result.drivers) is raised_by_load


def test_load_rule_never_lowers_a_worse_weather_level():
    # 40 mph + heavy load → Severe by load rule, but 1.5 in/h rain is already No Travel.
    result = assess(calm(wind_mph=40, rain_in_hr=1.5), load_lb=45_000)

    assert result.level == N
    assert result.drivers == ("rain",)
    assert result.load_rule is None


def test_load_rule_description_is_readable():
    rule = assess(calm(wind_mph=50), load_lb=35_000).load_rule
    assert rule is not None
    assert rule.description == "Wind 45–54 mph with load over 30,000 lb → No Travel"
