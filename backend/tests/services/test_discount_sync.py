import datetime as dt
from http import HTTPStatus
from types import MappingProxyType, SimpleNamespace

import pytest
from mpt_extension_sdk.errors.pipeline import FailError
from requests import HTTPError

from adobe.errors import AdobeAPIError, AuthorizationNotFoundError
from mpt_adobe_vipm_ef.services import discount_sync
from mpt_adobe_vipm_ef.services.discounts import CODE_FIELD

_AUTH_ID = "AUT-1234-5678"
_OTHER_AUTH_ID = "AUT-8765-4321"
_COUNTRY = "US"
_OTHER_COUNTRY = "CA"
_REGION = "NA"
_SEGMENTS = ("COM", "EDU", "GOV")
# Adobe reports different offer ids per country, so the store must union them.
_COUNTRY_OFFER_IDS = MappingProxyType({
    _COUNTRY: "65322651CA02A12",
    _OTHER_COUNTRY: "11083117CA01A12",
})


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
                # Percentage discounts are country-agnostic: Adobe reports the
                # bare value, without country or currency.
                "type": "PERCENTAGE_DISCOUNT",
                "discountValues": [{"value": 20}],
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


@pytest.fixture(autouse=True)
def region_mapping(mocker):
    """Map every country to a single-country region, so tests opt into expansion."""
    return SimpleNamespace(
        region_of_country=mocker.patch(
            "mpt_adobe_vipm_ef.services.discount_sync.region_of_country",
            return_value=_REGION,
        ),
        region_countries=mocker.patch(
            "mpt_adobe_vipm_ef.services.discount_sync.region_countries",
            return_value=(_COUNTRY,),
        ),
    )


@pytest.fixture
def store(mocker):
    fake_store = mocker.Mock()
    fake_store.find_code.return_value = None
    fake_store.list_open_codes.return_value = []
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


async def test_sync_writes_country_agnostic_percentage_values(ctx, store, adobe_client):
    await discount_sync.sync_open_discounts(ctx)

    value_calls = store.replace_country_value.call_args_list
    assert [value_call.args[:3] for value_call in value_calls] == [
        ("SUMMER25", segment, None) for segment in _SEGMENTS
    ]
    assert value_calls[0].args[3] == {
        "code": "SUMMER25",
        "market_segment": "COM",
        "value": 20,
    }


async def test_sync_writes_the_per_country_values(ctx, store, adobe_client):
    discount = _flex_discount()
    discount["outcomes"] = [
        {
            "type": "FIXED_PRICE",
            "discountValues": [{"country": _COUNTRY, "currency": "USD", "value": 15.99}],
        }
    ]
    adobe_client.discount.list_flex_discounts.return_value = [discount]

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
        "value": 15.99,
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


@pytest.mark.parametrize("closed_source", ["Operations", "Vendor", "Client", "Ops/Vendor"])
async def test_sync_never_touches_closed_rows_sharing_the_code(
    ctx, store, adobe_client, code_record_factory, closed_source
):
    store.find_code.return_value = code_record_factory(source=closed_source)

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


async def test_sync_walks_every_country_of_the_authorization_region(
    ctx, adobe_client, store, region_mapping
):
    region_mapping.region_countries.return_value = (_COUNTRY, _OTHER_COUNTRY)

    await discount_sync.sync_open_discounts(ctx)

    listing_calls = adobe_client.discount.list_flex_discounts.call_args_list
    assert [listing.args for listing in listing_calls] == [
        (_AUTH_ID, segment, country)
        for country in (_COUNTRY, _OTHER_COUNTRY)
        for segment in _SEGMENTS
    ]


async def test_sync_processes_each_region_only_once(
    ctx, adobe_client, store, authorizations_query, region_mapping
):
    authorizations_query.authorizations = [
        _authorization(),
        _authorization(auth_id=_OTHER_AUTH_ID, country=_OTHER_COUNTRY),
    ]
    region_mapping.region_countries.return_value = (_COUNTRY, _OTHER_COUNTRY)

    await discount_sync.sync_open_discounts(ctx)

    listing_calls = adobe_client.discount.list_flex_discounts.call_args_list
    assert [listing.args for listing in listing_calls] == [
        (_AUTH_ID, segment, country)
        for country in (_COUNTRY, _OTHER_COUNTRY)
        for segment in _SEGMENTS
    ]


async def test_sync_falls_back_to_the_owner_country_when_it_has_no_region(
    ctx, adobe_client, store, region_mapping
):
    region_mapping.region_of_country.return_value = None

    await discount_sync.sync_open_discounts(ctx)

    listing_calls = adobe_client.discount.list_flex_discounts.call_args_list
    assert [listing.args for listing in listing_calls] == [
        (_AUTH_ID, segment, _COUNTRY) for segment in _SEGMENTS
    ]
    region_mapping.region_countries.assert_not_called()


async def test_sync_keeps_going_and_fails_the_task_when_a_segment_fails(ctx, store, adobe_client):
    adobe_client.discount.list_flex_discounts.side_effect = [
        AdobeAPIError(HTTPStatus.INTERNAL_SERVER_ERROR, {"code": "5000", "message": "boom"}),
        [_flex_discount()],
        [_flex_discount()],
    ]

    with pytest.raises(FailError, match=f"{_AUTH_ID}/{_COUNTRY}/COM"):
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

    with pytest.raises(FailError, match=f"{_AUTH_ID}/{_COUNTRY}/COM"):
        await discount_sync.sync_open_discounts(ctx)

    assert store.create_code.call_count == len(_SEGMENTS)
    assert store.replace_country_value.call_count == 2


async def test_sync_reports_progress_per_segment(ctx, store, adobe_client):
    await discount_sync.sync_open_discounts(ctx)

    progress_values = [call.args[0] for call in ctx.task.progress.await_args_list]
    assert len(progress_values) == len(_SEGMENTS)
    assert progress_values[-1] == 100


async def test_sync_retires_the_open_codes_past_their_usable_window(
    ctx, store, adobe_client, code_record_factory
):
    expired = code_record_factory(source="API", end_date="2020-01-01T00:00:00Z")
    live = code_record_factory(source="API", end_date="2999-12-31T23:59:59Z")
    live["id"] = "rec-live"
    store.list_open_codes.return_value = [expired, live]

    await discount_sync.sync_open_discounts(ctx)

    store.retire_codes.assert_called_once()
    record_ids, retired_at = store.retire_codes.call_args.args
    assert record_ids == ["rec123"]
    assert retired_at.startswith(str(dt.datetime.now(tz=dt.UTC).year))


async def test_sync_keeps_a_reusable_code_whose_discount_lock_is_still_open(
    ctx, store, adobe_client, code_record_factory
):
    store.list_open_codes.return_value = [
        code_record_factory(
            source="API",
            end_date="2020-01-01T00:00:00Z",
            reusable=True,
            discount_lock_end_date="2999-12-31T23:59:59Z",
        )
    ]

    await discount_sync.sync_open_discounts(ctx)

    retired_ids, _ = store.retire_codes.call_args.args
    assert not retired_ids


async def test_sync_retires_nothing_when_no_stored_code_expired(ctx, store, adobe_client):
    await discount_sync.sync_open_discounts(ctx)

    store.list_open_codes.assert_called_once_with()
    retired_ids, _ = store.retire_codes.call_args.args
    assert not retired_ids


async def test_sync_reviews_expiry_even_without_synchronizable_authorizations(
    ctx, store, adobe_client, authorizations_query, code_record_factory
):
    authorizations_query.authorizations = []
    store.list_open_codes.return_value = [
        code_record_factory(source="API", end_date="2020-01-01T00:00:00Z")
    ]

    await discount_sync.sync_open_discounts(ctx)

    adobe_client.discount.list_flex_discounts.assert_not_called()
    retired_ids, _ = store.retire_codes.call_args.args
    assert retired_ids == ["rec123"]


async def test_sync_un_retires_a_code_adobe_reports_as_usable_again(
    ctx, store, adobe_client, code_record_factory
):
    discount = _flex_discount()
    discount["endDate"] = "2999-12-31T23:59:59Z"
    adobe_client.discount.list_flex_discounts.return_value = [discount]
    store.find_code.return_value = code_record_factory(
        source="API", retired_at="2026-07-01T00:00:00Z"
    )

    await discount_sync.sync_open_discounts(ctx)

    first_update = store.update_code.call_args_list[0]
    assert first_update.args[1]["retired_at"] is None


async def test_sync_fails_the_task_when_the_expiry_review_cannot_be_written(
    ctx, store, adobe_client, code_record_factory
):
    store.list_open_codes.return_value = [
        code_record_factory(source="API", end_date="2020-01-01T00:00:00Z")
    ]
    store.retire_codes.side_effect = HTTPError("422 Client Error")

    with pytest.raises(FailError, match="could not retire the expired codes"):
        await discount_sync.sync_open_discounts(ctx)


async def test_sync_reports_the_listing_failures_before_the_expiry_review_ones(
    ctx, store, adobe_client, code_record_factory
):
    adobe_client.discount.list_flex_discounts.side_effect = HTTPError("500 Server Error")
    store.list_open_codes.side_effect = HTTPError("500 Server Error")

    with pytest.raises(FailError, match=f"{_AUTH_ID}/{_COUNTRY}/COM"):
        await discount_sync.sync_open_discounts(ctx)


class FakeCodeStore:
    """Store fake keyed by ``(code, market_segment)``, so a run reads its writes."""

    def __init__(self, rows=None):
        self.rows = dict(rows or {})
        self.by_id = {row["id"]: row for row in self.rows.values()}
        self.updates = []

    def find_code(self, code, market_segment):
        return self.rows.get((code, market_segment))

    def create_code(self, fields):
        segment = fields["market_segment"]
        record = {"id": f"rec-{segment}", "fields": dict(fields)}
        self.rows[fields[CODE_FIELD], segment] = record
        self.by_id[record["id"]] = record
        return record

    def update_code(self, record_id, fields):
        self.updates.append(dict(fields))
        record = self.by_id[record_id]
        record["fields"].update(fields)
        return record

    def replace_country_value(self, *args):
        """The values table is out of scope for these runs."""

    def list_open_codes(self):
        return []

    def retire_codes(self, record_ids, retired_at):
        """No stored row expires in these runs."""


def _patch_code_store(mocker, rows=None):
    """Install a stateful store fake, returning it."""
    fake_store = FakeCodeStore(rows)
    store_class = mocker.patch("mpt_adobe_vipm_ef.services.discount_sync.DiscountStore")
    store_class.from_settings.return_value = fake_store
    return fake_store


def _open_row(market_segment, **field_overrides):
    fields = {CODE_FIELD: "SUMMER25", "source": "API", "market_segment": market_segment}
    fields.update(field_overrides)
    return {"id": f"rec-{market_segment}", "fields": fields}


def _discount_of_offer(offer_id, end_date=None):
    discount = _flex_discount()
    discount["qualification"] = {"baseOfferIds": [offer_id]}
    if end_date:
        discount["endDate"] = end_date
    return discount


def _listing_of_country(authorization_id, market_segment, country):
    """Adobe scopes a discount's offer ids to the country being listed."""
    return [_discount_of_offer(_COUNTRY_OFFER_IDS[country])]


async def test_sync_accumulates_the_offer_ids_of_every_country_of_the_region(
    mocker, ctx, adobe_client, region_mapping
):
    store = _patch_code_store(mocker)
    region_mapping.region_countries.return_value = (_COUNTRY, _OTHER_COUNTRY)
    # The first country's segments create the rows, the second country's update
    # them, each reading back the ids the first one stored.
    adobe_client.discount.list_flex_discounts.side_effect = _listing_of_country

    await discount_sync.sync_open_discounts(ctx)

    assert len(store.updates) == len(_SEGMENTS)
    assert {update["target_offer_ids"] for update in store.updates} == {"65322651CA,11083117CA"}


async def test_sync_keeps_the_accumulated_offer_ids_when_it_un_retires_a_row(
    mocker, ctx, adobe_client
):
    retired_row = _open_row("COM", target_offer_ids="65322651CA", retired_at="2026-07-01T00:00:00Z")
    store = _patch_code_store(mocker, {("SUMMER25", "COM"): retired_row})
    # The un-retirement reads the window Adobe reports now, not the stored one.
    adobe_client.discount.list_flex_discounts.return_value = [
        _discount_of_offer("11083117CA01A12", end_date="2999-12-31T23:59:59Z")
    ]

    await discount_sync.sync_open_discounts(ctx)

    assert store.updates[0]["retired_at"] is None
    assert store.updates[0]["target_offer_ids"] == "65322651CA,11083117CA"
