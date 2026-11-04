from django.conf import settings
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response


@api_view(["GET"])
def health(request: Request) -> Response:
    """Liveness check used by the hosting platform and the frontend."""
    return Response(
        {
            "status": "ok",
            "routing_configured": bool(settings.TOMTOM_API_KEY),
        }
    )
