import json
import logging
from hashlib import sha256
from typing import Any

from adobe.enums import LinkedMembershipType
from adobe.errors import wrap_http_error
from adobe.transport import AdobeTransport

logger = logging.getLogger(__name__)


def _correlation_id(payload: dict[str, Any]) -> str:
    serialized = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return sha256(serialized.encode()).hexdigest()


class CustomerClient:
    """Customer flows of the Adobe VIPM API.

    Reachable as ``adobe_client.customer``. All HTTP work is delegated to the
    injected :class:`~adobe.transport.AdobeTransport`.
    """

    def __init__(self, transport: AdobeTransport) -> None:
        self._transport = transport

    @wrap_http_error
    def get_customer(self, authorization_id: str, customer_id: str) -> dict[str, Any]:
        """Retrieve a customer account from Adobe VIPM."""
        logger.info("get_customer: customer=%s authorization=%s", customer_id, authorization_id)
        authorization = self._transport.settings.get_authorization(authorization_id)
        return self._transport.request("GET", authorization, f"/v3/customers/{customer_id}")

    @wrap_http_error
    def create_three_year_request(
        self,
        authorization_id: str,
        customer_id: str,
        commitment_request: dict[str, Any],
        is_recommitment: bool = False,  # noqa: FBT001, FBT002
    ) -> dict[str, Any]:
        """Create a 3YC commitment (or recommitment) request for the given customer."""
        logger.info(
            "create_three_year_request: customer=%s authorization=%s is_recommitment=%s",
            customer_id,
            authorization_id,
            is_recommitment,
        )
        request_type = "recommitmentRequest" if is_recommitment else "commitmentRequest"
        quantities = []
        if commitment_request.get("3YCLicenses"):
            quantities.append(
                {"offerType": "LICENSE", "quantity": int(commitment_request["3YCLicenses"])},
            )
        if commitment_request.get("3YCConsumables"):
            quantities.append(
                {"offerType": "CONSUMABLES", "quantity": int(commitment_request["3YCConsumables"])},
            )
        company_profile = self.get_customer(authorization_id, customer_id)["companyProfile"]
        payload = {
            "companyProfile": company_profile,
            "benefits": [
                {
                    "type": "THREE_YEAR_COMMIT",
                    request_type: {
                        "minimumQuantities": quantities,
                    },
                },
            ],
        }

        logger.info(
            "create_three_year_request: PATCH customer=%s is_recommitment=%s minimumQuantities=%s",
            customer_id,
            is_recommitment,
            quantities,
        )

        authorization = self._transport.settings.get_authorization(authorization_id)
        return self._transport.request(
            "PATCH",
            authorization,
            f"/v3/customers/{customer_id}",
            json=payload,
        )

    @wrap_http_error
    def enable_global_sales(self, authorization_id: str, customer_id: str) -> dict[str, Any]:
        """Enable global sales for the given customer."""
        company_profile = self.get_customer(authorization_id, customer_id)["companyProfile"]
        payload = {
            "companyProfile": company_profile,
            "globalSalesEnabled": True,
        }
        authorization = self._transport.settings.get_authorization(authorization_id)
        return self._transport.request(
            "PATCH",
            authorization,
            f"/v3/customers/{customer_id}",
            json=payload,
        )

    @wrap_http_error
    def create_linked_membership_request(
        self,
        authorization_id: str,
        customer_id: str,
        name: str,
        membership_type: LinkedMembershipType = LinkedMembershipType.STANDARD,
    ) -> dict[str, Any]:
        """Create a linked membership request for the given customer."""
        company_profile = self.get_customer(authorization_id, customer_id)["companyProfile"]
        payload = {
            "linkedMembership": {
                "type": membership_type,
                "name": name,
            },
            "companyProfile": company_profile,
        }
        authorization = self._transport.settings.get_authorization(authorization_id)
        return self._transport.request(
            "PATCH",
            authorization,
            f"/v3/customers/{customer_id}",
            json=payload,
        )
