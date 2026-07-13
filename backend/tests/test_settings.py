import json

import pytest
from mpt_extension_sdk.errors.runtime import ConfigError

from adobe.dataclasses import Authorization
from adobe.errors import AuthorizationNotFoundError
from mpt_adobe_vipm_ef.models.product import ProductSegment
from mpt_adobe_vipm_ef.settings import ExtensionSettings, get_settings


def _write_adobe_files(tmp_path, monkeypatch, credentials, authorizations):
    cred_file = tmp_path / "credentials.json"
    cred_file.write_text(json.dumps(credentials))
    auth_file = tmp_path / "authorizations.json"
    auth_file.write_text(json.dumps(authorizations))
    monkeypatch.setenv("EXT_ADOBE_CREDENTIALS_FILE", str(cred_file))
    monkeypatch.setenv("EXT_ADOBE_AUTHORIZATIONS_FILE", str(auth_file))


@pytest.fixture(autouse=True)
def adobe_env(tmp_path, monkeypatch):
    """Provide a valid Adobe configuration so ExtensionSettings.load() succeeds."""
    monkeypatch.setenv("MPT_PRODUCTS_IDS", "PRD-1111-1111")
    monkeypatch.setenv("EXT_ADOBE_AUTH_ENDPOINT_URL", "https://ims-na1.adobelogin.com/ims/token/v3")
    monkeypatch.setenv("EXT_ADOBE_API_BASE_URL", "https://api.adobe.io")
    _write_adobe_files(
        tmp_path,
        monkeypatch,
        credentials=[
            {
                "authorization_uk": "rs-adobe-auth-usd",
                "name": "Test Credentials",
                "client_id": "test_client_id_1234",
                "client_secret": "test_secret_5678",
            }
        ],
        authorizations={
            "authorizations": [
                {
                    "authorization_uk": "rs-adobe-auth-usd",
                    "authorization_id": "AUT-1234-5678",
                    "distributor_id": "dist-123",
                    "currency": "USD",
                }
            ]
        },
    )
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


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


def test_load_without_adobe_endpoints_raises(monkeypatch):
    monkeypatch.delenv("EXT_ADOBE_API_BASE_URL", raising=False)

    with pytest.raises(ConfigError, match="EXT_ADOBE_API_BASE_URL"):  # act
        ExtensionSettings.load()


def test_adobe_authorizations_without_files_raises(monkeypatch):
    monkeypatch.delenv("EXT_ADOBE_CREDENTIALS_FILE", raising=False)
    monkeypatch.delenv("EXT_ADOBE_AUTHORIZATIONS_FILE", raising=False)
    settings = ExtensionSettings.load()

    with pytest.raises(ConfigError):  # act
        _ = settings.adobe_authorizations  # noqa: WPS122


def test_get_authorization_by_uk():
    auth = ExtensionSettings.load().get_authorization("rs-adobe-auth-usd")  # act

    assert isinstance(auth, Authorization)
    assert auth.authorization_uk == "rs-adobe-auth-usd"


def test_get_authorization_by_id():
    auth = ExtensionSettings.load().get_authorization("AUT-1234-5678")  # act

    assert isinstance(auth, Authorization)
    assert auth.authorization_id == "AUT-1234-5678"


def test_get_authorization_raises_when_not_found():
    settings = ExtensionSettings.load()

    with pytest.raises(AuthorizationNotFoundError, match="AUT-9999-0000"):  # act
        settings.get_authorization("AUT-9999-0000")


def test_load_raises_when_credentials_missing_for_authorization(tmp_path, monkeypatch):
    _write_adobe_files(
        tmp_path,
        monkeypatch,
        credentials=[],
        authorizations={
            "authorizations": [
                {
                    "authorization_uk": "rs-adobe-auth-usd",
                    "authorization_id": "AUT-1234-5678",
                    "distributor_id": "dist-123",
                    "currency": "USD",
                }
            ]
        },
    )

    settings = ExtensionSettings.load()  # act

    with pytest.raises(ConfigError, match="rs-adobe-auth-usd"):  # act
        _ = settings.adobe_authorizations  # noqa: WPS122


def test_load_authorization_without_id_not_indexed_by_none(tmp_path, monkeypatch):
    _write_adobe_files(
        tmp_path,
        monkeypatch,
        credentials=[
            {
                "authorization_uk": "rs-adobe-auth-usd",
                "name": "Test Credentials",
                "client_id": "test_client_id_1234",
                "client_secret": "test_secret_5678",
            }
        ],
        authorizations={
            "authorizations": [
                {
                    "authorization_uk": "rs-adobe-auth-usd",
                    "distributor_id": "dist-123",
                    "currency": "USD",
                }
            ]
        },
    )

    settings = ExtensionSettings.load()  # act

    assert None not in settings.adobe_authorizations
    assert len(settings.adobe_authorizations) == 1


def test_load_multiple_authorizations(tmp_path, monkeypatch):
    _write_adobe_files(
        tmp_path,
        monkeypatch,
        credentials=[
            {
                "authorization_uk": "rs-adobe-auth-usd",
                "name": "USD",
                "client_id": "c_usd",
                "client_secret": "s_usd",
            },
            {
                "authorization_uk": "rs-adobe-auth-eur",
                "name": "EUR",
                "client_id": "c_eur",
                "client_secret": "s_eur",
            },
        ],
        authorizations={
            "authorizations": [
                {
                    "authorization_uk": "rs-adobe-auth-usd",
                    "authorization_id": "AUT-0001",
                    "distributor_id": "d1",
                    "currency": "USD",
                },
                {
                    "authorization_uk": "rs-adobe-auth-eur",
                    "authorization_id": "AUT-0002",
                    "distributor_id": "d2",
                    "currency": "EUR",
                },
            ]
        },
    )

    settings = ExtensionSettings.load()  # act

    assert settings.get_authorization("rs-adobe-auth-usd").currency == "USD"
    assert settings.get_authorization("rs-adobe-auth-eur").currency == "EUR"


def test_adobe_api_scopes_joined_by_comma():
    assert ExtensionSettings.load().adobe_api_scopes == "openid,AdobeID,read_organizations"  # act


def test_get_settings_returns_loaded_settings():
    settings = get_settings()  # act

    assert isinstance(settings, ExtensionSettings)
    assert settings.product_ids == ("PRD-1111-1111",)


def test_get_settings_is_cached():
    assert get_settings() is get_settings()  # act
