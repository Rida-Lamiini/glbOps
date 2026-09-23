"""Cadastral report for one saved lot: identification, surface check, plan, bornes, distance
control and the review trail. Server-side port of the former frontend utils/reportLot.js."""

import math
import re

from django.utils import timezone

from core.pdf_kit import Report, fr_date, num

STATUT_LABEL = {"brouillon": "Brouillon", "verifie": "Vérifié", "valide": "Validé"}
SURFACE_TOLERANCE_M2 = 1
DISTANCE_TOLERANCE_M = 0.1


def _m2(value):
    return f"{num(value)} m²"


def _name(user):
    if user is None:
        return ""
    employee = getattr(user, "employee", None)
    return employee.nom if employee else (user.first_name or user.username)


def _local_date(dt):
    return fr_date(timezone.localtime(dt).date()) if dt else ""


def _perimeter(bornes):
    return sum(
        math.hypot(bornes[(i + 1) % len(bornes)].x_lambert - b.x_lambert, bornes[(i + 1) % len(bornes)].y_lambert - b.y_lambert)
        for i, b in enumerate(bornes)
    )


def report_filename(lot):
    titre = re.sub(r"[^\w-]+", "_", str(lot.titre_foncier))
    return f"Rapport-cadastral-{titre}.pdf"


def build_lot_report(lot):
    bornes = list(lot.bornes.all())
    for b in bornes:
        b.x_lambert, b.y_lambert = float(b.x_lambert), float(b.y_lambert)
    calculee, document, correction = (float(v) for v in (lot.surface_calculee_m2, lot.surface_document_m2, lot.correction_lambert_m2))
    ecart = round(calculee + correction - document, 2)
    conforme = abs(ecart) <= SURFACE_TOLERANCE_M2
    projet = lot.projet
    client = projet.client if projet else None
    prestation = lot.prestation
    statut = STATUT_LABEL.get(lot.statut, lot.statut)
    created_by, statut_par = _name(lot.created_by), _name(lot.statut_par)

    r = Report(
        title=lot.propriete_dite or "Lot cadastral",
        eyebrow=f"Rapport cadastral · Titre foncier {lot.titre_foncier}",
        subtitle="Contrôle de la surface, des bornes et des distances d'un lot issu d'un Calcul de Contenances.",
        ref=f"Lot {lot.titre_foncier}" + (f" / {lot.lot_number}" if lot.lot_number else ""),
    )

    if conforme:
        r.callout("Lot conforme", f"La surface recalculée à partir des bornes concorde avec le document (écart de {num(ecart)} m², tolérance {SURFACE_TOLERANCE_M2} m²).", "good")
    else:
        r.callout("Écart de surface à examiner", f"L'écart entre la surface recalculée et le document est de {num(ecart)} m², au-delà de la tolérance de {SURFACE_TOLERANCE_M2} m².", "bad")

    r.kpis([
        {"label": "Surface calculée", "value": _m2(calculee), "sub": "à partir des bornes"},
        {"label": "Surface du document", "value": _m2(document), "sub": "contenance adoptée"},
        {"label": "Correction Lambert", "value": _m2(correction), "sub": "altération linéaire"},
        {"label": "Écart", "value": f"{'+' if ecart > 0 else ''}{num(ecart)} m²", "sub": f"tolérance {SURFACE_TOLERANCE_M2} m²", "tone": "good" if conforme else "bad"},
    ])

    r.section("Identification")
    r.kv([
        ("Titre foncier", lot.titre_foncier),
        ("Propriété dite", lot.propriete_dite),
        ("Lot n°", lot.lot_number),
        ("Référence d'affaire", lot.affaire_ref),
        ("Géomètre", lot.geometre),
        ("Date du levé", fr_date(lot.date_leve)),
        ("Service du cadastre", lot.service_cadastre),
        ("Client", f"{client.nom} ({client.id})" if client else ""),
        ("Projet", f"{projet.id}{f' — {projet.situation}' if projet.situation else ''}" if projet else ""),
        ("Prestation", f"{prestation.id} — {prestation.nature_demandee or ''}" if prestation else ""),
    ])

    r.section("Plan du lot", note="Coordonnées Lambert Nord Maroc (EPSG:26191)", keep=82)
    plan_top = r.y
    r.plot([(b.name, b.x_lambert, b.y_lambert) for b in bornes], w=100, h=80)
    fx = 16 + 100 + 8
    facts = [
        ("Bornes", str(len(bornes))),
        ("Périmètre", f"{num(_perimeter(bornes))} m" if len(bornes) >= 3 else "—"),
        ("Statut de revue", statut),
    ]
    for i, (label, value) in enumerate(facts):
        fy = plan_top + 6 + i * 22
        r.font("bold", 7, "muted")
        r.text(label.upper(), fx, fy)
        r.font("bold", 16, "ink", "times")
        r.text(value, fx, fy + 8)
    r.y = plan_top + 86

    r.section("Bornes")
    r.table(
        cols=[
            {"label": "Borne", "w": 3},
            {"label": "X Lambert (m)", "w": 4, "align": "right"},
            {"label": "Y Lambert (m)", "w": 4, "align": "right"},
            {"label": "Latitude", "w": 3.4, "align": "right"},
            {"label": "Longitude", "w": 3.4, "align": "right"},
        ],
        rows=[[{"text": b.name, "bold": True}, num(b.x_lambert, 3), num(b.y_lambert, 3), f"{b.lat:.6f}", f"{b.lng:.6f}"] for b in bornes],
        empty_text="Aucune borne enregistrée.",
    )

    checks = list(lot.distance_checks.all())
    if checks:
        rows = []
        for d in checks:
            ecart_m = float(d.ecart_m)
            ok = abs(ecart_m) <= DISTANCE_TOLERANCE_M
            rows.append([
                d.segment_label, num(d.croquis_m, 3), num(d.calcule_m, 3), f"{'+' if ecart_m > 0 else ''}{num(ecart_m, 3)}",
                {"text": "Conforme" if ok else "À vérifier", "tone": "good" if ok else "bad", "bold": True},
            ])
        r.section("Contrôle des distances", note=f"tolérance {num(DISTANCE_TOLERANCE_M, 1)} m")
        r.table(
            cols=[
                {"label": "Segment", "w": 4},
                {"label": "Croquis (m)", "w": 3, "align": "right"},
                {"label": "Calculée (m)", "w": 3, "align": "right"},
                {"label": "Écart (m)", "w": 3, "align": "right"},
                {"label": "Résultat", "w": 2.6},
            ],
            rows=rows,
        )

    points = list(lot.reference_points.all())
    if points:
        r.section("Points de repère")
        r.table(
            cols=[{"label": "Repère", "w": 5}, {"label": "Distance (m)", "w": 3, "align": "right"}, {"label": "Gisement (°)", "w": 3, "align": "right"}],
            rows=[[p.label, num(p.distance_m, 1), num(p.bearing_deg, 1)] for p in points],
        )

    if lot.statut != "brouillon":
        decision = f"{statut} par {statut_par or '—'}" + (f" le {_local_date(lot.statut_at)}" if lot.statut_at else "")
    else:
        decision = "En attente de vérification"
    r.section("Revue et validation")
    r.kv([
        ("Établi par", created_by or "—"),
        ("Statut actuel", statut),
        ("Dernière décision", decision),
        ("Dernière modification", _local_date(lot.updated_at)),
    ])
    r.paragraph(
        "La surface est toujours recalculée par la plateforme à partir des bornes saisies ; elle n'est jamais reprise "
        "telle quelle du document. Toute modification du lot le remet à l'état de brouillon.",
        size=8.3, color="muted", gap=5,
    )
    r.signatures([
        {"role": "Établi par (bureau)", "name": created_by},
        {"role": "Vérifié par", "name": statut_par if lot.statut != "brouillon" else ""},
        {"role": "Validé par (contrôle)", "name": statut_par if lot.statut == "valide" else ""},
    ])
    return r.finalize()
