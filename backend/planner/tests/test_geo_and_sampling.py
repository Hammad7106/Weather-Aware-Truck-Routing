import pytest

from planner.domain.geo import (
    LatLon,
    cumulative_miles,
    haversine_miles,
    point_at,
    simplify_indices,
    slice_line,
)
from planner.domain.sampling import TravelTimeProfile, checkpoint_miles, coverage

# A straight line along the equator: 1 degree of longitude is about 69.17 miles.
EQUATOR = [LatLon(0, 0), LatLon(0, 1), LatLon(0, 2)]


def test_haversine_known_distance():
    # Denver → Chicago is about 920 miles great-circle.
    assert haversine_miles(LatLon(39.7392, -104.9903), LatLon(41.8781, -87.6298)) == pytest.approx(
        920, abs=5
    )


def test_point_at_interpolates_and_clamps():
    cum = cumulative_miles(EQUATOR)
    assert point_at(EQUATOR, cum, cum[-1] * 0.75).lon == pytest.approx(1.5)
    assert point_at(EQUATOR, cum, -5) == EQUATOR[0]
    assert point_at(EQUATOR, cum, 10_000) == EQUATOR[-1]


def test_slice_line_keeps_inner_vertices_and_interpolates_ends():
    cum = cumulative_miles(EQUATOR)
    part = slice_line(EQUATOR, cum, cum[1] / 2, cum[1] * 1.5)

    assert [round(p.lon, 6) for p in part] == [0.5, 1.0, 1.5]


def test_simplify_drops_collinear_points_and_keeps_corners():
    line = [LatLon(0, 0), LatLon(0, 0.5), LatLon(0, 1), LatLon(1, 1)]
    assert simplify_indices(line, tolerance_deg=1e-4) == [0, 2, 3]


@pytest.mark.parametrize(
    ("total", "interval", "expected"),
    [
        (60, 25, [0, 25, 50, 60]),
        (50, 25, [0, 25, 50]),
        (50.01, 25, [0, 25, 50.01]),  # no 0.01-mile stub
        (8, 10, [0, 8]),
        (0, 10, [0]),
    ],
)
def test_checkpoint_miles(total, interval, expected):
    assert checkpoint_miles(total, interval) == pytest.approx(expected)


def test_checkpoint_miles_rejects_bad_interval():
    with pytest.raises(ValueError):
        checkpoint_miles(100, 0)


def test_coverage_is_contiguous_and_sums_to_route_length():
    marks = checkpoint_miles(60, 25)
    stretches = coverage(marks)

    assert stretches == [(0, 12.5), (12.5, 37.5), (37.5, 55), (55, 60)]
    assert sum(end - start for start, end in stretches) == pytest.approx(60)


def test_travel_time_profile_follows_speed_changes():
    # 10 slow city miles take 30 min, then 90 interstate miles take 90 min.
    profile = TravelTimeProfile.from_anchors([(10, 1800)], total_miles=100, total_seconds=7200)

    assert profile.seconds_at(5) == pytest.approx(900)
    assert profile.seconds_at(55) == pytest.approx(1800 + 45 * 60)
    assert profile.seconds_at(100) == 7200
    assert profile.mile_at(3600) == pytest.approx(40)


def test_travel_time_profile_ignores_out_of_order_anchors():
    profile = TravelTimeProfile.from_anchors(
        [(10, 1000), (20, 900), (150, 5)], total_miles=100, total_seconds=6000
    )

    assert profile.miles == (0, 10, 100)
    assert profile.seconds == (0, 1000, 6000)
