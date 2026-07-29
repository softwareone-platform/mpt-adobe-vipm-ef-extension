import logging
from typing import Any

from adobe.constants import RECOMMENDATION_TRACKER_HEADER
from adobe.errors import wrap_http_error
from adobe.transport import AdobeTransport

logger = logging.getLogger(__name__)


class SubscriptionClient:
    """Client for Adobe VIPM subscription endpoints.

    Composes an :class:`~adobe.transport.AdobeTransport` and exposes subscription
    endpoints on top of it.
    """

    def __init__(self, transport: AdobeTransport) -> None:
        self._transport = transport

    @wrap_http_error
    def create_subscription(  # noqa: WPS211
        self,
        authorization_id: str,
        customer_id: str,
        offer_id: str,
        renewal_quantity: int,
        recommendation_tracker_id: str,
        renewal_code: str = "",
        flex_discount_codes: list[str] | None = None,
        currency_code: str = "",
        deployment_id: str = "",
    ) -> dict[str, Any]:
        """Create a scheduled subscription for a net-new product.

        Adobe creates the subscription with ``currentQuantity`` 0 and status
        1009: it activates and is invoiced only at the anniversary date. Adobe
        accepts the call only between 30 and 3 days before the anniversary date
        and only while the customer holds at least one active subscription; both
        are validated by Adobe on this call.

        ``autoRenewal.enabled`` is always sent as ``True`` because Adobe rejects
        any other value on creation. ``currency_code`` and ``deployment_id``
        apply to global customers ordering outside their home country and are
        omitted from the payload when empty.

        The tracker id is replayed as the ``x-recommendation-tracker-id`` header
        so Adobe can attribute the outcome, whether or not the selected product
        came from Adobe's recommendations.
        """
        logger.info(
            "create_subscription: customer=%s authorization=%s offer=%s renewal_quantity=%d",
            customer_id,
            authorization_id,
            offer_id,
            renewal_quantity,
        )
        auto_renewal: dict[str, Any] = {"enabled": True, "renewalQuantity": renewal_quantity}
        if renewal_code:
            auto_renewal["renewalCode"] = renewal_code
        if flex_discount_codes:
            auto_renewal["flexDiscountCodes"] = flex_discount_codes
        payload: dict[str, Any] = {"offerId": offer_id, "autoRenewal": auto_renewal}
        if currency_code:
            payload["currencyCode"] = currency_code
        if deployment_id:
            payload["deploymentId"] = deployment_id
        extra_headers = (
            {RECOMMENDATION_TRACKER_HEADER: recommendation_tracker_id}
            if recommendation_tracker_id
            else None
        )
        authorization = self._transport.settings.get_authorization(authorization_id)
        return self._transport.request(
            "POST",
            authorization,
            f"/v3/customers/{customer_id}/subscriptions",
            extra_headers=extra_headers,
            json=payload,
        )
