import pytest
from freezegun import freeze_time
from mpt_extension_sdk.api import ValidationError

from mpt_adobe_vipm_ef.models.renewal import RenewalPath
from mpt_adobe_vipm_ef.services.renewal_path import (
    has_active_subscriptions,
    is_renewal_window_open,
    require_unlocked_anniversary_path,
    resolve_locked_path,
)


@pytest.fixture
def adobe_subscriptions():
    return {
        "items": [
            {"subscriptionId": "a-sub-1", "status": "1000", "renewalDate": "2026-08-01"},
            {"subscriptionId": "a-sub-2", "status": "1000", "renewalDate": "2026-08-01"},
        ],
    }


@pytest.mark.parametrize("today", ["2026-07-02", "2026-07-29"])
def test_window_open_inside_the_window(anniversary_date, today):
    with freeze_time(today):
        result = is_renewal_window_open(anniversary_date.isoformat())

    assert result is True


@pytest.mark.parametrize("today", ["2026-07-01", "2026-07-30", "2026-08-02"])
def test_window_closed_outside_the_window(anniversary_date, today):
    with freeze_time(today):
        result = is_renewal_window_open(anniversary_date.isoformat())

    assert result is False


@pytest.mark.parametrize("coterm_date", ["", "not-a-date"])
def test_window_closed_without_an_anniversary(coterm_date):
    result = is_renewal_window_open(coterm_date)

    assert result is False


def test_active_subscriptions_found(adobe_subscriptions):
    result = has_active_subscriptions(adobe_subscriptions)

    assert result is True


def test_active_subscriptions_ignores_scheduled_ones():
    subscriptions = {"items": [{"subscriptionId": "a-sub-9", "status": "1009"}]}

    result = has_active_subscriptions(subscriptions)

    assert result is False


def test_active_subscriptions_on_an_empty_customer():
    result = has_active_subscriptions({})

    assert result is False


def test_locked_path_when_the_anniversary_has_rolled(adobe_subscriptions):
    result = resolve_locked_path("2027-08-01", adobe_subscriptions)

    assert result is RenewalPath.NOW


def test_no_locked_path_before_a_renewal(adobe_subscriptions):
    result = resolve_locked_path("2026-08-01", adobe_subscriptions)

    assert result is None


def test_no_locked_path_without_renewal_dates():
    subscriptions = {"items": [{"subscriptionId": "a-sub-1", "status": "1000"}]}

    result = resolve_locked_path("2027-08-01", subscriptions)

    assert result is None


def test_no_locked_path_without_a_coterm_date(adobe_subscriptions):
    result = resolve_locked_path("", adobe_subscriptions)

    assert result is None


def test_anniversary_path_rejected_once_locked(adobe_subscriptions):
    with pytest.raises(ValidationError) as exc_info:
        require_unlocked_anniversary_path("2027-08-01", adobe_subscriptions)

    assert "already moved the anniversary date forward" in str(exc_info.value)


def test_anniversary_path_allowed_before_a_renewal(adobe_subscriptions):
    require_unlocked_anniversary_path("2026-08-01", adobe_subscriptions)  # act
