from rest_framework.test import APIClient


def test_health_returns_ok():
    response = APIClient().get("/api/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_health_is_not_redirected_to_https(settings):
    """Render's health probe uses plain HTTP inside its network; it must get a 200."""
    settings.SECURE_SSL_REDIRECT = True
    settings.SECURE_REDIRECT_EXEMPT = [r"^api/health$"]
    client = APIClient()

    assert client.get("/api/health").status_code == 200
    assert client.get("/api/risk-rules").status_code == 301
