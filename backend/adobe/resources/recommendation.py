import logging
from collections.abc import Mapping
from typing import Any

from adobe.errors import wrap_http_error
from adobe.transport import AdobeTransport

logger = logging.getLogger(__name__)


class RecommendationClient:
    """Client for Adobe VIPM recommendation endpoints.

    Composes an :class:`~adobe.transport.AdobeTransport` and exposes recommendation
    endpoints on top of it.
    """

    def __init__(self, transport: AdobeTransport) -> None:
        self._transport = transport

    @wrap_http_error
    def get_recommendations(
        self, authorization_id: str, customer_id: str, offers: list[dict[str, Any]]
    ) -> tuple[dict[str, Any], Mapping[str, str]]:
        """Fetch product recommendations for a customer's offers.

        Returns the response body and the response headers (the caller reads the
        ``x-recommendation-tracker-id`` header, which Adobe may omit).
        """
        logger.info("get_recommendations: offers=%d", len(offers))
        authorization = self._transport.settings.get_authorization(authorization_id)
        response = self._transport.request_raw(
            "POST",
            authorization,
            "/v3/recommendations",
            json={"customerId": customer_id, "offers": offers},
        )
        return response.json(), response.headers
