"""Errors the API turns into clean JSON responses (see `exception_handler`)."""

from __future__ import annotations

from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler


class PlannerError(Exception):
    """Base class. `status_code` and `code` are used for the HTTP response."""

    status_code = 500
    code = "error"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class UpstreamError(PlannerError):
    """A third-party API failed or returned something unusable."""

    status_code = 502
    code = "upstream_error"

    def __init__(self, service: str, message: str) -> None:
        super().__init__(f"{service}: {message}")
        self.service = service


class NoRouteFound(PlannerError):
    status_code = 422
    code = "no_route"


class ConfigurationError(PlannerError):
    """The server is missing configuration, such as an API key."""

    status_code = 503
    code = "not_configured"


def exception_handler(exc: Exception, context: dict) -> Response | None:
    """Every error response has the same shape: {"detail", "code"} plus "errors" for bad input."""
    if isinstance(exc, PlannerError):
        return Response({"detail": exc.message, "code": exc.code}, status=exc.status_code)

    response = drf_exception_handler(exc, context)
    if response is None:
        return None
    if isinstance(exc, ValidationError):
        response.data = {
            "detail": "Some fields are invalid.",
            "code": "invalid",
            "errors": response.data,
        }
    elif isinstance(response.data, dict) and "detail" in response.data:
        response.data = {
            "detail": str(response.data["detail"]),
            "code": getattr(response.data["detail"], "code", "error"),
        }
    return response
