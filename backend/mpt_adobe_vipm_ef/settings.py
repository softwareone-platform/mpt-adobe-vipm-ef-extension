import json
import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Self, override

from mpt_extension_sdk.errors.runtime import ConfigError
from mpt_extension_sdk.settings.extension import BaseExtensionSettings

from mpt_adobe_vipm_ef.models import ProductSegment


@dataclass(frozen=True)
class ExtensionSettings(BaseExtensionSettings):
    """Extension settings."""

    product_ids: tuple[str, ...]
    product_segments: tuple[ProductSegment, ...]

    @override
    @property
    def required_env_vars(self) -> list[tuple[Any, ...]]:
        return [
            (self.product_ids, "Product ids is required (MPT_PRODUCTS_IDS)"),
        ]

    @classmethod
    def json_env(cls, env_key: str, *, default: str = "{}") -> dict[str, Any]:
        """Parse a JSON object environment variable and raise ConfigError on failure."""
        raw_value = os.getenv(env_key, default)
        try:
            parsed: dict[str, Any] = json.loads(raw_value)
        except json.JSONDecodeError as error:
            raise ConfigError(f"Invalid JSON in {env_key}") from error
        if not isinstance(parsed, dict):
            raise ConfigError(f"Expected a JSON object in {env_key}, got {type(parsed).__name__}")
        return parsed

    @override
    @classmethod
    def load(cls) -> Self:
        return cls(
            product_ids=tuple(cls.list_env("MPT_PRODUCTS_IDS")),
            product_segments=tuple(
                ProductSegment(id=product_id, segment=segment)
                for product_id, segment in cls.json_env("EXT_PRODUCT_SEGMENTS").items()
            ),
        )


@lru_cache
def get_settings() -> ExtensionSettings:
    """Return the cached extension settings singleton."""
    return ExtensionSettings.load()
