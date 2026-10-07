"""Early-path availability and path lock, read from the customer's Adobe data."""

import datetime as dt
import logging
from typing import Any

from mpt_extension_sdk.api import ValidationError

from mpt_adobe_vipm_ef.constants import ACTIVE_SUBSCRIPTION_STATUS, SCHEDULED_SUBSCRIPTION_STATUS
from mpt_adobe_vipm_ef.models.renewal import RenewalPath, RenewalWindow
from mpt_adobe_vipm_ef.services.items import get_partial_sku
from mpt_adobe_vipm_ef.services.renewal import resolve_renewal_window

logger = logging.getLogger(__name__)

Payload = dict[str, Any]

_NO_SKUS: frozenset[str] = frozenset()


def read_renewal_window(window_date: str) -> RenewalWindow:
    """Whether a renewal can be planned today, on either path.

    Both paths share one window, so the wizard reads one answer. A missing or
    unreadable date reads as unknown.
    """
    renewal_date = _parse_date(window_date)
    if renewal_date is None:
        return RenewalWindow.UNKNOWN
    return resolve_renewal_window(renewal_date)


def has_active_subscriptions(adobe_subscriptions: Payload) -> bool:
    """Whether the customer holds a subscription a renewal can be planned around.

    Adobe requires at least one active subscription before it will schedule a
    net-new product, and there is nothing to renew without one.
    """
    return any(
        str(subscription_item.get("status") or "") == ACTIVE_SUBSCRIPTION_STATUS
        for subscription_item in adobe_subscriptions.get("items") or []
    )


def resolve_anniversary_date(
    coterm_date: str,
    adobe_subscriptions: Payload,
    non_renewable_skus: frozenset[str] = _NO_SKUS,
) -> str:
    """The date the customer's current term ends.

    This is usually the ``cotermDate``. When an early renewal is fully returned,
    Adobe leaves the ``cotermDate`` a year ahead, so the earliest subscription
    ``renewalDate`` is used instead. Products that can't renew, such as credit
    packs, have their own dates and are skipped.
    """
    coterm = _parse_date(coterm_date)
    subscription_items = adobe_subscriptions.get("items") or []
    if coterm is None or _has_early_renewed_seats(subscription_items, coterm):
        return coterm_date
    renewal_dates = _active_renewal_dates([
        subscription_item
        for subscription_item in subscription_items
        if get_partial_sku(str(subscription_item.get("offerId") or "")) not in non_renewable_skus
    ])
    if not renewal_dates or coterm <= min(renewal_dates) or coterm in renewal_dates:
        return coterm_date
    return min(renewal_dates).isoformat()


def resolve_window_date(
    coterm_date: str,
    adobe_subscriptions: Payload,
    non_renewable_skus: frozenset[str] = _NO_SKUS,
) -> str:
    """The date the renewal window counts down to.

    After an early renewal, that's the renewed subscriptions' renewal date,
    which doesn't move. Otherwise it's the anniversary.
    """
    coterm = _parse_date(coterm_date)
    early_renewed_items = [
        subscription_item
        for subscription_item in adobe_subscriptions.get("items") or []
        if coterm is not None and _holds_early_renewed_seats(subscription_item, coterm)
    ]
    if not early_renewed_items:
        return resolve_anniversary_date(coterm_date, adobe_subscriptions, non_renewable_skus)
    return min(_active_renewal_dates(early_renewed_items)).isoformat()


def resolve_locked_path(
    coterm_date: str,
    adobe_subscriptions: Payload,
    non_renewable_skus: frozenset[str] = _NO_SKUS,
) -> RenewalPath | None:
    """Which renewal path a renewal already in place has established, if any.

    The path is locked to ``now`` while an active subscription still has seats
    renewed early (``renewedQuantity`` above 0). Dates alone are not enough,
    because they stay moved after an early renewal is returned.

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
    if _has_early_renewed_seats(subscription_items, coterm):
        return RenewalPath.NOW
    anniversary = _parse_date(
        resolve_anniversary_date(coterm_date, adobe_subscriptions, non_renewable_skus)
    )
    staged = any(
        _is_staged(subscription_item, anniversary) for subscription_item in subscription_items
    )
    return RenewalPath.ANNIVERSARY if staged else None


def require_unlocked_path(
    renewal_path: RenewalPath,
    coterm_date: str,
    adobe_subscriptions: Payload,
    non_renewable_skus: frozenset[str] = _NO_SKUS,
) -> None:
    """Reject a plan on the path a renewal already in place has closed off.

    The wizard already shows the established path as locked, but the submission
    is where it has to hold: at the anniversary because the anniversary this
    plan would renew at has passed to next year, and now because the renewal
    the customer already set up for the anniversary owns the term this plan
    would renew.
    """
    locked_path = resolve_locked_path(coterm_date, adobe_subscriptions, non_renewable_skus)
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


def _has_early_renewed_seats(subscription_items: list[Payload], coterm: dt.date) -> bool:
    return any(
        _holds_early_renewed_seats(subscription_item, coterm)
        for subscription_item in subscription_items
    )


def _holds_early_renewed_seats(subscription_item: Payload, coterm: dt.date) -> bool:
    if str(subscription_item.get("status") or "") != ACTIVE_SUBSCRIPTION_STATUS:
        return False
    if int(subscription_item.get("renewedQuantity") or 0) <= 0:
        return False
    renewal_date = _parse_date(str(subscription_item.get("renewalDate") or ""))
    return renewal_date is not None and renewal_date < coterm


def _is_staged(subscription_item: Payload, anniversary: dt.date | None) -> bool:
    if _parse_date(str(subscription_item.get("renewalDate") or "")) != anniversary:
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
