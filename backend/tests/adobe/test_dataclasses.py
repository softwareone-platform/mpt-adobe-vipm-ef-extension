import dataclasses
import datetime as dt

import pytest

from adobe.dataclasses import APIToken, Authorization, _wrap_secret  # noqa: PLC2701


def test_wrap_secret_masks_middle_and_preserves_first_and_last_four_chars():
    result = _wrap_secret("abcd1234efgh5678")

    assert result == "abcd******5678"


def test_authorization_repr_masks_secrets_and_shows_other_fields():
    auth = Authorization(
        authorization_uk="rs-adobe-auth-usd",
        authorization_id="AUT-1234-5678",
        name="Test",
        client_id="abcd1234efgh5678",
        client_secret="wxyz1234ijkl5678",  # noqa: S106
        currency="USD",
        distributor_id="dist-123",
    )

    result = repr(auth)

    assert "abcd1234efgh5678" not in result
    assert "wxyz1234ijkl5678" not in result
    assert "rs-adobe-auth-usd" in result
    assert "AUT-1234-5678" in result
    assert "USD" in result


def test_authorization_id_can_be_none():
    auth = Authorization(
        authorization_uk="rs-adobe-auth-usd",
        authorization_id=None,
        name="Test",
        client_id="test_client_id",
        client_secret="test_secret",  # noqa: S106
        currency="USD",
        distributor_id="dist-123",
    )  # act

    assert auth.authorization_id is None


def test_authorization_is_frozen():
    auth = Authorization(
        authorization_uk="rs-adobe-auth-usd",
        authorization_id=None,
        name="Test",
        client_id="test_client_id",
        client_secret="test_secret",  # noqa: S106
        currency="USD",
        distributor_id="dist-123",
    )

    with pytest.raises(dataclasses.FrozenInstanceError):
        auth.name = "Changed"  # type: ignore[misc]


def test_api_token_is_not_expired_with_future_expiry():
    now = dt.datetime.now(tz=dt.UTC)
    token = APIToken(token="t", expires=now + dt.timedelta(hours=1))  # noqa: S106

    result = token.is_expired()  # act

    assert result is False


def test_api_token_is_expired_with_past_expiry():
    now = dt.datetime.now(tz=dt.UTC)
    token = APIToken(token="t", expires=now - dt.timedelta(seconds=1))  # noqa: S106

    result = token.is_expired()  # act

    assert result is True


def test_api_token_is_frozen():
    now = dt.datetime.now(tz=dt.UTC)
    token = APIToken(token="t", expires=now + dt.timedelta(hours=1))  # noqa: S106

    with pytest.raises(dataclasses.FrozenInstanceError):
        token.token = "changed"  # type: ignore[misc]
