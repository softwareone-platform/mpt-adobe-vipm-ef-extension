import logging
from typing import Any

from adobe.errors import wrap_http_error
from adobe.transport import AdobeTransport

logger = logging.getLogger(__name__)

# Adobe caps the flex-discounts page size at 50 items.
_PAGE_LIMIT = 50


class DiscountClient:
    """Client for Adobe VIPM flexible discount endpoints.

    Composes an :class:`~adobe.transport.AdobeTransport` and exposes the
    flexible discount catalogue endpoints on top of it.
    """

    def __init__(self, transport: AdobeTransport) -> None:
        self._transport = transport

    @wrap_http_error
    def list_flex_discounts(
        self, authorization_id: str, market_segment: str, country: str
    ) -> list[dict[str, Any]]:
        """Retrieve the open flexible discounts of a market segment and country.

        ``GET /v3/flex-discounts`` without a code filter only ever returns the
        open catalogue (closed codes must be queried individually), so this is
        the listing the synchronization mirrors into the discount store. Pages
        are walked until ``totalCount`` is exhausted.
        """
        logger.info(
            "list_flex_discounts: market_segment=%s country=%s authorization=%s",
            market_segment,
            country,
            authorization_id,
        )
        authorization = self._transport.settings.get_authorization(authorization_id)
        return self._collect_flex_discounts(
            authorization,
            "/v3/flex-discounts",
            {"market-segment": market_segment, "country": country},
        )

    @wrap_http_error
    def get_flex_discounts(self, authorization_id: str, customer_id: str) -> list[dict[str, Any]]:
        """Retrieve the reusable flexible discounts the customer already holds.

        ``GET /v3/customers/{customer_id}/flex-discounts`` returns the customer's
        held reusables in the ``ACTIVE`` or ``REUSABLE`` state — the catalogue
        that enriches the inherited discounts surfaced at renewal (code, name,
        values and ``discountLockEndDate``). The endpoint only accepts ``limit``
        and ``offset``; pages are walked until ``totalCount`` is exhausted.
        """
        logger.info(
            "get_flex_discounts: customer=%s authorization=%s", customer_id, authorization_id
        )
        authorization = self._transport.settings.get_authorization(authorization_id)
        return self._collect_flex_discounts(
            authorization, f"/v3/customers/{customer_id}/flex-discounts", {}
        )

    def _collect_flex_discounts(
        self, authorization: Any, path: str, query: dict[str, Any]
    ) -> list[dict[str, Any]]:
        """Walk a paginated flex-discounts listing until ``totalCount`` is exhausted."""
        discounts: list[dict[str, Any]] = []
        offset = 0
        while True:
            page = self._transport.request(
                "GET",
                authorization,
                path,
                params={**query, "limit": _PAGE_LIMIT, "offset": offset},
            )
            page_items = page.get("flexDiscounts") or []
            discounts.extend(page_items)
            offset += len(page_items)
            if not page_items or offset >= page.get("totalCount", 0):
                return discounts
