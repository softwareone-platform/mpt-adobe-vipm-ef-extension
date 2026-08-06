from mpt_adobe_vipm_ef.services import price_list_items


def _entry(vendor_sku):
    if vendor_sku is None:
        return {"item": {}}
    return {"item": {"externalIds": {"vendor": vendor_sku}}}


def test_mark_recommended_compares_partial_skus():
    entries = [_entry("65304578CA01A12"), _entry("65322587CA01A12")]

    marked = price_list_items.mark_recommended(entries, ["65304578CA"])  # act

    assert [entry["recommended"] for entry in marked] == [True, False]


def test_mark_recommended_accepts_full_offer_ids():
    entries = [_entry("65304578CA")]

    marked = price_list_items.mark_recommended(entries, ["65304578CA01A12"])  # act

    assert marked[0]["recommended"] is True


def test_mark_recommended_handles_missing_vendor_sku():
    entries = [_entry(None), {"item": None}, {}]

    marked = price_list_items.mark_recommended(entries, ["65304578CA"])  # act

    assert [entry["recommended"] for entry in marked] == [False, False, False]


def test_mark_recommended_without_recommendations_flags_nothing():
    entries = [_entry("65304578CA01A12")]

    marked = price_list_items.mark_recommended(entries, [])  # act

    assert marked[0]["recommended"] is False
