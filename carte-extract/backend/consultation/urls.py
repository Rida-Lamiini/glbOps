from django.urls import path

from . import views

urlpatterns = [
    path("consult/", views.ConsultView.as_view()),
    path("consult/file/", views.ConsultFileView.as_view()),
    path("report/", views.ReportView.as_view()),
    path("batch/", views.BatchView.as_view()),
    path("near/", views.NearView.as_view()),
    path("route/", views.RouteView.as_view()),
    path("notifications/", views.NotificationsView.as_view()),
    path("notifications/read/", views.NotificationsReadView.as_view()),
    path("notifications/scan/", views.NotificationsScanView.as_view()),
    path("layers/", views.LayersView.as_view()),
    path("layers/geojson/", views.LayersGeoJSONView.as_view()),
    path("layers/<int:pk>/", views.LayerDetailView.as_view()),
    path("history/", views.HistoryView.as_view()),
    path("history/csv/", views.HistoryCsvView.as_view()),
]
