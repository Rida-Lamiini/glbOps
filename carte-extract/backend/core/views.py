from django.contrib.auth.password_validation import validate_password
from django.core.cache import cache
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView

from . import ocr
from .models import Attachment, Comment
from . import backups, runtime, updates
from .bundle import BundleError, import_bundle
from .version import app_version
from .permissions import AuthorOrOfficeCanChange, is_office
from .storage import guess_type, read_file
from .serializers import AttachmentSerializer, CommentSerializer, UserSerializer


@api_view(['GET'])
@permission_classes([AllowAny])
def health(request):
    from django.db import connection

    return Response({'status': 'ok', 'version': app_version(), 'mode': 'local' if connection.vendor == 'sqlite' else 'online'})


LOGIN_MAX_ATTEMPTS = 5
LOGIN_LOCKOUT_SECONDS = 15 * 60


class LockedTokenObtainPairView(TokenObtainPairView):
    """Same login endpoint as simplejwt's own, but locks a username out for 15 minutes after
    5 failed attempts in a row. Demo-style passwords (seed_demo) have no other defense against
    brute-forcing, so this is the one gap worth closing even on an internal tool."""

    def post(self, request, *args, **kwargs):
        username = (request.data.get('username') or '').strip().lower()
        key = f'login_attempts:{username}'
        if username and cache.get(key, 0) >= LOGIN_MAX_ATTEMPTS:
            return Response(
                {'detail': 'Trop de tentatives échouées. Réessayez dans 15 minutes.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        # A bad login doesn't return a non-200 Response here — TokenObtainPairSerializer raises
        # AuthenticationFailed, which propagates out of super().post() rather than being
        # returned, so the failure count has to be bumped from the except branch, not a status
        # check afterwards.
        try:
            response = super().post(request, *args, **kwargs)
        except Exception:
            if username:
                cache.set(key, cache.get(key, 0) + 1, LOGIN_LOCKOUT_SECONDS)
            raise
        if username:
            cache.delete(key)
        return response


def _profile(user):
    data = UserSerializer(user).data
    employee = getattr(user, 'employee', None)
    if employee is not None:
        data['role'] = employee.role
        data['name'] = employee.nom
        data['employee_id'] = employee.id
        data['poste'] = employee.poste
        data['telephone'] = employee.telephone
        data['email'] = employee.email or user.email
        data['date_embauche'] = employee.date_embauche
    else:
        data['role'] = 'Directrice' if user.is_superuser else 'Dispatcher'
        data['name'] = user.first_name or user.username
        data['employee_id'] = None
        data['poste'] = ''
        data['telephone'] = ''
        data['date_embauche'] = None
    return data


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def me(request):
    """The signed-in user's profile. PATCH edits only the contact details (email, phone) — role,
    name and status stay with the office."""
    user = request.user
    if request.method == 'PATCH':
        email = (request.data.get('email') or '').strip()
        telephone = (request.data.get('telephone') or '').strip()
        try:
            if email:
                validate_email(email)
        except DjangoValidationError:
            return Response({'email': ['Adresse e-mail invalide.']}, status=status.HTTP_400_BAD_REQUEST)
        if len(telephone) > 30:
            return Response({'telephone': ['30 caractères maximum.']}, status=status.HTTP_400_BAD_REQUEST)
        user.email = email
        user.save(update_fields=['email'])
        employee = getattr(user, 'employee', None)
        if employee is not None:
            employee.email = email
            employee.telephone = telephone
            employee.save(update_fields=['email', 'telephone'])
    return Response(_profile(user))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password(request):
    user = request.user
    current = request.data.get('current_password') or ''
    new = request.data.get('new_password') or ''
    if not user.check_password(current):
        return Response({'current_password': ['Mot de passe actuel incorrect.']}, status=status.HTTP_400_BAD_REQUEST)
    try:
        validate_password(new, user)
    except DjangoValidationError as error:
        return Response({'new_password': list(error.messages)}, status=status.HTTP_400_BAD_REQUEST)
    user.set_password(new)
    user.save(update_fields=['password'])
    return Response({'detail': 'Mot de passe modifié.'})


class AttachmentViewSet(viewsets.ModelViewSet):
    queryset = Attachment.objects.select_related('content_type', 'uploaded_by').all()
    serializer_class = AttachmentSerializer
    permission_classes = [AuthorOrOfficeCanChange]
    owner_field = 'uploaded_by'

    def perform_create(self, serializer):
        user = self.request.user if self.request.user.is_authenticated else None
        instance = serializer.save(uploaded_by=user)
        if instance.file and ocr.is_ocr_eligible(instance.file.name):
            instance.ocr_text = ocr.extract_text(instance.file)
            instance.save(update_fields=["ocr_text"])


class CommentViewSet(viewsets.ModelViewSet):
    queryset = Comment.objects.select_related("content_type", "created_by").all()
    serializer_class = CommentSerializer
    permission_classes = [AuthorOrOfficeCanChange]
    owner_field = 'created_by'

    def perform_create(self, serializer):
        user = self.request.user if self.request.user.is_authenticated else None
        serializer.save(created_by=user)

    @action(detail=True, methods=["post"])
    def mark_read(self, request, pk=None):
        comment = self.get_object()
        comment.read_by.add(request.user)
        return Response(self.get_serializer(comment).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def bundle_import(request):
    """Office only: applies an update bundle (.zip) exported from the main glbOps."""
    if not is_office(request.user):
        return Response({"detail": "Réservé au Dispatcher et à la Directrice."}, status=status.HTTP_403_FORBIDDEN)
    upload = request.FILES.get("file")
    if not upload:
        return Response({"detail": "Aucun fichier reçu."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        result = import_bundle(upload)
    except BundleError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response({"created": result["manifest"].get("created"), "counts": result["manifest"]["counts"], "geometries": result["geometries"], "files": result["files"]})


def serve_media(request, path):
    """Uploaded files through the configured storage (disk or database)."""
    import io

    from django.http import FileResponse, Http404

    if ".." in path.split("/"):
        raise Http404
    try:
        data = read_file(path)
    except Exception as exc:  # noqa: BLE001
        raise Http404 from exc
    return FileResponse(io.BytesIO(data), content_type=guess_type(path))


def _local_backups_only(request):
    """None when the caller may use backups; otherwise the error response."""
    from django.db import connection

    if not is_office(request.user):
        return Response({"detail": "Réservé au Dispatcher et à la Directrice."}, status=status.HTTP_403_FORBIDDEN)
    if connection.vendor != "sqlite":
        return Response(
            {"detail": "Mode en ligne : les sauvegardes sont gérées par le fournisseur de la base (Neon : restauration à un instant donné depuis sa console)."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return None


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def backup_list(request):
    """GET: the local backups. POST: take one now (office only, standalone mode only)."""
    from django.conf import settings
    from django.db import connection

    if request.method == "GET":
        if not request.user.is_authenticated:
            return Response(status=status.HTTP_401_UNAUTHORIZED)
        local = connection.vendor == "sqlite"
        return Response({
            "mode": "local" if local else "online",
            "version": app_version(),
            "folder": str(backups.backup_dir(settings.DATA_DIR)) if local else "",
            "backups": backups.list_backups(settings.DATA_DIR) if local and is_office(request.user) else [],
        })
    refused = _local_backups_only(request)
    if refused:
        return refused
    try:
        made = backups.create_backup(settings.DATA_DIR, version=app_version(), reason="manuelle")
    except backups.BackupError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(made, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def backup_restore(request):
    """Queues a restore; it is applied when the app restarts (which this triggers when it can)."""
    import threading

    from django.conf import settings

    refused = _local_backups_only(request)
    if refused:
        return refused
    try:
        backups.stage_restore(settings.DATA_DIR, str(request.data.get("name", "")), version=app_version())
    except backups.BackupError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    restarting = runtime.restart_callback is not None
    if restarting:
        threading.Timer(1.5, runtime.restart_callback).start()
    return Response({"queued": True, "restarting": restarting})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def update_info(request):
    """Is a newer version published? (``?force=1`` skips the one-hour cache.)"""
    return Response({**updates.public(updates.check(force=request.GET.get("force") == "1")), "install": updates.status()})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def update_install(request):
    """Office only: download, verify and install the published update; the app closes and the installer relaunches it."""
    if not is_office(request.user):
        return Response({"detail": "Réservé au Dispatcher et à la Directrice."}, status=status.HTTP_403_FORBIDDEN)
    return Response(updates.start_install())


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def update_status(request):
    return Response(updates.status())
