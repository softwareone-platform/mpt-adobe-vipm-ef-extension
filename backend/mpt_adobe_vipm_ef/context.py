"""Extiende el ``APIContext`` del SDK con acceso al cliente de Adobe.

El SDK construye el ``APIContext`` internamente y no expone un hook para
inyectar campos extra en rutas API, pero sí reserva ``APIContext.state`` para
estado de extensiones. Aquí registramos una ``property`` de solo lectura que
construye el cliente de Adobe de forma perezosa y lo cachea en ese ``state``,
de modo que los handlers puedan usar ``ctx.adobe_client`` directamente.
"""

import logging
from typing import Protocol, cast

from mpt_extension_sdk.api.context import APIContext

from adobe.client import AdobeClient, get_adobe_client

_ADOBE_CLIENT_KEY = "adobe_client"

logging.getLogger("adobe").setLevel(logging.INFO)


def _adobe_client(self: APIContext) -> AdobeClient:
    """Construye (una vez) y cachea el cliente de Adobe en el contexto."""
    client = self.state.get(_ADOBE_CLIENT_KEY)
    if client is None:
        client = get_adobe_client()
        self.state[_ADOBE_CLIENT_KEY] = client
    return client


APIContext.adobe_client = property(_adobe_client)  # type: ignore[attr-defined]


class _SupportsAdobeClient(Protocol):
    adobe_client: AdobeClient


def adobe_client(ctx: APIContext) -> AdobeClient:
    """Typed accessor for the Adobe client attached to the request context.

    ``adobe_client`` is registered on ``APIContext`` as a property at runtime, so
    the type checker cannot see it. Viewing the context through the
    :class:`_SupportsAdobeClient` protocol lets handlers call ``adobe_client(ctx)`` with
    full typing and no per-call ``type: ignore``.
    """
    return cast(_SupportsAdobeClient, ctx).adobe_client
