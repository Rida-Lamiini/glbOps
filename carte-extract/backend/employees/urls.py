from rest_framework.routers import DefaultRouter

from .views import CongeViewSet, EmployeeViewSet

router = DefaultRouter()
router.register("employees", EmployeeViewSet)
router.register("conges", CongeViewSet)

urlpatterns = router.urls
