import datetime as dt

import pytest


@pytest.fixture
def anniversary_date():
    return dt.date.fromisoformat("2026-08-01")


@pytest.fixture
def active_subscriptions():
    return [
        {"subscriptionId": "SUB-001", "status": "1000"},
        {"subscriptionId": "SUB-002", "status": "1004"},
    ]


@pytest.fixture
def inactive_subscriptions():
    return [
        {"subscriptionId": "SUB-001", "status": "1004"},
        {"subscriptionId": "SUB-002", "status": "1009"},
    ]
