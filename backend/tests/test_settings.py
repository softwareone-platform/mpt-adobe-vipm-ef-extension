import json

import pytest
from mpt_extension_sdk.errors.runtime import ConfigError

from mpt_adobe_vipm_ef.models import ProductSegment
from mpt_adobe_vipm_ef.settings import ExtensionSettings, get_settings


def test_load_reads_product_ids(monkeypatch):
    monkeypatch.setenv("MPT_PRODUCTS_IDS", "PRD-1111-1111,PRD-2222-2222")

    settings = ExtensionSettings.load()  # act

    assert settings.product_ids == ("PRD-1111-1111", "PRD-2222-2222")


def test_load_without_product_ids_raises(monkeypatch):
    monkeypatch.delenv("MPT_PRODUCTS_IDS", raising=False)

    with pytest.raises(ConfigError):  # act
        ExtensionSettings.load()


def test_load_parses_product_segments(monkeypatch):
    monkeypatch.setenv("MPT_PRODUCTS_IDS", "PRD-1111-1111")
    monkeypatch.setenv("EXT_PRODUCT_SEGMENTS", json.dumps({"PRD-1111-1111": "COM"}))

    settings = ExtensionSettings.load()  # act

    assert settings.product_segments == (ProductSegment(id="PRD-1111-1111", segment="COM"),)


def test_load_without_product_segments_empty(monkeypatch):
    monkeypatch.setenv("MPT_PRODUCTS_IDS", "PRD-1111-1111")
    monkeypatch.delenv("EXT_PRODUCT_SEGMENTS", raising=False)

    settings = ExtensionSettings.load()  # act

    assert settings.product_segments == ()


def test_load_with_malformed_product_segments(monkeypatch):
    monkeypatch.setenv("MPT_PRODUCTS_IDS", "PRD-1111-1111")
    monkeypatch.setenv("EXT_PRODUCT_SEGMENTS", "not-json")

    with pytest.raises(ConfigError):  # act
        ExtensionSettings.load()


def test_load_with_non_object_product_segments(monkeypatch):
    monkeypatch.setenv("MPT_PRODUCTS_IDS", "PRD-1111-1111")
    monkeypatch.setenv("EXT_PRODUCT_SEGMENTS", "[1, 2]")

    with pytest.raises(ConfigError):  # act
        ExtensionSettings.load()


def test_get_settings_returns_loaded_settings(monkeypatch):
    monkeypatch.setenv("MPT_PRODUCTS_IDS", "PRD-1111-1111")
    get_settings.cache_clear()

    settings = get_settings()  # act

    assert isinstance(settings, ExtensionSettings)
    assert settings.product_ids == ("PRD-1111-1111",)
