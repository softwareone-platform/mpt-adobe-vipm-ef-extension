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
    """Create the hidden adobeOrderIds parameter in the Configuration context.

    The early-renewal ("Renew now") plan reaches fulfilment on a Configuration
    order whenever it moves no quantity, and the fulfilment pipeline persists
    the Adobe renewal order id on the ``adobeOrderIds`` fulfilment parameter
    right after placing the Adobe order. That parameter only exists in the
    Purchase, Change and Termination contexts (see the fulfilment extension's
    20260306113000 migration) and a parameter definition is bound to one order
    context, so updating a Configuration order 400s with "Parameter with
    external Id 'adobeOrderIds' was not found" until this twin exists. The
    definition mirrors the original: hidden from client actors and read-only
    for vendor and operations actors on the Parameters tab.
    """

    def new_parameter(self) -> dict[str, Any]:
        """Return the parameter definition for the Adobe order ids on configuration orders."""
        return {
            "externalId": "adobeOrderIds",
            "displayOrder": 100,
            "context": PARAMETER_CONTEXT,
            "scope": "Order",
            "phase": "Order",
            "name": "Adobe Order IDs",
            "description": "Adobe Order IDs",
            "multiple": False,
            "constraints": {"hidden": True, "readonly": True, "required": False},
            "options": {
                "placeholderText": "Adobe Order IDs",
                "hintText": "Comma-separated Adobe order IDs",
            },
            "type": "SingleLineText",
        }

    @override
    def run(self) -> None:
        """Create the adobeOrderIds configuration parameter for configured products if missing."""
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

        The same externalId already exists in the Purchase, Change and
        Termination contexts, so keying on the externalId alone would skip
        this product and leave the configuration order without the parameter.
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
