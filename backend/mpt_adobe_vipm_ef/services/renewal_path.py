"""Early-path availability and path lock, read from the customer's Adobe data."""

import datetime as dt
import logging
from typing import Any

from mpt_extension_sdk.api import ValidationError

from mpt_adobe_vipm_ef.constants import ACTIVE_SUBSCRIPTION_STATUS, SCHEDULED_SUBSCRIPTION_STATUS
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
    first successful order, while each active subscription's ``renewalDate``
    holds at the original anniversary until it passes. A ``cotermDate`` past
    that date is therefore the proof that the early path is established. Only
    active subscriptions count: an inactive one keeps the ``renewalDate`` of the
    term it lapsed in, which says nothing about a renewal in place.

    An at-anniversary renewal moves no date and bills nothing now: it lands as
    deferred auto-renewal preferences on the subscriptions renewing at the
    anniversary. The proof is a scheduled net-new subscription still armed to
    activate, or an active subscription still set to auto-renew with more seats
    than it holds. A disabled auto-renewal or a lower renewal quantity is not
    proof, because both are ordinary states that exist without any renewal
    having been set up, and a subscription that will lapse renews nothing
    whatever quantity it carries. The native-order guard also blocks an upsize
    with auto-renewal off, because a native order would overwrite the quantity
    either way; here the question is only whether a renewal is set to happen.

    Either way the wizard presents the established path as confirmed state and
    the other path is no longer reachable.
    """
    coterm = _parse_date(coterm_date)
    if coterm is None:
        return None
    subscription_items = adobe_subscriptions.get("items") or []
    renewal_dates = _active_renewal_dates(subscription_items)
    if renewal_dates and coterm > min(renewal_dates):
        return RenewalPath.NOW
    staged = any(_is_staged(subscription_item, coterm) for subscription_item in subscription_items)
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


def _is_staged(subscription_item: Payload, coterm: dt.date) -> bool:
    if _parse_date(str(subscription_item.get("renewalDate") or "")) != coterm:
        return False
    status = str(subscription_item.get("status") or "")
    auto_renewal = subscription_item.get("autoRenewal") or {}
    if status == SCHEDULED_SUBSCRIPTION_STATUS:
        # A rolled-back plan neutralises its scheduled subscription by disabling
        # auto-renewal rather than deleting it, and that one never activates.
        return bool(auto_renewal.get("enabled"))
    if status != ACTIVE_SUBSCRIPTION_STATUS:
        return False
    renewal_quantity = int(auto_renewal.get("renewalQuantity") or 0)
    current_quantity = int(subscription_item.get("currentQuantity") or 0)
    return bool(auto_renewal.get("enabled")) and renewal_quantity > current_quantity


def _active_renewal_dates(subscription_items: list[Payload]) -> list[dt.date]:
    parsed = (
        _parse_date(str(subscription_item.get("renewalDate") or ""))
        for subscription_item in subscription_items
        if str(subscription_item.get("status") or "") == ACTIVE_SUBSCRIPTION_STATUS
    )
    return [renewal_date for renewal_date in parsed if renewal_date]


def _parse_date(raw_date: str) -> dt.date | None:
    try:
        return dt.date.fromisoformat(raw_date)
    except (TypeError, ValueError):
        logger.warning("Unusable Adobe date %r on the renewal path state", raw_date)
        return None
