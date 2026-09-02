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
    def list_flex_discounts(  # noqa: WPS210
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
        discounts: list[dict[str, Any]] = []
        offset = 0
        while True:
            page = self._transport.request(
                "GET",
                authorization,
                "/v3/flex-discounts",
                params={
                    "market-segment": market_segment,
                    "country": country,
                    "limit": _PAGE_LIMIT,
                    "offset": offset,
                },
            )
            page_items = page.get("flexDiscounts") or []
            discounts.extend(page_items)
            offset += len(page_items)
            total_count = page.get("totalCount", 0)
            if not page_items or offset >= total_count:
                return discounts
