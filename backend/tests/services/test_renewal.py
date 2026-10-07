import datetime as dt

import pytest
from mpt_extension_sdk.api import ValidationError

from mpt_adobe_vipm_ef.models.renewal import RenewalWindow
from mpt_adobe_vipm_ef.services.renewal import (
    require_scheduled_creation_window,
    resolve_renewal_window,
)


@pytest.mark.parametrize(
    "now",
    [
        pytest.param("2026-07-02T07:00:00Z", id="30-days-before-from-pacific-midnight"),
        pytest.param("2026-07-15T12:00:00Z", id="mid-window"),
        pytest.param("2026-07-30T19:00:00Z", id="2-days-before"),
        pytest.param("2026-07-31T06:59:00Z", id="2-days-before-until-pacific-midnight"),
    ],
)
def test_resolve_renewal_window_open(anniversary_date, frozen_clock, now):
    frozen_clock.move_to(now)

    result = resolve_renewal_window(anniversary_date)

    assert result is RenewalWindow.OPEN


@pytest.mark.parametrize(
    ("now", "expected"),
    [
        pytest.param("2026-07-01T12:00:00Z", RenewalWindow.TOO_EARLY, id="31-days-before"),
        pytest.param(
            "2026-07-02T06:59:00Z",
            RenewalWindow.TOO_EARLY,
            id="31-days-before-until-pacific-midnight",
        ),
        pytest.param(
            "2026-07-31T07:00:00Z", RenewalWindow.TOO_LATE, id="1-day-before-from-pacific-midnight"
        ),
        pytest.param("2026-08-01T12:00:00Z", RenewalWindow.TOO_LATE, id="on-the-anniversary"),
        pytest.param("2026-08-02T12:00:00Z", RenewalWindow.TOO_LATE, id="after-the-anniversary"),
    ],
)
def test_resolve_renewal_window_closed(anniversary_date, frozen_clock, now, expected):
    frozen_clock.move_to(now)

    result = resolve_renewal_window(anniversary_date)

    assert result is expected


@pytest.mark.parametrize(
    ("now", "expected"),
    [
        pytest.param(
            "2027-01-02T07:59:00Z",
            RenewalWindow.TOO_EARLY,
            id="31-days-before-until-pacific-midnight",
        ),
        pytest.param(
            "2027-01-02T08:00:00Z", RenewalWindow.OPEN, id="30-days-before-from-pacific-midnight"
        ),
    ],
)
def test_resolve_renewal_window_counts_pacific_days_in_winter(frozen_clock, now, expected):
    frozen_clock.move_to(now)

    result = resolve_renewal_window(dt.date.fromisoformat("2027-02-01"))

    assert result is expected


@pytest.mark.parametrize(
    "time_zone",
    ["Australia/Perth", "UTC", "America/Los_Angeles", "Pacific/Honolulu"],
)
def test_resolve_renewal_window_ignores_the_local_time_zone(
    anniversary_date, frozen_clock, local_time_zone_factory, time_zone
):
    local_time_zone_factory(time_zone)
    frozen_clock.move_to("2026-07-31T06:59:00Z")

    result = resolve_renewal_window(anniversary_date)

    assert result is RenewalWindow.OPEN


def test_require_scheduled_creation_window_passes_inside_the_window(anniversary_date, frozen_clock):
    frozen_clock.move_to("2026-07-22T12:00:00Z")

    require_scheduled_creation_window(anniversary_date.isoformat())  # act


def test_require_scheduled_creation_window_rejects_before_the_window_opens(
    anniversary_date, frozen_clock
):
    frozen_clock.move_to("2026-07-02T06:59:00Z")

    with pytest.raises(ValidationError) as exc_info:
        require_scheduled_creation_window(anniversary_date.isoformat())

    assert "from 30 days until 2 days before your renewal date" in str(exc_info.value)


def test_require_scheduled_creation_window_rejects_after_the_window_closes(
    anniversary_date, frozen_clock
):
    frozen_clock.move_to("2026-07-31T07:00:00Z")

    with pytest.raises(ValidationError) as exc_info:
        require_scheduled_creation_window(anniversary_date.isoformat())

    assert "too late to plan this renewal" in str(exc_info.value)


@pytest.mark.parametrize("coterm_date", ["", "not-a-date", None])
def test_require_scheduled_creation_window_rejects_unusable_coterm_date(coterm_date):
    with pytest.raises(ValidationError) as exc_info:
        require_scheduled_creation_window(coterm_date)

    assert "anniversary date is unknown" in str(exc_info.value)
