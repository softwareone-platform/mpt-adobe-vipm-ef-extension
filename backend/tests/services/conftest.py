import datetime as dt

import pytest


@pytest.fixture
def anniversary_date():
    return dt.date.fromisoformat("2026-08-01")
