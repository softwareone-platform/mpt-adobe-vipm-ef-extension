import json
import os
from dataclasses import dataclass
from functools import cached_property, lru_cache
from pathlib import Path
from typing import Any, Self, override

from mpt_extension_sdk.errors.runtime import ConfigError
from mpt_extension_sdk.settings.extension import BaseExtensionSettings

from adobe.dataclasses import Authorization
from adobe.errors import AuthorizationNotFoundError
from mpt_adobe_vipm_ef.models import ProductSegment

ADOBE_API_SCOPES = ("openid", "AdobeID", "read_organizations")


def _json_env(env_key: str, *, default: str = "{}") -> dict[str, Any]:
    """Parse a JSON object environment variable and raise ConfigError on failure."""
    raw_value = os.getenv(env_key, default)
    try:
        parsed: dict[str, Any] = json.loads(raw_value)
    except json.JSONDecodeError as error:
        raise ConfigError(f"Invalid JSON in {env_key}") from error
    if not isinstance(parsed, dict):
        raise ConfigError(f"Expected a JSON object in {env_key}, got {type(parsed).__name__}")
    return parsed


def load_product_segments() -> tuple[ProductSegment, ...]:
    """Load product segments from EXT_PRODUCT_SEGMENTS without requiring Adobe config.

    Kept independent from ExtensionSettings.load() so plug metadata generation does not
    depend on Adobe environment variables or credential files.
    """
    return tuple(
        ProductSegment(id=product_id, segment=segment)
        for product_id, segment in _json_env("EXT_PRODUCT_SEGMENTS").items()
    )


def _load_adobe_json(env_key: str) -> Any:
    raw_path = os.getenv(env_key)
    if not raw_path:
        raise ConfigError(f"Environment variable {env_key} is required for Adobe integration")
    with Path(raw_path).open(encoding="utf-8") as json_file:
        return json.load(json_file)


def _build_authorization(
    authorization_data: dict[str, Any], credentials_map: dict[str, Any]
) -> Authorization:
    auth_uk = authorization_data["authorization_uk"]
    credentials = credentials_map.get(auth_uk)
    if credentials is None:
        raise ConfigError(f"No Adobe credentials found for authorization_uk={auth_uk}")
    return Authorization(
        authorization_uk=auth_uk,
        authorization_id=authorization_data.get("authorization_id"),
        name=credentials["name"],
        client_id=credentials["client_id"],
        client_secret=credentials["client_secret"],
        currency=authorization_data["currency"],
        distributor_id=authorization_data["distributor_id"],
    )


def _load_adobe_authorizations() -> dict[str, Authorization]:
    authorizations_data = _load_adobe_json("EXT_ADOBE_AUTHORIZATIONS_FILE")
    credentials_map = {
        credential["authorization_uk"]: credential
        for credential in _load_adobe_json("EXT_ADOBE_CREDENTIALS_FILE")
    }

    authorizations: dict[str, Authorization] = {}
    for authorization_data in authorizations_data["authorizations"]:
        authorization = _build_authorization(authorization_data, credentials_map)
        authorizations[authorization.authorization_uk] = authorization
        if authorization.authorization_id:
            authorizations[authorization.authorization_id] = authorization
    return authorizations


@dataclass(frozen=True)
class ExtensionSettings(BaseExtensionSettings):
    """Extension settings."""

    product_ids: tuple[str, ...]
    product_segments: tuple[ProductSegment, ...]
    adobe_auth_endpoint_url: str
    adobe_api_base_url: str

    @cached_property
    def adobe_authorizations(self) -> dict[str, Authorization]:
        """Adobe authorizations, loaded lazily so metadata generation needs no Adobe files."""
        return _load_adobe_authorizations()

    @property
    def adobe_api_scopes(self) -> str:
        """Adobe API scopes joined by comma."""
        return ",".join(ADOBE_API_SCOPES)

    @override
    @property
    def required_env_vars(self) -> list[tuple[Any, ...]]:
        return [
            (self.product_ids, "Product ids is required (MPT_PRODUCTS_IDS)"),
            (
                self.adobe_auth_endpoint_url,
                "Adobe auth endpoint URL is required (EXT_ADOBE_AUTH_ENDPOINT_URL)",
            ),
            (self.adobe_api_base_url, "Adobe API base URL is required (EXT_ADOBE_API_BASE_URL)"),
        ]

    def get_authorization(self, auth_id: str) -> Authorization:
        """Return an Authorization based on its identifier (uk or id)."""
        try:
            return self.adobe_authorizations[auth_id]
        except KeyError:
            raise AuthorizationNotFoundError(f"Authorization with uk/id {auth_id} not found.")

    @override
    @classmethod
    def load(cls) -> Self:
        return cls(
            product_ids=tuple(cls.list_env("MPT_PRODUCTS_IDS")),
            product_segments=load_product_segments(),
            adobe_auth_endpoint_url=os.getenv("EXT_ADOBE_AUTH_ENDPOINT_URL", ""),
            adobe_api_base_url=os.getenv("EXT_ADOBE_API_BASE_URL", ""),
        )


@lru_cache
def get_settings() -> ExtensionSettings:
    """Return the cached extension settings singleton."""
    return ExtensionSettings.load()
