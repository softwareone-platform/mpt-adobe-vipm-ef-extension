import logging
import os
from typing import Any, override

from mpt_api_client import RQLQuery
from mpt_tool.migration import SchemaBaseMigration
from mpt_tool.migration.mixins import MPTAPIClientMixin

logger = logging.getLogger(__name__)

DETAILS_GROUP_NAME = "Details"
PARAMETER_CONTEXT = "Configuration"


class Migration(SchemaBaseMigration, MPTAPIClientMixin):
    """Create the hidden renewalPayload DataObject parameter in the Configuration context.

    The early-renewal ("Renew now") plan reaches fulfilment on a Configuration
    order whenever it moves no quantity, so the snapshot the Change context
    already defines (see the 20260805120000 migration) needs a twin here: a
    parameter definition is bound to one order context, so the Configuration
    order cannot carry the Change one. It is hidden from client actors and
    read-only for vendor and operations actors on the Parameters tab.
    """

    def new_parameter(self) -> dict[str, Any]:
        """Return the parameter definition for the renewal payload on configuration orders."""
        return {
            "externalId": "renewalPayload",
            "displayOrder": 810,
            "context": PARAMETER_CONTEXT,
            "scope": "Order",
            "phase": "Order",
            "name": "Renewal payload",
            "description": (
                "Snapshot of the customer's renewal plan on a renewal-driven "
                "configuration order, which is how an early renewal ('Renew "
                "now') that changes no quantity is submitted. Locks in what "
                "the customer agreed to: the renewal path, the "
                "per-subscription renew decisions and renewal quantities, the "
                "flexible discount codes to apply, and the recommendation "
                "tracker id. The fulfillment extension uses it to place the "
                "early Adobe renewal order at processing."
            ),
            "multiple": False,
            "constraints": {"hidden": True, "readonly": True, "required": False},
            "options": {
                "type": "DataObject",
                "objectType": "Json",
                "defaultValue": "{}",
                "name": "renewalPayload",
                "hintText": "renewalPayload",
            },
            "type": "DataObject",
        }

    @override
    def run(self) -> None:
        """Create the renewalPayload configuration parameter for configured products if missing."""
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

        if (PARAMETER_CONTEXT, external_id) in self._active_params_by_context(params_service):
            logger.info(
                "Product %s: parameter %s for context %s already exists, skipping.",
                product_id,
                external_id,
                PARAMETER_CONTEXT,
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

    def _active_params_by_context(self, params_service: Any) -> set[tuple[str, str]]:
        """Key the existing parameters by context.

        The same externalId already exists in the Change context, so keying on
        the externalId alone would skip this product and leave the
        configuration order without its snapshot.
        """
        result = set()
        for parameter in params_service.iterate():
            param_data = parameter.to_dict()
            if param_data.get("status") != "Active":
                continue
            context = param_data.get("context", "")
            external_id = param_data.get("externalId", "")
            result.add((context, external_id))
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
