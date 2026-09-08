from mpt_adobe_vipm_ef.services.inherited_discounts import (
    InheritedDiscount,
    build_inherited_discounts,
    serialize_inherited_discounts,
)

_OFFER_ID = "65304470CA01A12"
_ADOBE_SUBSCRIPTION_ID = "adobe-sub-1"
_CODE = "BLACK_FRIDAY"


def _held(*, code=_CODE, name="Black Friday", amount=10):
    return {
        "id": "adobe-discount-1",
        "code": code,
        "name": name,
        "description": f"{code} description",
        "status": "REUSABLE",
        "discountLockEndDate": "2028-03-31T23:59:59Z",
        "outcomes": [
            {"type": "FIXED_DISCOUNT", "discountValues": [{"currency": "USD", "value": amount}]}
        ],
    }


def _automated_preview(line_items):
    return {"orderType": "PREVIEW_RENEWAL", "lineItems": line_items}


def _line(offer_id, flex_discounts, *, subscription_id=""):
    return {
        "extLineItemNumber": 1,
        "offerId": offer_id,
        "subscriptionId": subscription_id,
        "flexDiscounts": flex_discounts,
    }


def test_build_inherited_discounts_returns_empty_when_no_preview():
    result = build_inherited_discounts(None, [_held()])

    assert result == {}


def test_build_inherited_discounts_maps_and_enriches_by_code():
    preview = _automated_preview([
        _line(_OFFER_ID, [{"id": "adobe-discount-1", "code": _CODE, "result": "SUCCESS"}])
    ])

    result = build_inherited_discounts(preview, [_held()])

    assert result[_OFFER_ID][0] == InheritedDiscount(
        offer_id=_OFFER_ID,
        code=_CODE,
        adobe_id="adobe-discount-1",
        subscription_id="",
        eligible=True,
        name="Black Friday",
        description=f"{_CODE} description",
        discount_lock_end_date="2028-03-31T23:59:59Z",
        discount_values=[{"currency": "USD", "value": 10}],
    )


def test_build_inherited_discounts_marks_failure_as_not_eligible():
    preview = _automated_preview([
        _line(_OFFER_ID, [{"id": "adobe-discount-1", "code": _CODE, "result": "FAILURE"}])
    ])

    result = build_inherited_discounts(preview, [_held()])

    assert result[_OFFER_ID][0].eligible is False


def test_build_inherited_discounts_leaves_enrichment_empty_without_a_catalogue_match():
    preview = _automated_preview([
        _line(_OFFER_ID, [{"id": "adobe-discount-1", "code": "UNKNOWN", "result": "SUCCESS"}])
    ])

    result = build_inherited_discounts(preview, [_held()])

    discount = result[_OFFER_ID][0]
    assert discount.code == "UNKNOWN"
    assert not discount.name
    assert discount.discount_values == []


def test_build_inherited_discounts_skips_lines_without_flex_discounts():
    preview = _automated_preview([_line(_OFFER_ID, [])])

    result = build_inherited_discounts(preview, [_held()])

    assert result == {}


def test_serialize_inherited_discounts_produces_the_wizard_payload():
    inherited = {
        _OFFER_ID: [
            InheritedDiscount(
                offer_id=_OFFER_ID,
                code=_CODE,
                adobe_id="adobe-discount-1",
                subscription_id=_ADOBE_SUBSCRIPTION_ID,
                eligible=True,
                name="Black Friday",
                description="desc",
                discount_lock_end_date="2028-03-31T23:59:59Z",
                discount_values=[{"currency": "USD", "value": 10}],
            )
        ]
    }

    result = serialize_inherited_discounts(inherited)

    assert result == [
        {
            "offerId": _OFFER_ID,
            "subscriptionId": _ADOBE_SUBSCRIPTION_ID,
            "code": _CODE,
            "adobeId": "adobe-discount-1",
            "eligible": True,
            "name": "Black Friday",
            "description": "desc",
            "discountLockEndDate": "2028-03-31T23:59:59Z",
            "discountValues": [{"currency": "USD", "value": 10}],
        }
    ]
