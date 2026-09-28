from rest_framework.permissions import SAFE_METHODS, BasePermission

OFFICE_ROLES = {"Dispatcher", "Directrice"}


def is_office(user):
    """Dispatcher/Directrice. A signed-in user with no Employee row counts as office, matching
    ``core.views._profile`` (which gives such an account the Dispatcher/Directrice UI)."""
    if not user or not user.is_authenticated:
        return False
    employee = getattr(user, "employee", None)
    return employee is None or employee.role in OFFICE_ROLES


class OfficeWriteOrReadOnly(BasePermission):
    """Any signed-in user may read; only the office may create, edit or delete. Mirrors the
    UI, where the client roster, employees, congés and resources are office screens."""

    message = "Réservé à la direction."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.method in SAFE_METHODS or is_office(request.user)


class OfficeCreateDelete(BasePermission):
    """Any signed-in user may read and edit (agents drive their prestations through the
    pipeline), but creating and deleting projets/prestations is an office job."""

    message = "Réservé à la direction."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if getattr(view, "action", None) in ("create", "destroy"):
            return is_office(request.user)
        return True


class AuthorOrOfficeCanChange(BasePermission):
    """Comments and attachments: everyone reads and adds, but only the author edits, and the
    author or the office deletes. ``owner_field`` on the view names the author column."""

    message = "Vous ne pouvez modifier que vos propres éléments."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        action = getattr(view, "action", None)
        if action not in ("update", "partial_update", "destroy"):
            return True
        owner = getattr(obj, getattr(view, "owner_field", "created_by"), None)
        if owner is not None and owner == request.user:
            return True
        return action == "destroy" and is_office(request.user)
