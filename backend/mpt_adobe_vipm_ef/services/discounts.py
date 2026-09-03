"""Airtable-backed data store for discount code management (Discount Management TDR).

The extension keeps a local copy of the Adobe flexible discount catalogue in an
Airtable base with three tables: ``Discount Codes`` (one row per code, open and
closed), ``Discount Values`` (one amount per country for fixed types, a single
country-less row for percentages) and ``Discount Redemptions``
(one row per code redeemed by a customer). This module wraps the Airtable API
with the queries the discount-codes endpoints need; all methods are synchronous
and callers run them in a thread.
"""

from http import HTTPStatus
from typing import Any

from mpt_extension_sdk.errors.runtime import ConfigError
from pyairtable import Api, Table
from pyairtable.api.types import RecordDict
from pyairtable.formulas import AND, BLANK, EQ, OR, Field, Formula
from requests import HTTPError

from mpt_adobe_vipm_ef.settings import ExtensionSettings

CODES_TABLE = "Discount Codes"
VALUES_TABLE = "Discount Values"
REDEMPTIONS_TABLE = "Discount Redemptions"

CODE_FIELD = "Code"
SOURCE_OPEN = "API"
SOURCE_CLOSED = "Ops/Vendor"
ACTIVE_STATUS = "ACTIVE"
ENRICHMENT_COMPLETE = "COMPLETE"
ENRICHMENT_PENDING = "PENDING"

AirtableRecord = RecordDict

# Bound every Airtable HTTP call by (connect, read) seconds so a stalled
# request cannot hang the worker thread indefinitely; mirrors the 60s Adobe
# transport timeout.
_REQUEST_TIMEOUT = (60, 60)


class DiscountStore:
    """Synchronous gateway to the Airtable discount tables."""

    def __init__(self, api_token: str, base_id: str) -> None:
        self._api = Api(api_token, timeout=_REQUEST_TIMEOUT)
        self._base_id = base_id

    @classmethod
    def from_settings(cls, settings: ExtensionSettings) -> "DiscountStore":
        """Build the store from the extension settings, failing fast when unset."""
        if not settings.airtable_api_token or not settings.airtable_discounts_base_id:
            raise ConfigError(
                "The Airtable discount store is not configured "
                "(EXT_AIRTABLE_API_TOKEN / EXT_AIRTABLE_DISCOUNTS_ID)."
            )
        return cls(settings.airtable_api_token, settings.airtable_discounts_base_id)

    def list_codes(self, market_segment: str, customer_id: str) -> list[AirtableRecord]:
        """Return the non-retired codes visible to the customer in the segment.

        Open (sync-owned) codes are visible to every customer of the segment;
        closed codes only to the customer they target.
        """
        formula = AND(
            EQ(Field("market_segment"), market_segment),
            EQ(Field("retired_at"), BLANK()),
            OR(
                EQ(Field("source"), SOURCE_OPEN),
                EQ(Field("target_customer_id"), customer_id),
            ),
        )
        return self._table(CODES_TABLE).all(formula=formula)

    def get_code(self, record_id: str) -> AirtableRecord | None:
        """Return one code row by its Airtable record id, or None when missing."""
        try:
            return self._table(CODES_TABLE).get(record_id)
        except HTTPError as error:
            if _status_code(error) in {HTTPStatus.NOT_FOUND, HTTPStatus.UNPROCESSABLE_ENTITY}:
                return None
            raise

    def find_code(self, code: str, market_segment: str) -> AirtableRecord | None:
        """Return the code row keyed by ``(code, market_segment)``, or None."""
        formula = AND(
            EQ(Field(CODE_FIELD), code),
            EQ(Field("market_segment"), market_segment),
        )
        return self._table(CODES_TABLE).first(formula=formula)

    def list_open_codes(self) -> list[AirtableRecord]:
        """Return the open (sync-owned) code rows still in scope.

        Rows already retired are left out: the expiry pass only ever stamps
        ``retired_at``, and un-retiring is the synchronization's own job.
        """
        formula = AND(
            EQ(Field("source"), SOURCE_OPEN),
            EQ(Field("retired_at"), BLANK()),
        )
        return self._table(CODES_TABLE).all(formula=formula)

    def retire_codes(self, record_ids: list[str], retired_at: str) -> None:
        """Stamp ``retired_at`` on the given code rows in Airtable batches."""
        if not record_ids:
            return
        self._table(CODES_TABLE).batch_update(
            [{"id": record_id, "fields": {"retired_at": retired_at}} for record_id in record_ids],
            typecast=True,
        )

    def create_code(self, fields: dict[str, Any]) -> AirtableRecord:
        """Insert a new code row."""
        return self._table(CODES_TABLE).create(fields, typecast=True)

    def update_code(self, record_id: str, fields: dict[str, Any]) -> AirtableRecord:
        """Update an existing code row."""
        return self._table(CODES_TABLE).update(record_id, fields, typecast=True)

    def list_values(self, codes: list[str], market_segment: str) -> list[AirtableRecord]:
        """Return the per-country value rows for the given codes."""
        if not codes:
            return []
        formula = AND(
            EQ(Field("market_segment"), market_segment),
            _any_equals("code", codes),
        )
        return self._table(VALUES_TABLE).all(formula=formula)

    def replace_value(self, code: str, market_segment: str, fields: dict[str, Any]) -> None:
        """Rewrite the value rows of a closed code with a single fresh row."""
        values_table = self._table(VALUES_TABLE)
        formula = AND(
            EQ(Field("code"), code),
            EQ(Field("market_segment"), market_segment),
        )
        existing = values_table.all(formula=formula)
        values_table.create(fields, typecast=True)
        if existing:
            values_table.batch_delete([record["id"] for record in existing])

    def replace_country_value(
        self,
        code: str,
        market_segment: str,
        country: str | None,
        fields: dict[str, Any],
    ) -> None:
        """Rewrite the value rows of a code for one country with a single fresh row.

        The Adobe synchronization stores one row per country, so unlike
        :meth:`replace_value` the rows of the other countries are preserved.
        A country-agnostic (percentage) value passes no country and lands on
        the single blank-country row.
        """
        values_table = self._table(VALUES_TABLE)
        formula = AND(
            EQ(Field("code"), code),
            EQ(Field("market_segment"), market_segment),
            EQ(Field("country"), country or BLANK()),
        )
        existing = values_table.all(formula=formula)
        values_table.create(fields, typecast=True)
        if existing:
            values_table.batch_delete([record["id"] for record in existing])

    def list_redemptions(self, codes: list[str], customer_id: str) -> list[AirtableRecord]:
        """Return the customer's redemption rows for the given codes."""
        if not codes:
            return []
        formula = AND(
            EQ(Field("customer_id"), customer_id),
            _any_equals("code", codes),
        )
        return self._table(REDEMPTIONS_TABLE).all(formula=formula)

    def _table(self, table_name: str) -> Table:
        return self._api.table(self._base_id, table_name)


def _any_equals(field_name: str, accepted: list[str]) -> Formula:
    return OR(*(EQ(Field(field_name), accepted_value) for accepted_value in accepted))


def _status_code(error: HTTPError) -> int | None:
    response = error.response
    return None if response is None else response.status_code
