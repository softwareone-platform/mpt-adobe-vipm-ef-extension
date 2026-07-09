import functools
import inspect
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from mpt_extension_sdk.api import APIResponse

logger = logging.getLogger(__name__)


def log_inputs(
    wrapped: Callable[..., Awaitable[APIResponse]],
) -> Callable[..., Awaitable[APIResponse]]:
    """Log a route handler's string inputs, stripped of CRLF to prevent log injection."""
    handler_signature = inspect.signature(wrapped)

    @functools.wraps(wrapped)
    async def wrapper(*args: Any, **kwargs: Any) -> APIResponse:
        bound = handler_signature.bind(*args, **kwargs)
        logged_inputs = {
            name: argument.replace("\r", "").replace("\n", "")
            for name, argument in bound.arguments.items()
            if isinstance(argument, str)
        }
        logger.info("%s called with %s", wrapped.__name__, logged_inputs)
        return await wrapped(*args, **kwargs)

    return wrapper
