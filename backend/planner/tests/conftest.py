import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def _clear_cache():
    """Weather/geocode caching and API throttling both use the cache; isolate every test."""
    cache.clear()
    yield
    cache.clear()
