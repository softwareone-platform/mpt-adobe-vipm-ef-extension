import json

from mpt_adobe_vipm_ef.routers.plugs import agreement_plugs
from mpt_adobe_vipm_ef.settings import get_settings


def test_agreement_plug_metadata(monkeypatch):
    monkeypatch.setenv("MPT_PRODUCTS_IDS", "PRD-1111-1111")
    monkeypatch.setenv("EXT_PRODUCT_SEGMENTS", json.dumps({"PRD-1111-1111": "COM"}))
    get_settings.cache_clear()

    plug = agreement_plugs()[0]  # act

    assert plug.id == "agreement-adobe"
    assert plug.socket == "portal.commerce.agreements.agreement"
    assert plug.href == "/static/agreement/index.js"


def test_request_commitment_modal_plug_metadata(monkeypatch):
    monkeypatch.setenv("MPT_PRODUCTS_IDS", "PRD-1111-1111")
    monkeypatch.setenv("EXT_PRODUCT_SEGMENTS", json.dumps({"PRD-1111-1111": "COM"}))
    get_settings.cache_clear()

    plug = agreement_plugs()[1]  # act

    assert plug.id == "request-commitment-action"
    assert plug.socket == "portal.commerce.agreements.agreement.modal"
    assert plug.href == "/static/request-commitment-action/index.js"


def test_request_discount_plug_metadata(monkeypatch):
    monkeypatch.setenv("MPT_PRODUCTS_IDS", "PRD-1111-1111")
    monkeypatch.setenv("EXT_PRODUCT_SEGMENTS", json.dumps({"PRD-1111-1111": "COM"}))
    get_settings.cache_clear()

    plug = agreement_plugs()[4]  # act

    assert plug.id == "request-discount-action"
    assert plug.socket == "portal.commerce.agreements.agreement.modal"
    assert plug.href == "/static/request-discount-action/index.js"


def test_request_midterm_upgrade_plug_metadata(monkeypatch):
    monkeypatch.setenv("MPT_PRODUCTS_IDS", "PRD-1111-1111")
    monkeypatch.setenv("EXT_PRODUCT_SEGMENTS", json.dumps({"PRD-1111-1111": "COM"}))
    get_settings.cache_clear()

    plug = agreement_plugs()[5]  # act

    assert plug.id == "request-midterm-upgrade-action"
    assert plug.name == "Upgrade"
    assert plug.socket == "portal.commerce.subscriptions.subscription.actions"
    assert plug.href == "/static/request-midterm-upgrade-action/index.js"


def test_subscription_plug_condition_lists_products(monkeypatch):
    monkeypatch.setenv("MPT_PRODUCTS_IDS", "PRD-1111-1111")
    monkeypatch.setenv(
        "EXT_PRODUCT_SEGMENTS", json.dumps({"PRD-1111-1111": "COM", "PRD-2222-2222": "EDU"})
    )
    get_settings.cache_clear()

    plug = agreement_plugs()[5]  # act

    assert plug.condition == (
        "and("
        "in(subscription.product.id,(PRD-1111-1111,PRD-2222-2222)),"
        "eq(subscription.status,Active)"
        ")"
    )


def test_plug_condition_lists_products(monkeypatch):
    monkeypatch.setenv("MPT_PRODUCTS_IDS", "PRD-1111-1111")
    monkeypatch.setenv(
        "EXT_PRODUCT_SEGMENTS", json.dumps({"PRD-1111-1111": "COM", "PRD-2222-2222": "EDU"})
    )
    get_settings.cache_clear()

    plug = agreement_plugs()[0]  # act

    assert plug.condition == "in(agreement.product.id,(PRD-1111-1111,PRD-2222-2222))"


def test_plug_condition_empty(monkeypatch):
    monkeypatch.setenv("MPT_PRODUCTS_IDS", "PRD-1111-1111")
    monkeypatch.delenv("EXT_PRODUCT_SEGMENTS", raising=False)
    get_settings.cache_clear()

    plug = agreement_plugs()[0]  # act

    assert plug.condition == "in(agreement.product.id,())"
