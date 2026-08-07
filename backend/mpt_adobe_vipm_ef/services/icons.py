from typing import Any

from mpt_adobe_vipm_ef.constants import PUBLIC_API_PREFIX


def resolve_icons(payload: Any, api_base_url: str) -> None:
    """Rewrite every relative ``icon`` in the payload to the URL it is served from.

    Entities carry their icon as an API path (``/v1/accounts/...``). The wizard
    runs on another origin and only knows the portal one, so it cannot resolve
    that path itself. The icons need no authentication, which lets the sync
    route hand the browser ready-to-render URLs.
    """
    if not api_base_url:
        return
    if isinstance(payload, list):
        for entry in payload:
            resolve_icons(entry, api_base_url)
    elif isinstance(payload, dict):
        _resolve_entity_icon(payload, api_base_url)
        for nested in payload.values():
            resolve_icons(nested, api_base_url)


def _asset_url(api_base_url: str) -> str:
    """Return the base the icons are served from, however the API URL is configured.

    ``MPT_API_BASE_URL`` may already carry the public prefix: the API client
    strips ``/public`` and ``/public/v1`` from it before building requests.
    """
    base_url = api_base_url.rstrip("/")
    for suffix in (f"{PUBLIC_API_PREFIX}/v1", PUBLIC_API_PREFIX):
        base_url = base_url.removesuffix(suffix)
    return f"{base_url.rstrip('/')}{PUBLIC_API_PREFIX}"


def _resolve_entity_icon(payload: dict[str, Any], api_base_url: str) -> None:
    icon = payload.get("icon")
    if isinstance(icon, str) and icon.startswith("/"):
        payload["icon"] = f"{_asset_url(api_base_url)}{icon}"
