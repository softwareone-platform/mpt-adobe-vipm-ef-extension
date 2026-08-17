import http

import pytest
from freezegun import freeze_time
from mpt_extension_sdk.api.auth.context import Account, AccountType, AuthContext
from mpt_extension_sdk.api.errors import (
    ForbiddenError,
    NotFoundError,
    UpstreamServiceError,
    ValidationError,
)
from mpt_extension_sdk.api.pagination import Pagination
from mpt_extension_sdk.models import Agreement
from requests import ConnectionError as RequestsConnectionError

from mpt_adobe_vipm_ef.constants import CUSTOMER_ID_PARAM
from mpt_adobe_vipm_ef.models.discount import DiscountCodeCreateRequest, DiscountCodeUpdateRequest
from mpt_adobe_vipm_ef.models.product import ProductSegment
from mpt_adobe_vipm_ef.routers.api.discounts import (
    create_discount_code,
    delete_discount_code,
    get_discount_code,
    list_discount_codes,
    update_discount_code,
)

_FAKE_JWT = "fake-token"
_AGREEMENT_ID = "AGR-1234-5678"
_PRODUCT_ID = "PRD-1111-1111"
_CUSTOMER_ID = "CUST-001"
_RECORD_ID = "rec123"
_TARGET_OFFER_ID = "65322651CA02A12"


def _agreement_payload():
    return {
        "id": _AGREEMENT_ID,
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
        "product": {"id": _PRODUCT_ID, "name": "Dummy Product"},
        "authorization": {"id": "AUT-123", "name": "Dummy Authorization", "currency": "USD"},
        "parameters": {"fulfillment": [{"externalId": CUSTOMER_ID_PARAM, "value": _CUSTOMER_ID}]},
    }


def _body_payload(**overrides):
    payload = {
        "code": "SUMMER25",
        "name": "Summer 2025",
        "category": "STANDARD",
        "discountType": "PERCENTAGE",
        "value": 20,
        "startDate": "2026-06-01T00:00:00Z",
        "endDate": "2026-08-31T23:59:59Z",
        "targetOfferIds": [_TARGET_OFFER_ID],
        "applicableOrderTypes": ["RENEWAL"],
    }
    payload.update(overrides)
    return payload


def _create_body(**overrides):
    return DiscountCodeCreateRequest.model_validate(_body_payload(**overrides))


def _update_body(**overrides):
    payload = _body_payload(**overrides)
    payload.pop("code", None)
    return DiscountCodeUpdateRequest.model_validate(payload)


class FakeAgreements:
    """Fake agreements service returning a preset agreement."""

    def __init__(self, agreement):
        self.agreement = agreement

    async def get_by_id(self, agreement_id):
        return self.agreement


class FakeMPTApiService:
    def __init__(self, agreements):
        self.agreements = agreements


class FakeExtSettings:
    """Fake settings exposing the fields the discount endpoints read."""

    def __init__(self, product_ids, product_segments):
        self.product_ids = product_ids
        self.product_segments = product_segments


class FakeRequest:
    """Fake request context exposing query parameters and pagination."""

    def __init__(self, query):
        self.query = query

    @property
    def pagination(self):
        return Pagination.from_query(self.query)


class FakeDiscountContext:
    """Fake API context mirroring the fields the discount handlers read."""

    def __init__(self, agreement, account_type=AccountType.OPERATIONS, query=None):
        self.mpt_api_service = FakeMPTApiService(FakeAgreements(agreement))
        self.ext_settings = FakeExtSettings(
            product_ids=(_PRODUCT_ID,),
            product_segments=(ProductSegment(id=_PRODUCT_ID, segment="COM"),),
        )
        self.state = {}
        self.auth = AuthContext(
            token=_FAKE_JWT,
            account=Account(id="ACC-0001", type=account_type),
            permissions={},
            extension_id="EXT-0001",
        )
        self.request = FakeRequest({"agreement": _AGREEMENT_ID, **(query or {})})


@pytest.fixture
def agreement():
    return Agreement.from_payload(_agreement_payload())


@pytest.fixture
def fake_store(mocker, code_record_factory):
    store = mocker.Mock()
    store.list_codes.return_value = [code_record_factory()]
    store.get_code.return_value = code_record_factory()
    store.find_code.return_value = None
    store.create_code.return_value = code_record_factory()
    store.update_code.return_value = code_record_factory()
    store.replace_value.return_value = None
    store.list_values.return_value = [
        {
            "id": "recV",
            "fields": {"code": "SUMMER25", "country": "US", "currency": "USD", "value": 20},
        },
    ]
    store.list_redemptions.return_value = []
    mocker.patch(
        "mpt_adobe_vipm_ef.services.discount_codes.DiscountStore.from_settings",
        return_value=store,
    )
    return store


async def test_list_returns_paginated_codes_with_values(agreement, fake_store):
    ctx = FakeDiscountContext(agreement)

    result = await list_discount_codes(ctx=ctx)

    expected_values = [{"country": "US", "currency": "USD", "value": 20}]
    assert result.status_code == http.HTTPStatus.OK
    assert result.paginated_result.total == 1
    assert result.payload[0]["code"] == "SUMMER25"
    assert result.payload[0]["values"] == expected_values
    fake_store.list_codes.assert_called_once_with("COM", _CUSTOMER_ID)


@freeze_time("2026-07-21T12:00:00Z")
async def test_list_keeps_only_the_codes_the_order_type_can_apply(
    agreement, fake_store, code_record_factory
):
    fake_store.list_codes.return_value = [
        code_record_factory(),
        code_record_factory(applicable_order_types=["NEW"]),
        code_record_factory(end_date="2026-07-01T00:00:00Z"),
    ]
    ctx = FakeDiscountContext(agreement, query={"orderType": "RENEWAL"})

    result = await list_discount_codes(ctx=ctx)

    assert result.paginated_result.total == 1
    assert len(result.payload) == 1


@freeze_time("2026-07-21T12:00:00Z")
async def test_list_without_order_type_keeps_every_code(agreement, fake_store, code_record_factory):
    fake_store.list_codes.return_value = [
        code_record_factory(applicable_order_types=["NEW"]),
        code_record_factory(end_date="2026-07-01T00:00:00Z"),
    ]
    ctx = FakeDiscountContext(agreement)

    result = await list_discount_codes(ctx=ctx)

    assert result.paginated_result.total == 2


async def test_list_rejects_an_unsupported_order_type(agreement, fake_store):
    ctx = FakeDiscountContext(agreement, query={"orderType": "TRANSFER"})

    with pytest.raises(ValidationError):
        await list_discount_codes(ctx=ctx)

    fake_store.list_codes.assert_not_called()


async def test_list_requires_agreement_query_parameter(agreement, fake_store):
    ctx = FakeDiscountContext(agreement)
    ctx.request = FakeRequest({})

    with pytest.raises(ValidationError):
        await list_discount_codes(ctx=ctx)


async def test_list_maps_store_failures_to_upstream_error(agreement, fake_store):
    ctx = FakeDiscountContext(agreement)
    fake_store.list_codes.side_effect = RequestsConnectionError("boom")

    with pytest.raises(UpstreamServiceError):
        await list_discount_codes(ctx=ctx)


async def test_get_returns_one_discount(agreement, fake_store):
    ctx = FakeDiscountContext(agreement)

    result = await get_discount_code(discount_id=_RECORD_ID, ctx=ctx)

    assert result.status_code == http.HTTPStatus.OK
    assert result.payload["id"] == _RECORD_ID


async def test_get_hides_missing_record_as_not_found(agreement, fake_store):
    ctx = FakeDiscountContext(agreement)
    fake_store.get_code.return_value = None

    with pytest.raises(NotFoundError):
        await get_discount_code(discount_id=_RECORD_ID, ctx=ctx)


async def test_get_hides_retired_record_as_not_found(agreement, fake_store, code_record_factory):
    ctx = FakeDiscountContext(agreement)
    fake_store.get_code.return_value = code_record_factory(retired_at="2026-07-01T00:00:00Z")

    with pytest.raises(NotFoundError):
        await get_discount_code(discount_id=_RECORD_ID, ctx=ctx)


async def test_create_rejects_client_accounts(agreement, fake_store):
    ctx = FakeDiscountContext(agreement, account_type=AccountType.CLIENT)

    with pytest.raises(ForbiddenError):
        await create_discount_code(ctx=ctx, body=_create_body())


async def test_create_rejects_duplicate_codes(agreement, fake_store, code_record_factory):
    ctx = FakeDiscountContext(agreement)
    fake_store.find_code.return_value = code_record_factory()

    with pytest.raises(ValidationError):
        await create_discount_code(ctx=ctx, body=_create_body())


async def test_create_returns_created_payload(agreement, fake_store):
    ctx = FakeDiscountContext(agreement)

    result = await create_discount_code(ctx=ctx, body=_create_body())

    expected_values = [{"country": "US", "currency": "USD", "value": 20}]
    assert result.status_code == http.HTTPStatus.CREATED
    assert result.payload["code"] == "SUMMER25"
    assert result.payload["values"] == expected_values


async def test_create_stores_code_and_value_row(agreement, fake_store):
    ctx = FakeDiscountContext(agreement)

    await create_discount_code(ctx=ctx, body=_create_body())

    created_fields = fake_store.create_code.call_args.args[0]
    expected_value_fields = {
        "code": "SUMMER25",
        "market_segment": "COM",
        "country": "US",
        "currency": "USD",
        "value": 20,
    }
    assert created_fields["source"] == "Ops/Vendor"
    assert created_fields["market_segment"] == "COM"
    assert created_fields["target_customer_id"] == _CUSTOMER_ID
    fake_store.replace_value.assert_called_once_with("SUMMER25", "COM", expected_value_fields)


async def test_update_rejects_open_codes(agreement, fake_store, code_record_factory):
    ctx = FakeDiscountContext(agreement)
    fake_store.get_code.return_value = code_record_factory(source="API")

    with pytest.raises(ValidationError):
        await update_discount_code(discount_id=_RECORD_ID, ctx=ctx, body=_update_body())


async def test_update_rewrites_code_and_value_rows(agreement, fake_store):
    ctx = FakeDiscountContext(agreement)

    result = await update_discount_code(
        discount_id=_RECORD_ID, ctx=ctx, body=_update_body(name="Summer 2025 v2")
    )

    assert result.status_code == http.HTTPStatus.OK
    updated_fields = fake_store.update_code.call_args.args[1]
    assert updated_fields["name"] == "Summer 2025 v2"
    assert "Code" not in updated_fields
    fake_store.replace_value.assert_called_once()


async def test_delete_soft_deletes_closed_code(agreement, fake_store):
    ctx = FakeDiscountContext(agreement)

    result = await delete_discount_code(discount_id=_RECORD_ID, ctx=ctx)

    assert result.status_code == http.HTTPStatus.NO_CONTENT
    update_args = fake_store.update_code.call_args.args
    assert update_args[0] == _RECORD_ID
    assert "retired_at" in update_args[1]


async def test_delete_rejects_client_accounts(agreement, fake_store):
    ctx = FakeDiscountContext(agreement, account_type=AccountType.CLIENT)

    with pytest.raises(ForbiddenError):
        await delete_discount_code(discount_id=_RECORD_ID, ctx=ctx)


async def test_endpoints_reject_unsupported_products(agreement, fake_store):
    payload = _agreement_payload()
    payload["product"]["id"] = "PRD-9999-9999"
    ctx = FakeDiscountContext(Agreement.from_payload(payload))

    with pytest.raises(ForbiddenError):
        await list_discount_codes(ctx=ctx)


async def test_endpoints_reject_products_without_market_segment(agreement, fake_store):
    ctx = FakeDiscountContext(agreement)
    ctx.ext_settings = FakeExtSettings(
        product_ids=(_PRODUCT_ID,),
        product_segments=(ProductSegment(id="PRD-9999-9999", segment="GOV"),),
    )

    with pytest.raises(ValidationError, match="no configured market segment"):
        await list_discount_codes(ctx=ctx)
