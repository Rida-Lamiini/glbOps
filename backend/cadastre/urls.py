from django.urls import path

from . import views

urlpatterns = [
    path("cadastre/lots/", views.lots, name="cadastre-lots"),
    # Declared before the <uuid:pk> routes so the literal segments win.
    path("cadastre/lots/parse-pdf/", views.parse_pdf, name="cadastre-parse-pdf"),
    path("cadastre/lots/matches/", views.lot_matches, name="cadastre-lot-matches"),
    path("cadastre/lots/geojson/", views.lots_geojson, name="cadastre-lots-geojson"),
    path("cadastre/lots/<uuid:pk>/", views.lot_detail, name="cadastre-lot-detail"),
    path("cadastre/lots/<uuid:pk>/statut/", views.lot_statut, name="cadastre-lot-statut"),
    path("cadastre/lots/<uuid:pk>/reuse/", views.lot_reuse, name="cadastre-lot-reuse"),
    path("cadastre/lots/<uuid:pk>/geojson/", views.lot_geojson, name="cadastre-lot-geojson"),
]
