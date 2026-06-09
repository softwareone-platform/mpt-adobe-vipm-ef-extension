import logging
import os
from typing import Any, override

from mpt_api_client import RQLQuery
from mpt_tool.migration import SchemaBaseMigration
from mpt_tool.migration.mixins import MPTAPIClientMixin

logger = logging.getLogger(__name__)

DETAILS_GROUP_NAME = "Details"


class Migration(SchemaBaseMigration, MPTAPIClientMixin):
    """Create the 3yc parameters in order scope and remove the agreement parameters."""

    def new_parameter(self) -> list[dict[str, Any]]:
        """Return parameter definition for Adobe Order IDs."""
        return [
            {
                "externalId": "3YC",
                "displayOrder": 100,
                "context": "Purchase",
                "scope": "Order",
                "phase": "Order",
                "name": "3-year commitment",
                "description": (
                    "When enabled, requests Adobe 3-year commitment enrollment."
                    "Adobe sends an Admin Console invitation to the primary "
                    "administrator. The order enters Querying until the customer "
                    "accepts. Upon acceptance, licenses and consumables are placed "
                    "at 3YC discount levels.\n\n"
                    "Controls visibility of minimum commitment parameters."
                ),
                "multiple": False,
                "constraints": {"hidden": True, "readonly": True, "required": False},
                "options": {
                    "optionsList": [
                        {
                            "description": "Lock in discounted pricing with a 3-year commitment.",
                            "label": "Enable 3-year commitment",
                            "value": "Yes",
                        }
                    ],
                    "defaultValue": [],
                    "hintText": (
                        "Opt in to a 3-year commitment for discounted pricing. "
                        "You'll receive an invitation in Adobe Admin Console to "
                        "confirm and activate the commitment."
                    ),
                },
                "type": "Checkbox",
            },
            {
                "externalId": "3YCLicenses",
                "displayOrder": 600,
                "context": "Purchase",
                "scope": "Order",
                "phase": "Order",
                "name": "Minimum committed licenses",
                "description": (
                    "Defines the minimum license quantity for 3YC enrollment."
                    "Value determines Adobe commitment level (12/13/14). Quantities "
                    "may be adjusted annually but cannot drop below this value during "
                    "the active commitment. Invalid values will result in Querying."
                ),
                "multiple": False,
                "constraints": {"hidden": True, "readonly": True, "required": False},
                "options": {
                    "placeholderText": "e.g. 10",
                    "hintText": (
                        "Enter the minimum number of licenses you commit to "
                        "maintain throughout the full 3-year term. You can adjust "
                        "quantities annually, but they can't drop below this number."
                    ),
                },
                "type": "SingleLineText",
            },
            {
                "externalId": "3YCConsumables",
                "displayOrder": 700,
                "context": "Purchase",
                "scope": "Order",
                "phase": "Order",
                "name": "Minimum committed consumables",
                "description": (
                    "Defines the minimum consumable commitment for 3YC enrollment."
                    "Maps to Adobe consumable tiers (A-G). Quantities may be adjusted "
                    "annually but cannot drop below this value during the active "
                    "commitment. Invalid values will result in Querying."
                ),
                "multiple": False,
                "constraints": {"hidden": True, "readonly": True, "required": False},
                "options": {
                    "placeholderText": "e.g. 1,000",
                    "hintText": (
                        "Enter the minimum number of consumable transactions you "
                        "commit to maintain throughout the 3-year term. You can adjust "
                        "quantities annually, but they can't drop below this number."
                    ),
                },
                "type": "SingleLineText",
            },
        ]

    @override
    def run(self) -> None:
        """Create the Adobe Order IDs order parameter for configured products if missing."""
        raw_products = os.getenv("MPT_PRODUCTS_IDS", "")
        split_products = raw_products.split(",")
        product_ids = [pid.strip() for pid in split_products if pid.strip()]
        if not product_ids:
            logger.info("MPT_PRODUCTS_IDS is empty. No products to process.")
            return

        for product_id in product_ids:
            params_service = self.mpt_client.catalog.products.parameters(product_id)
            self._delete_agreement_parameters_for_product(product_id, params_service)
            self._create_parameter_for_product(product_id, params_service)

    def _delete_agreement_parameters_for_product(
        self, product_id: str, params_service: Any
    ) -> None:
        external_ids = ["3YC", "3YCLicenses", "3YCConsumables"]
        for external_id in external_ids:
            mpt_param_id = self._get_param_id_agreement_scope(params_service, external_id)
            if mpt_param_id:
                params_service.delete(mpt_param_id)

    def _create_parameter_for_product(self, product_id: str, params_service: Any) -> None:  # noqa: WPS210
        params_def = self.new_parameter()
        group = self._fetch_details_group(product_id)
        active_ids = self._active_external_ids_by_scope(params_service, "Order")
        logger.info("Start the parameter creation")

        for param_def in params_def:
            external_id = param_def["externalId"]

            if external_id in active_ids:
                logger.info(
                    "Product %s: parameter %s already exists, skipping.",
                    product_id,
                    external_id,
                )
                continue

            base_param = {**param_def, "group": group}

            params_service.create({**base_param})
            logger.info(
                "Product %s: created parameter %s",
                product_id,
                external_id,
            )

    def _active_external_ids_by_scope(self, params_service: Any, scope: str) -> set[str]:
        result = set()

        for parameter in params_service.iterate():
            param_data = parameter.to_dict()

            if param_data.get("status") == "Active" and param_data.get("scope") == scope:
                result.add(param_data.get("externalId", ""))

        return result

    def _get_param_id_agreement_scope(self, params_service: Any, external_id: str) -> str | None:  # noqa: WPS110
        return next(
            (
                data.get("id")
                for parameter in params_service.iterate()
                if (data := parameter.to_dict()).get("externalId") == external_id  # noqa: WPS110
                and data.get("scope") == "Agreement"
                and data.get("status") == "Active"
            ),
            None,
        )

    def _fetch_details_group(self, product_id: str) -> dict[str, Any]:
        group = (
            self.mpt_client.catalog.products
            .parameter_groups(product_id)
            .filter(RQLQuery(name=DETAILS_GROUP_NAME))
            .fetch_one()
            .to_dict()
        )
        return {"id": group["id"], "name": group["name"]}
