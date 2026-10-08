import datetime as dt
import logging
from types import MappingProxyType
from zoneinfo import ZoneInfo

from mpt_extension_sdk.api import ValidationError

from mpt_adobe_vipm_ef.constants import (
    ADOBE_TIME_ZONE,
    SCHEDULED_CREATION_WINDOW_CLOSES_DAYS,
    SCHEDULED_CREATION_WINDOW_OPENS_DAYS,
)
from mpt_adobe_vipm_ef.models.renewal import RenewalWindow

logger = logging.getLogger(__name__)

_CLOSED_WINDOW_DETAILS = MappingProxyType({
    RenewalWindow.TOO_EARLY: (
        f"You can plan your renewal from {SCHEDULED_CREATION_WINDOW_OPENS_DAYS} days until "
        f"{SCHEDULED_CREATION_WINDOW_CLOSES_DAYS} days before your renewal date. "
        "Meanwhile, you can still use Change, Configuration, and Termination orders "
        "to manage your subscriptions."
    ),
    RenewalWindow.TOO_LATE: (
        "It's too late to plan this renewal. Renewals can be planned up to "
        f"{SCHEDULED_CREATION_WINDOW_CLOSES_DAYS} days before your renewal date. "
        "Your subscriptions will renew as they're currently set up."
    ),
})


def resolve_renewal_window(renewal_date: dt.date) -> RenewalWindow:
    """Whether a renewal can be planned today, counted by the Pacific date as Adobe does.

    The window is inclusive: it opens 30 days before the renewal date and
    closes 2 days before it.
    """
    today = dt.datetime.now(tz=ZoneInfo(ADOBE_TIME_ZONE)).date()
    days_to_renewal = (renewal_date - today).days
    if days_to_renewal > SCHEDULED_CREATION_WINDOW_OPENS_DAYS:
        return RenewalWindow.TOO_EARLY
    if days_to_renewal < SCHEDULED_CREATION_WINDOW_CLOSES_DAYS:
        return RenewalWindow.TOO_LATE
    return RenewalWindow.OPEN


def require_scheduled_creation_window(coterm_date: str) -> None:
    """Reject a renewal plan outside the window.

    Adobe enforces the window itself, so this guard is about the message: it
    fails with an explanation the wizard can show, instead of surfacing an
    Adobe rejection code. ``coterm_date`` is the date the window is measured
    against, in Adobe's wire format (``YYYY-MM-DD``).
    """
    try:
        renewal_date = dt.date.fromisoformat(coterm_date)
    except (TypeError, ValueError):
        logger.warning("Unusable Adobe renewal date %r for a renewal plan", coterm_date)
        raise ValidationError(
            detail="The customer's anniversary date is unknown, so this renewal cannot be planned.",
        )
    renewal_window = resolve_renewal_window(renewal_date)
    if renewal_window is not RenewalWindow.OPEN:
        raise ValidationError(detail=_CLOSED_WINDOW_DETAILS[renewal_window])
