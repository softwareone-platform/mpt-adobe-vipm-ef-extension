import http

import pytest
from requests import HTTPError, JSONDecodeError
from requests.exceptions import ConnectionError as RequestsConnectionError
from requests.exceptions import RetryError, Timeout

from adobe.errors import (
    AdobeAPIError,
    AdobeConnectionError,
    AdobeError,
    AdobeHttpError,
    AuthorizationNotFoundError,
    wrap_http_error,
)


@wrap_http_error
def _return_dict():
    return {"key": "value"}


@wrap_http_error
def _raise_http_error(response):
    raise HTTPError(response=response)


@wrap_http_error
def _raise_value_error():
    raise ValueError("Not an HTTP error")


@wrap_http_error
def _raise(error):
    raise error


@wrap_http_error
def _format_with_prefix(text, *, prefix=""):
    return f"{prefix}{text}"


def test_adobe_http_error_stores_status_code_and_formats_str():
    error = AdobeHttpError(http.HTTPStatus.NOT_FOUND, "Not Found")  # act

    assert error.status_code == http.HTTPStatus.NOT_FOUND
    assert error.response_content == "Not Found"
    assert str(error) == "404 - Not Found"
    assert isinstance(error, AdobeError)


def test_authorization_not_found_error_is_adobe_error_with_message():
    error = AuthorizationNotFoundError("AUT-0000 not found.")  # act

    assert isinstance(error, AdobeError)
    assert "AUT-0000" in str(error)


def test_adobe_api_error_reads_code_message_payload_and_inherits_http_error():
    payload = {"code": "4000", "message": "Bad Request"}

    error = AdobeAPIError(http.HTTPStatus.BAD_REQUEST, payload)  # act

    assert error.status_code == http.HTTPStatus.BAD_REQUEST
    assert error.code == "4000"
    assert error.message == "Bad Request"
    assert error.payload == payload
    assert isinstance(error, AdobeHttpError)


def test_adobe_api_error_falls_back_to_error_code_field():
    error = AdobeAPIError(
        http.HTTPStatus.INTERNAL_SERVER_ERROR, {"error_code": "5000", "message": "Server Error"}
    )  # act

    assert error.code == "5000"


def test_adobe_api_error_falls_back_to_error_and_error_description_fields():
    error = AdobeAPIError(
        http.HTTPStatus.UNAUTHORIZED,
        {"error": "invalid_grant", "error_description": "Token expired"},
    )  # act

    assert error.code == "invalid_grant"
    assert error.message == "Token expired"


def test_adobe_api_error_falls_back_message_to_str_payload_when_no_message_field():
    payload = {"code": "9999"}

    error = AdobeAPIError(http.HTTPStatus.BAD_REQUEST, payload)  # act

    assert error.message == str(payload)


def test_adobe_api_error_str_without_details():
    error = AdobeAPIError(
        http.HTTPStatus.BAD_REQUEST, {"code": "4000", "message": "Bad Request"}
    )  # act

    assert str(error) == "4000 - Bad Request"


def test_adobe_api_error_str_with_details_joined_by_comma_and_reads_details_attribute():
    payload = {
        "code": "4001",
        "message": "Validation error",
        "additionalDetails": ["Field X invalid", "Field Y required"],
    }

    error = AdobeAPIError(http.HTTPStatus.BAD_REQUEST, payload)  # act

    assert error.details == ["Field X invalid", "Field Y required"]
    assert str(error) == "4001 - Validation error: Field X invalid, Field Y required"


def test_adobe_api_error_repr_returns_payload_string():
    payload = {"code": "4000", "message": "Bad Request"}

    assert repr(AdobeAPIError(http.HTTPStatus.BAD_REQUEST, payload)) == str(payload)  # act


def test_wrap_http_error_passes_through_return_value_on_success():
    assert _return_dict() == {"key": "value"}  # act


def test_wrap_http_error_raises_adobe_api_error_on_http_error_with_json(mocker):
    mock_response = mocker.Mock()
    mock_response.status_code = http.HTTPStatus.BAD_REQUEST
    mock_response.json.return_value = {"code": "4000", "message": "Bad Request"}

    with pytest.raises(AdobeAPIError) as exc_info:
        _raise_http_error(mock_response)

    assert exc_info.value.status_code == http.HTTPStatus.BAD_REQUEST
    assert exc_info.value.code == "4000"


def test_wrap_http_error_raises_adobe_http_error_when_response_has_no_json(mocker):
    mock_response = mocker.Mock()
    mock_response.status_code = http.HTTPStatus.SERVICE_UNAVAILABLE
    mock_response.json.side_effect = JSONDecodeError("msg", "doc", 0)
    mock_response.content = b"Service Unavailable"

    with pytest.raises(AdobeHttpError) as exc_info:
        _raise_http_error(mock_response)

    assert exc_info.value.status_code == http.HTTPStatus.SERVICE_UNAVAILABLE
    assert exc_info.value.response_content == "Service Unavailable"


def test_wrap_http_error_does_not_catch_non_http_errors():
    with pytest.raises(ValueError, match="Not an HTTP error"):
        _raise_value_error()


def test_adobe_connection_error_is_service_unavailable_http_error():
    error = AdobeConnectionError("retries exhausted")  # act

    assert error.status_code == http.HTTPStatus.SERVICE_UNAVAILABLE
    assert error.response_content == "retries exhausted"
    assert isinstance(error, AdobeHttpError)


@pytest.mark.parametrize(
    "error",
    [
        RetryError("too many 503 error responses"),
        RequestsConnectionError("connection reset"),
        Timeout("read timed out"),
    ],
)
def test_wrap_http_error_wraps_connection_failures_as_adobe_connection_error(error):
    with pytest.raises(AdobeConnectionError) as exc_info:
        _raise(error)

    assert exc_info.value.status_code == http.HTTPStatus.SERVICE_UNAVAILABLE
