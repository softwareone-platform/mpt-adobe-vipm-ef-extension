"""Early-path availability and path lock, read from the customer's Adobe data."""

import datetime as dt
import logging
from typing import Any

from mpt_extension_sdk.api import ValidationError

from mpt_adobe_vipm_ef.constants import ACTIVE_SUBSCRIPTION_STATUS
from mpt_adobe_vipm_ef.models.renewal import RenewalPath
from mpt_adobe_vipm_ef.services.renewal import is_within_scheduled_creation_window

logger = logging.getLogger(__name__)

Payload = dict[str, Any]


def is_renewal_window_open(coterm_date: str) -> bool:
    """Whether a renewal can be planned today, on either path.

    Adobe accepts a renewal order and a scheduled net-new subscription in the
    same window, between 30 and 3 days before the anniversary, so the wizard
    reads one availability answer for the whole walkthrough. An unknown
    anniversary reads as closed, so the customer is told to come back instead of
    being sent into an Adobe rejection.
    """
    anniversary = _parse_date(coterm_date)
    if anniversary is None:
        return False
    return is_within_scheduled_creation_window(anniversary)


def has_active_subscriptions(adobe_subscriptions: Payload) -> bool:
    """Whether the customer holds a subscription a renewal can be planned around.

    Adobe requires at least one active subscription before it will schedule a
    net-new product, and there is nothing to renew without one.
    """
    return any(
        str(subscription_item.get("status") or "") == ACTIVE_SUBSCRIPTION_STATUS
        for subscription_item in adobe_subscriptions.get("items") or []
    )


def resolve_locked_path(coterm_date: str, adobe_subscriptions: Payload) -> RenewalPath | None:
    """Whether an early renewal has already rolled the anniversary forward.

    The roll happens once, immediately on the first successful early renewal,
    while each subscription's ``renewalDate`` holds at the original anniversary
    until it passes. A ``cotermDate`` past that date is therefore the proof that
    the early path is established: the wizard presents it as confirmed state,
    and at-anniversary is no longer reachable.
    """
    coterm = _parse_date(coterm_date)
    renewal_dates = _renewal_dates(adobe_subscriptions)
    if coterm is None or not renewal_dates:
        return None
    return RenewalPath.NOW if coterm > min(renewal_dates) else None


def require_unlocked_anniversary_path(coterm_date: str, adobe_subscriptions: Payload) -> None:
    """Reject an at-anniversary plan once an early renewal has rolled the anniversary.

    The wizard already shows the path as locked, but the submission is where it
    has to hold: the anniversary this plan would renew at has passed to next
    year, so there is nothing left for it to do.
    """
    if resolve_locked_path(coterm_date, adobe_subscriptions) is not None:
        raise ValidationError(
            detail=(
                "An early renewal has already moved the anniversary date forward, "
                "so this renewal cannot be planned for the anniversary date."
            ),
        )


def _renewal_dates(adobe_subscriptions: Payload) -> list[dt.date]:
    parsed = (
        _parse_date(str(subscription_item.get("renewalDate") or ""))
        for subscription_item in adobe_subscriptions.get("items") or []
    )
    return [renewal_date for renewal_date in parsed if renewal_date]


def _parse_date(raw_date: str) -> dt.date | None:
    try:
        return dt.date.fromisoformat(raw_date)
    except (TypeError, ValueError):
        logger.warning("Unusable Adobe date %r on the renewal path state", raw_date)
        return None
