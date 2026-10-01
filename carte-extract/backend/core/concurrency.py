"""Optimistic concurrency for records several people can edit (lots, projets).

Every such row carries an integer ``version`` that goes up by one on each edit. A client that wants
protection sends the version it loaded in the ``X-Expected-Version`` header; if the row has moved on
in the meantime the save is refused with 409 instead of silently overwriting someone else's work.
A request without the header is not checked, so older clients keep working.
"""

from rest_framework.exceptions import APIException

HEADER = "X-Expected-Version"


class VersionConflict(APIException):
    status_code = 409
    default_code = "conflict"
    default_detail = (
        "Cet élément a été modifié par quelqu'un d'autre depuis que vous l'avez ouvert. "
        "Vos changements n'ont pas été enregistrés : rechargez-le pour voir ses dernières données."
    )


def check_version(request, current_version: int) -> None:
    raw = request.headers.get(HEADER)
    if raw in (None, ""):
        return
    try:
        expected = int(raw)
    except ValueError:
        return
    if expected != current_version:
        raise VersionConflict()
