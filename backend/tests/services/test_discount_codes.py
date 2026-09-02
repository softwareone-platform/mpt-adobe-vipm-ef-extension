import asyncio

import pytest
from mpt_extension_sdk.api.errors import ValidationError
from mpt_extension_sdk.models import Agreement

from mpt_adobe_vipm_ef.models.discount import (
    DiscountCodeUpdateRequest,
    DiscountScope,
    DiscountType,
)
from mpt_adobe_vipm_ef.services import discount_codes

_CODE = "SUMMER25"
_MARKET_SEGMENT = "COM"
_CUSTOMER_ID = "CUST-001"
_HOLD_SECONDS = 0.05


def _agreement_payload():
    return {
        "id": "AGR-1234-5678",
        "name": "Dummy Agreement",
        "status": "Active",
        "client": {"id": "ACC-0000-0001", "name": "Dummy Client"},
        "licensee": {
            "id": "LCE-0000-0001",
            "name": "Dummy Licensee",
            "status": "active",
            "address": {
                "addressLine1": "1 Main St",
                "city": "Boston",
                "country": "US",
                "postCode": "02108",
                "state": "MA",
            },
        },
        "product": {"id": "PRD-1111-1111", "name": "Dummy Product"},
        "authorization": {"id": "AUT-123", "name": "Dummy Authorization", "currency": "USD"},
    }


def _scope(payload):
    return DiscountScope(
        agreement=Agreement.from_payload(payload),
        market_segment=_MARKET_SEGMENT,
        customer_id=_CUSTOMER_ID,
    )


def _update_body(**overrides):
    payload = {
        "name": "Summer 2025",
        "category": "STANDARD",
        "discountType": "PERCENTAGE",
        "value": 20,
        "startDate": "2026-06-01T00:00:00Z",
        "endDate": "2026-08-31T23:59:59Z",
        "targetOfferIds": ["65322651CA02A12"],
        "applicableOrderTypes": ["RENEWAL"],
    }
    payload.update(overrides)
    return DiscountCodeUpdateRequest.model_validate(payload)


async def _run_critical_section(scope, events, tag):
    async with discount_codes.guard_code_creation(scope, _CODE):
        events.append(f"enter-{tag}")
        await asyncio.sleep(0)  # yield so an unguarded section would interleave
        events.append(f"exit-{tag}")


async def _hold_code(scope, inside, code):
    async with discount_codes.guard_code_creation(scope, code):
        inside.set()
        await asyncio.sleep(_HOLD_SECONDS)


async def _enter_after(scope, inside, code):
    await asyncio.wait_for(inside.wait(), timeout=1)
    async with discount_codes.guard_code_creation(scope, code):
        return True


def test_resolve_value_fields_builds_row_from_scope():
    result = discount_codes.resolve_value_fields(
        _scope(_agreement_payload()),
        _CODE,
        _update_body(discountType="FIXED_DISCOUNT", currency="USD"),
    )

    assert result == {
        "code": _CODE,
        "market_segment": _MARKET_SEGMENT,
        "country": "US",
        "currency": "USD",
        "value": 20,
    }


def test_resolve_value_fields_percentage_is_country_agnostic():
    result = discount_codes.resolve_value_fields(
        _scope(_agreement_payload()), _CODE, _update_body()
    )

    assert result == {
        "code": _CODE,
        "market_segment": _MARKET_SEGMENT,
        "value": 20,
    }


def test_resolve_value_fields_percentage_needs_no_licensee_country():
    payload = _agreement_payload()
    payload["licensee"].pop("address")

    result = discount_codes.resolve_value_fields(_scope(payload), _CODE, _update_body())

    assert result == {
        "code": _CODE,
        "market_segment": _MARKET_SEGMENT,
        "value": 20,
    }


def test_resolve_value_fields_prefers_body_currency_over_scope():
    result = discount_codes.resolve_value_fields(
        _scope(_agreement_payload()),
        _CODE,
        _update_body(discountType="FIXED_DISCOUNT", currency="EUR"),
    )

    assert result["currency"] == "EUR"


def test_resolve_value_fields_requires_licensee_country():
    payload = _agreement_payload()
    payload["licensee"].pop("address")

    with pytest.raises(ValidationError, match="no country"):
        discount_codes.resolve_value_fields(
            _scope(payload), _CODE, _update_body(discountType="FIXED_DISCOUNT", currency="USD")
        )


def test_resolve_value_fields_requires_currency():
    payload = _agreement_payload()
    payload.pop("authorization")
    body = DiscountCodeUpdateRequest.model_construct(
        discount_type=DiscountType.FIXED_DISCOUNT,
        currency=None,
        amount=_update_body().amount,
    )

    with pytest.raises(ValidationError, match="currency is required"):
        discount_codes.resolve_value_fields(_scope(payload), _CODE, body)


async def test_guard_code_creation_serializes_same_pair():
    scope = _scope(_agreement_payload())
    events = []

    await asyncio.gather(
        _run_critical_section(scope, events, "a"),
        _run_critical_section(scope, events, "b"),
    )

    # Neither task enters while the other holds the pair: no interleaving.
    assert events in (
        ["enter-a", "exit-a", "enter-b", "exit-b"],
        ["enter-b", "exit-b", "enter-a", "exit-a"],
    )


async def test_guard_code_creation_allows_distinct_pairs_concurrently():
    scope = _scope(_agreement_payload())
    inside = asyncio.Event()

    _, entered = await asyncio.gather(
        _hold_code(scope, inside, "FIRST"),
        _enter_after(scope, inside, "SECOND"),
    )

    assert entered is True


async def test_guard_code_creation_cleans_up_registry():
    scope = _scope(_agreement_payload())

    async with discount_codes.guard_code_creation(scope, _CODE):
        assert (_CODE, _MARKET_SEGMENT) in discount_codes._create_locks

    assert (_CODE, _MARKET_SEGMENT) not in discount_codes._create_locks
    assert (_CODE, _MARKET_SEGMENT) not in discount_codes._create_lock_waiters
