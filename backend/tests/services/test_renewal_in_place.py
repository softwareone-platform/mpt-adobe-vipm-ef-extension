import datetime as dt
import http

import pytest
from mpt_extension_sdk.api import UpstreamServiceError, ValidationError

from adobe.enums import AdobeOrderType
from adobe.errors import AdobeAPIError, AdobeError, AdobeHttpError
from mpt_adobe_vipm_ef.services.renewal_in_place import (
    RenewalInPlace,
    find_renewal_in_place,
    load_renewal_in_place,
    require_no_renewal_in_place,
)
from tests.routers.conftest import FakeAdobeCall, FakeAdobeClient

_COTERM = "2026-10-20"
_TODAY = dt.date.fromisoformat("2026-10-01")
_AFTER_ANNIVERSARY = dt.date.fromisoformat("2026-10-21")
_CURRENT = 10
_UPSIZED = 12
_DOWNSIZED = 8


def _no_subscriptions():
    return {"items": []}


@pytest.fixture
def adobe_call(mocker):
    """Every Adobe read the check makes, routed to one recording stub."""
    call = FakeAdobeCall()
    mocker.patch(
        "mpt_adobe_vipm_ef.services.renewal_in_place.adobe_client",
        return_value=FakeAdobeClient(call),
    )
    return call


def _renewal_order(created, status="1000"):
    return {"orderId": "P-RENEWAL", "status": status, "creationDate": created}


def _subscription(status="1000", current=_CURRENT, renewal=_CURRENT, *, enabled=True):
    return {
        "subscriptionId": "a-sub-1",
        "status": status,
        "currentQuantity": current,
        "autoRenewal": {"enabled": enabled, "renewalQuantity": renewal},
    }


def test_finds_no_renewal_by_default():
    result = find_renewal_in_place(_COTERM, [], {"items": [_subscription()]}, _TODAY)

    assert result is None


@pytest.mark.parametrize(
    ("coterm", "created", "status"),
    [
        # Renewed early on 28 Sep for the 20 Oct 2026 anniversary: cotermDate rolled to 2027.
        ("2027-10-20", "2026-09-28T10:00:00Z", "1000"),
        # In flight: the cotermDate has not rolled yet.
        (_COTERM, "2026-09-30T23:00:00Z", "1002"),
    ],
)
def test_finds_an_early_renewal(coterm, created, status):
    result = find_renewal_in_place(
        coterm, [_renewal_order(created, status)], _no_subscriptions(), _TODAY
    )

    assert result is RenewalInPlace.EARLY


@pytest.mark.parametrize(
    ("coterm", "created", "status", "today"),
    [
        # Adobe's own anniversary renewal is created on the anniversary itself.
        ("2027-10-20", "2026-10-20T08:00:00Z", "1000", dt.date.fromisoformat("2026-10-25")),
        # The anniversary it renewed has passed: the renewal has taken effect.
        ("2027-10-20", "2026-09-28T10:00:00Z", "1000", _AFTER_ANNIVERSARY),
        # Older than the lookback: it cannot be an early renewal still pending.
        ("2027-10-20", "2026-08-30T10:00:00Z", "1002", _TODAY),
        # A failed renewal renews nothing.
        ("2027-10-20", "2026-09-28T10:00:00Z", "1004", _TODAY),
    ],
)
def test_ignores_a_renewal_order_that_is_not_pending(coterm, created, status, today):
    result = find_renewal_in_place(
        coterm, [_renewal_order(created, status)], _no_subscriptions(), today
    )

    assert result is None


@pytest.mark.parametrize(
    "subscription",
    [
        _subscription(status="1009", enabled=True),
        _subscription(renewal=_UPSIZED),
        # The native-order guard also counts an upsize with auto-renewal off.
        _subscription(renewal=_UPSIZED, enabled=False),
    ],
)
def test_finds_a_staged_renewal(subscription):
    result = find_renewal_in_place(_COTERM, [], {"items": [subscription]}, _TODAY)

    assert result is RenewalInPlace.STAGED


@pytest.mark.parametrize(
    "subscription",
    [
        _subscription(status="1009", enabled=False),
        _subscription(renewal=_DOWNSIZED),
        _subscription(status="1004", renewal=_UPSIZED),
        {
            "subscriptionId": "a-sub-1",
            "status": "1000",
            "currentQuantity": _CURRENT,
            "autoRenewal": {},
        },
    ],
)
def test_ignores_a_subscription_that_stages_nothing(subscription):
    result = find_renewal_in_place(_COTERM, [], {"items": [subscription]}, _TODAY)

    assert result is None


def test_a_staged_renewal_stops_locking_after_the_anniversary():
    staged = {"items": [_subscription(renewal=_UPSIZED)]}

    result = find_renewal_in_place(_COTERM, [], staged, _AFTER_ANNIVERSARY)

    assert result is None


@pytest.mark.parametrize("coterm", ["", "not-a-date"])
def test_finds_no_renewal_without_an_anniversary(coterm):
    staged = {"items": [_subscription(renewal=_UPSIZED)]}

    result = find_renewal_in_place(coterm, [], staged, _TODAY)

    assert result is None


def test_leap_day_anniversary_falls_back_to_the_last_day_of_february():
    result = find_renewal_in_place(
        "2028-02-29",
        [_renewal_order("2027-02-27T10:00:00Z")],
        _no_subscriptions(),
        dt.date.fromisoformat("2027-02-27"),
    )

    assert result is RenewalInPlace.EARLY


def test_reads_a_creation_date_without_a_timezone_as_utc():
    result = find_renewal_in_place(
        "2027-10-20", [_renewal_order("2026-09-28T10:00:00")], _no_subscriptions(), _TODAY
    )

    assert result is RenewalInPlace.EARLY


def test_skips_a_renewal_order_with_an_unusable_creation_date():
    result = find_renewal_in_place(
        "2027-10-20", [_renewal_order("not-a-date")], _no_subscriptions(), _TODAY
    )

    assert result is None


async def test_load_renewal_in_place_reads_the_customer_orders_and_subscriptions(adobe_call):
    adobe_call.answers = [
        {"cotermDate": "2027-10-20"},
        [_renewal_order("2026-09-28T10:00:00Z")],
        _no_subscriptions(),
    ]

    result = await load_renewal_in_place(None, "AUT-123", "CUST-001")

    assert result is RenewalInPlace.EARLY
    assert [call_args for call_args, _ in adobe_call.calls] == [
        ("AUT-123", "CUST-001"),
        ("AUT-123", "CUST-001", AdobeOrderType.RENEWAL),
        ("AUT-123", "CUST-001"),
    ]


@pytest.mark.parametrize(
    ("error", "expected"),
    [
        (AdobeAPIError(http.HTTPStatus.BAD_REQUEST, {"code": "1116"}), UpstreamServiceError),
        (AdobeHttpError(http.HTTPStatus.SERVICE_UNAVAILABLE, "down"), UpstreamServiceError),
        (AdobeError("Config error"), ValidationError),
    ],
)
async def test_load_renewal_in_place_maps_adobe_errors(adobe_call, error, expected):
    adobe_call.error = error

    with pytest.raises(expected):
        await load_renewal_in_place(None, "AUT-123", "CUST-001")


def test_require_no_renewal_in_place_passes_without_a_renewal():
    require_no_renewal_in_place(None)  # act


@pytest.mark.parametrize(
    ("in_place", "detail"),
    [
        (RenewalInPlace.EARLY, "early renewal has already been placed"),
        (RenewalInPlace.STAGED, "renewal has been staged"),
    ],
)
def test_require_no_renewal_in_place_refuses_with_the_reason(in_place, detail):
    with pytest.raises(ValidationError, match=detail):
        require_no_renewal_in_place(in_place)
