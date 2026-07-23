import logging
import os
from typing import Any, override

from mpt_tool.migration import SchemaBaseMigration
from mpt_tool.migration.mixins import MPTAPIClientMixin

logger = logging.getLogger(__name__)

DELETE_EXTERNAL_ID = "3YCRecommit"
RENAME_EXTERNAL_IDS = {  # noqa: WPS407
    "3YCLicenses": "3YCMinLicenses",
    "3YCConsumables": "3YCMinConsumables",
}
AGREEMENT_SCOPE = "Agreement"


def new_parameter() -> list[dict[str, Any]]:
    """Return the 3YC commitment-request agreement parameter definitions."""
    return [
        {
            "externalId": "3YCCommitmentRequestLicenses",
            "displayOrder": 6100,
            "scope": "Agreement",
            "phase": "Fulfillment",
            "name": "Commitment request minimum licenses",
            "description": (
                "The minimum license quantity submitted with the current pending "
                "commitment request. Reflects the license quantity that the customer "
                "must reach to satisfy the minimum purchase quantity (MPQ) and move the "
                "request to COMMITTED status. Populated when the commitment request status "
                "is REQUESTED or ACCEPTED. Cleared when no commitment request is in flight."
            ),
            "multiple": False,
            "constraints": {"hidden": False, "readonly": False, "required": False},  # noqa: WPS204
            "options": {
                "placeholderText": "Automatically populated by Adobe",
                "hintText": (
                    "Shows the minimum license quantity submitted with "
                    "the pending commitment or commitment increase request."
                ),
            },
            "type": "SingleLineText",
        },
        {
            "externalId": "3YCCommitmentRequestConsumables",
            "displayOrder": 6200,
            "scope": "Agreement",
            "phase": "Fulfillment",
            "name": "Commitment request minimum consumables",
            "description": (
                "The minimum consumable quantity submitted with the current pending "
                "commitment request. Reflects the consumable quantity that the customer "
                "must reach to satisfy the minimum purchase quantity (MPQ) and move the "
                "request to COMMITTED status. Populated when the commitment request status "
                "is REQUESTED or ACCEPTED. Cleared when no commitment request is in flight."
            ),
            "multiple": False,
            "constraints": {"hidden": False, "readonly": False, "required": False},
            "options": {
                "placeholderText": "Automatically populated by Adobe",
                "hintText": (
                    "Shows the minimum consumable quantity submitted with "
                    "the pending commitment or commitment increase request."
                ),
            },
            "type": "SingleLineText",
        },
        {
            "externalId": "3YCCommitmentRequestStartDate",
            "displayOrder": 6300,
            "scope": "Agreement",
            "phase": "Fulfillment",
            "name": "Commitment request start date",
            "description": (
                "The start date of the current pending commitment request, as "
                "returned by Adobe. This date reflects when the new or updated commitment "
                "term would begin if the customer meets the minimum purchase quantity. "
                "Populated when the commitment request status is REQUESTED or ACCEPTED. "
                "Cleared when no commitment request is in flight."
            ),
            "multiple": False,
            "constraints": {"hidden": False, "readonly": False, "required": False},
            "options": {
                "dateRange": False,
                "hintText": (
                    "Shows the proposed start date of the pending commitment "
                    "or commitment increase request."
                ),
            },
            "type": "Date",
        },
        {
            "externalId": "3YCCommitmentRequestEndDate",
            "displayOrder": 6400,
            "scope": "Agreement",
            "phase": "Fulfillment",
            "name": "Commitment request end date",
            "description": (
                "The end date of the current pending commitment request, as "
                "returned by Adobe. This date reflects when the new or updated commitment "
                "term would begin if the customer meets the minimum purchase quantity. "
                "Populated when the commitment request status is REQUESTED or ACCEPTED. "
                "Cleared when no commitment request is in flight."
            ),
            "multiple": False,
            "constraints": {"hidden": False, "readonly": False, "required": False},
            "options": {
                "dateRange": False,
                "hintText": (
                    "Shows the proposed end date of the pending commitment "
                    "or commitment increase request."
                ),
            },
            "type": "Date",
        },
        {
            "externalId": "3YCRecommitmentRequestLicenses",
            "displayOrder": 6700,
            "scope": "Agreement",
            "phase": "Fulfillment",
            "name": "Recommitment request minimum licenses",
            "description": (
                "The minimum license quantity submitted with the current pending recommitment "
                "request. Reflects the license quantity the customer must maintain for the "
                "next 3-year term. Populated when the recommitment request status is "
                "REQUESTED or ACCEPTED. Cleared when no recommitment request is in flight."
            ),
            "multiple": False,
            "constraints": {"hidden": False, "readonly": False, "required": False},
            "options": {
                "placeholderText": "Automatically populated by Adobe",
                "hintText": (
                    "Shows the minimum license quantity submitted "
                    "with the pending recommitment request."
                ),
            },
            "type": "SingleLineText",
        },
        {
            "externalId": "3YCRecommitmentRequestConsumables",
            "displayOrder": 6800,
            "scope": "Agreement",
            "phase": "Fulfillment",
            "name": "Recommitment request minimum consumables",
            "description": (
                "The minimum consumable quantity submitted with the current pending recommitment "
                "request. Reflects the consumable quantity the customer must maintain for the "
                "next 3-year term. Populated when the recommitment request status is "
                "REQUESTED or ACCEPTED. Cleared when no recommitment request is in flight."
            ),
            "multiple": False,
            "constraints": {"hidden": False, "readonly": False, "required": False},
            "options": {
                "placeholderText": "Automatically populated by Adobe",
                "hintText": (
                    "Shows the minimum consumable quantity submitted "
                    "with the pending recommitment request."
                ),
            },
            "type": "SingleLineText",
        },
        {
            "externalId": "3YCRecommitmentRequestStartDate",
            "displayOrder": 6900,
            "scope": "Agreement",
            "phase": "Fulfillment",
            "name": "Recommitment request start date",
            "description": (
                "The start date of the current pending recommitment request, as returned by Adobe."
                "This is the date the new commitment term will begin, which cannot be earlier "
                "than the end date of the current active commitment. Populated "
                "when the recommitment request status is REQUESTED or ACCEPTED. Cleared when no "
                "recommitment request is in flight."
            ),
            "multiple": False,
            "constraints": {"hidden": False, "readonly": False, "required": False},
            "options": {
                "dateRange": False,
                "hintText": ("Shows the proposed start date of the pending recommitment request."),
            },
            "type": "Date",
        },
        {
            "externalId": "3YCRecommitmentRequestEndDate",
            "displayOrder": 7000,
            "scope": "Agreement",
            "phase": "Fulfillment",
            "name": "Recommitment request end date",
            "description": (
                "The end date of the current pending recommitment request, as returned by Adobe."
                "This is the date the new commitment term will end, approximately 3 years after "
                "the start date. Populated when the recommitment request status "
                "is REQUESTED or ACCEPTED. "
                "Cleared when no recommitment request is in flight."
            ),
            "multiple": False,
            "constraints": {"hidden": False, "readonly": False, "required": False},
            "options": {
                "dateRange": False,
                "hintText": ("Shows the proposed end date of the pending recommitment request."),
            },
            "type": "Date",
        },
    ]


class Migration(SchemaBaseMigration, MPTAPIClientMixin):
    """Correct the 3YC agreement parameters.

    Deletes the obsolete ``3YCRecommit`` parameter and renames the
    ``3YCLicenses`` and ``3YCConsumables`` agreement parameters to
    ``3YCMinLicenses`` and ``3YCMinConsumables`` respectively.
    """

    @override
    def run(self) -> None:
        """Apply the 3YC parameter corrections for configured products."""
        raw_products = os.getenv("MPT_PRODUCTS_IDS", "")
        split_products = raw_products.split(",")
        product_ids = [pid.strip() for pid in split_products if pid.strip()]
        if not product_ids:
            logger.info("MPT_PRODUCTS_IDS is empty. No products to process.")
            return

        for product_id in product_ids:
            params_service = self.mpt_client.catalog.products.parameters(product_id)
            self._delete_recommit_parameter(product_id, params_service)
            self._rename_agreement_parameters(product_id, params_service)
            self._create_parameters_for_product(product_id, params_service)

    def _delete_recommit_parameter(self, product_id: str, params_service: Any) -> None:
        for parameter in params_service.iterate():
            param_data = parameter.to_dict()
            if (
                param_data.get("externalId") == DELETE_EXTERNAL_ID
                and param_data.get("status") == "Active"
            ):
                params_service.delete(param_data["id"])
                logger.info(
                    "Product %s: deleted parameter %s (scope %s)",
                    product_id,
                    DELETE_EXTERNAL_ID,
                    param_data.get("scope"),
                )

    def _rename_agreement_parameters(self, product_id: str, params_service: Any) -> None:
        for parameter in params_service.iterate():
            param_data = parameter.to_dict()
            external_id = param_data.get("externalId")
            new_external_id = RENAME_EXTERNAL_IDS.get(external_id)

            if (
                new_external_id is None
                or param_data.get("scope") != AGREEMENT_SCOPE
                or param_data.get("status") != "Active"
            ):
                continue

            param_data["externalId"] = new_external_id
            if new_external_id == "3YCMinLicenses":
                param_data["displayOrder"] = 5800
                param_data["options"] = {
                    "placeholderText": "e.g. 10",
                    "hintText": (
                        "Shows the minimum number of licenses committed to under "
                        "the current active 3-year commitment."
                    ),
                }
                param_data["description"] = (
                    "The minimum license quantity of the customer's currently active "
                    "3-year commitment, as confirmed by Adobe. Populated only when the "
                    "commitment is in COMMITTED status. Cleared when no active "
                    "commitment exists."
                )
            else:
                param_data["displayOrder"] = 5900
                param_data["options"] = {
                    "placeholderText": "e.g. 10",
                    "hintText": (
                        "Shows the minimum number of consumable transactions committed "
                        "to under the current active 3-year commitment."
                    ),
                }
                param_data["description"] = (
                    "The minimum consumable quantity of the customer's currently active "
                    "3-year commitment, as confirmed by Adobe. Populated only when the "
                    "commitment is in COMMITTED status and includes a consumables "
                    "component. Cleared when no active commitment exists or the "
                    "commitment covers licenses only."
                )

            params_service.update(param_data["id"], param_data)
            logger.info(
                "Product %s: renamed parameter %s to %s (scope %s)",
                product_id,
                external_id,
                new_external_id,
                AGREEMENT_SCOPE,
            )

    def _create_parameters_for_product(self, product_id: str, params_service: Any) -> None:
        active_params = self._active_params_by_scope(params_service)

        for param_def in new_parameter():
            external_id = param_def["externalId"]
            scope = param_def["scope"]

            if (scope, external_id) in active_params:
                logger.info(
                    "Product %s: parameter %s (scope %s) already exists, skipping.",
                    product_id,
                    external_id,
                    scope,
                )
                continue

            params_service.create({**param_def})
            logger.info(
                "Product %s: created parameter %s (scope %s)",
                product_id,
                external_id,
                scope,
            )

    def _active_params_by_scope(self, params_service: Any) -> set[tuple[str, str]]:
        result = set()

        for parameter in params_service.iterate():
            param_data = parameter.to_dict()

            if param_data.get("status") == "Active":
                scope = param_data.get("scope", "")
                external_id = param_data.get("externalId", "")
                result.add((scope, external_id))

        return result
