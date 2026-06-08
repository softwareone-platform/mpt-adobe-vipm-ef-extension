import json
import logging
from collections.abc import Callable
from functools import wraps
from http import HTTPStatus
from typing import Any, NoReturn, ParamSpec, TypeVar

from requests import HTTPError, JSONDecodeError, RequestException

Param = ParamSpec("Param")  # noqa: WPS110
RetType = TypeVar("RetType")

logger = logging.getLogger(__name__)


class AdobeError(Exception):
    """Basic Adobe Client Error."""


class AuthorizationNotFoundError(AdobeError):
    """Authorization not found in configuration."""


class AdobeHttpError(AdobeError):
    """Basic Adobe API HTTP error."""

    def __init__(self, status_code: int, response_content: str):
        self.status_code = status_code
        self.response_content = response_content
        super().__init__(f"{self.status_code} - {self.response_content}")


class AdobeConnectionError(AdobeHttpError):
    """Adobe API connection failure: network error, timeout or retries exhausted.

    Raised when the request never produced an HTTP response (e.g. urllib3
    ``MaxRetryError``/``RetryError`` after the staging IMS endpoint returns
    repeated 503s, connection resets or read timeouts). Modelled as a
    ``503 Service Unavailable`` so route handlers map it to an upstream service
    error instead of letting the raw ``requests`` exception surface as a 500.
    """

    def __init__(self, response_content: str) -> None:
        super().__init__(HTTPStatus.SERVICE_UNAVAILABLE, response_content)


class AdobeAPIError(AdobeHttpError):
    """Adobe API error."""

    def __init__(self, status_code: int, payload: dict[str, Any]) -> None:
        super().__init__(status_code, json.dumps(payload))
        self.payload: dict[str, Any] = payload
        # 504 error response doesn't follow the expected format -
        # it uses "error_code" field instead of "code"
        self.code: str | None = payload.get("code")
        if not self.code:
            self.code = payload.get("error_code")
        if not self.code:
            self.code = payload.get("error")

        self.message: str = (
            payload.get("message") or payload.get("error_description") or str(payload)
        )
        self.details: list[Any] = payload.get("additionalDetails", [])

    def __str__(self) -> str:
        """Stringify Adobe API error."""
        message = f"{self.code} - {self.message}"
        if self.details:
            details_str = ", ".join(self.details)
            message = f"{message}: {details_str}"
        return message

    def __repr__(self) -> str:
        """Repr Adobe API error."""
        return str(self.payload)


def _raise_http_error_as_adobe(error: HTTPError) -> NoReturn:
    """Log and re-raise ``HTTPError`` as ``AdobeHttpError`` or ``AdobeAPIError``."""
    response = error.response
    if response is None:
        raise AdobeHttpError(0, str(error)) from error
    try:  # noqa: WPS328, WPS505
        raise AdobeAPIError(response.status_code, response.json())
    except JSONDecodeError:
        raise AdobeHttpError(response.status_code, response.content.decode())


def wrap_http_error(func: Callable[Param, RetType]) -> Callable[Param, RetType]:  # noqa: UP047
    """Wrap HTTP errors raised by ``requests`` into Adobe-specific exceptions."""

    @wraps(func)
    def _wrapper(*args: Param.args, **kwargs: Param.kwargs) -> RetType:  # noqa: WPS430
        try:
            return func(*args, **kwargs)
        except HTTPError as error:
            _raise_http_error_as_adobe(error)
        except RequestException as error:
            raise AdobeConnectionError(str(error)) from error

    return _wrapper
