import http
from urllib.parse import parse_qs, urlparse

import pytest
import responses

from adobe.errors import AdobeAPIError

_FLEX_DISCOUNTS_URL = "https://api.adobe.io/v3/flex-discounts"
_CUSTOMER_FLEX_DISCOUNTS_URL = "https://api.adobe.io/v3/customers/CUST-000/flex-discounts"


def _page(page_items, total_count, offset):
    return {
        "limit": 50,
        "offset": offset,
        "count": len(page_items),
        "totalCount": total_count,
        "flexDiscounts": page_items,
    }


@responses.activate
def test_list_flex_discounts_passes_segment_and_country_params(adobe_client):
    responses.get(
        _FLEX_DISCOUNTS_URL,
        json=_page([{"code": "INTRO-PHSP"}], 1, 0),
        status=http.HTTPStatus.OK,
    )

    result = adobe_client.discount.list_flex_discounts("AUT-1234-5678", "COM", "US")

    query = parse_qs(urlparse(responses.calls[0].request.url).query)
    assert result == [{"code": "INTRO-PHSP"}]
    assert query["market-segment"] == ["COM"]
    assert query["country"] == ["US"]
    assert query["limit"] == ["50"]
    assert query["offset"] == ["0"]


@responses.activate
def test_list_flex_discounts_walks_every_page(adobe_client):
    responses.get(
        _FLEX_DISCOUNTS_URL,
        json=_page([{"code": "CODE-A"}, {"code": "CODE-B"}], 3, 0),
        status=http.HTTPStatus.OK,
    )
    responses.get(
        _FLEX_DISCOUNTS_URL,
        json=_page([{"code": "CODE-C"}], 3, 2),
        status=http.HTTPStatus.OK,
    )

    result = adobe_client.discount.list_flex_discounts("AUT-1234-5678", "COM", "US")

    second_query = parse_qs(urlparse(responses.calls[1].request.url).query)
    assert [discount["code"] for discount in result] == ["CODE-A", "CODE-B", "CODE-C"]
    assert second_query["offset"] == ["2"]


@responses.activate
def test_list_flex_discounts_returns_empty_catalogue(adobe_client):
    empty_page = _page([], 0, 0)
    responses.get(_FLEX_DISCOUNTS_URL, json=empty_page, status=http.HTTPStatus.OK)

    result = adobe_client.discount.list_flex_discounts("AUT-1234-5678", "GOV", "CA")

    assert result == []


@responses.activate
def test_list_flex_discounts_stops_when_a_page_comes_back_empty(adobe_client):
    responses.get(
        _FLEX_DISCOUNTS_URL,
        json=_page([{"code": "CODE-A"}], 5, 0),
        status=http.HTTPStatus.OK,
    )
    short_page = _page([], 5, 1)
    responses.get(_FLEX_DISCOUNTS_URL, json=short_page, status=http.HTTPStatus.OK)

    result = adobe_client.discount.list_flex_discounts("AUT-1234-5678", "COM", "US")

    assert [discount["code"] for discount in result] == ["CODE-A"]
    assert len(responses.calls) == 2


@responses.activate
def test_list_flex_discounts_raises_adobe_api_error_on_http_error(adobe_client):
    responses.get(
        _FLEX_DISCOUNTS_URL,
        json={"code": "1000", "message": "Bad request"},
        status=http.HTTPStatus.BAD_REQUEST,
    )

    with pytest.raises(AdobeAPIError) as exc_info:
        adobe_client.discount.list_flex_discounts("AUT-1234-5678", "COM", "US")

    assert exc_info.value.status_code == http.HTTPStatus.BAD_REQUEST


@responses.activate
def test_get_flex_discounts_calls_customer_scoped_url_with_paging_params(adobe_client):
    responses.get(
        _CUSTOMER_FLEX_DISCOUNTS_URL,
        json=_page([{"code": "BLACK_FRIDAY", "status": "REUSABLE"}], 1, 0),
        status=http.HTTPStatus.OK,
    )

    result = adobe_client.discount.get_flex_discounts("AUT-1234-5678", "CUST-000")

    query = parse_qs(urlparse(responses.calls[0].request.url).query)
    assert result == [{"code": "BLACK_FRIDAY", "status": "REUSABLE"}]
    assert query["limit"] == ["50"]
    assert query["offset"] == ["0"]
    assert "market-segment" not in query
    assert "country" not in query


@responses.activate
def test_get_flex_discounts_walks_every_page(adobe_client):
    responses.get(
        _CUSTOMER_FLEX_DISCOUNTS_URL,
        json=_page([{"code": "CODE-A"}, {"code": "CODE-B"}], 3, 0),
        status=http.HTTPStatus.OK,
    )
    responses.get(
        _CUSTOMER_FLEX_DISCOUNTS_URL,
        json=_page([{"code": "CODE-C"}], 3, 2),
        status=http.HTTPStatus.OK,
    )

    result = adobe_client.discount.get_flex_discounts("AUT-1234-5678", "CUST-000")

    second_query = parse_qs(urlparse(responses.calls[1].request.url).query)
    assert [discount["code"] for discount in result] == ["CODE-A", "CODE-B", "CODE-C"]
    assert second_query["offset"] == ["2"]


@responses.activate
def test_get_flex_discounts_returns_empty_when_customer_holds_none(adobe_client):
    empty_page = _page([], 0, 0)
    responses.get(_CUSTOMER_FLEX_DISCOUNTS_URL, json=empty_page, status=http.HTTPStatus.OK)

    result = adobe_client.discount.get_flex_discounts("AUT-1234-5678", "CUST-000")

    assert result == []


@responses.activate
def test_get_flex_discounts_raises_adobe_api_error_on_http_error(adobe_client):
    responses.get(
        _CUSTOMER_FLEX_DISCOUNTS_URL,
        json={"code": "4115", "message": "Api Key is invalid or missing"},
        status=http.HTTPStatus.FORBIDDEN,
    )

    with pytest.raises(AdobeAPIError) as exc_info:
        adobe_client.discount.get_flex_discounts("AUT-1234-5678", "CUST-000")

    assert exc_info.value.status_code == http.HTTPStatus.FORBIDDEN
