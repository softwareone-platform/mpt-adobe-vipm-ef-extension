"""Airtable-backed lookup of the Adobe SKU master data (``SKU Mapping`` table).

The SoftwareOne Adobe extensions keep the Adobe product master data in an
Airtable base with a ``SKU Mapping`` table: one row per partial SKU and
segment. Two hand-curated columns drive the at-anniversary renewal: ``type_3yc``
classifies the product as a three-year commitment license or consumable, which
the 3YC floor pre-check needs to split the renewal quantities between the
LICENSE and CONSUMABLES commitment floors, and ``auto_renew_supported`` states
whether the SKU can auto-renew at all, which routes it into or out of the
at-anniversary path. Neither can be derived from Adobe data. All methods are
synchronous and callers run them in a thread.
"""

import asyncio
import logging
from types import MappingProxyType
from typing import cast

from mpt_extension_sdk.api import UpstreamServiceError
from mpt_extension_sdk.api.context import APIContext
from mpt_extension_sdk.errors.runtime import ConfigError
from pyairtable import Api, Table
from pyairtable.api.types import RecordDict
from pyairtable.formulas import AND, EQ, OR, Field
from requests import RequestException

from mpt_adobe_vipm_ef.settings import ExtensionSettings

logger = logging.getLogger(__name__)

SKU_MAPPING_TABLE = "SKU Mapping"

THREE_YC_TYPE_LICENSE = "License"
THREE_YC_TYPE_CONSUMABLE = "Consumable"

# EXT_PRODUCT_SEGMENTS configures Adobe segment codes per product; the Airtable
# ``segment`` column stores the segment display names.
SEGMENT_TO_AIRTABLE_SEGMENT = MappingProxyType({
    "COM": "Commercial",
    "GOV": "Government",
    "EDU": "Education",
    "GOV_LGA": "LargeGovernment",
})

# Bound every Airtable HTTP call by (connect, read) seconds so a stalled
# request cannot hang the worker thread indefinitely; mirrors the 60s Adobe
# transport timeout.
_REQUEST_TIMEOUT = (60, 60)


class SkuMappingStore:
    """Synchronous gateway to the Airtable SKU mapping table."""

    def __init__(self, api_token: str, base_id: str) -> None:
        self._api = Api(api_token, timeout=_REQUEST_TIMEOUT)
        self._base_id = base_id

    @classmethod
    def from_settings(cls, settings: ExtensionSettings) -> "SkuMappingStore":
        """Build the store from the extension settings, failing fast when unset."""
        if not settings.airtable_api_token or not settings.airtable_sku_mapping_base_id:
            raise ConfigError(
                "The Airtable SKU mapping store is not configured "
                "(EXT_AIRTABLE_API_TOKEN / EXT_AIRTABLE_SKU_MAPPING_ID)."
            )
        return cls(settings.airtable_api_token, settings.airtable_sku_mapping_base_id)

    def list_three_yc_types(self, partial_skus: list[str], market_segment: str) -> dict[str, str]:
        """Return the ``type_3yc`` classification of each SKU within the segment.

        Keyed by partial SKU (the ``vendor_external_id`` column); SKUs without
        a mapping row are absent from the result.
        """
        records = self._list_segment_rows(partial_skus, market_segment)
        return {
            record["fields"]["vendor_external_id"]: record["fields"].get("type_3yc", "")
            for record in records
            if record.get("fields", {}).get("vendor_external_id")
        }

    def list_auto_renew_supported(
        self, partial_skus: list[str], market_segment: str
    ) -> dict[str, bool]:
        """Return whether each SKU within the segment supports auto-renewal.

        Keyed by partial SKU (the ``vendor_external_id`` column). An unticked
        ``auto_renew_supported`` checkbox is absent from the Airtable row, and a
        SKU without a mapping row is absent from the result, so both read as
        unsupported at the call site.
        """
        if not partial_skus:
            return {}
        formula = AND(
            EQ(Field("segment"), _to_airtable_segment(market_segment)),
            OR(*(EQ(Field("vendor_external_id"), sku) for sku in partial_skus)),
        )
        records = self._table(SKU_MAPPING_TABLE).all(formula=formula)
        return {
            record["fields"]["vendor_external_id"]: bool(
                record["fields"].get("auto_renew_supported")
            )
            for record in records
            if record.get("fields", {}).get("vendor_external_id")
        }

    def list_lifecycle(
        self, partial_skus: list[str], market_segment: str
    ) -> dict[str, dict[str, bool]]:
        """Return the ``end_of_sale`` and ``end_of_life`` flags of each SKU within the segment.

        Keyed by partial SKU (the ``vendor_external_id`` column), with both
        flags in one row so a single query serves the early-renewability rule.
        An unticked checkbox is absent from the Airtable row, as is a SKU
        without a mapping row, so both read as neither retired at the call site.
        """
        records = self._list_segment_rows(partial_skus, market_segment)
        return {
            record["fields"]["vendor_external_id"]: _lifecycle_flags(record)
            for record in records
            if record.get("fields", {}).get("vendor_external_id")
        }

    def list_full_skus(self, partial_skus: list[str], market_segment: str) -> dict[str, str]:
        """Return the full Adobe SKU (``sku`` column) of each SKU within the segment.

        Keyed by partial SKU (the ``vendor_external_id`` column); SKUs without
        a mapping row or with a blank ``sku`` column are absent from the
        result.
        """
        records = self._list_segment_rows(partial_skus, market_segment)
        return {
            record["fields"]["vendor_external_id"]: record["fields"]["sku"]
            for record in records
            if _has_full_sku(record)
        }

    def _list_segment_rows(self, partial_skus: list[str], market_segment: str) -> list[RecordDict]:
        if not partial_skus:
            return []
        formula = AND(
            EQ(Field("segment"), _to_airtable_segment(market_segment)),
            OR(*(EQ(Field("vendor_external_id"), sku) for sku in partial_skus)),
        )
        return self._table(SKU_MAPPING_TABLE).all(formula=formula)

    def _table(self, table_name: str) -> Table:
        return self._api.table(self._base_id, table_name)


async def load_full_skus(
    ctx: APIContext, partial_skus: list[str], market_segment: str
) -> dict[str, str]:
    """Load the full Adobe SKU of each partial SKU from Airtable, mapping failures to 502."""
    store = SkuMappingStore.from_settings(cast(ExtensionSettings, ctx.ext_settings))
    try:
        return await asyncio.to_thread(store.list_full_skus, partial_skus, market_segment)
    except RequestException as error:
        logger.warning("SKU mapping store request failed: %s", error)
        raise UpstreamServiceError(detail="SKU mapping data store request failed")


def _lifecycle_flags(record: RecordDict) -> dict[str, bool]:
    fields = record.get("fields", {})
    return {
        "endOfSale": bool(fields.get("end_of_sale")),
        "endOfLife": bool(fields.get("end_of_life")),
    }


def _has_full_sku(record: RecordDict) -> bool:
    fields = record.get("fields", {})
    return bool(fields.get("vendor_external_id") and fields.get("sku"))


def _to_airtable_segment(market_segment: str) -> str:
    airtable_segment = SEGMENT_TO_AIRTABLE_SEGMENT.get(market_segment)
    if airtable_segment is None:
        raise ConfigError(f"Market segment {market_segment!r} has no Airtable SKU mapping segment.")
    return airtable_segment
