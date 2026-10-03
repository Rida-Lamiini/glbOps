"""The "opération" of a lot: the shortcut(s) of what the survey was done for (MT, MEC, COPRO…).

Stored on ``Lot.operation`` as comma-separated upper-case shortcuts ("MEC,COPRO"), written for
humans as "MEC + COPRO".

Single source of truth: MEC, COPRO and MT are prestations. A lot linked to a projet takes its operation
from that projet's prestations (kept in sync by cadastre/signals.py whenever a prestation changes);
only a lot with no projet carries a hand-entered operation.
"""

import re

KNOWN = ("MT", "MEC", "COPRO")  # shortcuts recognised in file names; other shortcuts can still be typed
_TOKEN = re.compile(r"^[A-Z0-9-]{1,12}$")
_SPLIT = re.compile(r"\s*(?:[,;+/&]|\bet\b|\band\b)\s*|\s+", re.IGNORECASE)
_STOP = {"ET", "AND", ""}


def normalize(text) -> str:
    """"mec et copro", "MEC + COPRO", "MEC,COPRO" -> "MEC,COPRO" (upper-cased, de-duplicated, order kept)."""
    seen = []
    for raw in _SPLIT.split(str(text or "").strip()):
        token = raw.strip().upper()
        if token in _STOP or not _TOKEN.match(token) or token in seen:
            continue
        seen.append(token)
    return ",".join(seen)


def display(operation: str) -> str:
    return " + ".join(t for t in (operation or "").split(",") if t)


def from_filename(name: str) -> str:
    """"127_TF5608_64 MEC _COPRO.pdf" -> "MEC,COPRO". Only the known shortcuts are read from a file name."""
    stem = re.sub(r"\.[A-Za-z0-9]{2,4}$", "", str(name or "").replace("\\", "/").rsplit("/", 1)[-1])
    tokens = [t.upper() for t in re.split(r"[\s_()\-.]+", stem)]
    found = []
    for token in tokens:
        if token in KNOWN and token not in found:
            found.append(token)
    return ",".join(found)


def from_natures(natures) -> str:
    """The known shortcuts found in some prestation natures ("MEC", "COPRO", "MEC et COPRO"…), in KNOWN order."""
    found = set()
    for text in natures:
        found.update(t for t in normalize(text).split(",") if t in KNOWN)
    return ",".join(t for t in KNOWN if t in found)


def derived_for_projet(projet_id) -> str:
    from projets.models import Prestation

    return from_natures(Prestation.objects.filter(projet_id=projet_id).values_list("nature_demandee", flat=True))


def sync_projet_lots(projet_id) -> int:
    """Brings the operation of every lot of a projet in line with the projet's prestations. Returns how many changed."""
    from .models import Lot

    op = derived_for_projet(projet_id)
    return Lot.objects.filter(projet_id=projet_id).exclude(operation=op).update(operation=op)


def sync_all() -> int:
    from .models import Lot

    changed = 0
    for projet_id in Lot.objects.exclude(projet_id=None).values_list("projet_id", flat=True).distinct():
        changed += sync_projet_lots(projet_id)
    return changed
