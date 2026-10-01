from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register('attachments', views.AttachmentViewSet)
router.register('comments', views.CommentViewSet)

urlpatterns = [
    path('health/', views.health, name='health'),
    path('bundle/import/', views.bundle_import, name='bundle-import'),
    path('backups/', views.backup_list, name='backup-list'),
    path('backups/restore/', views.backup_restore, name='backup-restore'),
    path('auth/me/', views.me, name='me'),
    path('auth/change-password/', views.change_password, name='change-password'),
] + router.urls
