import pytest
from mpt_api_client.exceptions import MPTError
from mpt_extension_sdk.api import ForbiddenError, UpstreamServiceError

from mpt_adobe_vipm_ef.routers.api.agreement_subscriptions import get_agreement_subscriptions

_AGREEMENT_ID = "AGR-1234-5678"


class FakeAgreementSubscriptions:
    """Async stub for fetch_agreement_subscriptions, recording its calls."""

    def __init__(self, subscriptions=None, error=None):
        self._subscriptions = subscriptions or []
        self._error = error
        self.calls = []

    async def __call__(self, ctx, agreement_id):
        self.calls.append(agreement_id)
        if self._error is not None:
            raise self._error
        return self._subscriptions


def _patch_fetch(monkeypatch, fake):
    monkeypatch.setattr(
        "mpt_adobe_vipm_ef.routers.api.agreement_subscriptions.fetch_agreement_subscriptions",
        fake,
    )
    return fake


async def test_get_agreement_subscriptions_returns_the_live_subscriptions(
    fake_ctx, resolve_ids, monkeypatch
):
    subscriptions = [{"id": "SUB-1", "status": "Active", "lines": [{"id": "ALI-0002"}]}]
    fake = _patch_fetch(monkeypatch, FakeAgreementSubscriptions(subscriptions))

    result = await get_agreement_subscriptions(_AGREEMENT_ID, fake_ctx)  # act

    assert result.payload == subscriptions
    assert fake.calls == [_AGREEMENT_ID]


async def test_get_agreement_subscriptions_maps_mpt_errors_to_upstream_error(
    fake_ctx, resolve_ids, monkeypatch
):
    _patch_fetch(monkeypatch, FakeAgreementSubscriptions(error=MPTError("boom")))

    with pytest.raises(UpstreamServiceError):
        await get_agreement_subscriptions(_AGREEMENT_ID, fake_ctx)


async def test_get_agreement_subscriptions_raises_forbidden_when_product_not_allowed(
    fake_ctx, patch_agreement, agreement_factory, disallowed_product_id
):
    patch_agreement(agreement_factory(product_id=disallowed_product_id))

    with pytest.raises(ForbiddenError):
        await get_agreement_subscriptions(_AGREEMENT_ID, fake_ctx)
