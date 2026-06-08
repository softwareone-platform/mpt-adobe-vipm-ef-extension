import datetime as dt
import json

import pytest

from adobe.client import AdobeClient, reset_adobe_client
from adobe.dataclasses import APIToken, Authorization
from adobe.transport import AdobeTransport
from mpt_adobe_vipm_ef.settings import get_settings


@pytest.fixture(autouse=True)
def reset_singletons():
    get_settings.cache_clear()
    reset_adobe_client()
    yield
    get_settings.cache_clear()
    reset_adobe_client()


@pytest.fixture
def credentials_data():
    return [
        {
            "authorization_uk": "rs-adobe-auth-usd",
            "name": "Test Credentials",
            "client_id": "test_client_id_1234",
            "client_secret": "test_secret_5678",
        }
    ]


@pytest.fixture
def authorizations_data():
    return {
        "authorizations": [
            {
                "authorization_uk": "rs-adobe-auth-usd",
                "authorization_id": "AUT-1234-5678",
                "distributor_id": "dist-123",
                "currency": "USD",
            }
        ]
    }


@pytest.fixture
def adobe_env(tmp_path, monkeypatch, credentials_data, authorizations_data):
    cred_file = tmp_path / "credentials.json"
    cred_file.write_text(json.dumps(credentials_data))
    auth_file = tmp_path / "authorizations.json"
    auth_file.write_text(json.dumps(authorizations_data))

    monkeypatch.setenv("MPT_PRODUCTS_IDS", "PRD-1111-1111")
    monkeypatch.setenv("EXT_ADOBE_CREDENTIALS_FILE", str(cred_file))
    monkeypatch.setenv("EXT_ADOBE_AUTHORIZATIONS_FILE", str(auth_file))
    monkeypatch.setenv("EXT_ADOBE_AUTH_ENDPOINT_URL", "https://ims-na1.adobelogin.com/ims/token/v3")
    monkeypatch.setenv("EXT_ADOBE_API_BASE_URL", "https://api.adobe.io")


@pytest.fixture
def authorization():
    return Authorization(
        authorization_uk="rs-adobe-auth-usd",
        authorization_id="AUT-1234-5678",
        name="Test Credentials",
        client_id="test_client_id_1234",
        client_secret="test_secret_5678",  # noqa: S106
        currency="USD",
        distributor_id="dist-123",
    )


@pytest.fixture
def valid_token():
    return APIToken(
        token="test_access_token",  # noqa: S106
        expires=dt.datetime.now(tz=dt.UTC) + dt.timedelta(hours=1),
    )


@pytest.fixture
def expired_token():
    return APIToken(
        token="old_access_token",  # noqa: S106
        expires=dt.datetime.now(tz=dt.UTC) - dt.timedelta(seconds=1),
    )


@pytest.fixture
def adobe_transport(adobe_env, authorization, valid_token):
    transport = AdobeTransport()
    transport._token_cache[authorization.authorization_uk] = valid_token
    return transport


@pytest.fixture
def adobe_client(adobe_env, authorization, valid_token):
    client = AdobeClient()
    client._transport._token_cache[authorization.authorization_uk] = valid_token
    return client


@pytest.fixture
def customer_data():
    return {
        "customerId": "CUST-001",
        "companyProfile": {
            "companyName": "Test Corp",
            "preferredLanguage": "en-US",
            "address": {
                "country": "US",
                "region": "CA",
                "city": "San Francisco",
                "addressLine1": "123 Main St",
                "postalCode": "94102",
                "phoneNumber": "+1234567890",
            },
        },
        "benefits": [],
        "globalSalesEnabled": False,
    }
