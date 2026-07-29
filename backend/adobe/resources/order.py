import logging
from typing import Any

from adobe.constants import RECOMMENDATION_TRACKER_HEADER
from adobe.enums import AdobeOrderType
from adobe.errors import wrap_http_error
from adobe.transport import AdobeTransport

logger = logging.getLogger(__name__)


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
