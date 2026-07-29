import logging
from typing import Any

from adobe.errors import wrap_http_error
from adobe.transport import AdobeTransport

logger = logging.getLogger(__name__)


class OfferClient:
    """Client for Adobe VIPM offer-related endpoints.

    Composes an :class:`~adobe.transport.AdobeTransport` and exposes offer
    endpoints on top of it.
    """

    def __init__(self, transport: AdobeTransport) -> None:
        self._transport = transport

    @wrap_http_error
    def get_offer_switch_paths(
        self, authorization_id: str, customer_id: str, subscription_id: str
    ) -> dict[str, Any]:
        """Retrieve the offer switch paths for a given customer."""
        logger.info(
            "get_offer_switch_paths: customer=%s subscription=%s authorization=%s",
            customer_id,
            subscription_id,
            authorization_id,
        )
        authorization = self._transport.settings.get_authorization(authorization_id)
        return self._transport.request(
            "GET",
            authorization,
            "/v3/offer-switch-paths",
            params={
                "customer-id": customer_id,
                "subscription-id": subscription_id,
            },
        )
