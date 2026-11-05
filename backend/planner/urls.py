from django.urls import path

from . import views

urlpatterns = [
    path("health", views.health, name="health"),
    path("risk-rules", views.risk_rules, name="risk-rules"),
    path("plan", views.PlanView.as_view(), name="plan"),
    path("corridor-weather", views.CorridorWeatherView.as_view(), name="corridor-weather"),
    path("geocode", views.GeocodeView.as_view(), name="geocode"),
    path("reverse-geocode", views.ReverseGeocodeView.as_view(), name="reverse-geocode"),
]
