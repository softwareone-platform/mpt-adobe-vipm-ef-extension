from http import HTTPStatus

import pytest
from mpt_extension_sdk.api import ErrorDetail, ValidationError

from adobe.errors import AdobeAPIError
from mpt_adobe_vipm_ef.services.discount_preview import preview_with_discounts

_SUBSCRIPTION_ID = "adobe-sub-1"


def _line(**overrides):
    return {"extLineItemNumber": 1, "subscriptionId": _SUBSCRIPTION_ID, **overrides}


async def test_preview_rejects_unconfirmed_code_ignoring_unselected_refusal(mocker):
    preview = {
        "lineItems": [
            {
                "extLineItemNumber": 1,
                "subscriptionId": _SUBSCRIPTION_ID,
                "flexDiscounts": [{"code": "NOT_SENT", "result": "FAILURE"}],
            }
        ]
    }
    quote = mocker.AsyncMock(return_value=preview)

    with pytest.raises(ValidationError) as rejection:
        await preview_with_discounts(quote, [_line(flexDiscountCodes=["SENT"])])

    assert rejection.value.errors == [
        ErrorDetail(pointer=f"{_SUBSCRIPTION_ID}/flexDiscountCodes/SENT", detail="")
    ]
    assert quote.await_count == 2


async def test_preview_points_refusal_at_the_given_row(mocker):
    preview = {
        "lineItems": [
            {"extLineItemNumber": 1, "flexDiscounts": [{"code": "SENT", "result": "FAILURE"}]}
        ]
    }
    quote = mocker.AsyncMock(side_effect=[preview, {"lineItems": []}])

    with pytest.raises(ValidationError) as rejection:
        await preview_with_discounts(quote, [_line(flexDiscountCodes=["SENT"])], {1: "ROW-1"})

    assert rejection.value.errors == [
        ErrorDetail(pointer="ROW-1/flexDiscountCodes/SENT", detail="FAILURE")
    ]


async def test_preview_rejects_refused_line_without_codes(mocker):
    error = AdobeAPIError(
        HTTPStatus.BAD_REQUEST,
        {
            "code": "2147",
            "message": "Customer is not qualified for the Flexible Discount",
            "additionalDetails": ["Line Item: 1"],
        },
    )
    quote = mocker.AsyncMock(side_effect=error)

    with pytest.raises(ValidationError) as rejection:
        await preview_with_discounts(quote, [_line()])

    assert rejection.value.errors == [ErrorDetail(pointer=_SUBSCRIPTION_ID, detail="2147")]
    quote.assert_awaited_once()
