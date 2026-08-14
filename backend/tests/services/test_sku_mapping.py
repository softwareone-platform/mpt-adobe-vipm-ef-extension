import pytest
from mpt_extension_sdk.errors.runtime import ConfigError
from pyairtable.formulas import AND, EQ, OR, Field

from mpt_adobe_vipm_ef.services.sku_mapping import SKU_MAPPING_TABLE, SkuMappingStore

_API_TOKEN = "airtable-token"
_BASE_ID = "appBASE456"
_MARKET_SEGMENT = "COM"
_LICENSE_SKU = "65304470CA"
_CONSUMABLE_SKU = "65304999CA"
_FULL_SKU = "65304470CA01A12"


@pytest.fixture
def api(mocker):
    return mocker.patch("mpt_adobe_vipm_ef.services.sku_mapping.Api")


@pytest.fixture
def table(api):
    return api.return_value.table.return_value


@pytest.fixture
def store(api):
    return SkuMappingStore(_API_TOKEN, _BASE_ID)


def _settings(mocker, *, token=_API_TOKEN, base_id=_BASE_ID):
    return mocker.Mock(airtable_api_token=token, airtable_sku_mapping_base_id=base_id)


def test_from_settings_builds_store_from_airtable_settings(mocker, api):
    result = SkuMappingStore.from_settings(_settings(mocker))

    assert isinstance(result, SkuMappingStore)
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
        SkuMappingStore.from_settings(_settings(mocker, token=token, base_id=base_id))


def test_list_three_yc_types_queries_the_segment_rows(api, table, store):
    table.all.return_value = [
        {"id": "rec1", "fields": {"vendor_external_id": _LICENSE_SKU, "type_3yc": "License"}},
        {"id": "rec2", "fields": {"vendor_external_id": _CONSUMABLE_SKU, "type_3yc": "Consumable"}},
    ]

    result = store.list_three_yc_types([_LICENSE_SKU, _CONSUMABLE_SKU], _MARKET_SEGMENT)

    assert result == {_LICENSE_SKU: "License", _CONSUMABLE_SKU: "Consumable"}
    api.return_value.table.assert_called_once_with(_BASE_ID, SKU_MAPPING_TABLE)
    table.all.assert_called_once_with(
        formula=AND(
            EQ(Field("segment"), "Commercial"),
            OR(
                EQ(Field("vendor_external_id"), _LICENSE_SKU),
                EQ(Field("vendor_external_id"), _CONSUMABLE_SKU),
            ),
        )
    )


def test_list_three_yc_types_tolerates_rows_without_a_type(table, store):
    table.all.return_value = [
        {"id": "rec1", "fields": {"vendor_external_id": _LICENSE_SKU}},
        {"id": "rec2", "fields": {}},
    ]

    result = store.list_three_yc_types([_LICENSE_SKU], _MARKET_SEGMENT)

    assert result == {_LICENSE_SKU: ""}


def test_list_three_yc_types_returns_empty_without_skus(api, store):
    result = store.list_three_yc_types([], _MARKET_SEGMENT)

    assert result == {}
    api.return_value.table.assert_not_called()


def test_list_three_yc_types_rejects_an_unmapped_segment(store):
    with pytest.raises(ConfigError, match="no Airtable SKU mapping segment"):
        store.list_three_yc_types([_LICENSE_SKU], "UNKNOWN")


def test_list_full_skus_queries_the_segment_rows(api, table, store):
    table.all.return_value = [
        {"id": "rec1", "fields": {"vendor_external_id": _LICENSE_SKU, "sku": _FULL_SKU}},
    ]

    result = store.list_full_skus([_LICENSE_SKU], _MARKET_SEGMENT)

    assert result == {_LICENSE_SKU: _FULL_SKU}
    api.return_value.table.assert_called_once_with(_BASE_ID, SKU_MAPPING_TABLE)
    table.all.assert_called_once_with(
        formula=AND(
            EQ(Field("segment"), "Commercial"),
            OR(EQ(Field("vendor_external_id"), _LICENSE_SKU)),
        )
    )


def test_list_full_skus_skips_rows_without_a_full_sku(table, store):
    table.all.return_value = [
        {"id": "rec1", "fields": {"vendor_external_id": _LICENSE_SKU}},
        {"id": "rec2", "fields": {"vendor_external_id": _CONSUMABLE_SKU, "sku": ""}},
        {"id": "rec3", "fields": {"sku": _FULL_SKU}},
    ]

    result = store.list_full_skus([_LICENSE_SKU, _CONSUMABLE_SKU], _MARKET_SEGMENT)

    assert result == {}


def test_list_full_skus_returns_empty_without_skus(api, store):
    result = store.list_full_skus([], _MARKET_SEGMENT)

    assert result == {}
    api.return_value.table.assert_not_called()


def test_list_auto_renew_supported_queries_the_segment_rows(api, table, store):
    table.all.return_value = [
        {
            "id": "rec1",
            "fields": {"vendor_external_id": _LICENSE_SKU, "auto_renew_supported": True},
        },
        {"id": "rec2", "fields": {"vendor_external_id": _CONSUMABLE_SKU}},
    ]

    result = store.list_auto_renew_supported([_LICENSE_SKU, _CONSUMABLE_SKU], _MARKET_SEGMENT)

    assert result == {_LICENSE_SKU: True, _CONSUMABLE_SKU: False}
    api.return_value.table.assert_called_once_with(_BASE_ID, SKU_MAPPING_TABLE)
    table.all.assert_called_once_with(
        formula=AND(
            EQ(Field("segment"), "Commercial"),
            OR(
                EQ(Field("vendor_external_id"), _LICENSE_SKU),
                EQ(Field("vendor_external_id"), _CONSUMABLE_SKU),
            ),
        )
    )


def test_list_auto_renew_supported_returns_empty_without_skus(api, store):
    result = store.list_auto_renew_supported([], _MARKET_SEGMENT)

    assert result == {}
    api.return_value.table.assert_not_called()


def test_list_auto_renew_supported_rejects_an_unmapped_segment(store):
    with pytest.raises(ConfigError, match="no Airtable SKU mapping segment"):
        store.list_auto_renew_supported([_LICENSE_SKU], "UNKNOWN")
