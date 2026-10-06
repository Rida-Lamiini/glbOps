"""'A projet already exists 80 m away': raised once, when a projet first gets a location (pin, boundary or lots)."""

from .dataset import load_entries
from .engine import neighbours, local_projection, to_local
from .models import ProximityNotification, SeenProjet

NOTIFY_RADIUS_M = 150


def evaluate_projet(projet_id, radius_m=NOTIFY_RADIUS_M):
    """Compare a projet with the others; returns the notifications created (none if already seen or unlocated)."""
    if not projet_id or SeenProjet.objects.filter(projet_id=projet_id).exists():
        return []
    entries = load_entries(None, only_projet_ids=None)
    me = next((e for e in entries if e.projet_id == projet_id), None)
    if me is None or me.geom is None:
        return []
    SeenProjet.objects.get_or_create(projet_id=projet_id, defaults={"geom_kind": me.geom_kind})
    c = me.geom.centroid
    close = neighbours(me.geom, c.y, c.x, radius_m, [e for e in entries if e.projet_id], exclude_projet_id=projet_id)
    created = []
    for n in close:
        overlap = n["relation"] in ("chevauche", "dans")
        delivered = n["delivered"]
        if overlap:
            sev, title = ("danger" if delivered or n["validated"] else "warning"), "Chevauchement avec un projet existant"
            msg = f"{me.label} recouvre {n['overlap_m2']:.0f} m² du projet {n['label']} ({n['client']})."
        elif n["relation"] == "mitoyen":
            sev, title, msg = "info", "Projet mitoyen", f"{me.label} est mitoyen du projet {n['label']} ({n['client']})."
        else:
            sev, title = "info", "Un projet existe à proximité"
            msg = f"Le projet {n['label']} ({n['client']}) existe déjà à {n['distance_m']:.0f} m ({n['direction']})" + (" — livré." if delivered else ".")
        created.append(ProximityNotification.objects.create(
            projet_id=projet_id, other_projet_id=n["projet_id"], severity=sev, title=title, message=msg, distance_m=n["distance_m"],
        ))
        if len(created) >= 5:
            break
    return created


def scan_all():
    """Evaluate every located projet not seen yet (the first run seeds the existing ones without notifying: see `seed`)."""
    out = []
    for e in load_entries(None):
        if e.projet_id and e.geom is not None:
            out.extend(evaluate_projet(e.projet_id))
    return out


def seed():
    """Mark every currently located projet as seen so only projets created from now on raise notifications."""
    for e in load_entries(None):
        if e.projet_id and e.geom is not None:
            SeenProjet.objects.get_or_create(projet_id=e.projet_id, defaults={"geom_kind": e.geom_kind})
