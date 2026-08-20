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
    """Which renewal path a renewal already in place has established, if any.

    An early renewal rolls the anniversary forward once, immediately on the
    first successful order, while each subscription's ``renewalDate`` holds at
    the original anniversary until it passes. A ``cotermDate`` past that date is
    therefore the proof that the early path is established.

    An at-anniversary renewal moves no date and bills nothing now: it lands as
    deferred auto-renewal preferences, so a subscription set to lapse or to
    renew at a quantity other than the one it holds is the proof that the
    at-anniversary path is established.

    Either way the wizard presents the established path as confirmed state and
    the other path is no longer reachable.
    """
    coterm = _parse_date(coterm_date)
    renewal_dates = _renewal_dates(adobe_subscriptions)
    if coterm and renewal_dates and coterm > min(renewal_dates):
        return RenewalPath.NOW
    staged = any(
        _is_staged(subscription_item)
        for subscription_item in adobe_subscriptions.get("items") or []
    )
    return RenewalPath.ANNIVERSARY if staged else None


def require_unlocked_path(
    renewal_path: RenewalPath, coterm_date: str, adobe_subscriptions: Payload
) -> None:
    """Reject a plan on the path a renewal already in place has closed off.

    The wizard already shows the established path as locked, but the submission
    is where it has to hold: at the anniversary because the anniversary this
    plan would renew at has passed to next year, and now because the renewal
    the customer already set up for the anniversary owns the term this plan
    would renew.
    """
    locked_path = resolve_locked_path(coterm_date, adobe_subscriptions)
    if locked_path is None or locked_path is renewal_path:
        return
    if locked_path is RenewalPath.NOW:
        raise ValidationError(
            detail=(
                "An early renewal has already moved the anniversary date forward, "
                "so this renewal cannot be planned for the anniversary date."
            ),
        )
    raise ValidationError(
        detail=(
            "A renewal is already set up for the anniversary date, "
            "so this renewal cannot be placed now."
        ),
    )


def _is_staged(subscription_item: Payload) -> bool:
    if str(subscription_item.get("status") or "") != ACTIVE_SUBSCRIPTION_STATUS:
        return False
    auto_renewal = subscription_item.get("autoRenewal") or {}
    if not auto_renewal.get("enabled", True):
        return True
    renewal_quantity = int(auto_renewal.get("renewalQuantity") or 0)
    current_quantity = int(subscription_item.get("currentQuantity") or 0)
    return bool(renewal_quantity) and renewal_quantity != current_quantity


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
