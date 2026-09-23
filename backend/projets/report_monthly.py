"""Monthly management report ("Rapport de direction"). Activity figures (requests, deliveries,
rejections) are for the chosen month; the pipeline, workload, resources and cadastre blocks are the
situation on the day it is issued. Server-side port of the former frontend utils/reportMonthly.js,
including the bits of utils/vehicule.js and utils/stats.js it relied on."""

import calendar
import datetime

from django.utils import timezone

from cadastre.geo.build_lot import is_surface_conforme
from cadastre.models import Lot
from core.pdf_kit import Report, fr_date
from employees.models import Employee
from resources.models import Resource

from .models import STAGE_CHOICES, Prestation

STAGE_RGB = {
    "demande": (109, 102, 90),
    "prestation": (59, 110, 165),
    "affectation": (179, 38, 30),
    "execution": (183, 121, 31),
    "bureau": (31, 111, 104),
    "controle": (122, 90, 156),
    "livraison": (31, 122, 85),
}
REJECT = ("Non conforme", "Données insuffisantes")
MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
SHORT_MONTHS = ["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"]
PAPER_SOON_DAYS = 30
SERVICE_SOON_KM = 1500
RANK = {"none": -1, "ok": 0, "soon": 1, "late": 2}


# --- dates ------------------------------------------------------------------------------------

def parse_month(key):
    """ "YYYY-MM" -> (year, month); ValueError when malformed."""
    year, month = (int(part) for part in key.split("-"))
    datetime.date(year, month, 1)
    return year, month


def month_label(year, month):
    return f"{MONTHS[month - 1].capitalize()} {year}"


def _bounds(year, month):
    return datetime.date(year, month, 1), datetime.date(year, month, calendar.monthrange(year, month)[1])


def _shift(year, month, delta):
    index = year * 12 + (month - 1) + delta
    return index // 12, index % 12 + 1


def parse_fr(value):
    """ "DD/MM/YYYY" or "DD/MM/YYYY HH:MM" -> date (None when unreadable)."""
    try:
        d, m, y = (int(part) for part in (value or "").strip().split(" ")[0].split("/"))
        return datetime.date(y, m, d)
    except ValueError:
        return None


def _in(day, bounds):
    return day is not None and bounds[0] <= day <= bounds[1]


def _plural(n, word, plural=None):
    return f"{n} {word if n == 1 else (plural or word + 's')}"


def _delta(cur, prev):
    if cur == prev:
        return "stable vs mois précédent"
    return f"{'+' if cur > prev else ''}{cur - prev} vs mois précédent"


# --- vehicles (utils/vehicule.js) ---------------------------------------------------------------

def _due(key, label, due, today):
    if due is None:
        return {"key": key, "label": label, "due": "", "level": "none", "days": None, "text": "Non renseigné"}
    days = (due - today).days
    level = "late" if days < 0 else "soon" if days <= PAPER_SOON_DAYS else "ok"
    text = f"expirée depuis {-days} j" if days < 0 else "expire aujourd'hui" if days == 0 else f"dans {days} j"
    return {"key": key, "label": label, "due": fr_date(due), "level": level, "days": days, "text": text}


def _service(v, today):
    by_date = _due("entretien", "Entretien", v.entretien_prochain_date, today)
    if v.kilometrage is None or not v.entretien_prochain_km:
        return by_date
    km_left = v.entretien_prochain_km - v.kilometrage
    km_level = "late" if km_left < 0 else "soon" if km_left <= SERVICE_SOON_KM else "ok"
    km_text = f"dépassé de {-km_left:,} km" if km_left < 0 else f"dans {km_left:,} km"
    if by_date["level"] == "none" or RANK[km_level] > RANK[by_date["level"]]:
        return {**by_date, "level": km_level, "text": km_text.replace(",", " ")}
    return by_date


def vehicule_alerts(v, today):
    """Papers that need action (expired or expiring), most urgent first."""
    if v.type != "vehicule":
        return []
    papers = [
        _due("assurance", "Assurance", v.assurance_echeance, today),
        _due("visite", "Visite technique", v.visite_technique_prochaine, today),
        _due("vignette", "Vignette", v.vignette_echeance, today),
        _service(v, today),
    ]
    alerts = [p for p in papers if p["level"] in ("late", "soon")]
    return sorted(alerts, key=lambda p: (-RANK[p["level"]], p["days"] or 0))


# --- the report -------------------------------------------------------------------------------

def _is_livree(p):
    return p.stage == "livraison" and bool(p.chemin)


def build_monthly_report(year, month, author=""):
    today = timezone.localdate()
    b = _bounds(year, month)
    prev_b = _bounds(*_shift(year, month, -1))
    label = month_label(year, month)

    prestations = list(
        Prestation.objects.select_related("projet__client", "agent_bureau", "agent_controle")
        .prefetch_related("history", "agent_chantier", "taches__agents")
    )
    client_name = {p.id: p.projet.client.nom or p.projet.id for p in prestations}

    recues = [p for p in prestations if _in(p.date_debut_demande, b)]
    recues_prev = [p for p in prestations if _in(p.date_debut_demande, prev_b)]
    livrees = [p for p in prestations if _is_livree(p) and _in(p.date_livraison, b)]
    livrees_prev = [p for p in prestations if _is_livree(p) and _in(p.date_livraison, prev_b)]
    delays = [
        (p.date_livraison - p.date_debut_demande).days for p in livrees
        if p.date_debut_demande and p.date_livraison and p.date_livraison >= p.date_debut_demande
    ]
    delai_moyen = round(sum(delays) / len(delays)) if delays else None

    rejections = [
        (p, h) for p in prestations for h in p.history.all()
        if (h.label or "").startswith(REJECT) and _in(parse_fr(h.date), b)
    ]
    open_ = [p for p in prestations if not _is_livree(p)]
    non_conf_open = [p for p in open_ if p.cycles > 0]
    en_retard = [p for p in open_ if p.stage == "affectation" and (parse_fr(p.date_debut_exec) or datetime.date.max) <= today]

    resources = list(Resource.objects.all())
    materiels = [r for r in resources if r.type != "vehicule"]
    vehicules = [r for r in resources if r.type == "vehicule"]

    r = Report(
        title=f"Rapport de direction — {label}",
        eyebrow="Rapport mensuel",
        subtitle="Activité du mois, qualité, charge des équipes et état des ressources.",
        ref=label,
    )

    # ---- Synthèse
    r.kpis([
        {"label": "Demandes reçues", "value": str(len(recues)), "sub": _delta(len(recues), len(recues_prev))},
        {"label": "Prestations livrées", "value": str(len(livrees)), "sub": _delta(len(livrees), len(livrees_prev)), "tone": "good"},
        {"label": "Non-conformités", "value": str(len(rejections)), "sub": "renvois du mois", "tone": "bad" if rejections else None},
        {"label": "Délai moyen", "value": "—" if delai_moyen is None else f"{delai_moyen} j", "sub": "demande à livraison"},
    ])

    points = []
    if en_retard:
        n = len(en_retard)
        s = "s" if n > 1 else ""
        points.append(f"{n} visite{s} terrain prévue{s} et non démarrée{s} ({', '.join(p.id for p in en_retard)}).")
    if non_conf_open:
        points.append(f"{_plural(len(non_conf_open), 'prestation')} en reprise après non-conformité ({', '.join(p.id for p in non_conf_open)}).")
    stuck = sum(1 for p in open_ if p.stage == "controle")
    if stuck:
        points.append(f"{_plural(stuck, 'dossier')} en attente de contrôle.")
    fleet_late = [v for v in vehicules if any(a["level"] == "late" for a in vehicule_alerts(v, today))]
    if fleet_late:
        points.append(f"{_plural(len(fleet_late), 'véhicule')} avec un papier expiré ({', '.join(v.nom for v in fleet_late)}).")
    cal_late = [m for m in materiels if m.prochaine_calibration and m.prochaine_calibration <= today]
    if cal_late:
        points.append(f"{_plural(len(cal_late), 'matériel')} avec un étalonnage en retard ({', '.join(m.nom for m in cal_late)}).")
    if points:
        r.callout("Points d'attention", "\n".join(f"• {p}" for p in points), "warn")
    else:
        r.callout("Rien à signaler", "Aucun retard, aucune reprise en cours et aucun papier expiré à la date d'édition.", "good")

    # ---- Activité sur 6 mois
    r.section("Activité sur six mois", keep=44)
    series = []
    for i in range(6):
        sy, sm = _shift(year, month, i - 5)
        bb = _bounds(sy, sm)
        series.append({
            "label": SHORT_MONTHS[sm - 1],
            "a": sum(1 for p in prestations if _in(p.date_debut_demande, bb)),
            "b": sum(1 for p in prestations if _is_livree(p) and _in(p.date_livraison, bb)),
        })
    r.columns(series, a_label="Demandes reçues", b_label="Livraisons")

    # ---- Livraisons du mois
    r.section("Prestations livrées ce mois", note=_plural(len(livrees), "livraison"))
    rows = []
    for p in livrees:
        delay = (p.date_livraison - p.date_debut_demande).days if p.date_debut_demande else None
        rows.append([
            {"text": p.id, "bold": True}, client_name[p.id], p.nature_demandee or "—", fr_date(p.date_livraison),
            f"{delay} j" if delay is not None else "—", {"text": str(p.cycles or 0), "tone": "bad" if p.cycles else None},
        ])
    r.table(
        cols=[
            {"label": "Prestation", "w": 2.6}, {"label": "Client", "w": 3.6}, {"label": "Nature", "w": 5},
            {"label": "Livrée le", "w": 2.4}, {"label": "Délai", "w": 1.6, "align": "right"}, {"label": "Reprises", "w": 1.7, "align": "right"},
        ],
        rows=rows,
        empty_text="Aucune prestation livrée ce mois-ci.",
    )

    # ---- Qualité
    r.section("Qualité : renvois du mois", note=_plural(len(rejections), "événement"))
    r.table(
        cols=[
            {"label": "Date", "w": 2}, {"label": "Prestation", "w": 2.6}, {"label": "Client", "w": 3},
            {"label": "Motif", "w": 7}, {"label": "Par", "w": 2.4},
        ],
        rows=[[h.date, {"text": p.id, "bold": True}, client_name[p.id], h.label, h.author or "—"] for p, h in rejections],
        empty_text="Aucun renvoi ce mois-ci.",
    )

    # ---- Situation à la date d'édition
    r.section("Situation des prestations en cours", note="à la date d'édition", keep=6 * len(STAGE_CHOICES) + 3)
    r.bars(
        [{"label": lbl, "value": sum(1 for p in open_ if p.stage == key), "color": STAGE_RGB[key]} for key, lbl in STAGE_CHOICES],
        label_w=48,
    )

    r.section("Charge de travail par agent", note="prestations non livrées")
    workload = []
    for e in Employee.objects.filter(status="actif").order_by("nom"):
        mine = [
            p for p in open_
            if e in p.agent_chantier.all() or p.agent_bureau_id == e.id or p.agent_controle_id == e.id
            or any(e in t.agents.all() for t in p.taches.all())
        ]
        if mine:
            workload.append((e, len(mine), sum(1 for p in mine if p.cycles > 0)))
    workload.sort(key=lambda w: -w[1])
    r.table(
        cols=[{"label": "Agent", "w": 4}, {"label": "Poste", "w": 4}, {"label": "En cours", "w": 2, "align": "right"}, {"label": "Dont reprises", "w": 2.4, "align": "right"}],
        rows=[[{"text": e.nom, "bold": True}, e.poste or e.role, str(total), {"text": str(nc), "tone": "bad" if nc else None}] for e, total, nc in workload],
        empty_text="Aucune charge active.",
    )

    # ---- Ressources
    r.section("Ressources à surveiller")
    res_rows = []
    status_label = lambda s: "Hors service" if s == "hors_service" else "En maintenance"  # noqa: E731
    for m in materiels:
        if m.status != "operationnel":
            res_rows.append([{"text": m.nom, "bold": True}, "Matériel", "Statut", {"text": status_label(m.status), "tone": "warn"}])
        if m in cal_late:
            res_rows.append([{"text": m.nom, "bold": True}, "Matériel", "Étalonnage", {"text": f"en retard (échéance {fr_date(m.prochaine_calibration)})", "tone": "bad"}])
    for v in vehicules:
        if v.status != "operationnel":
            res_rows.append([{"text": v.nom, "bold": True}, "Véhicule", "Statut", {"text": status_label(v.status), "tone": "warn"}])
        for a in vehicule_alerts(v, today):
            state = "expiré" if a["level"] == "late" else "à renouveler"
            when = f"échéance {a['due']}" if a["due"] else a["text"]
            res_rows.append([{"text": v.nom, "bold": True}, "Véhicule", a["label"], {"text": f"{state} — {when}", "tone": "bad" if a["level"] == "late" else "warn"}])
    r.table(
        cols=[{"label": "Ressource", "w": 4.6}, {"label": "Type", "w": 2}, {"label": "Point de contrôle", "w": 3}, {"label": "État", "w": 6}],
        rows=res_rows,
        empty_text="Toutes les ressources sont opérationnelles et à jour.",
    )

    # ---- Congés
    conges = [
        c for e in Employee.objects.prefetch_related("conges").order_by("nom") for c in e.conges.all()
        if c.date_debut <= b[1] and c.date_fin >= b[0] and c.statut != "refuse"
    ]
    r.section("Congés du mois")
    if not conges:
        r.paragraph("Aucun congé sur la période.", size=9, color="muted", gap=1)
    elif len(conges) <= 3:
        # A couple of leaves read better as a short list than as a table.
        for c in conges:
            statut = "approuvé" if c.statut == "approuve" else "en attente"
            r.paragraph(f"• {c.employee.nom} — {c.type}, du {fr_date(c.date_debut)} au {fr_date(c.date_fin)} ({statut})", size=9, gap=0.5)
    else:
        r.table(
            cols=[{"label": "Employé", "w": 4}, {"label": "Type", "w": 3}, {"label": "Du", "w": 2.4}, {"label": "Au", "w": 2.4}, {"label": "Statut", "w": 2.4}],
            rows=[
                [{"text": c.employee.nom, "bold": True}, c.type, fr_date(c.date_debut), fr_date(c.date_fin),
                 {"text": "Approuvé" if c.statut == "approuve" else "En attente", "tone": "good" if c.statut == "approuve" else "warn"}]
                for c in conges
            ],
        )

    # ---- Cadastre
    r.section("Cadastre", keep=28)
    lots = list(Lot.objects.all())
    conformes = sum(
        1 for lot in lots
        if is_surface_conforme(float(lot.surface_calculee_m2), float(lot.correction_lambert_m2), float(lot.surface_document_m2))
    )
    by_statut = {s: sum(1 for lot in lots if lot.statut == s) for s in ("brouillon", "verifie", "valide")}
    touched = sum(1 for lot in lots if _in(timezone.localtime(lot.updated_at).date(), b))
    s = "s" if touched > 1 else ""
    r.kpis([
        {"label": "Lots enregistrés", "value": str(len(lots)), "sub": f"{touched} créé{s} ou modifié{s} ce mois"},
        {"label": "Conformes", "value": str(conformes), "sub": "écart de surface ≤ 1 m²", "tone": "good"},
        {"label": "Avec écart", "value": str(len(lots) - conformes), "sub": "à examiner", "tone": "bad" if len(lots) - conformes else None},
        {"label": "Validés", "value": str(by_statut["valide"]), "sub": f"{by_statut['verifie']} vérifié(s), {by_statut['brouillon']} brouillon(s)"},
    ])

    r.paragraph(f"Établi par {author or 'glbOps'}. Activité : {label.lower()}. Autres blocs : état au jour de l'édition.", size=8, color="muted", gap=0)
    return r.finalize()
