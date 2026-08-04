import pytest
from freezegun import freeze_time
from mpt_extension_sdk.api import ValidationError

from mpt_adobe_vipm_ef.services.renewal import (
    is_within_scheduled_creation_window,
    require_scheduled_creation_window,
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


@freeze_time("2026-07-22")
def test_require_scheduled_creation_window_passes_inside_the_window(anniversary_date):
    require_scheduled_creation_window(anniversary_date.isoformat())  # act


@freeze_time("2026-07-01")
def test_require_scheduled_creation_window_rejects_before_the_window_opens(anniversary_date):
    with pytest.raises(ValidationError) as exc_info:
        require_scheduled_creation_window(anniversary_date.isoformat())

    assert "30 and 3 days before the anniversary date" in str(exc_info.value)


@freeze_time("2026-07-30")
def test_require_scheduled_creation_window_rejects_after_the_window_closes(anniversary_date):
    with pytest.raises(ValidationError) as exc_info:
        require_scheduled_creation_window(anniversary_date.isoformat())

    assert anniversary_date.isoformat() in str(exc_info.value)


@pytest.mark.parametrize("coterm_date", ["", "not-a-date", None])
def test_require_scheduled_creation_window_rejects_unusable_coterm_date(coterm_date):
    with pytest.raises(ValidationError) as exc_info:
        require_scheduled_creation_window(coterm_date)

    assert "anniversary date is unknown" in str(exc_info.value)
