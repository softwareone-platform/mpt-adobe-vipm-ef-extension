from http import HTTPStatus
from types import SimpleNamespace

import pytest
from mpt_extension_sdk.errors.pipeline import FailError
from requests import HTTPError

from adobe.errors import AdobeAPIError, AuthorizationNotFoundError
from mpt_adobe_vipm_ef.services import discount_sync

_AUTH_ID = "AUT-1234-5678"
_OTHER_AUTH_ID = "AUT-8765-4321"
_COUNTRY = "US"
_SEGMENTS = ("COM", "EDU", "GOV")


def _flex_discount():
    """An Adobe flex discount as ``GET /v3/flex-discounts`` returns it."""
    return {
        "id": "55555555-313b-476c-9d0b-6a610d5b91e0",
        "category": "STANDARD",
        "code": "SUMMER25",
        "name": "Summer 2025",
        "status": "ACTIVE",
        "startDate": "2026-06-01T00:00:00Z",
        "endDate": "2026-08-31T23:59:59Z",
        "qualification": {"baseOfferIds": ["65322651CA02A12"]},
        "outcomes": [
            {
                "type": "PERCENTAGE_DISCOUNT",
                "discountValues": [{"country": _COUNTRY, "currency": "USD", "value": 20}],
            }
        ],
    }


class FakeAuthorizationsQuery:
    """Fake catalog authorizations accessor yielding preset authorizations."""

    def __init__(self, authorizations):
        self.authorizations = authorizations
        self.filters = []
        self.selects = []

    def filter(self, query):
        self.filters.append(query)
        return self

    def select(self, *fields):
        self.selects.append(fields)
        return self

    def iterate(self):
        return self._yield_authorizations()

    async def _yield_authorizations(self):
        for authorization in self.authorizations:
            yield authorization


def _authorization(auth_id=_AUTH_ID, country=_COUNTRY):
    address = SimpleNamespace(country=country) if country else SimpleNamespace()
    return SimpleNamespace(id=auth_id, owner=SimpleNamespace(address=address))


@pytest.fixture
def authorizations_query():
    return FakeAuthorizationsQuery([_authorization()])


@pytest.fixture
def settings(mocker):
    fake_settings = mocker.Mock()
    fake_settings.product_ids = ("PRD-1111-1111",)
    fake_settings.get_authorization.return_value = mocker.Mock(client_id="adobe-client-1")
    return fake_settings


@pytest.fixture
def ctx(mocker, authorizations_query, settings):
    catalog = SimpleNamespace(authorizations=authorizations_query)
    return SimpleNamespace(
        ext_settings=settings,
        logger=mocker.Mock(),
        task=SimpleNamespace(progress=mocker.AsyncMock()),
        mpt_api_service=SimpleNamespace(client=SimpleNamespace(catalog=catalog)),
    )


@pytest.fixture
def store(mocker):
    fake_store = mocker.Mock()
    fake_store.find_code.return_value = None
    store_class = mocker.patch("mpt_adobe_vipm_ef.services.discount_sync.DiscountStore")
    store_class.from_settings.return_value = fake_store
    return fake_store


@pytest.fixture
def adobe_client(mocker):
    client = mocker.Mock()
    client.discount.list_flex_discounts.return_value = [_flex_discount()]
    mocker.patch("mpt_adobe_vipm_ef.services.discount_sync.get_adobe_client", return_value=client)
    return client


async def test_sync_creates_open_rows_for_every_segment(ctx, store, adobe_client):
    await discount_sync.sync_open_discounts(ctx)

    listing_calls = adobe_client.discount.list_flex_discounts.call_args_list
    assert [listing.args for listing in listing_calls] == [
        (_AUTH_ID, segment, _COUNTRY) for segment in _SEGMENTS
    ]
    assert store.create_code.call_count == len(_SEGMENTS)
    first_create = store.create_code.call_args_list[0]
    created_fields = first_create.args[0]
    assert created_fields["Code"] == "SUMMER25"
    assert created_fields["source"] == "API"
    assert created_fields["market_segment"] == "COM"
    store.update_code.assert_not_called()


async def test_sync_writes_the_per_country_values(ctx, store, adobe_client):
    await discount_sync.sync_open_discounts(ctx)

    value_calls = store.replace_country_value.call_args_list
    assert [value_call.args[:3] for value_call in value_calls] == [
        ("SUMMER25", segment, _COUNTRY) for segment in _SEGMENTS
    ]
    assert value_calls[0].args[3] == {
        "code": "SUMMER25",
        "market_segment": "COM",
        "country": _COUNTRY,
        "currency": "USD",
        "value": 20,
    }


async def test_sync_updates_existing_open_rows(ctx, store, adobe_client, code_record_factory):
    store.find_code.return_value = code_record_factory(source="API")

    await discount_sync.sync_open_discounts(ctx)

    store.create_code.assert_not_called()
    assert store.update_code.call_count == len(_SEGMENTS)
    first_update = store.update_code.call_args_list[0]
    record_id, updated_fields = first_update.args
    assert record_id == "rec123"
    assert "Code" not in updated_fields
    assert "applicable_order_types" not in updated_fields
    assert updated_fields["synchronized_at"] is not None


async def test_sync_never_touches_closed_rows_sharing_the_code(
    ctx, store, adobe_client, code_record_factory
):
    store.find_code.return_value = code_record_factory(source="Ops/Vendor")

    await discount_sync.sync_open_discounts(ctx)

    store.create_code.assert_not_called()
    store.update_code.assert_not_called()
    store.replace_country_value.assert_not_called()


async def test_sync_skips_authorizations_without_adobe_credentials(
    ctx, store, adobe_client, settings
):
    settings.get_authorization.side_effect = AuthorizationNotFoundError("missing")

    await discount_sync.sync_open_discounts(ctx)

    adobe_client.discount.list_flex_discounts.assert_not_called()
    store.create_code.assert_not_called()


async def test_sync_skips_authorizations_without_owner_country(
    ctx, store, adobe_client, authorizations_query
):
    authorizations_query.authorizations = [_authorization(country=None)]

    await discount_sync.sync_open_discounts(ctx)

    adobe_client.discount.list_flex_discounts.assert_not_called()


async def test_sync_deduplicates_authorizations_sharing_credentials_and_country(
    ctx, adobe_client, store, authorizations_query
):
    authorizations_query.authorizations = [
        _authorization(),
        _authorization(auth_id=_OTHER_AUTH_ID),
    ]

    await discount_sync.sync_open_discounts(ctx)

    listing_calls = adobe_client.discount.list_flex_discounts.call_args_list
    assert [listing.args for listing in listing_calls] == [
        (_AUTH_ID, segment, _COUNTRY) for segment in _SEGMENTS
    ]


async def test_sync_keeps_going_and_fails_the_task_when_a_segment_fails(ctx, store, adobe_client):
    adobe_client.discount.list_flex_discounts.side_effect = [
        AdobeAPIError(HTTPStatus.INTERNAL_SERVER_ERROR, {"code": "5000", "message": "boom"}),
        [_flex_discount()],
        [_flex_discount()],
    ]

    with pytest.raises(FailError, match=f"{_AUTH_ID}/COM"):
        await discount_sync.sync_open_discounts(ctx)

    assert store.create_code.call_count == 2


async def test_sync_keeps_going_and_fails_the_task_when_a_store_write_fails(
    ctx, store, adobe_client, code_record_factory
):
    store.create_code.side_effect = [
        HTTPError("422 Client Error"),
        code_record_factory(source="API"),
        code_record_factory(source="API"),
    ]

    with pytest.raises(FailError, match=f"{_AUTH_ID}/COM"):
        await discount_sync.sync_open_discounts(ctx)

    assert store.create_code.call_count == len(_SEGMENTS)
    assert store.replace_country_value.call_count == 2


async def test_sync_reports_progress_per_segment(ctx, store, adobe_client):
    await discount_sync.sync_open_discounts(ctx)

    progress_values = [call.args[0] for call in ctx.task.progress.await_args_list]
    assert len(progress_values) == len(_SEGMENTS)
    assert progress_values[-1] == 100
