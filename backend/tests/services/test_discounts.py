from http import HTTPStatus

import pytest
from mpt_extension_sdk.errors.runtime import ConfigError
from pyairtable.formulas import AND, BLANK, EQ, OR, Field
from requests import HTTPError

from mpt_adobe_vipm_ef.services.discounts import (
    CODES_TABLE,
    REDEMPTIONS_TABLE,
    VALUES_TABLE,
    DiscountStore,
)

_API_TOKEN = "airtable-token"
_BASE_ID = "appBASE123"
_MARKET_SEGMENT = "COM"
_CUSTOMER_ID = "CUST-0001"


@pytest.fixture
def api(mocker):
    return mocker.patch("mpt_adobe_vipm_ef.services.discounts.Api")


@pytest.fixture
def table(api):
    return api.return_value.table.return_value


@pytest.fixture
def store(api):
    return DiscountStore(_API_TOKEN, _BASE_ID)


def _settings(mocker, *, token=_API_TOKEN, base_id=_BASE_ID):
    return mocker.Mock(airtable_api_token=token, airtable_discounts_base_id=base_id)


def _http_error(mocker, status_code=None):
    response = None if status_code is None else mocker.Mock(status_code=status_code)
    return HTTPError(response=response)


def test_from_settings_builds_store_from_airtable_settings(mocker, api):
    result = DiscountStore.from_settings(_settings(mocker))

    assert isinstance(result, DiscountStore)
    api.assert_called_once_with(_API_TOKEN, timeout=(60, 60))


@pytest.mark.parametrize(
    ("token", "base_id"),
    [
        ("", _BASE_ID),
        (_API_TOKEN, ""),
        ("", ""),
    ],
)
def test_from_settings_fails_fast_when_not_configured(mocker, token, base_id):
    with pytest.raises(ConfigError, match="not configured"):
        DiscountStore.from_settings(_settings(mocker, token=token, base_id=base_id))


def test_list_codes_queries_visible_codes_for_customer(api, table, store):
    table.all.return_value = [{"id": "rec1", "fields": {}}]

    result = store.list_codes(_MARKET_SEGMENT, _CUSTOMER_ID)

    assert result == [{"id": "rec1", "fields": {}}]
    api.return_value.table.assert_called_once_with(_BASE_ID, CODES_TABLE)
    table.all.assert_called_once_with(
        formula=AND(
            EQ(Field("market_segment"), _MARKET_SEGMENT),
            EQ(Field("retired_at"), BLANK()),
            OR(
                EQ(Field("source"), "API"),
                EQ(Field("target_customer_id"), _CUSTOMER_ID),
            ),
        )
    )


def test_get_code_returns_record_by_id(table, store):
    table.get.return_value = {"id": "rec1", "fields": {}}

    result = store.get_code("rec1")

    assert result == {"id": "rec1", "fields": {}}
    table.get.assert_called_once_with("rec1")


@pytest.mark.parametrize(
    "status_code",
    [HTTPStatus.NOT_FOUND, HTTPStatus.UNPROCESSABLE_ENTITY],
)
def test_get_code_returns_none_when_record_is_missing(mocker, table, store, status_code):
    table.get.side_effect = _http_error(mocker, status_code)

    result = store.get_code("rec-missing")

    assert result is None


def test_get_code_reraises_unexpected_http_errors(mocker, table, store):
    table.get.side_effect = _http_error(mocker, HTTPStatus.INTERNAL_SERVER_ERROR)

    with pytest.raises(HTTPError):
        store.get_code("rec1")


def test_get_code_reraises_http_errors_without_response(mocker, table, store):
    table.get.side_effect = _http_error(mocker)

    with pytest.raises(HTTPError):
        store.get_code("rec1")


def test_find_code_queries_by_code_and_segment(api, table, store):
    table.first.return_value = {"id": "rec1", "fields": {}}

    result = store.find_code("SUMMER25", _MARKET_SEGMENT)

    assert result == {"id": "rec1", "fields": {}}
    api.return_value.table.assert_called_once_with(_BASE_ID, CODES_TABLE)
    table.first.assert_called_once_with(
        formula=AND(
            EQ(Field("Code"), "SUMMER25"),
            EQ(Field("market_segment"), _MARKET_SEGMENT),
        )
    )


def test_create_code_inserts_row_with_typecast(table, store):
    table.create.return_value = {"id": "rec1", "fields": {"Code": "SUMMER25"}}

    result = store.create_code({"Code": "SUMMER25"})

    assert result == {"id": "rec1", "fields": {"Code": "SUMMER25"}}
    table.create.assert_called_once_with({"Code": "SUMMER25"}, typecast=True)


def test_update_code_updates_row_with_typecast(table, store):
    table.update.return_value = {"id": "rec1", "fields": {"status": "RETIRED"}}

    result = store.update_code("rec1", {"status": "RETIRED"})

    assert result == {"id": "rec1", "fields": {"status": "RETIRED"}}
    table.update.assert_called_once_with("rec1", {"status": "RETIRED"}, typecast=True)


def test_list_values_returns_empty_without_codes(api, store):
    result = store.list_values([], _MARKET_SEGMENT)

    assert result == []
    api.return_value.table.assert_not_called()


def test_list_values_queries_rows_for_codes(api, table, store):
    table.all.return_value = [{"id": "recVal1", "fields": {}}]

    result = store.list_values(["SUMMER25", "WINTER10"], _MARKET_SEGMENT)

    assert result == [{"id": "recVal1", "fields": {}}]
    api.return_value.table.assert_called_once_with(_BASE_ID, VALUES_TABLE)
    table.all.assert_called_once_with(
        formula=AND(
            EQ(Field("market_segment"), _MARKET_SEGMENT),
            OR(
                EQ(Field("code"), "SUMMER25"),
                EQ(Field("code"), "WINTER10"),
            ),
        )
    )


def test_replace_value_creates_before_deleting_existing_rows(table, store):
    table.all.return_value = [
        {"id": "recVal1", "fields": {}},
        {"id": "recVal2", "fields": {}},
    ]

    store.replace_value("SUMMER25", _MARKET_SEGMENT, {"value": 20})  # act

    table.all.assert_called_once_with(
        formula=AND(
            EQ(Field("code"), "SUMMER25"),
            EQ(Field("market_segment"), _MARKET_SEGMENT),
        )
    )
    table.create.assert_called_once_with({"value": 20}, typecast=True)
    table.batch_delete.assert_called_once_with(["recVal1", "recVal2"])
    called_methods = [name for name, _, _ in table.method_calls]
    assert called_methods.index("create") < called_methods.index("batch_delete")


def test_replace_value_only_creates_when_no_rows_exist(table, store):
    table.all.return_value = []

    store.replace_value("SUMMER25", _MARKET_SEGMENT, {"value": 20})  # act

    table.batch_delete.assert_not_called()
    table.create.assert_called_once_with({"value": 20}, typecast=True)


def test_list_redemptions_returns_empty_without_codes(api, store):
    result = store.list_redemptions([], _CUSTOMER_ID)

    assert result == []
    api.return_value.table.assert_not_called()


def test_list_redemptions_queries_customer_rows_for_codes(api, table, store):
    table.all.return_value = [{"id": "recRed1", "fields": {}}]

    result = store.list_redemptions(["SUMMER25"], _CUSTOMER_ID)

    assert result == [{"id": "recRed1", "fields": {}}]
    api.return_value.table.assert_called_once_with(_BASE_ID, REDEMPTIONS_TABLE)
    table.all.assert_called_once_with(
        formula=AND(
            EQ(Field("customer_id"), _CUSTOMER_ID),
            OR(EQ(Field("code"), "SUMMER25")),
        )
    )
