"""Whether a renewal is in place for the agreement, as the native-order guards read it.

Once a renewal is in place, the fulfilment extension refuses native Change,
Configuration and Termination orders so nothing silently forks it
(``ValidateNoEarlyRenewal`` and ``ValidateNoStagedRenewal`` in
swo-adobe-vipm-extension). A mid-term upgrade moves seats between the very
subscriptions that renewal depends on, so it is held to exactly the same
signal: this module mirrors those two guards rule for rule, so the upgrade
wizard never lets through an order that fulfilment would then refuse, and never
refuses one fulfilment would take.
"""

import asyncio
import datetime as dt
import logging
from collections.abc import Callable
from enum import StrEnum
from typing import Any

from mpt_extension_sdk.api import APIContext, UpstreamServiceError, ValidationError

from adobe.enums import AdobeOrderStatus, AdobeOrderType
from adobe.errors import AdobeAPIError, AdobeError, AdobeHttpError
from mpt_adobe_vipm_ef.constants import ACTIVE_SUBSCRIPTION_STATUS, SCHEDULED_SUBSCRIPTION_STATUS
from mpt_adobe_vipm_ef.context import adobe_client

logger = logging.getLogger(__name__)

Payload = dict[str, Any]

# RENEWAL orders older than this cannot be an early renewal still pending effect
# (the early window opens 30 days before the anniversary); same value as the
# fulfilment extension's EARLY_RENEWAL_LOOKBACK_DAYS.
EARLY_RENEWAL_LOOKBACK_DAYS = 30
_LAST_DAY_OF_FEBRUARY_NON_LEAP = 28
_ADOBE_REQUEST_FAILED_DETAIL = "Adobe service request failed"


class RenewalInPlace(StrEnum):
    """The kind of renewal that locks the agreement's subscriptions."""

    EARLY = "early"
    STAGED = "staged"


_EARLY_RENEWAL_DETAIL = (
    "An early renewal has already been placed for this agreement, so a mid-term "
    "upgrade is locked until it takes effect at the anniversary date. Please "
    "re-open the renewal wizard to make renewal-affecting changes."
)
_STAGED_RENEWAL_DETAIL = (
    "A renewal has been staged for this agreement, so a mid-term upgrade is "
    "locked until it takes effect at the anniversary date. Please re-open the "
    "renewal wizard to make renewal-affecting changes."
)


def find_renewal_in_place(
    coterm_date: str,
    renewal_orders: list[Payload],
    adobe_subscriptions: Payload,
    today: dt.date,
) -> RenewalInPlace | None:
    """Which renewal locks the agreement today, if any.

    An early renewal is a RENEWAL order created strictly before the anniversary
    of the term it renews (the current ``cotermDate`` minus one year) while that
    anniversary is still ahead: Adobe's own anniversary RENEWAL orders are
    created on that very day, and late ones after it. An OPEN RENEWAL order
    counts too, because its commit is in flight and the ``cotermDate`` has not
    rolled forward yet.

    A staged renewal places no Adobe order; it shows on the subscriptions until
    the anniversary: a scheduled net-new subscription still armed to activate,
    or an active subscription whose ``renewalQuantity`` exceeds its
    ``currentQuantity``. A staged downsize is the ordinary renewal reduction and
    does not lock, and an inactive subscription's leftover quantities describe
    no renewal.
    """
    coterm = _parse_date(coterm_date)
    if coterm is None:
        return None
    if _has_pending_early_renewal(renewal_orders, coterm, today):
        return RenewalInPlace.EARLY
    if today <= coterm and any(
        _stages_renewal(subscription_item)
        for subscription_item in adobe_subscriptions.get("items") or []
    ):
        return RenewalInPlace.STAGED
    return None


async def load_renewal_in_place(
    ctx: APIContext, authorization_id: str, customer_id: str
) -> RenewalInPlace | None:
    """Read the customer's Adobe data and report the renewal in place, if any."""
    client = adobe_client(ctx)
    customer = await _call_adobe(client.customer.get_customer, authorization_id, customer_id)
    renewal_orders = await _call_adobe(
        client.order.list_orders, authorization_id, customer_id, AdobeOrderType.RENEWAL
    )
    subscriptions = await _call_adobe(
        client.subscription.get_subscriptions, authorization_id, customer_id
    )
    return find_renewal_in_place(
        str(customer.get("cotermDate") or ""),
        renewal_orders,
        subscriptions,
        dt.datetime.now(tz=dt.UTC).date(),
    )


def require_no_renewal_in_place(renewal_in_place: RenewalInPlace | None) -> None:
    """Refuse a mid-term upgrade while a renewal is in place for the agreement."""
    if renewal_in_place is RenewalInPlace.EARLY:
        raise ValidationError(detail=_EARLY_RENEWAL_DETAIL)
    if renewal_in_place is RenewalInPlace.STAGED:
        raise ValidationError(detail=_STAGED_RENEWAL_DETAIL)


def _has_pending_early_renewal(
    renewal_orders: list[Payload], coterm: dt.date, today: dt.date
) -> bool:
    anniversary = _previous_anniversary(coterm)
    return any(_is_pending_early_renewal(order, anniversary, today) for order in renewal_orders)


def _is_pending_early_renewal(order: Payload, anniversary: dt.date, today: dt.date) -> bool:
    created = _parse_creation_date(str(order.get("creationDate") or ""))
    if created is None or created < today - dt.timedelta(days=EARLY_RENEWAL_LOOKBACK_DAYS):
        return False
    status = str(order.get("status") or "")
    if status == AdobeOrderStatus.OPEN:
        return True
    return status == AdobeOrderStatus.COMPLETE and created < anniversary and today <= anniversary


def _stages_renewal(subscription_item: Payload) -> bool:
    status = str(subscription_item.get("status") or "")
    auto_renewal = subscription_item.get("autoRenewal") or {}
    if status == SCHEDULED_SUBSCRIPTION_STATUS:
        # A rolled-back plan neutralises its scheduled subscription by disabling
        # auto-renewal rather than deleting it, and that one never activates.
        return bool(auto_renewal.get("enabled"))
    if status != ACTIVE_SUBSCRIPTION_STATUS:
        return False
    renewal_quantity = auto_renewal.get("renewalQuantity")
    current_quantity = subscription_item.get("currentQuantity")
    return (
        renewal_quantity is not None
        and current_quantity is not None
        and int(renewal_quantity) > int(current_quantity)
    )


def _previous_anniversary(coterm: dt.date) -> dt.date:
    try:
        return coterm.replace(year=coterm.year - 1)
    except ValueError:  # 29 Feb on a non-leap target year
        return coterm.replace(year=coterm.year - 1, day=_LAST_DAY_OF_FEBRUARY_NON_LEAP)


def _parse_date(raw_date: str) -> dt.date | None:
    try:
        return dt.date.fromisoformat(raw_date)
    except ValueError:
        logger.warning("Unusable Adobe cotermDate %r for the renewal-in-place check", raw_date)
        return None


def _parse_creation_date(raw_date: str) -> dt.date | None:
    try:
        created = dt.datetime.fromisoformat(raw_date)
    except ValueError:
        logger.warning("Unusable Adobe order creationDate %r", raw_date)
        return None
    if created.tzinfo is None:
        created = created.replace(tzinfo=dt.UTC)
    return created.astimezone(dt.UTC).date()


async def _call_adobe(call: Callable[..., Any], *args: Any) -> Any:
    """Run one Adobe read, mapping its failures to API errors the wizard can show."""
    try:
        return await asyncio.to_thread(call, *args)
    except AdobeAPIError as error:
        logger.warning("Adobe API error on the renewal-in-place check: %s", error)
        raise UpstreamServiceError(detail=_ADOBE_REQUEST_FAILED_DETAIL)
    except AdobeHttpError as error:
        logger.warning(
            "Adobe HTTP error on the renewal-in-place check: body=%r", error.response_content
        )
        raise UpstreamServiceError(detail=_ADOBE_REQUEST_FAILED_DETAIL)
    except AdobeError as error:
        logger.warning("Adobe configuration error on the renewal-in-place check: %s", error)
        raise ValidationError(detail=str(error))
