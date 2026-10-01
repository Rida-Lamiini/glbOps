"""File storage that keeps uploaded files inside the database.

Used in "online" mode (a shared hosted Postgres such as Neon): there is no shared disk between
the PCs that use the app, so plans, photos and deliverables live in a table next to the data.
Works through Django's normal ``FileField`` machinery, so views keep calling ``file.open()``.
"""

import io
import mimetypes

from django.core.files.base import ContentFile
from django.core.files.storage import Storage
from django.utils.deconstruct import deconstructible


@deconstructible
class DatabaseStorage(Storage):
    def _model(self):
        from .models import StoredFile

        return StoredFile

    def _open(self, name, mode="rb"):
        try:
            row = self._model().objects.get(pk=name)
        except self._model().DoesNotExist as exc:
            raise FileNotFoundError(name) from exc
        return ContentFile(bytes(row.content), name=name)

    def _save(self, name, content):
        data = content.read()
        self._model().objects.update_or_create(pk=name, defaults={"content": data, "size": len(data)})
        return name

    def exists(self, name):
        return self._model().objects.filter(pk=name).exists()

    def delete(self, name):
        self._model().objects.filter(pk=name).delete()

    def size(self, name):
        return self._model().objects.values_list("size", flat=True).get(pk=name)

    def url(self, name):
        from django.conf import settings

        return settings.MEDIA_URL + name

    def listdir(self, path):
        names = self._model().objects.filter(pk__startswith=path).values_list("name", flat=True)
        return [], [n[len(path):] for n in names]


def uses_database_storage() -> bool:
    from django.core.files.storage import default_storage

    return isinstance(default_storage._wrapped, DatabaseStorage)


def read_file(name: str) -> bytes:
    """Bytes of a stored file (raises FileNotFoundError)."""
    from django.core.files.storage import default_storage

    with default_storage.open(name, "rb") as fh:
        return fh.read()


def write_file(name: str, data: bytes) -> None:
    """Stores a file under exactly this name, replacing any existing one."""
    from django.core.files.storage import default_storage

    if default_storage.exists(name):
        default_storage.delete(name)
    default_storage.save(name, io.BytesIO(data))


def list_files():
    """Every stored file name (for building a bundle)."""
    from pathlib import Path

    from django.conf import settings

    if uses_database_storage():
        return list(DatabaseStorage()._model().objects.values_list("name", flat=True))
    root = Path(settings.MEDIA_ROOT)
    return [p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()] if root.is_dir() else []


def guess_type(name: str) -> str:
    return mimetypes.guess_type(name)[0] or "application/octet-stream"
