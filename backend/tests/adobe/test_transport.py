import datetime as dt
import http

import pytest

from adobe.transport import AdobeTransport
from mpt_adobe_vipm_ef.settings import ADOBE_API_SCOPES

_UUID_LENGTH = 36
_TOKEN_EXPIRY_SECONDS = 3600
_TOKEN_EXPIRY_DELAY_SECONDS = 180


def test_transport_init_has_empty_cache_and_sixty_second_timeout(adobe_env):
    transport = AdobeTransport()  # act

    assert transport._token_cache == {}
    assert transport._TIMEOUT == 60


def test_get_headers_returns_all_required_headers_with_uuid_ids(
    adobe_transport, authorization, valid_token
):
    headers = adobe_transport._get_headers(authorization)  # act

    assert headers == {
        "X-Api-Key": authorization.client_id,
        "Authorization": f"Bearer {valid_token.token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Request-Id": headers["X-Request-Id"],
        "x-correlation-id": headers["x-correlation-id"],
    }
    assert len(headers["X-Request-Id"]) == _UUID_LENGTH
    assert len(headers["x-correlation-id"]) == _UUID_LENGTH


def test_get_headers_uses_provided_correlation_id(adobe_transport, authorization):
    headers = adobe_transport._get_headers(authorization, correlation_id="fixed-id")  # act

    assert headers["x-correlation-id"] == "fixed-id"


def test_request_adds_permitted_extra_headers_without_touching_auth(
    mocker, adobe_transport, authorization, valid_token
):
    request_mock = mocker.patch.object(adobe_transport._session, "request")
    request_mock.return_value = mocker.Mock(status_code=http.HTTPStatus.OK, json=dict)

    adobe_transport.request(  # act
        "POST",
        authorization,
        "/v3/customers/CUST-000/orders",
        extra_headers={"x-recommendation-tracker-id": "TRACKER-1"},
    )

    _, call_kwargs = request_mock.call_args
    headers = call_kwargs["headers"]
    assert headers["x-recommendation-tracker-id"] == "TRACKER-1"
    assert headers["Authorization"] == f"Bearer {valid_token.token}"


def test_request_ignores_extra_headers_that_override_transport_headers(
    mocker, adobe_transport, authorization, valid_token
):
    request_mock = mocker.patch.object(adobe_transport._session, "request")
    request_mock.return_value = mocker.Mock(status_code=http.HTTPStatus.OK, json=dict)

    adobe_transport.request(  # act
        "POST",
        authorization,
        "/v3/customers/CUST-000/orders",
        extra_headers={
            "Authorization": "Bearer spoofed",
            "x-api-key": "spoofed-key",
            "x-recommendation-tracker-id": "TRACKER-1",
        },
    )

    _, call_kwargs = request_mock.call_args
    headers = call_kwargs["headers"]
    assert headers["Authorization"] == f"Bearer {valid_token.token}"
    assert headers["X-Api-Key"] == authorization.client_id
    assert "x-api-key" not in headers
    assert headers["x-recommendation-tracker-id"] == "TRACKER-1"


def test_refresh_auth_token_fetches_token_and_is_not_expired(
    mocker, adobe_transport, authorization
):
    mock_response = mocker.Mock()
    mock_response.json.return_value = {"access_token": "fresh_token", "expires_in": 3600}
    mocker.patch.object(adobe_transport._session, "post", return_value=mock_response)
    adobe_transport._token_cache.clear()

    token = adobe_transport._refresh_auth_token(authorization)  # act

    assert token.token == "fresh_token"
    assert not token.is_expired()
    assert authorization.authorization_uk not in adobe_transport._token_cache


def test_refresh_auth_token_calls_auth_endpoint_with_correct_parameters(
    mocker, adobe_transport, authorization
):
    mock_response = mocker.Mock()
    mock_response.json.return_value = {"access_token": "token", "expires_in": 3600}
    mock_post = mocker.patch.object(adobe_transport._session, "post", return_value=mock_response)

    adobe_transport._refresh_auth_token(authorization)  # act

    mock_post.assert_called_once_with(
        url="https://ims-na1.adobelogin.com/ims/token/v3",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data={
            "grant_type": "client_credentials",
            "client_id": authorization.client_id,
            "client_secret": authorization.client_secret,
            "scope": ",".join(ADOBE_API_SCOPES),
        },
        timeout=60,
    )


def test_refresh_auth_token_applies_expiry_delay_offset(mocker, adobe_transport, authorization):
    mock_response = mocker.Mock()
    mock_response.json.return_value = {"access_token": "token", "expires_in": 3600}
    mocker.patch.object(adobe_transport._session, "post", return_value=mock_response)
    adobe_transport._token_cache.clear()

    token = adobe_transport._refresh_auth_token(authorization)  # act

    expected_expiry = dt.datetime.now(tz=dt.UTC) + dt.timedelta(
        seconds=_TOKEN_EXPIRY_SECONDS - _TOKEN_EXPIRY_DELAY_SECONDS
    )
    assert abs((token.expires - expected_expiry).total_seconds()) < 2


def test_refresh_auth_token_raises_on_http_error(mocker, adobe_transport, authorization):
    mock_response = mocker.Mock()
    mock_response.raise_for_status.side_effect = Exception("Unauthorized")
    mocker.patch.object(adobe_transport._session, "post", return_value=mock_response)
    adobe_transport._token_cache.clear()

    with pytest.raises(Exception, match="Unauthorized"):
        adobe_transport._refresh_auth_token(authorization)


def test_get_auth_token_returns_cached_valid_token_without_calling_auth_endpoint(
    mocker, adobe_transport, authorization, valid_token
):
    mock_post = mocker.patch.object(adobe_transport._session, "post")

    result = adobe_transport._get_auth_token(authorization)

    mock_post.assert_not_called()
    assert result is valid_token


def test_get_auth_token_refreshes_when_no_token_is_cached(mocker, adobe_transport, authorization):
    mock_response = mocker.Mock()
    mock_response.json.return_value = {"access_token": "new_token", "expires_in": 3600}
    mocker.patch.object(adobe_transport._session, "post", return_value=mock_response)
    adobe_transport._token_cache.clear()

    result = adobe_transport._get_auth_token(authorization)

    assert result.token == "new_token"


def test_get_auth_token_refreshes_expired_token(
    mocker, adobe_transport, authorization, expired_token
):
    adobe_transport._token_cache[authorization.authorization_uk] = expired_token
    mock_response = mocker.Mock()
    mock_response.json.return_value = {"access_token": "refreshed_token", "expires_in": 3600}
    mocker.patch.object(adobe_transport._session, "post", return_value=mock_response)

    result = adobe_transport._get_auth_token(authorization)

    assert result.token == "refreshed_token"


def test_refresh_auth_token_clamps_expiry_when_expires_in_is_at_or_below_delay(
    mocker, adobe_transport, authorization
):
    mock_response = mocker.Mock()
    mock_response.json.return_value = {"access_token": "short_token", "expires_in": 60}
    mocker.patch.object(adobe_transport._session, "post", return_value=mock_response)
    adobe_transport._token_cache.clear()

    token = adobe_transport._refresh_auth_token(authorization)  # act

    assert token.token == "short_token"
    assert not token.is_expired()
    now = dt.datetime.now(tz=dt.UTC)
    expected_expiry = now + dt.timedelta(seconds=60)
    assert abs((token.expires - expected_expiry).total_seconds()) < 2
