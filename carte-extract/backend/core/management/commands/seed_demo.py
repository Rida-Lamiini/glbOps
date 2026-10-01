from datetime import datetime

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.db import transaction

DEMO_PASSWORD = "password123"

from clients.models import Client
from employees.models import Conge, Employee
from projets.models import HistoryEntry, Prestation, Projet, Tache
from resources.models import Resource


def d(value):
    """Parse a dd/mm/yyyy date string. Returns None for empty values."""
    if not value:
        return None
    return datetime.strptime(value, "%d/%m/%Y").date()


class Command(BaseCommand):
    help = "Seed the database with the same demo data used by the frontend (frontend/src/data/seed.js)."

    @transaction.atomic
    def handle(self, *args, **options):
        self.stdout.write("Clearing existing demo data...")
        Projet.objects.all().delete()
        Client.objects.all().delete()
        Resource.objects.all().delete()
        Conge.objects.all().delete()
        Employee.objects.all().delete()
        User.objects.filter(username__in=[
            "emp-001", "emp-002", "emp-003", "emp-004", "emp-005", "emp-006",
            "dispatcher", "directrice",
        ]).delete()

        def make_user(username, **extra):
            user = User.objects.create_user(username=username, password=DEMO_PASSWORD, **extra)
            return user

        self.stdout.write("Seeding office accounts (dispatcher/directrice)...")
        make_user("dispatcher", is_staff=True, first_name="Yassine", last_name="Berrada")
        make_user("directrice", is_staff=True, is_superuser=True, first_name="Leila", last_name="Amrani")

        self.stdout.write("Seeding employees...")
        employees = {
            "EMP-001": Employee.objects.create(
                id="EMP-001", nom="Pierre Lefèvre", role="Agent Chantier", poste="Chef d'équipe",
                telephone="06 61 20 30 40", email="p.lefevre@exemple.ma", date_embauche=d("03/01/2019"),
                user=make_user("emp-001", first_name="Pierre", last_name="Lefèvre"),
            ),
            "EMP-002": Employee.objects.create(
                id="EMP-002", nom="Marc Lambert", role="Agent Bureau", poste="Agent bureau",
                telephone="06 68 27 37 47", email="m.lambert@exemple.ma", date_embauche=d("12/01/2019"),
                user=make_user("emp-002", first_name="Marc", last_name="Lambert"),
            ),
            "EMP-003": Employee.objects.create(
                id="EMP-003", nom="Julien Faure", role="Agent Contrôle", poste="Agent contrôle",
                telephone="06 71 30 40 50", email="j.faure@exemple.ma", date_embauche=d("16/05/2020"),
                user=make_user("emp-003", first_name="Julien", last_name="Faure"),
            ),
            "EMP-004": Employee.objects.create(
                id="EMP-004", nom="Sara Benjelloun", role="Agent Chantier", poste="Topographe terrain",
                telephone="06 54 18 22 09", email="s.benjelloun@exemple.ma", date_embauche=d("07/09/2021"),
                user=make_user("emp-004", first_name="Sara", last_name="Benjelloun"),
            ),
            "EMP-005": Employee.objects.create(
                id="EMP-005", nom="Nadia Chraibi", role="Agent Bureau", poste="Dessinatrice-projeteuse",
                telephone="06 45 33 12 87", email="n.chraibi@exemple.ma", date_embauche=d("20/02/2022"),
                user=make_user("emp-005", first_name="Nadia", last_name="Chraibi"),
            ),
            "EMP-006": Employee.objects.create(
                id="EMP-006", nom="Omar Idrissi", role="Agent Contrôle", poste="Contrôleur qualité",
                telephone="06 77 41 09 33", email="o.idrissi@exemple.ma", date_embauche=d("11/11/2020"),
                status="inactif", user=make_user("emp-006", first_name="Omar", last_name="Idrissi"),
            ),
        }

        Conge.objects.create(
            id="CNG-001", employee=employees["EMP-004"], type="Congé payé",
            date_debut=d("28/09/2026"), date_fin=d("02/10/2026"), statut="approuve", motif="Congés annuels",
        )

        self.stdout.write("Seeding clients...")
        clients = {
            "CLI-0231": Client.objects.create(
                id="CLI-0231", nom="Atlas Immobilier", contact="Rania El Amrani",
                telephone="05 37 71 20 10", email="r.elamrani@atlas-immo.ma",
                adresse="12 Avenue Annakhil, Hay Riad, Rabat", secteur="Promotion immobilière",
            ),
            "CLI-0232": Client.objects.create(
                id="CLI-0232", nom="Groupe Meridia", contact="Yassine Kadiri",
                telephone="05 22 95 40 18", email="y.kadiri@meridia.ma",
                adresse="Twin Center, Boulevard Zerktouni, Casablanca", secteur="Promotion immobilière",
            ),
            "CLI-0233": Client.objects.create(
                id="CLI-0233", nom="Riad Aménagement", contact="Khadija Bennani",
                telephone="05 37 68 12 44", email="k.bennani@riad-amenagement.ma",
                adresse="Avenue Al Alaouiyine, Agdal, Rabat", secteur="Aménagement urbain",
            ),
            "CLI-0234": Client.objects.create(
                id="CLI-0234", nom="Office Régional des Eaux", contact="Hicham Radouani",
                telephone="05 37 65 91 22", email="h.radouani@ore-eau.ma",
                adresse="Station de traitement, Route de Zaër, Rabat", secteur="Infrastructure publique",
            ),
        }

        self.stdout.write("Seeding materiels & vehicules...")
        resources = {
            "MAT-001": Resource.objects.create(
                id="MAT-001", nom="Station totale", type="station_totale", marque="Leica", modele="TS16",
                numero_serie="LC-88213", status="operationnel",
                derniere_calibration=d("15/03/2026"), prochaine_calibration=d("15/03/2027"),
                emplacement="Armoire matériel — Agence Rabat", date_achat=d("12/03/2023"),
                valeur="285 000 MAD", fournisseur="Leica Geosystems Maroc",
            ),
            "MAT-002": Resource.objects.create(
                id="MAT-002", nom="GPS GNSS", type="gps", marque="Trimble", modele="R12i",
                numero_serie="TR-55019", status="operationnel",
                derniere_calibration=d("02/05/2026"), prochaine_calibration=d("02/05/2027"),
                emplacement="Armoire matériel — Agence Rabat", date_achat=d("18/06/2023"),
                valeur="195 000 MAD", fournisseur="Trimble Maroc",
            ),
            "MAT-003": Resource.objects.create(
                id="MAT-003", nom="Drone cartographie", type="drone", marque="DJI", modele="Matrice 350 RTK",
                numero_serie="DJ-40217", status="operationnel",
                derniere_calibration=d("20/07/2026"), prochaine_calibration=d("20/01/2027"),
                emplacement="Local drone — Agence Rabat", date_achat=d("05/09/2024"),
                valeur="165 000 MAD", fournisseur="Aeromaroc",
            ),
            "MAT-004": Resource.objects.create(
                id="MAT-004", nom="Scanner 3D LiDAR", type="scanner", marque="Leica", modele="RTC360",
                numero_serie="LC-91345", status="maintenance",
                derniere_calibration=d("10/01/2026"), prochaine_calibration=d("10/01/2027"),
                emplacement="Atelier technique — Agence Rabat", date_achat=d("22/11/2022"),
                valeur="540 000 MAD", fournisseur="Leica Geosystems Maroc",
            ),
            "MAT-005": Resource.objects.create(
                id="MAT-005", nom="Niveau optique", type="niveau", marque="Sokkia", modele="B40A",
                numero_serie="SK-11278", status="operationnel",
                derniere_calibration=d("08/04/2026"), prochaine_calibration=d("08/04/2027"),
                emplacement="Armoire matériel — Agence Rabat", date_achat=d("14/01/2021"),
                valeur="22 000 MAD", fournisseur="Sokkia Maroc",
            ),
            "VEH-001": Resource.objects.create(
                id="VEH-001", nom="4x4 — 12345-A-6", type="vehicule", marque="Toyota", modele="Hilux",
                numero_serie="12345-A-6", status="operationnel",
                emplacement="Parking — Agence Rabat", date_achat=d("03/02/2022"),
                valeur="320 000 MAD", fournisseur="Toyota du Maroc",
                assurance_compagnie="Wafa Assurance", assurance_police="P-2025-40817", assurance_debut=d("12/10/2025"),
                assurance_echeance=d("12/10/2026"), assurance_prime="7 200 MAD",
                visite_technique_derniere=d("04/03/2026"), visite_technique_prochaine=d("04/03/2027"),
                vignette_paiement=d("20/01/2026"), vignette_echeance=d("31/01/2027"),
                kilometrage=84200, kilometrage_date=d("18/09/2026"),
                entretien_prochain_date=d("15/11/2026"), entretien_prochain_km=90000,
                carburant="diesel", carte_carburant="CC-4471", conducteur=employees["EMP-001"],
            ),
            "VEH-002": Resource.objects.create(
                id="VEH-002", nom="Dacia Duster — 33210-A-6", type="vehicule", marque="Dacia", modele="Duster",
                numero_serie="33210-A-6", status="maintenance",
                emplacement="Garage — Agence Rabat", date_achat=d("19/05/2023"),
                valeur="180 000 MAD", fournisseur="Renault Maroc",
                assurance_compagnie="AXA Assurance Maroc", assurance_police="A-2025-11902", assurance_debut=d("01/09/2025"),
                assurance_echeance=d("01/09/2026"), assurance_prime="4 900 MAD",
                visite_technique_derniere=d("22/12/2025"), visite_technique_prochaine=d("22/12/2026"),
                vignette_paiement=d("25/01/2026"), vignette_echeance=d("31/01/2027"),
                kilometrage=61350, kilometrage_date=d("02/09/2026"),
                entretien_prochain_date=d("10/10/2026"), entretien_prochain_km=65000,
                carburant="essence", carte_carburant="CC-5120", conducteur=employees["EMP-004"],
            ),
        }

        self.stdout.write("Seeding projets & prestations...")

        def make_projet(id, client_id, reference_fonciere, situation, lat, lng, nature, date_debut, notes=""):
            return Projet.objects.create(
                id=id, client=clients[client_id], reference_fonciere=reference_fonciere,
                situation=situation, lat=lat, lng=lng, nature_prestation_projet=nature,
                date_debut=d(date_debut), notes=notes,
            )

        def add_history(prestation, entries):
            for entry in entries:
                HistoryEntry.objects.create(
                    prestation=prestation, date=entry["date"], label=entry["label"],
                    author=entry.get("author", ""),
                )

        def add_taches(prestation, taches):
            for t in taches:
                tache = Tache.objects.create(prestation=prestation, label=t["label"], done=t["done"])
                tache.agents.set([e for e in employees.values() if e.nom in t.get("agents", [])])

        p1 = make_projet(
            "PRJ-2026-001", "CLI-0231", "TF/58210/R", "Hay Riad, Rabat", 33.9654, -6.8498,
            "Levé topographique", "01/09/2026",
        )

        p2 = make_projet(
            "PRJ-2026-002", "CLI-0232", "TF/61044/C", "Twin Center, Boulevard Zerktouni, Casablanca",
            33.5850, -7.6320, "Bornage terrain", "05/09/2026",
        )
        prs101 = Prestation.objects.create(
            id="PRS-2026-101", projet=p2, nature_demandee="Bornage terrain — 3 lots",
            date_debut_demande=d("05/09/2026"), stage="demande",
        )
        add_history(prs101, [{"date": "05/09/2026", "label": "Demande reçue", "author": "Dispatcher"}])

        p3 = make_projet(
            "PRJ-2026-003", "CLI-0233", "TF/44872/R", "Sidi Yahya Zaer, Rabat", 33.9280, -6.5830,
            "Implantation VRD", "20/08/2026", "Lotissement 40 lots, phase 1",
        )
        prs102 = Prestation.objects.create(
            id="PRS-2026-102", projet=p3, nature_demandee="Implantation VRD — lotissement 40 lots",
            date_debut_demande=d("20/08/2026"), date_fin_demande=d("22/08/2026"), stage="affectation",
            vehicule=resources["VEH-001"], agent_bureau=employees["EMP-002"], agent_controle=employees["EMP-003"],
            date_debut_exec="18/09/2026",
        )
        prs102.agent_chantier.set([employees["EMP-001"]])
        prs102.materiels.set([resources["MAT-001"]])
        add_history(prs102, [
            {"date": "20/08/2026", "label": "Demande reçue", "author": "Dispatcher"},
            {"date": "22/08/2026", "label": "Prestation confirmée", "author": "Directrice"},
            {"date": "10/09/2026", "label": "Affectation : Pierre Lefèvre — visite prévue le 18/09/2026", "author": "Dispatcher"},
        ])

        p4 = make_projet(
            "PRJ-2026-004", "CLI-0234", "TF/39120/R", "Station de traitement, Route de Zaër, Rabat",
            33.9430, -6.9120, "Relevé LiDAR", "15/08/2026",
        )
        prs103 = Prestation.objects.create(
            id="PRS-2026-103", projet=p4, nature_demandee="Relevé LiDAR station de traitement",
            date_debut_demande=d("15/08/2026"), date_fin_demande=d("16/08/2026"), stage="execution",
            vehicule=resources["VEH-001"], agent_bureau=employees["EMP-005"], agent_controle=employees["EMP-006"],
            date_debut_exec="05/09/2026",
        )
        prs103.agent_chantier.set([employees["EMP-004"]])
        prs103.materiels.set([resources["MAT-003"]])
        add_history(prs103, [
            {"date": "15/08/2026", "label": "Demande reçue", "author": "Dispatcher"},
            {"date": "16/08/2026", "label": "Prestation confirmée", "author": "Directrice"},
            {"date": "28/08/2026", "label": "Affectation : Sara Benjelloun — visite prévue le 05/09/2026", "author": "Dispatcher"},
            {"date": "05/09/2026", "label": "Passage à l'exécution — visite du 05/09/2026", "author": "Sara Benjelloun"},
        ])

        p5 = make_projet(
            "PRJ-2026-005", "CLI-0231", "TF/52310/C", "Californie, Casablanca", 33.5590, -7.6050,
            "Cartographie drone", "01/08/2026",
        )
        prs104 = Prestation.objects.create(
            id="PRS-2026-104", projet=p5, nature_demandee="Cartographie drone — terrain 8ha",
            nature_executee="Vol drone réalisé sur 8ha, 420 clichés capturés",
            date_debut_demande=d("01/08/2026"), date_fin_demande=d("02/08/2026"), stage="bureau",
            vehicule=resources["VEH-001"], agent_bureau=employees["EMP-002"], agent_controle=employees["EMP-003"],
            date_debut_exec="18/08/2026", date_fin_exec="18/08/2026 16:30",
            date_debut_bureau=d("19/08/2026"), chemin_bureau="\\\\SERVEUR\\Projets\\PRJ-2026-005\\bureau\\",
        )
        prs104.agent_chantier.set([employees["EMP-001"]])
        prs104.materiels.set([resources["MAT-003"]])
        add_taches(prs104, [
            {"label": "Orthophoto", "done": True, "agents": ["Marc Lambert"]},
            {"label": "Nuage de points", "done": False, "agents": ["Marc Lambert"]},
        ])
        add_history(prs104, [
            {"date": "01/08/2026", "label": "Demande reçue", "author": "Dispatcher"},
            {"date": "02/08/2026", "label": "Prestation confirmée", "author": "Directrice"},
            {"date": "12/08/2026", "label": "Affectation : Pierre Lefèvre — visite prévue le 18/08/2026", "author": "Dispatcher"},
            {"date": "18/08/2026", "label": "Passage à l'exécution — visite du 18/08/2026", "author": "Pierre Lefèvre"},
            {"date": "18/08/2026", "label": "Exécution saisie — Vol drone réalisé sur 8ha, 420 clichés capturés", "author": "Pierre Lefèvre"},
            {"date": "19/08/2026", "label": "Tâches affectées — Orthophoto, Nuage de points", "author": "Marc Lambert"},
        ])

        p6 = make_projet(
            "PRJ-2026-006", "CLI-0232", "TF/47033/C", "Ain Sebaâ, Casablanca", 33.6070, -7.5330,
            "Auscultation structure", "10/07/2026", "Pont RN1 — franchissement voie ferrée",
        )
        prs105 = Prestation.objects.create(
            id="PRS-2026-105", projet=p6, nature_demandee="Auscultation structure — pont RN1",
            nature_executee="Relevé des fissures et déformations réalisé",
            date_debut_demande=d("10/07/2026"), date_fin_demande=d("11/07/2026"), stage="controle",
            vehicule=resources["VEH-001"], agent_bureau=employees["EMP-005"], agent_controle=employees["EMP-003"],
            date_debut_exec="22/07/2026", date_fin_exec="23/07/2026 12:00",
            ref="LIV-2026-0142", chemin_bureau="\\\\SERVEUR\\Projets\\PRJ-2026-006\\bureau\\rapport_v2.pdf",
            date_debut_bureau=d("24/07/2026"), date_fin_bureau=d("29/07/2026"), date_debut_controle=d("30/07/2026"),
        )
        prs105.agent_chantier.set([employees["EMP-004"]])
        prs105.materiels.set([resources["MAT-005"]])
        add_taches(prs105, [{"label": "Rapport de bornage", "done": True, "agents": ["Nadia Chraibi"]}])
        add_history(prs105, [
            {"date": "10/07/2026", "label": "Demande reçue", "author": "Dispatcher"},
            {"date": "11/07/2026", "label": "Prestation confirmée", "author": "Directrice"},
            {"date": "18/07/2026", "label": "Affectation : Sara Benjelloun — visite prévue le 22/07/2026", "author": "Dispatcher"},
            {"date": "22/07/2026", "label": "Passage à l'exécution — visite du 22/07/2026", "author": "Sara Benjelloun"},
            {"date": "23/07/2026", "label": "Exécution saisie — Relevé des fissures et déformations réalisé", "author": "Sara Benjelloun"},
            {"date": "24/07/2026", "label": "Tâches affectées — Rapport de bornage", "author": "Nadia Chraibi"},
            {"date": "29/07/2026", "label": "Traitement bureau terminé — Rapport de bornage", "author": "Nadia Chraibi"},
        ])

        p7 = make_projet(
            "PRJ-2026-007", "CLI-0233", "TF/36018/R", "Tamesna, Rabat", 33.8210, -6.8340,
            "Levé topographique", "01/06/2026",
        )
        prs106 = Prestation.objects.create(
            id="PRS-2026-106", projet=p7, nature_demandee="Levé topographique — assiette foncière 12ha",
            nature_executee="Levé complet réalisé, 340 points levés",
            date_debut_demande=d("01/06/2026"), date_fin_demande=d("02/06/2026"), stage="livraison",
            vehicule=resources["VEH-001"], agent_bureau=employees["EMP-002"], agent_controle=employees["EMP-003"],
            date_debut_exec="15/06/2026", date_fin_exec="16/06/2026 15:00",
            ref="LIV-2026-0098", chemin_bureau="\\\\SERVEUR\\Projets\\PRJ-2026-007\\bureau\\plan_v3.dwg",
            date_debut_bureau=d("17/06/2026"), date_fin_bureau=d("25/06/2026"),
            date_debut_controle=d("26/06/2026"), date_fin_controle=d("01/07/2026"),
            date_livraison=d("20/07/2026"), chemin="\\\\SERVEUR\\Projets\\PRJ-2026-007\\livraison\\",
            cd_n="CD-0118", disque_n="DQ-041",
        )
        prs106.agent_chantier.set([employees["EMP-001"]])
        prs106.materiels.set([resources["MAT-001"], resources["MAT-002"]])
        add_taches(prs106, [{"label": "Plan topographique", "done": True, "agents": ["Marc Lambert"]}])
        add_history(prs106, [
            {"date": "01/06/2026", "label": "Demande reçue", "author": "Dispatcher"},
            {"date": "02/06/2026", "label": "Prestation confirmée", "author": "Directrice"},
            {"date": "10/06/2026", "label": "Affectation : Pierre Lefèvre — visite prévue le 15/06/2026", "author": "Dispatcher"},
            {"date": "15/06/2026", "label": "Passage à l'exécution — visite du 15/06/2026", "author": "Pierre Lefèvre"},
            {"date": "16/06/2026", "label": "Exécution saisie — Levé complet réalisé, 340 points levés", "author": "Pierre Lefèvre"},
            {"date": "17/06/2026", "label": "Tâches affectées — Plan topographique", "author": "Marc Lambert"},
            {"date": "25/06/2026", "label": "Traitement bureau terminé — Plan topographique", "author": "Marc Lambert"},
            {"date": "01/07/2026", "label": "Contrôle conforme", "author": "Julien Faure"},
            {"date": "20/07/2026", "label": "Livré — Réf LIV-2026-0098", "author": "Directrice"},
        ])

        p8 = make_projet(
            "PRJ-2026-008", "CLI-0234", "TF/61987/S", "Quartier industriel, Salé", 34.0530, -6.7990,
            "Bornage terrain", "05/07/2026",
        )
        prs107 = Prestation.objects.create(
            id="PRS-2026-107", projet=p8, nature_demandee="Bornage terrain — 14 bornes, lotissement industriel",
            nature_executee="Bornage réalisé, 14 bornes posées",
            date_debut_demande=d("05/07/2026"), date_fin_demande=d("07/07/2026"), stage="execution",
            cycles=1, non_conformite_source="chantier",
            vehicule=resources["VEH-001"], agent_bureau=employees["EMP-005"], agent_controle=employees["EMP-003"],
            date_debut_exec="20/07/2026", date_fin_exec="21/07/2026 17:00",
            ref="LIV-2026-0121", chemin_bureau="\\\\SERVEUR\\Projets\\PRJ-2026-008\\bureau\\rapport_v1.pdf",
            date_debut_bureau=d("23/07/2026"), date_fin_bureau=d("25/07/2026"),
            date_debut_controle=d("26/07/2026"), date_fin_controle=d("28/07/2026"),
        )
        prs107.agent_chantier.set([employees["EMP-001"]])
        prs107.materiels.set([resources["MAT-001"], resources["MAT-005"]])
        add_taches(prs107, [{"label": "Rapport de bornage", "done": True, "agents": ["Nadia Chraibi"]}])
        add_history(prs107, [
            {"date": "05/07/2026", "label": "Demande reçue", "author": "Dispatcher"},
            {"date": "07/07/2026", "label": "Prestation confirmée", "author": "Directrice"},
            {"date": "15/07/2026", "label": "Affectation : Pierre Lefèvre — visite prévue le 20/07/2026", "author": "Dispatcher"},
            {"date": "20/07/2026", "label": "Passage à l'exécution — visite du 20/07/2026", "author": "Pierre Lefèvre"},
            {"date": "21/07/2026", "label": "Exécution saisie — Bornage réalisé, 14 bornes posées", "author": "Pierre Lefèvre"},
            {"date": "23/07/2026", "label": "Tâches affectées — Rapport de bornage", "author": "Nadia Chraibi"},
            {"date": "25/07/2026", "label": "Traitement bureau terminé — Rapport de bornage", "author": "Nadia Chraibi"},
            {
                "date": "28/07/2026",
                "label": "Non conforme — [Agent Chantier (exécution terrain)] Bornes manquantes sur 2 limites, "
                         "coordonnées incohérentes avec le plan cadastral. Retour à Exécution.",
                "author": "Julien Faure",
            },
        ])

        self.stdout.write(self.style.SUCCESS("Demo data seeded."))
        self.stdout.write(
            f"Demo login accounts (password: {DEMO_PASSWORD}): dispatcher, directrice, "
            + ", ".join(e.lower() for e in employees)
        )
