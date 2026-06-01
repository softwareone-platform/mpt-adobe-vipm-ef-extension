import pytest
from mpt_extension_sdk.errors.runtime import ConfigError

from mpt_adobe_vipm_ef.settings import ExtensionSettings


def test_load_reads_product_ids(monkeypatch):
    monkeypatch.setenv("MPT_PRODUCTS_IDS", "PRD-1111-1111,PRD-2222-2222")

    settings = ExtensionSettings.load()  # act

    assert settings.product_ids == ("PRD-1111-1111", "PRD-2222-2222")


def test_load_without_product_ids_raises(monkeypatch):
    monkeypatch.delenv("MPT_PRODUCTS_IDS", raising=False)

    with pytest.raises(ConfigError):  # act
        ExtensionSettings.load()
