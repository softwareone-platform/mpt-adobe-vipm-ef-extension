from mpt_adobe_vipm_ef.services.icons import resolve_icons

_API_BASE_URL = "https://api.dummy.test"


def test_resolve_icons_rewrites_the_icon_of_a_nested_entity():
    payload = {"id": "SUB-1", "agreement": {"vendor": {"icon": "/v1/accounts/accounts/ACC-1/icon"}}}

    resolve_icons(payload, _API_BASE_URL)  # act

    vendor = payload["agreement"]["vendor"]
    assert vendor["icon"] == f"{_API_BASE_URL}/public/v1/accounts/accounts/ACC-1/icon"


def test_resolve_icons_rewrites_the_icons_within_lists():
    payload = {"lines": [{"item": {"icon": "/v1/catalog/items/ITM-1/icon"}}]}

    resolve_icons(payload, _API_BASE_URL)  # act

    icon = payload["lines"][0]["item"]["icon"]
    assert icon == f"{_API_BASE_URL}/public/v1/catalog/items/ITM-1/icon"


def test_resolve_icons_keeps_one_public_prefix_when_the_api_url_carries_it():
    payload = {"vendor": {"icon": "/v1/accounts/accounts/ACC-1/icon"}}

    resolve_icons(payload, f"{_API_BASE_URL}/public/v1")  # act

    assert payload["vendor"]["icon"] == f"{_API_BASE_URL}/public/v1/accounts/accounts/ACC-1/icon"


def test_resolve_icons_keeps_an_absolute_icon():
    payload = {"vendor": {"icon": "https://cdn.dummy.test/icon.png"}}

    resolve_icons(payload, _API_BASE_URL)  # act

    assert payload["vendor"]["icon"] == "https://cdn.dummy.test/icon.png"


def test_resolve_icons_keeps_the_payload_without_an_api_base_url():
    payload = {"vendor": {"icon": "/v1/accounts/accounts/ACC-1/icon"}}

    resolve_icons(payload, "")  # act

    assert payload["vendor"]["icon"] == "/v1/accounts/accounts/ACC-1/icon"


def test_resolve_icons_ignores_a_non_string_icon():
    payload = {"vendor": {"icon": None}, "seller": {"name": "Dummy Seller"}}

    resolve_icons(payload, _API_BASE_URL)  # act

    assert payload == {"vendor": {"icon": None}, "seller": {"name": "Dummy Seller"}}
