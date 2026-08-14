import pytest

from mpt_adobe_vipm_ef.models.discount import (
    DiscountCodeCreateRequest,
    DiscountCodeUpdateRequest,
)

_TARGET_OFFER_ID = "65322651CA02A12"
_PERCENTAGE_VALUE = 20
_PERCENTAGE_ABOVE_LIMIT = 101


def _payload(**overrides):
    payload = {
        "name": "Summer 2025",
        "description": "20% off for renewals",
        "category": "STANDARD",
        "discountType": "PERCENTAGE",
        "value": 20,
        "startDate": "2026-06-01T00:00:00Z",
        "endDate": "2026-08-31T23:59:59Z",
        "reusable": False,
        "targetOfferIds": [_TARGET_OFFER_ID],
        "applicableOrderTypes": ["RENEWAL"],
    }
    payload.update(overrides)
    return payload


def test_update_request_maps_aliases():
    result = DiscountCodeUpdateRequest.model_validate(_payload(supports3yc=True))

    assert result.discount_type == "PERCENTAGE"
    assert result.amount == _PERCENTAGE_VALUE
    assert result.target_offer_ids == [_TARGET_OFFER_ID]
    assert result.supports_three_yc is True
    assert result.is_reusable is False


def test_create_request_requires_code():
    with pytest.raises(ValueError, match="code"):
        DiscountCodeCreateRequest.model_validate(_payload())


def test_create_request_strips_code():
    result = DiscountCodeCreateRequest.model_validate(_payload(code="  SUMMER25  "))

    assert result.code == "SUMMER25"


def test_percentage_value_above_limit_is_rejected():
    with pytest.raises(ValueError, match="between 1 and 100"):
        DiscountCodeUpdateRequest.model_validate(_payload(value=_PERCENTAGE_ABOVE_LIMIT))


def test_fixed_discount_requires_currency():
    with pytest.raises(ValueError, match="currency"):
        DiscountCodeUpdateRequest.model_validate(_payload(discountType="FIXED_DISCOUNT"))


def test_fixed_discount_with_currency_is_accepted():
    result = DiscountCodeUpdateRequest.model_validate(
        _payload(discountType="FIXED_DISCOUNT", currency="USD")
    )

    assert result.currency == "USD"


def test_start_date_must_precede_end_date():
    with pytest.raises(ValueError, match="before the end date"):
        DiscountCodeUpdateRequest.model_validate(_payload(startDate="2026-09-01T00:00:00Z"))


def test_reusable_requires_lock_end_date():
    with pytest.raises(ValueError, match="lock end date"):
        DiscountCodeUpdateRequest.model_validate(_payload(reusable=True))


def test_non_reusable_rejects_lock_end_date():
    with pytest.raises(ValueError, match="not allowed for non-reusable"):
        DiscountCodeUpdateRequest.model_validate(
            _payload(reusable=False, discountLockEndDate="2028-03-31T23:59:59Z")
        )


def test_lock_end_date_must_follow_end_date():
    with pytest.raises(ValueError, match="after the end date"):
        DiscountCodeUpdateRequest.model_validate(
            _payload(reusable=True, discountLockEndDate="2026-07-01T00:00:00Z")
        )


def test_lock_end_date_derives_reusability():
    result = DiscountCodeUpdateRequest.model_validate(
        _payload(reusable=True, discountLockEndDate="2028-03-31T23:59:59Z")
    )

    assert result.is_reusable is True


def test_intro_category_rejects_renewal_order_types():
    with pytest.raises(ValueError, match="net-new"):
        DiscountCodeUpdateRequest.model_validate(_payload(category="INTRO"))


def test_intro_category_accepts_new_order_type():
    result = DiscountCodeUpdateRequest.model_validate(
        _payload(category="INTRO", applicableOrderTypes=["NEW"])
    )

    assert result.category == "INTRO"


def test_unknown_order_type_is_rejected():
    with pytest.raises(ValueError, match="applicableOrderTypes"):
        DiscountCodeUpdateRequest.model_validate(_payload(applicableOrderTypes=["ADD_SEATS"]))


def test_blank_target_offer_id_is_rejected():
    with pytest.raises(ValueError, match="part numbers"):
        DiscountCodeUpdateRequest.model_validate(_payload(targetOfferIds=["  "]))
