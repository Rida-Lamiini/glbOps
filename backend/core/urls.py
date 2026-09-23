from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register('attachments', views.AttachmentViewSet)
router.register('comments', views.CommentViewSet)

urlpatterns = [
    path('health/', views.health, name='health'),
    path('auth/me/', views.me, name='me'),
] + router.urls
