from __future__ import annotations

import datetime as dt
import logging
import threading
from collections import defaultdict
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any
from urllib.parse import urljoin
from uuid import uuid4

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from adobe.dataclasses import APIToken, Authorization

if TYPE_CHECKING:
    from mpt_adobe_vipm_ef.settings import ExtensionSettings

logger = logging.getLogger(__name__)

EXPIRES_IN_DELAY_SECONDS = 180

_RETRY_STRATEGY = Retry(
    total=3,
    backoff_factor=0.5,
    status_forcelist={429, 500, 502, 503, 504},
    allowed_methods={"GET", "POST", "PATCH"},
)


def get_header_value(headers: Mapping[str, str], name: str) -> str:
    """Return the response header ``name`` or an empty string when it is absent.

    Kept as a module-level function taking the headers rather than a
    method on AdobeTransport: the transport is shared and used
    by concurrent requests, so storing a response's headers on it would let one
    request read another request's headers.
    """
    return headers.get(name) or ""


class AdobeTransport:
    """HTTP transport for the Adobe VIPM API.

    Owns the HTTP session, the authentication token cache and the execution of
    authenticated requests. Resource clients (e.g.
    :class:`adobe.resources.customer.CustomerClient`) are composed on top of it.
    """

    def __init__(self) -> None:
        # Deferred import: avoids a circular import via mpt_adobe_vipm_ef.context.
        from mpt_adobe_vipm_ef.settings import get_settings  # noqa: PLC0415

        self._settings: ExtensionSettings = get_settings()
        self._token_cache: dict[str, APIToken] = {}
        self._token_locks: defaultdict[str, threading.Lock] = defaultdict(threading.Lock)
        self._TIMEOUT = 60
        self._session = requests.Session()
        adapter = HTTPAdapter(max_retries=_RETRY_STRATEGY)
        self._session.mount("https://", adapter)
        self._session.mount("http://", adapter)

    @property
    def settings(self) -> ExtensionSettings:
        """The extension settings backing this transport."""
        return self._settings

    def request(  # noqa: WPS210 WPS211
        self,
        method: str,
        authorization: Authorization,
        path: str,
        *,
        correlation_id: str | None = None,
        extra_headers: Mapping[str, str] | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Perform an authenticated request against the Adobe VIPM API.

        ``extra_headers`` add caller headers (e.g. the
        ``x-recommendation-tracker-id`` attribution header on order calls). Keys
        that collide with a transport-owned header (``Authorization``,
        ``X-Api-Key``, etc.) are ignored so a caller cannot override
        authentication.
        """
        url = urljoin(self._settings.adobe_api_base_url, path)
        headers = self._get_headers(authorization, correlation_id)
        if extra_headers:
            owned = {name.lower() for name in headers}
            for name, value in extra_headers.items():  # noqa: WPS110
                if name.lower() in owned:
                    logger.warning(
                        "Ignoring caller header %r: it would override a transport-owned header",
                        name,
                    )
                    continue
                headers[name] = value
        logger.info("Adobe API request: %s %s", method, url)
        response = self._session.request(
            method, url, headers=headers, timeout=self._TIMEOUT, **kwargs
        )
        logger.info("Adobe API response: %s %s -> %s", method, url, response.status_code)
        response.raise_for_status()
        return response.json()  # type: ignore[no-any-return]

    def request_raw(
        self,
        method: str,
        authorization: Authorization,
        path: str,
        *,
        correlation_id: str | None = None,
        **kwargs: Any,
    ) -> requests.Response:
        """Like :meth:`request` but return the raw response so callers can read headers."""
        url = urljoin(self._settings.adobe_api_base_url, path)
        headers = self._get_headers(authorization, correlation_id)
        logger.info("Adobe API request: %s %s", method, url)
        response = self._session.request(
            method, url, headers=headers, timeout=self._TIMEOUT, **kwargs
        )
        logger.info("Adobe API response: %s %s -> %s", method, url, response.status_code)
        response.raise_for_status()
        return response

    def _get_headers(
        self, authorization: Authorization, correlation_id: str | None = None
    ) -> dict[str, str]:
        token = self._get_auth_token(authorization).token
        return {
            "X-Api-Key": authorization.client_id,
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-Request-Id": str(uuid4()),
            "x-correlation-id": correlation_id or str(uuid4()),
        }

    def _refresh_auth_token(self, authorization: Authorization) -> APIToken:
        """Request an authentication token for the Adobe VIPM API."""
        response = self._session.post(
            url=self._settings.adobe_auth_endpoint_url,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={
                "grant_type": "client_credentials",
                "client_id": authorization.client_id,
                "client_secret": authorization.client_secret,
                "scope": self._settings.adobe_api_scopes,
            },
            timeout=self._TIMEOUT,
        )
        response.raise_for_status()

        token_info = response.json()
        raw = int(token_info["expires_in"])
        delta = raw - EXPIRES_IN_DELAY_SECONDS if raw > EXPIRES_IN_DELAY_SECONDS else raw
        expires_in = dt.timedelta(seconds=delta)
        return APIToken(
            token=token_info["access_token"],
            expires=dt.datetime.now(tz=dt.UTC) + expires_in,
        )

    def _get_auth_token(self, authorization: Authorization) -> APIToken:
        cache_key = authorization.authorization_uk
        token: APIToken | None = self._token_cache.get(cache_key)
        if not token or token.is_expired():
            with self._token_locks[cache_key]:
                token = self._token_cache.get(cache_key)
                if not token or token.is_expired():
                    token = self._refresh_auth_token(authorization)
                    self._token_cache[cache_key] = token
        return self._token_cache[cache_key]
