import datetime as dt
import logging
from collections.abc import Iterable, Mapping
from typing import Any

from mpt_extension_sdk.api import ValidationError

from adobe.enums import AdobeSubscriptionStatus
from mpt_adobe_vipm_ef.constants import (
    SCHEDULED_CREATION_WINDOW_CLOSES_DAYS,
    SCHEDULED_CREATION_WINDOW_OPENS_DAYS,
)

logger = logging.getLogger(__name__)


def is_within_scheduled_creation_window(coterm_date: dt.date) -> bool:
    """Whether Adobe accepts a scheduled net-new subscription today.

    The window is inclusive: it opens 30 days before the anniversary (coterm)
    date and closes 3 days before it.
    """
    today = dt.datetime.now(tz=dt.UTC).date()
    days_to_anniversary = (coterm_date - today).days
    return (
        SCHEDULED_CREATION_WINDOW_CLOSES_DAYS
        <= days_to_anniversary
        <= SCHEDULED_CREATION_WINDOW_OPENS_DAYS
    )


def has_active_subscription(adobe_subscriptions: Iterable[Mapping[str, Any]]) -> bool:
    """Whether the customer holds at least one active (status 1000) Adobe subscription."""
    return any(
        subscription.get("status") == AdobeSubscriptionStatus.ACTIVE
        for subscription in adobe_subscriptions
    )


def require_scheduled_creation_eligibility(
    coterm_date: str, adobe_subscriptions: Iterable[Mapping[str, Any]]
) -> None:
    """Reject scheduling a net-new subscription that Adobe would not accept.

    Adobe enforces both constraints itself, so this guard is about the message:
    it fails at creation time with an explanation the wizard can show, instead
    of surfacing an Adobe rejection code. ``coterm_date`` is the customer's
    anniversary date in Adobe's wire format (``YYYY-MM-DD``).
    """
    try:
        anniversary = dt.date.fromisoformat(coterm_date)
    except (TypeError, ValueError):
        logger.warning("Unusable Adobe coterm date %r for a scheduled creation", coterm_date)
        raise ValidationError(
            detail=(
                "The customer's anniversary date is unknown, "
                "so a net-new product cannot be scheduled."
            ),
        )
    if not is_within_scheduled_creation_window(anniversary):
        raise ValidationError(
            detail=(
                "Net-new products can only be scheduled between "
                f"{SCHEDULED_CREATION_WINDOW_OPENS_DAYS} and "
                f"{SCHEDULED_CREATION_WINDOW_CLOSES_DAYS} days before the anniversary date "
                f"({anniversary.isoformat()})."
            ),
        )
    if not has_active_subscription(adobe_subscriptions):
        raise ValidationError(
            detail=(
                "Adobe requires at least one active subscription before "
                "a net-new product can be scheduled."
            ),
        )
