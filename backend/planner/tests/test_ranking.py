import pytest

from planner.domain.ranking import rank, recommend, summarize
from planner.domain.risk import RiskLevel

L, M, H, S, N = (
    RiskLevel.LOW,
    RiskLevel.MODERATE,
    RiskLevel.HIGH,
    RiskLevel.SEVERE,
    RiskLevel.NO_TRAVEL,
)


def route(stretches, duration_s=3600):
    return summarize(stretches, sum(m for m, _ in stretches), duration_s)


def test_summary_counts_miles_and_distance_weights_average():
    summary = route([(25, L), (25, H), (10, S)])

    assert summary.miles(H) == 25
    assert summary.miles(S) == 10
    assert summary.average_risk == pytest.approx((0 * 25 + 2 * 25 + 3 * 10) / 60)
    assert summary.peak_level == S


def test_summary_excludes_missing_forecasts_from_average():
    summary = route([(10, H), (30, None)])

    assert summary.no_data_miles == 30
    assert summary.average_risk == 2


def test_summary_without_any_data():
    summary = route([(30, None)])
    assert summary.average_risk is None
    assert summary.peak_level is None


def test_no_travel_miles_rank_before_severe_miles():
    blocked = route([(1, N), (99, L)])
    stormy = route([(50, S), (50, L)])
    assert rank([blocked, stormy]) == [1, 0]


def test_severe_then_high_then_average_then_time():
    severe = route([(10, S), (90, L)], duration_s=100)
    high = route([(40, H), (60, L)], duration_s=100)
    moderate_slow = route([(100, M)], duration_s=9000)
    moderate_fast = route([(100, M)], duration_s=8000)
    assert rank([severe, high, moderate_slow, moderate_fast]) == [3, 2, 1, 0]


def test_float_noise_does_not_decide():
    a = route([(10.00001, H), (50, L)], duration_s=100)
    b = route([(10.0, H), (50, L)], duration_s=200)
    assert rank([b, a]) == [1, 0]  # equal High miles after rounding → faster route wins


def test_recommendation_explains_the_deciding_criterion():
    fast_but_icy = route([(20, S), (80, L)], duration_s=3600)
    slow_but_clear = route([(100, L)], duration_s=4200)

    rec = recommend([fast_but_icy, slow_but_clear])

    assert rec.best_index == 1
    assert rec.runner_up_index == 0
    assert rec.decided_by == "severe_miles"
    assert [c.criterion for c in rec.comparisons] == ["no_travel_miles", "severe_miles"]
    assert rec.comparisons[-1].winner == 0 and rec.comparisons[-1].runner_up == 20
    assert not rec.no_safe_route


def test_recommendation_flags_when_no_route_is_safe():
    rec = recommend([route([(5, N), (95, L)]), route([(10, N), (90, L)])])
    assert rec.best_index == 0
    assert rec.no_safe_route


def test_single_route_and_exact_tie():
    assert recommend([route([(10, L)])]).decided_by is None
    tie = recommend([route([(10, L)]), route([(10, L)])])
    assert tie.best_index == 0
    assert tie.decided_by is None
