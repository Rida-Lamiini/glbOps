"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.http import Http404
from django.urls import include, path, re_path
from django.views.static import serve
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import Http404
from django.urls import include, path, re_path
from django.views.static import serve
from rest_framework_simplejwt.views import TokenRefreshView

from core.views import LockedTokenObtainPairView, serve_media

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/token/', LockedTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/', include('core.urls')),
    path('api/', include('employees.urls')),
    path('api/', include('clients.urls')),
    path('api/', include('resources.urls')),
    path('api/', include('projets.urls')),
    path('api/', include('cadastre.urls')),
]

if settings.DEBUG or settings.SERVE_FRONTEND or settings.DATABASE_URL:
    urlpatterns += [re_path(r"^media/(?P<path>.*)$", serve_media)]


def _frontend(request, path=""):
    """The built single-page app: a real file under frontend/dist if there is one, else index.html."""
    root = settings.FRONTEND_DIST
    target = (root / path).resolve()
    if path and root.resolve() in target.parents and target.is_file():
        return serve(request, path, document_root=root)
    if path.startswith(("api/", "media/")):
        raise Http404
    return serve(request, "index.html", document_root=root)


if settings.SERVE_FRONTEND:
    urlpatterns += [
        re_path(r"^(?P<path>.*)$", _frontend),
    ]
