import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def _clear_cache():
    """Weather/geocode caching and API throttling both use the cache; isolate every test."""
    cache.clear()
    yield
    cache.clear()


@pytest.fixture(autouse=True)
def _plain_http(settings):
    """Test clients speak plain HTTP. With DEBUG off (as in CI, which has no .env), production's
    HTTPS redirect would answer every request with a 301, so turn it off for tests only."""
    settings.SECURE_SSL_REDIRECT = False


@pytest.fixture(autouse=True)
def _server_weather(settings):
    """Most tests inject a fake weather client; client-supplied weather is tested explicitly."""
    settings.WEATHER_SOURCE = "server"
