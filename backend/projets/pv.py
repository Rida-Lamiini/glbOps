"""The "procès-verbal" PDF of a prestation: identification, work done, cadastral lot, field photos,
bureau, rejections, control, delivery and signatures. Server-side port of the former
frontend utils/pv.js, drawn with core.pdf_kit."""

from cadastre.geo.proj import wgs84_to_lambert
from core.pdf_kit import Report, fr_date, image_for_pdf, num

from .models import STAGE_CHOICES

MAX_PHOTOS = 6
REJECT_PREFIXES = ["Non conforme", "Données insuffisantes", "Visite partielle"]
STAGE_KEYS = [key for key, _ in STAGE_CHOICES]
STAGE_LABELS = dict(STAGE_CHOICES)
LOT_STATUTS = {"brouillon": "Brouillon", "verifie": "Vérifié", "valide": "Validé"}


def _event_kind(label):
    return next((p for p in REJECT_PREFIXES if label.startswith(p)), "")


def _lot_for(prestation):
    """The survey attached to this prestation, or failing that the latest one of its projet."""
    lot = prestation.lots_cadastraux.prefetch_related("bornes").first()
    if lot is None:
        lot = prestation.projet.lots_cadastraux.prefetch_related("bornes").first()
    return lot


def _photos(prestation):
    all_photos = [a for a in prestation.attachments.all().order_by("uploaded_at", "id") if a.type == "photo"]
    loaded = []
    for a in (p for p in all_photos if p.file):
        if len(loaded) == MAX_PHOTOS:
            break
        try:
            with a.file.open("rb") as fh:
                img = image_for_pdf(fh.read())
        except OSError:
            img = None
        if img:
            name = a.file.name.rsplit("/", 1)[-1]
            img["caption"] = " · ".join(v for v in (a.label or name, fr_date(a.uploaded_at.date())) if v)
            loaded.append(img)
    return loaded, len(all_photos)


def build_pv(prestation):
    projet = prestation.projet
    client = projet.client
    lot = _lot_for(prestation)
    photos, total_photos = _photos(prestation)
    chantier = [e.nom for e in prestation.agent_chantier.all()]
    history = list(prestation.history.all())

    r = Report(
        title=f"Procès-verbal — {prestation.nature_demandee or 'Prestation'}",
        eyebrow="Procès-verbal de prestation",
        subtitle=f"{client.nom or '—'} · {projet.id} · {projet.situation or '—'}",
        ref=f"PV N° {prestation.id}",
    )

    stage_idx = STAGE_KEYS.index(prestation.stage) if prestation.stage in STAGE_KEYS else -1
    livree = prestation.stage == "livraison" and prestation.chemin and prestation.date_livraison
    cycles = prestation.cycles

    if livree:
        detail = f"Livrée le {fr_date(prestation.date_livraison)}"
        if prestation.ref:
            detail += f" — référence {prestation.ref}"
        if cycles:
            detail += f", après {cycles} reprise{'s' if cycles > 1 else ''}"
        r.callout("Prestation livrée", detail + ".", "good")
    else:
        r.callout(
            f"Étape en cours : {STAGE_LABELS.get(prestation.stage, prestation.stage)}",
            "Ce procès-verbal décrit l'avancement à la date d'édition.",
            "info",
        )

    r.section("Identification")
    identification = [
        ("Client", f"{client.nom or '—'} ({client.id})"),
        ("Projet", f"{projet.id} — {projet.nature_prestation_projet or '—'}"),
        ("Référence foncière", projet.reference_fonciere or "—"),
        ("Situation", projet.situation or "—"),
    ]
    if projet.lat is not None and projet.lng is not None:
        x, y = wgs84_to_lambert(projet.lat, projet.lng)
        identification += [
            ("Coordonnées GPS (WGS84)", f"{projet.lat:.5f}, {projet.lng:.5f}"),
            ("Lambert Nord Maroc (EPSG:26191)", f"X {x:.1f}  Y {y:.1f}"),
        ]
    r.kv(identification)

    r.section("Prestation réalisée")
    r.kv([
        ("Nature demandée", prestation.nature_demandee or "—"),
        ("Nature exécutée", prestation.nature_executee or "—"),
        ("Agent(s) chantier", ", ".join(chantier) or "—"),
        ("Matériel utilisé", ", ".join(m.nom for m in prestation.materiels.all()) or "—"),
        ("Véhicule", prestation.vehicule.nom if prestation.vehicule else "—"),
        ("Date de visite", prestation.date_debut_exec or "—"),
        ("Fin d'exécution", prestation.date_fin_exec or "—"),
    ])

    if lot:
        calculee, document, correction = (float(v) for v in (lot.surface_calculee_m2, lot.surface_document_m2, lot.correction_lambert_m2))
        ecart = round(calculee + correction - document, 2)
        conforme = abs(ecart) <= 1
        r.section("Lot cadastral", note=f"Titre foncier {lot.titre_foncier}", keep=106)
        r.kpis([
            {"label": "Surface calculée", "value": f"{num(calculee)} m²", "sub": "à partir des bornes"},
            {"label": "Surface du document", "value": f"{num(document)} m²", "sub": "contenance adoptée"},
            {"label": "Écart", "value": f"{'+' if ecart > 0 else ''}{num(ecart)} m²",
             "sub": "conforme (≤ 1 m²)" if conforme else "au-delà de 1 m²", "tone": "good" if conforme else "bad"},
        ])
        plan_top = r.y
        r.plot([(b.name, float(b.x_lambert), float(b.y_lambert)) for b in lot.bornes.all()], w=92, h=66)
        fx = 16 + 92 + 8
        for i, (label, value) in enumerate([
            ("Propriété dite", lot.propriete_dite),
            ("Géomètre", lot.geometre or "—"),
            ("Revue", LOT_STATUTS.get(lot.statut, lot.statut)),
        ]):
            fy = plan_top + 5 + i * 20
            r.font("bold", 7, "muted")
            r.text(label.upper(), fx, fy)
            r.font("normal", 10, "ink")
            r.text_lines(r.lines(value, 210 - 16 - fx), fx, fy + 5.5)
        r.y = plan_top + 72
        r.paragraph("Rapport cadastral complet disponible dans l'outil Cadastre (bornes, distances, revue).", size=8, color="muted", gap=2)

    if photos:
        note = f"{len(photos)} sur {total_photos}" if total_photos > len(photos) else f"{len(photos)} photo{'s' if len(photos) > 1 else ''}"
        r.section("Photos de terrain", note=note)
        r.photo_grid(photos)

    if stage_idx >= STAGE_KEYS.index("bureau"):
        taches = " · ".join(f"{t.label} ({', '.join(a.nom for a in t.agents.all()) or '—'})" for t in prestation.taches.all())
        r.section("Traitement bureau")
        r.kv([
            ("Tâches réalisées", taches or "—"),
            ("Référence du livrable", prestation.ref or "—"),
            ("Début du traitement", fr_date(prestation.date_debut_bureau) or "—"),
            ("Fin du traitement", fr_date(prestation.date_fin_bureau) or "—"),
            ("Dossier de travail", prestation.chemin_bureau or "—"),
        ])

    events = [h for h in history if _event_kind(h.label or "")]
    if events:
        r.section("Historique des reprises", note=f"{len(events)} événement{'s' if len(events) > 1 else ''}")
        rows = []
        for h in events:
            kind = _event_kind(h.label)
            detail = h.label[len(kind):].lstrip(" —-") or "—"
            rows.append([h.date, {"text": kind, "bold": True, "tone": "warn" if kind == "Visite partielle" else "bad"}, detail, h.author or "—"])
        r.table(
            cols=[{"label": "Date", "w": 2}, {"label": "Événement", "w": 3.2}, {"label": "Détail", "w": 8}, {"label": "Par", "w": 2.4}],
            rows=rows,
        )

    if stage_idx >= STAGE_KEYS.index("controle"):
        r.section("Contrôle")
        r.kv([
            ("Agent contrôle", prestation.agent_controle.nom if prestation.agent_controle else "—"),
            ("Période de contrôle", f"Du {fr_date(prestation.date_debut_controle) or '—'} au {fr_date(prestation.date_fin_controle) or '—'}"),
            ("Résultat", f"Conforme après {cycles} reprise{'s' if cycles > 1 else ''}" if cycles > 0 else "Conforme"),
        ])

    if livree:
        r.section("Livraison")
        r.kv([
            ("Date de livraison", fr_date(prestation.date_livraison)),
            ("Référence du livrable", prestation.ref or "—"),
            ("Dossier de livraison", prestation.chemin or "—"),
            ("CD / Disque", " / ".join(v for v in (prestation.cd_n, prestation.disque_n) if v) or "—"),
        ])

    r.section("Signatures")
    r.signatures([
        {"role": "Agent chantier", "name": chantier[0] if chantier else ""},
        {"role": "Responsable Globetudes"},
        {"role": "Client (lu et approuvé)", "name": client.contact},
    ])
    return r.finalize()
