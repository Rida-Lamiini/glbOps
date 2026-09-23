from django.urls import path

from . import views

urlpatterns = [
    path("cadastre/lots/", views.lots, name="cadastre-lots"),
    # Declared before the <uuid:pk> routes so the literal segments win.
    path("cadastre/lots/parse-pdf/", views.parse_pdf, name="cadastre-parse-pdf"),
    path("cadastre/lots/parse-excel/", views.parse_excel, name="cadastre-parse-excel"),
    path("cadastre/lots/excel-template/", views.excel_template, name="cadastre-excel-template"),
    path("cadastre/lots/export-excel/", views.export_excel, name="cadastre-export-excel"),
    path("cadastre/lots/matches/", views.lot_matches, name="cadastre-lot-matches"),
    path("cadastre/lots/geojson/", views.lots_geojson, name="cadastre-lots-geojson"),
    path("cadastre/lots/<uuid:pk>/", views.lot_detail, name="cadastre-lot-detail"),
    path("cadastre/lots/<uuid:pk>/report/", views.lot_report, name="cadastre-lot-report"),
    path("cadastre/lots/<uuid:pk>/statut/", views.lot_statut, name="cadastre-lot-statut"),
    path("cadastre/lots/<uuid:pk>/reuse/", views.lot_reuse, name="cadastre-lot-reuse"),
    path("cadastre/lots/<uuid:pk>/geojson/", views.lot_geojson, name="cadastre-lot-geojson"),
]
