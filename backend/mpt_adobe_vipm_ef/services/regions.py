"""Adobe region to storefront country mapping.

Adobe publishes its flexible discount catalogue per country, but a credential
set authorizes a whole Adobe region: the sync therefore resolves the region a
storefront country belongs to and walks every country of that region with the
same credentials. The mapping ships with the package
(``data/region_country_mapping.json``) because it is static Adobe metadata.
"""

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

_MAPPING_PATH = Path(__file__).parent.parent / "data" / "region_country_mapping.json"


@lru_cache(maxsize=1)
def _region_countries_map() -> dict[str, tuple[str, ...]]:
    """Load the region to countries mapping, keyed by region."""
    with _MAPPING_PATH.open(encoding="utf-8") as mapping_file:
        entries: list[dict[str, Any]] = json.load(mapping_file)
    return {
        entry["region"]: tuple(entry.get("countries") or [])
        for entry in entries
        if entry.get("region")
    }


@lru_cache(maxsize=1)
def _country_region_map() -> dict[str, str]:
    """Load the country to region mapping, keyed by country."""
    return {
        country: region
        for region, countries in _region_countries_map().items()
        for country in countries
    }


def region_of_country(country: str) -> str | None:
    """Return the Adobe region of a storefront country, or None when unmapped."""
    return _country_region_map().get(country.upper())


def region_countries(region: str) -> tuple[str, ...]:
    """Return the storefront countries of an Adobe region, empty when unmapped."""
    return _region_countries_map().get(region.upper(), ())
