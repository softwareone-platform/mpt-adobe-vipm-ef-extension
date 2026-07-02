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
