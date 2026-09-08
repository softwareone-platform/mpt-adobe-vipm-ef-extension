import logging
from typing import Any

from adobe.enums import AdobeOrderType
from adobe.errors import wrap_http_error
from adobe.transport import AdobeTransport

logger = logging.getLogger(__name__)

RECOMMENDATION_TRACKER_HEADER = "x-recommendation-tracker-id"


class OrderClient:
    """Client for Adobe VIPM order endpoints.

    Composes an :class:`~adobe.transport.AdobeTransport` and exposes order
    endpoints on top of it.
    """

    def __init__(self, transport: AdobeTransport) -> None:
        self._transport = transport

    @wrap_http_error
    def preview_switch_order(  # noqa: WPS211
        self,
        authorization_id: str,
        customer_id: str,
        currency_code: str,
        line_items: list[dict[str, Any]],
        cancelling_items: list[dict[str, Any]],
        recommendation_tracker_id: str = "",
    ) -> dict[str, Any]:
        """Request a PREVIEW_SWITCH quote validating a mid-term upgrade before ordering.

        Adobe validates the switch (path validity, quantities, single-item rule)
        and returns pro-rated pricing without placing an order. When the
        selection came from Adobe's recommendations, the tracker id is forwarded
        as the ``x-recommendation-tracker-id`` header so Adobe can attribute the
        order to the recommendation.
        """
        logger.info(
            "preview_switch_order: customer=%s authorization=%s targets=%d",
            customer_id,
            authorization_id,
            len(line_items),
        )
        extra_headers = (
            {RECOMMENDATION_TRACKER_HEADER: recommendation_tracker_id}
            if recommendation_tracker_id
            else None
        )
        authorization = self._transport.settings.get_authorization(authorization_id)
        return self._transport.request(
            "POST",
            authorization,
            f"/v3/customers/{customer_id}/orders",
            extra_headers=extra_headers,
            json={
                "orderType": AdobeOrderType.PREVIEW_SWITCH.value,
                "currencyCode": currency_code,
                "lineItems": line_items,
                "cancellingItems": cancelling_items,
            },
        )

    @wrap_http_error
    def preview_renewal_order(
        self,
        authorization_id: str,
        customer_id: str,
        currency_code: str,
        line_items: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Request a PREVIEW_RENEWAL quote validating an anniversary renewal before ordering.

        Adobe evaluates the renewal as described by the line items (offer,
        subscription, quantity and any flexible discount codes carried per
        line) and returns renewal pricing without committing an order. It is
        the authoritative validation for discount-code eligibility on the
        customer's existing subscriptions.
        """
        logger.info(
            "preview_renewal_order: customer=%s authorization=%s lines=%d",
            customer_id,
            authorization_id,
            len(line_items),
        )
        authorization = self._transport.settings.get_authorization(authorization_id)
        return self._transport.request(
            "POST",
            authorization,
            f"/v3/customers/{customer_id}/orders?fetch-price=true",
            json={
                "orderType": AdobeOrderType.PREVIEW_RENEWAL.value,
                "currencyCode": currency_code,
                "lineItems": line_items,
            },
        )

    @wrap_http_error
    def preview_automated_renewal_order(
        self, authorization_id: str, customer_id: str, currency_code: str
    ) -> dict[str, Any]:
        """Request the automated PREVIEW_RENEWAL Adobe would run at the anniversary.

        A PREVIEW_RENEWAL with no line items asks Adobe what the customer's
        standing auto-renewal preferences would renew: each renewing line comes
        back carrying the flexible discounts Adobe auto-applies to it (the
        reusables already held on the subscription), each validated with a
        ``result`` of ``SUCCESS`` or ``FAILURE``. Adobe owns the precedence
        between several held reusables and the extended lock window, so this is
        the authoritative source for the inherited discount set the renewal
        wizard surfaces. Adobe returns an error when the customer has no
        auto-renewal-enabled subscriptions; the caller reads that as no
        inherited discounts.
        """
        logger.info(
            "preview_automated_renewal_order: customer=%s authorization=%s",
            customer_id,
            authorization_id,
        )
        authorization = self._transport.settings.get_authorization(authorization_id)
        return self._transport.request(
            "POST",
            authorization,
            f"/v3/customers/{customer_id}/orders?fetch-price=true",
            json={
                "orderType": AdobeOrderType.PREVIEW_RENEWAL.value,
                "currencyCode": currency_code,
            },
        )
