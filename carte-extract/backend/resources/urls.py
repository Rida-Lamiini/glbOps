from rest_framework.routers import DefaultRouter

from .views import MaintenanceLogEntryViewSet, ResourceViewSet

router = DefaultRouter()
router.register("resources", ResourceViewSet)
router.register("maintenance-log", MaintenanceLogEntryViewSet)

urlpatterns = router.urls
