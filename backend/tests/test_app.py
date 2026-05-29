from mpt_extension_sdk.routing import (
    APIRouteDefinition,
    EventRouteDefinition,
    PlugRouteDefinition,
)

from swo_playground.app import ext_app


def test_app_registers_event_routes():
    result = ext_app.routes

    assert any(isinstance(route, EventRouteDefinition) for route in result)
    assert any(isinstance(route, PlugRouteDefinition) for route in result)


def test_app_registers_sync_route():
    result = {route.path: route for route in ext_app.routes}

    assert isinstance(result["/api/v2/agreements/{agreement_id}/sync"], APIRouteDefinition)


def test_app_generates_agreement_plug_metadata():
    result = ext_app.to_meta_config()

    assert result.plugs is not None
    assert len(result.plugs) == 1
    assert result.plugs[0].model_dump() == {
        "id": "agreement-playground",
        "name": "Playground",
        "description": "Synchronize the current agreement with Marketplace data.",
        "icon": None,
        "socket": "portal.commerce.agreements.agreement",
        "condition": None,
        "href": "/static/agreement/index.js",
    }
