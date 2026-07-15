import logging
import os
from typing import Any, override

from mpt_api_client import RQLQuery
from mpt_tool.migration import SchemaBaseMigration
from mpt_tool.migration.mixins import MPTAPIClientMixin

logger = logging.getLogger(__name__)

DETAILS_GROUP_NAME = "Details"
PARAMETER_CONTEXT = "Change"


class Migration(SchemaBaseMigration, MPTAPIClientMixin):
    """Create the hidden switchPayload DataObject parameter in order scope.

    The parameter carries the Adobe-resolved switch snapshot on every
    switch-driven change order (mid-term upgrade). It is hidden from client
    actors and read-only for vendor and operations actors on the Parameters tab.
    """

    def new_parameter(self) -> dict[str, Any]:
        """Return the parameter definition for the mid-term upgrade switch payload."""
        return {
            "externalId": "switchPayload",
            "displayOrder": 800,
            "context": PARAMETER_CONTEXT,
            "scope": "Order",
            "phase": "Order",
            "name": "Mid-term upgrade switch payload",
            "description": (
                "Adobe-resolved switch snapshot for a mid-term upgrade change "
                "order. Locks in what the customer agreed to: the SWITCH order "
                "line items and cancelling items, plus the recommendation "
                "tracker id returned by Adobe. The fulfillment extension uses "
                "it to place the Adobe SWITCH order and, on full upgrades, to "
                "identify the source subscription to terminate."
            ),
            "multiple": False,
            "constraints": {"hidden": True, "readonly": True, "required": False},
            "options": {
                "type": "DataObject",
                "objectType": "Json",
                "defaultValue": "{}",
                "name": "switchPayload",
                "hintText": "switchPayload",
            },
            "type": "DataObject",
        }

    @override
    def run(self) -> None:
        """Create the switchPayload order parameter for configured products if missing."""
        raw_products = os.getenv("MPT_PRODUCTS_IDS", "")
        split_products = raw_products.split(",")
        product_ids = [pid.strip() for pid in split_products if pid.strip()]
        if not product_ids:
            logger.info("MPT_PRODUCTS_IDS is empty. No products to process.")
            return

        for product_id in product_ids:
            self._create_parameter_for_product(product_id)

    def _create_parameter_for_product(self, product_id: str) -> None:
        param_def = self.new_parameter()
        external_id = param_def["externalId"]
        params_service = self.mpt_client.catalog.products.parameters(product_id)

        if external_id in self._active_external_ids(params_service):
            logger.info(
                "Product %s: parameter %s already exists, skipping.",
                product_id,
                external_id,
            )
            return

        group = self._fetch_details_group(product_id)
        params_service.create({**param_def, "group": group})
        logger.info(
            "Product %s: created parameter %s for context %s.",
            product_id,
            external_id,
            PARAMETER_CONTEXT,
        )

    def _active_external_ids(self, params_service: Any) -> set[str]:
        result = set()
        for parameter in params_service.iterate():
            param_data = parameter.to_dict()
            if param_data.get("status") == "Active":
                result.add(param_data.get("externalId", ""))
        return result

    def _fetch_details_group(self, product_id: str) -> dict[str, Any]:
        group = (
            self.mpt_client.catalog.products
            .parameter_groups(product_id)
            .filter(RQLQuery(name=DETAILS_GROUP_NAME))
            .fetch_one()
            .to_dict()
        )
        return {"id": group["id"], "name": group["name"]}
