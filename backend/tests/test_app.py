import json

import pytest
from mpt_extension_sdk.routing import (
    APIRouteDefinition,
    EventRouteDefinition,
    PlugRouteDefinition,
)

from mpt_adobe_vipm_ef.app import ext_app
from mpt_adobe_vipm_ef.settings import get_settings


def test_app_registers_event_routes():
    result = ext_app.routes

    assert any(isinstance(route, EventRouteDefinition) for route in result)
    assert any(isinstance(route, PlugRouteDefinition) for route in result)


@pytest.mark.parametrize(
    "path",
    [
        "/api/v2/agreements/{agreement_id}/sync",
        "/api/v2/settings",
        "/api/v2/discount-codes",
        "/api/v2/discount-codes/{discount_id}",
        "/api/v2/agreements/{agreement_id}/renewal-order",
        "/api/v2/agreements/{agreement_id}/renewal-order/3yc-check",
        "/api/v2/agreements/{agreement_id}/renewal-order/preview",
    ],
)
def test_app_registers_api_route(path):
    result = {route.path: route for route in ext_app.routes}

    assert isinstance(result[path], APIRouteDefinition)


def test_app_generates_agreement_plug_metadata(monkeypatch):  # noqa: WPS218
    monkeypatch.setenv("MPT_PRODUCTS_IDS", "PRD-1111-1111")
    monkeypatch.setenv(
        "EXT_PRODUCT_SEGMENTS", json.dumps({"PRD-1111-1111": "COM", "PRD-2222-2222": "EDU"})
    )
    get_settings.cache_clear()

    result = ext_app.to_meta_config()

    assert result.plugs is not None
    assert len(result.plugs) == 5
    assert result.plugs[0].model_dump() == {
        "id": "agreement-adobe",
        "name": "Adobe",
        "description": "Synchronize the current agreement with Marketplace data.",
        "icon": None,
        "socket": "portal.commerce.agreements.agreement",
        "condition": "in(agreement.product.id,(PRD-1111-1111,PRD-2222-2222))",
        "href": "/static/agreement/index.js",
    }
    assert result.plugs[1].model_dump() == {
        "id": "request-commitment-action",
        "name": "Request 3-year commitment",
        "description": "Request or update an Adobe 3-year commitment for the agreement.",
        "icon": None,
        "socket": "portal.commerce.agreements.agreement.modal",
        "condition": "in(agreement.product.id,(PRD-1111-1111,PRD-2222-2222))",
        "href": "/static/request-commitment-action/index.js",
    }
    assert result.plugs[2].model_dump() == {
        "id": "request-linked-membership-action",
        "name": "Create linked membership",
        "description": "Create an Adobe linked membership for the agreement's customer.",
        "icon": None,
        "socket": "portal.commerce.agreements.agreement.modal",
        "condition": "in(agreement.product.id,(PRD-1111-1111,PRD-2222-2222))",
        "href": "/static/request-linked-membership-action/index.js",
    }
    assert result.plugs[3].model_dump() == {
        "id": "request-global-customer-action",
        "name": "Update global customer",
        "description": "Enable global sales for the agreement's Adobe customer.",
        "icon": None,
        "socket": "portal.commerce.agreements.agreement.modal",
        "condition": "in(agreement.product.id,(PRD-1111-1111,PRD-2222-2222))",
        "href": "/static/request-global-customer-action/index.js",
    }
    assert result.plugs[4].model_dump() == {
        "id": "request-midterm-upgrade-action",
        "name": "Upgrade",
        "description": "Request a mid-term upgrade for the subscription.",
        "icon": None,
        "socket": "portal.commerce.subscriptions.subscription.actions",
        "condition": "and("
        "in(subscription.product.id,(PRD-1111-1111,PRD-2222-2222)),"
        "eq(subscription.status,Active)"
        ")",
        "href": "/static/request-midterm-upgrade-action/index.js",
    }
