import logging
from typing import Any

from adobe.errors import wrap_http_error
from adobe.transport import AdobeTransport

logger = logging.getLogger(__name__)


class SubscriptionClient:
    """Client for Adobe VIPM subscription endpoints.

    Composes an :class:`~adobe.transport.AdobeTransport` and exposes
    subscription endpoints on top of it.
    """

    def __init__(self, transport: AdobeTransport) -> None:
        self._transport = transport

    @wrap_http_error
    def get_subscriptions(self, authorization_id: str, customer_id: str) -> dict[str, Any]:
        """Retrieve every subscription of the given customer.

        Each item carries the subscription's current full Adobe offer id —
        the only place that full id lives. MPT's subscription and catalog
        data only ever expose the partial (10-char) vendor SKU, which Adobe
        rejects on a ``PREVIEW_RENEWAL``/order call.
        """
        logger.info(
            "get_subscriptions: customer=%s authorization=%s", customer_id, authorization_id
        )
        authorization = self._transport.settings.get_authorization(authorization_id)
        return self._transport.request(
            "GET", authorization, f"/v3/customers/{customer_id}/subscriptions"
        )
