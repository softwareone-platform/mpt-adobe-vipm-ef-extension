import pytest
from freezegun import freeze_time
from mpt_extension_sdk.api import ValidationError

from mpt_adobe_vipm_ef.services.renewal import (
    has_active_subscription,
    is_within_scheduled_creation_window,
    require_scheduled_creation_eligibility,
)


@pytest.mark.parametrize("today", ["2026-07-02", "2026-07-15", "2026-07-29"])
def test_is_within_scheduled_creation_window_accepts_the_window(anniversary_date, today):
    with freeze_time(today):
        result = is_within_scheduled_creation_window(anniversary_date)

    assert result is True


@pytest.mark.parametrize("today", ["2026-07-01", "2026-07-30", "2026-08-01", "2026-08-02"])
def test_is_within_scheduled_creation_window_rejects_outside_the_window(anniversary_date, today):
    with freeze_time(today):
        result = is_within_scheduled_creation_window(anniversary_date)

    assert result is False


def test_has_active_subscription_is_true_when_a_subscription_is_active(active_subscriptions):
    result = has_active_subscription(active_subscriptions)

    assert result is True


def test_has_active_subscription_is_false_without_an_active_subscription(inactive_subscriptions):
    result = has_active_subscription(inactive_subscriptions)

    assert result is False


def test_has_active_subscription_is_false_without_subscriptions():
    result = has_active_subscription([])

    assert result is False


@freeze_time("2026-07-22")
def test_require_scheduled_creation_eligibility_passes_inside_the_window(
    anniversary_date, active_subscriptions
):
    require_scheduled_creation_eligibility(  # act
        anniversary_date.isoformat(), active_subscriptions
    )


@freeze_time("2026-07-01")
def test_require_scheduled_creation_eligibility_rejects_before_the_window_opens(
    anniversary_date, active_subscriptions
):
    with pytest.raises(ValidationError) as exc_info:
        require_scheduled_creation_eligibility(anniversary_date.isoformat(), active_subscriptions)

    assert "30 and 3 days before the anniversary date" in str(exc_info.value)


@freeze_time("2026-07-30")
def test_require_scheduled_creation_eligibility_rejects_after_the_window_closes(
    anniversary_date, active_subscriptions
):
    with pytest.raises(ValidationError) as exc_info:
        require_scheduled_creation_eligibility(anniversary_date.isoformat(), active_subscriptions)

    assert anniversary_date.isoformat() in str(exc_info.value)


@freeze_time("2026-07-22")
def test_require_scheduled_creation_eligibility_rejects_customer_without_active_subscription(
    anniversary_date, inactive_subscriptions
):
    with pytest.raises(ValidationError) as exc_info:
        require_scheduled_creation_eligibility(anniversary_date.isoformat(), inactive_subscriptions)

    assert "at least one active subscription" in str(exc_info.value)


@pytest.mark.parametrize("coterm_date", ["", "not-a-date", None])
def test_require_scheduled_creation_eligibility_rejects_unusable_coterm_date(
    coterm_date, active_subscriptions
):
    with pytest.raises(ValidationError) as exc_info:
        require_scheduled_creation_eligibility(coterm_date, active_subscriptions)

    assert "anniversary date is unknown" in str(exc_info.value)
