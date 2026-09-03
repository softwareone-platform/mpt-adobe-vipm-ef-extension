from mpt_adobe_vipm_ef.services import regions


def test_region_of_country_resolves_the_shipped_mapping():
    region = regions.region_of_country("US")  # act

    assert region == "NA"


def test_region_of_country_is_case_insensitive():
    region = regions.region_of_country("us")  # act

    assert region == "NA"


def test_region_of_country_returns_none_for_an_unmapped_country():
    region = regions.region_of_country("XX")  # act

    assert region is None


def test_region_countries_lists_every_country_of_the_region():
    countries = regions.region_countries("NA")  # act

    assert countries == ("AS", "CA", "GU", "MP", "PR", "US", "UM", "VI")


def test_region_countries_is_empty_for_an_unmapped_region():
    countries = regions.region_countries("ZZ")  # act

    assert countries == ()
