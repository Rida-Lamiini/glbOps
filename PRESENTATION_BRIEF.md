# glbOps — Dossier de préparation de la présentation à Globetudes

> Ce document est basé uniquement sur ce qui existe dans le projet (code, base de données, données de démonstration, historique Git), vérifié le 19/09/2026.
> Ce qui est partiel, absent ou incertain est signalé « À confirmer ». Les sections 1 à 12 sont rédigées sans jargon technique ; le technique est confiné à la section 13.
> **Deux points d'attention avant tout** : (1) ne rien présenter comme « en production » — c'est un prototype fonctionnel de démonstration (section 11) ; (2) je n'ai pas consulté le site globetudes.com : tout ce qui décrit le fonctionnement actuel de l'entreprise est une **hypothèse déduite de l'outil** et doit être validée avec eux.

---

## 1. Le pitch

**En une phrase :**
glbOps est la plateforme unique qui suit chaque dossier de topographie, de la demande du client jusqu'à la livraison, en montrant à chacun (bureau, terrain, contrôle, direction) ce qu'il doit faire et où en est le travail.

**Elevator pitch en 3 lignes :**
1. Aujourd'hui, un dossier passe entre le bureau, le terrain, le traitement et le contrôle : chaque passage est une occasion de perdre une information ou du temps.
2. glbOps met tout le monde sur le même suivi : 7 étapes claires, une tâche visible pour la bonne personne, un historique complet, et des alertes quand quelque chose bloque (conflit de planning, matériel en panne, non-conformité).
3. Il inclut un outil cadastral qui transforme un plan de bornage PDF en lot vérifié, affiché sur la carte et réutilisable sur les projets suivants.

---

## 2. Le problème résolu

> ⚠️ Hypothèse à valider avec Globetudes. Elle est déduite des champs et des écrans de l'outil (chemins réseau `\\SERVEUR\…`, numéro de CD, numéro de disque, procès-verbal, « référence livrable ») : ils décrivent les pratiques que l'outil est censé remplacer ou encadrer.

**Ce que l'entreprise fait probablement aujourd'hui (à confirmer) :**
- Les demandes arrivent par téléphone, e-mail ou visite, puis sont saisies à la main dans des fichiers ou des cahiers.
- L'affectation des équipes, du matériel et des véhicules se fait « de tête » ou via un tableau à part.
- Le terrain envoie ses relevés et photos par des canaux informels ; le bureau doit relancer pour savoir où en est un dossier.
- Les livrables vivent sur un serveur de fichiers, des CD et des disques, avec un numéro noté à la main.
- Le contrôle qualité renvoie un dossier « non conforme » par échange oral ou mail, sans trace structurée.
- Les données cadastrales (bornes, coordonnées Lambert, surfaces) sont recopiées depuis des PDF de l'ANCFCC, avec risque de faute de frappe.

**Où l'on perd du temps, de la qualité et de la visibilité :**

| Perte | Exemple concret que l'outil traite |
|---|---|
| **Temps** | Relances pour savoir où en est un dossier ; ressaisie des coordonnées de bornes ; rédaction manuelle du PV |
| **Erreurs** | Deux dossiers réservent le même véhicule ou le même agent le même jour ; un agent en congé est planifié ; un matériel en maintenance est envoyé sur le terrain ; une surface cadastrale mal recopiée |
| **Visibilité** | La direction ne voit pas d'un coup d'œil ce qui est en retard, bloqué ou non conforme, ni la charge de chaque agent |
| **Traçabilité** | Qui a validé quoi, quand, et pourquoi un dossier est revenu au terrain |
| **Capitalisation** | Un terrain déjà levé pour un client est levé « à nouveau » faute de retrouver l'ancien calcul |

---

## 3. La solution en mots simples

glbOps est une application web, en français, qui se compose de quatre blocs :

1. **Le suivi des dossiers** : un client a des projets ; un projet a une ou plusieurs prestations (un levé, un bornage, un relevé drone…) ; chaque prestation avance dans un parcours en 7 étapes. Tout est daté, signé et historisé.
2. **La planification et les ressources** : calendrier, carte, fiches employés (avec congés), fiches matériel et véhicules (avec étalonnage et maintenance). L'outil avertit des conflits avant qu'ils n'arrivent.
3. **Le pilotage** : un tableau de bord et une page d'analyse (délais, taux de non-conformité, charge par agent).
4. **L'outil Cadastre** : import d'un « Calcul de Contenances » en PDF, lecture automatique, vérification humaine, calcul indépendant de la surface, affichage sur la carte, réutilisation sur les projets suivants.

**Pour qui :** le bureau (dispatcher, direction) qui pilote ; les agents de chantier, de bureau et de contrôle qui exécutent chacun leur étape avec un écran adapté.

---

## 4. Utilisateurs et rôles

Il y a **5 rôles**. Un compte de démonstration existe pour chacun (section 8 et 13).

| Rôle | Qui c'est (données de démo) | Ce qu'il voit | Ce qu'il peut faire |
|---|---|---|---|
| **Dispatcher** | Bureau d'ordonnancement | Toute l'application (10 écrans) | Créer clients, projets, prestations ; valider la prestation demandée ; affecter équipe, matériel, véhicule, date de visite ; affecter les tâches au bureau ; archiver et clôturer une livraison ; gérer employés, matériel, véhicules ; approuver ou refuser des congés ; utiliser le Cadastre ; exporter |
| **Directrice** | Direction | Idem Dispatcher | Idem Dispatcher (la seule différence en démo : compte administrateur) |
| **Agent Chantier** | Pierre Lefèvre (chef d'équipe), Sara Benjelloun (topographe terrain) | Uniquement **ses** missions, la carte et le calendrier ; interface pensée pour mobile | Démarrer l'exécution, saisir ce qui a été fait, ajouter des photos, signaler une mission non terminée et proposer une nouvelle date, ouvrir l'itinéraire dans Google Maps |
| **Agent Bureau** | Marc Lambert, Nadia Chraibi (dessinatrice-projeteuse) | Uniquement les dossiers qui lui sont affectés, en colonnes | Saisir dates de traitement, référence et chemin du livrable, cocher les tâches faites, envoyer au contrôle, ou renvoyer au terrain pour « données insuffisantes » |
| **Agent Contrôle** | Julien Faure ; Omar Idrissi (marqué inactif en démo) | Uniquement les dossiers à contrôler | Déclarer un dossier conforme, ou non conforme avec motif et origine (terrain ou bureau) ; il est alors renvoyé à la bonne étape |

**Règle de fond : chaque étape n'a qu'un seul rôle propriétaire.** Le dispatcher ne fait pas la visite terrain à la place du chef d'équipe, ni le contrôle à la place du contrôleur : il voit tout, mais les boutons d'action sont réservés au bon rôle (mention « Lecture seule pour votre rôle » sinon).

**Pas de rôle « Client » ni de portail client** : les clients sont des fiches dans la base, ils ne se connectent pas (voir section 11).

---

## 5. Le parcours principal, étape par étape

Une prestation traverse 7 statuts. Chacun a un responsable, une action et une trace dans l'historique.

| # | Statut | Responsable | Ce qui se passe | Passage à l'étape suivante |
|---|---|---|---|---|
| 1 | **Demande** | Dispatcher / Directrice | La demande du client est saisie (création d'un projet = première prestation créée automatiquement à cette étape). On choisit la nature (levé topographique, bornage, LiDAR, drone, implantation VRD, auscultation…) et les dates | « Valider la prestation demandée » |
| 2 | **Prestation demandée** | Dispatcher / Directrice | Affectation des ressources : agents chantier, matériel, véhicule, agent bureau, agent contrôle, date de visite. **L'outil alerte** si un agent ou un véhicule est déjà pris ce jour-là, si un agent est en congé approuvé, ou si un matériel est en maintenance | « Affecter les ressources » |
| 3 | **Affectation terrain** | Agent Chantier | La mission apparaît dans son planning (avec itinéraire) | « Démarrer l'exécution » |
| 4 | **Exécution** | Agent Chantier | Saisie de ce qui a réellement été fait et de la date/heure de fin, photos. Si la mission n'est pas finie : « reprogrammer » avec motif et nouvelle date | « Envoyer au bureau » |
| 5 | **Traitement bureau** | Dispatcher/Directrice affecte les tâches, Agent Bureau exécute | Liste de tâches de traitement (plan topographique, rapport de bornage, orthophoto, nuage de points…), chacune assignée à un agent, avec barre d'avancement. Saisie de la référence du livrable et du dossier de travail | « Envoyer au contrôle » — ou « Retour terrain » si les données sont insuffisantes (compteur de reprises +1) |
| 6 | **Contrôle** | Agent Contrôle | Vérification du livrable | « Conforme » ; ou « Non conforme » avec motif et origine : retour à **Exécution** (origine terrain) ou à **Traitement bureau** (origine bureau), compteur de reprises +1 |
| 7 | **Livraison** | Dispatcher / Directrice | Date de livraison, chemin réseau, n° de CD, n° de disque | « Archiver et clôturer » : la prestation est livrée et archivée |

**Ce qui se déclenche en chemin :**
- **Historique automatique** : chaque action écrit une ligne datée avec son auteur (« Non conforme — [Agent Chantier] Bornes manquantes sur 2 limites… »).
- **Procès-verbal (PV)** : dès que l'exécution est saisie, un PV en PDF est généré en un clic depuis la fiche.
- **Notifications dans l'application** (cloche), propres à chaque rôle : non-conformités et congés en attente pour le bureau, « à traiter » pour le bureau-agent, « à contrôler » pour le contrôleur, « reprise programmée » pour le terrain.
- **Alerte de retard** : une visite prévue mais non démarrée remonte en bandeau rouge.

---

## 6. Liste complète des fonctionnalités, par thème

### A. Suivi des dossiers
| Fonction | Ce qu'elle fait | Bénéfice |
|---|---|---|
| Projets et prestations | Un client → plusieurs projets → plusieurs prestations, chacune avec son parcours | Fini les dossiers « perdus » : tout est rattaché au bon client et au bon terrain |
| Parcours en 7 étapes | Statut unique et partagé | Tout le monde parle du même état d'avancement |
| Vue liste et vue Kanban | Cartes de projets avec mini-parcours, ou colonnes par étape | Voir d'un coup d'œil où s'accumule le travail |
| Filtres et tri | Par étape (dont « Non conformes »), client, agent chantier, dates ; tri récent/ancien/client/nb de prestations ; recherche par client, n° de projet, réf. foncière | Retrouver un dossier en quelques secondes |
| Historique par prestation et par projet | Chronologie signée | Traçabilité, réponse aux litiges |
| Non-conformités et reprises | Retour ciblé vers le terrain ou le bureau avec motif ; compteur de cycles | Qualité mesurable, pas de « ping-pong » informel |
| Mission non terminée | Reprogrammation motivée avec nouvelle date | La réalité du terrain est tracée, pas cachée |
| Pièces jointes | Fichiers ou chemins réseau, sur projet et prestation, avec type (photo terrain, livrable, autre) ; enregistrés réellement sur le serveur | Un seul endroit pour retrouver photos et livrables |
| Notes internes | Sur projet et client | Mémoire du contexte |
| PV en PDF | Généré depuis les données saisies | Gain de rédaction, document homogène |
| Exports | Prestations en CSV (Excel), projets géolocalisés en GeoJSON et KML | Reprise des données dans d'autres outils |

### B. Planification et ressources
| Fonction | Ce qu'elle fait | Bénéfice |
|---|---|---|
| Détection de conflits | Même agent ou même véhicule le même jour ; agent en congé ; matériel ou véhicule non opérationnel | Erreurs de planning évitées avant qu'elles ne coûtent une journée |
| Calendrier | Vues Mois, Semaine, Agents ; couleurs par étape ; nombre de jours en conflit ; filtres agent et étape | Charge et disponibilités lisibles |
| Fiches employés | Profil, poste, contact, statut actif/inactif, congés (paiement, maladie, sans solde…) à approuver ou refuser, liste des affectations | Suivi RH terrain simple ; un agent inactif n'est plus proposé |
| Fiches matériel et véhicules | Marque, modèle, n° de série, emplacement, achat, valeur, fournisseur, statut (opérationnel / maintenance / hors service), dates d'étalonnage, journal de maintenance, affectations | Parc maîtrisé, étalonnages non oubliés |
| **Étiquettes QR, sorties et retours** | Chaque matériel ou véhicule a une étiquette QR imprimable (planche A4). En la scannant avec un téléphone, on note la sortie ou le retour (qui, quand, note, kilométrage pour un véhicule) ; le bureau voit qui a quoi | On sait où est chaque appareil et qui l'a pris ; le kilométrage des véhicules se met à jour tout seul |
| Alerte d'étalonnage en retard | Notification au bureau | Conformité des instruments |
| Fiches clients | Contact, secteur, adresse, notes, projets liés | Mémoire commerciale |

### C. Cartographie
| Fonction | Ce qu'elle fait | Bénéfice |
|---|---|---|
| Carte des projets | Épingles colorées par statut (sans prestation / en cours / non-conformité / livré), regroupement automatique, fonds Plan / Topographie / Satellite | Vision géographique de l'activité |
| Limite de terrain | Dessin de la limite d'un projet ; polygone affiché sur la carte | Emprise réelle visible |
| Recherche d'adresse, géolocalisation, plein écran, échelle | Confort de navigation | — |
| Mesure | Distance et surface directement sur la carte | Estimation rapide sans logiciel dédié |
| Import de points GPX / CSV | Affiche des points ; « Créer un projet ici » | Passer d'un relevé à un projet |
| Coordonnées Lambert | Affichées dans les fenêtres d'information | Format familier des géomètres marocains |
| Export de la carte en PDF | Avec légende | Support pour réunion ou client |
| Couche « Lots cadastraux » | Affiche les lots enregistrés | Croiser projets et cadastre |

### D. Outil Cadastre
| Fonction | Ce qu'elle fait | Bénéfice |
|---|---|---|
| Import d'un PDF « Calcul de Contenances » | Lit les bornes, coordonnées Lambert et surfaces ; passe par une reconnaissance de texte si le PDF est un scan | Fin de la ressaisie |
| Vérification avant enregistrement | Champs obligatoires, minimum 3 bornes, bornes suspectes signalées | Une personne valide toujours ce que la machine a lu |
| Calcul indépendant de la surface | Recalculée côté serveur à partir des bornes ; conforme si l'écart avec le document est ≤ 1 m² | Contre-vérification objective |
| Contrôle des distances | Comparaison croquis / calculé par segment | Détecte les erreurs de plan |
| Statut de revue | Brouillon → Vérifié (bureau) → Validé (contrôle) ; toute modification remet en brouillon ; le changement de statut est contrôlé par rôle côté serveur | Circuit de validation traçable |
| Rattachement à un projet et une prestation | Optionnel | Le lot appartient au bon dossier |
| **Réutilisation d'un lot existant** | À la création d'un projet, l'outil propose les lots déjà levés (même titre foncier ou à moins de 200 m) ; réutilisable en un clic (rattaché ou copié avec lien vers l'original) | Ne jamais refaire deux fois le même calcul |

### E. Pilotage
| Fonction | Ce qu'elle fait | Bénéfice |
|---|---|---|
| Vue d'ensemble | Prestations actives, non conformes, livrées (semaine/mois/période), en retard ; pipeline actuel ; charge de travail par agent ; activité récente ; points à surveiller (clients, ressources, congés) ; état du cadastre | Le « tableau de bord du matin » de la direction |
| Analytique | Indicateurs : nombre de prestations, taux de livraison, taux de non-conformité, délai moyen demande→livraison ; onglets Activité, Équipe, Qualité, Cadastre ; période et client filtrables | Décisions basées sur des faits |
| Notifications | Cloche par rôle | Rien n'est oublié |

### F. Espaces par rôle
| Fonction | Ce qu'elle fait | Bénéfice |
|---|---|---|
| Espace Agent Chantier | Écran mobile : « Mes tâches » et « Planning », détail d'une mission, itinéraire Google Maps | Le terrain n'a que ce qui le concerne |
| Espace Agent Bureau | Tableau en colonnes (en attente terrain / à traiter / envoyé au contrôle / livré) avec glisser-déposer, agenda | Le bureau voit sa file d'attente |
| Espace Agent Contrôle | Colonnes (en attente / à contrôler / livré), agenda | Le contrôleur sait quoi vérifier |

### G. Accès et confort
Connexion par identifiant et mot de passe ; interface entièrement en français ; adaptée au téléphone et à la tablette.

---

## 7. Visite écran par écran (pour les captures d'écran)

> **Important : l'application n'a pas d'adresses (URL) distinctes par écran.** Tout se passe à une seule adresse, `http://localhost:5173/`, et l'on change d'écran avec le menu de gauche. Les fiches (projet, prestation, client…) s'ouvrent en panneau latéral par-dessus. Pour les captures, la colonne « Accès » indique le chemin de clics. Faites les captures en **1440 × 900** pour l'écran bureau, et en **mode mobile 375 × 812** pour l'espace Agent Chantier.
> Les 10 entrées du menu ne s'affichent complètement que pour Dispatcher/Directrice ; les autres rôles ont leur propre écran.

| # | Écran | Accès | Objectif | Ce que l'on voit |
|---|---|---|---|---|
| 1 | **Connexion** | Adresse de l'app, déconnecté | Entrer dans l'application | Logo, champs Identifiant / Mot de passe, bouton « Se connecter » (écran très sobre) |
| 2 | **Vue d'ensemble** | Menu → Suivi → *Vue d'ensemble* (page d'accueil) | Le résumé du matin | Salutation, bandeau d'alerte retard, 4 chiffres clés, sélecteur de période, pipeline par étape, cadastre, charge de travail, activité récente, « À surveiller » |
| 3 | **Projets — liste** | *Projets* | Retrouver et ouvrir un dossier | 4 compteurs, barre de filtres, cartes projet avec client, lieu, nature et mini-parcours de chaque prestation |
| 4 | **Projets — Kanban** | *Projets* → bouton de bascule en vue Kanban | Voir où s'accumulent les dossiers | Bandeau des 7 étapes, colonnes avec projets |
| 5 | **Fiche projet** | Cliquer sur une carte projet | Tout sur un projet | Onglets Résumé (localisation, équipe et ressources mobilisées, notes) / Prestations / Cadastre (lots liés, lots voisins ou historiques) / Documents / Historique |
| 6 | **Fiche prestation** | Fiche projet → cliquer une prestation | Faire avancer le dossier | Parcours en 7 étapes, formulaire de l'étape en cours, alertes de conflits, bouton « Générer le PV », pièces jointes, historique |
| 7 | **Nouveau projet** | *Projets* → « Nouveau projet » (ou depuis la carte / un client) | Créer un dossier | Client existant ou nouveau, réf. foncière, situation avec sélection sur carte, nature, coordonnées GPS, lots existants proposés |
| 8 | **Carte** | *Carte* | Vue géographique | Épingles par statut, compteurs, outils (mesure, import, export PDF, lots cadastraux, fonds de carte), légende |
| 9 | **Calendrier** | *Calendrier* | Planning et conflits | Vues Mois / Semaine / Agents, légende par étape, jours en conflit |
| 10 | **Analytique** | *Analytique* | Pilotage | 4 indicateurs, 4 onglets de graphiques (Activité, Équipe, Qualité, Cadastre) |
| 11 | **Clients** + fiche client | *Clients* | Annuaire clients | Tableau puis fiche (Infos / Projets), bouton nouveau projet pour ce client |
| 12 | **Matériel** et **Véhicules** + fiche | *Matériel* / *Véhicules* | Parc | Tableaux puis fiche (Fiche / Affectations / Maintenance / Documents) |
| 13 | **Employés** + fiche | *Employés* | Équipe | Tableau puis fiche (Profil / Affectations / Congés) |
| 14 | **Cadastre — accueil** | *Cadastre* | Importer un plan de bornage | Zone de dépôt du PDF, étapes Document → Vérification → Lot enregistré, liste des lots avec badges Conforme / Écart de surface et Brouillon / Vérifié / Validé |
| 15 | **Cadastre — vérification** | Accueil → déposer un PDF (ou « Saisir manuellement ») | Contrôler la lecture automatique | Champs d'identification, tableau des bornes, aperçu de la surface et de l'écart, liste « Avant d'enregistrer » |
| 16 | **Cadastre — détail d'un lot** | Cliquer un lot | Résultat validé | Carte du lot, bornes, surface calculée vs document, contrôle des distances, bloc Revue |
| 17 | **Espace Agent Chantier** | Changer de rôle (menu en bas à gauche) → *Agent Chantier* | Vue terrain | Cartes de missions, onglets « Mes tâches » / « Planning », détail de mission |
| 18 | **Espace Agent Bureau** | Rôle → *Agent Bureau* | Vue bureau | Colonnes En attente terrain / À traiter / Envoyé au contrôle / Livré |
| 19 | **Espace Agent Contrôle** | Rôle → *Agent Contrôle* | Vue contrôle | Colonnes En attente / À contrôler / Livré |
| 20 | **Notifications** | Icône cloche (en haut à droite) | Alertes du rôle | Liste d'alertes cliquables |

**Ordre conseillé pour les captures :** 2 → 3 → 4 → 6 → 5 → 9 → 8 → 10 → 14 → 16 → 17 → 18 → 19 → 13 → 12. Le même ordre suit le récit de la démo.

---

## 8. Script de démonstration en direct (6 à 7 minutes)

### Avant de commencer (à faire la veille, pas devant eux)
1. **Repartir de données propres.** La base actuelle contient des restes de tests (projet « tf222 – Tiddas », lot « 5tt5 », prestations 108 et 109 saisies à la main). Lancer la commande de rechargement (section 13) : **elle efface tous les projets, clients, employés et ressources** puis recrée la démo. À ne pas lancer sur une base contenant de vraies données.
2. **Internet obligatoire** : les fonds de carte et la recherche d'adresse viennent de services en ligne.
3. Ouvrir l'application dans **un seul onglet**, connecté en `dispatcher`.
4. **Préparer un PDF « Calcul de Contenances » anonymisé** (aucun n'est fourni dans le projet). À défaut, utiliser le lot de démonstration « SAPINO 533 » créé par la commande de chargement du cadastre.
5. **Répéter tout le déroulé une fois** : je l'ai construit à partir du code et des données, pas en le jouant clic par clic.
6. Ne **pas** créer d'employé ou de congé en direct, ni modifier un client ou joindre un document à un matériel ou un véhicule : ces ajouts ne sont pas enregistrés (voir section 11). Le matériel et les véhicules (création, fiche, papiers, maintenance) sont, eux, enregistrés.

**Compte** : `dispatcher` / `password123`. Pour passer aux rôles terrain, utiliser le sélecteur de rôle en bas à gauche du menu (plus rapide que de se reconnecter).

### Déroulé

| Temps | Action (clics) | Ce que vous dites |
|---|---|---|
| **0:00 – 0:45** | Connecté en Dispatcher, page **Vue d'ensemble**. Montrer les 4 chiffres, le pipeline, « Charge de travail », « À surveiller » (Scanner 3D LiDAR et Citadine en maintenance) | « Voilà ce que la direction voit chaque matin : 8 prestations actives, 1 en retard, 1 non conforme, et qui est chargé. Sans relancer personne. » |
| **0:45 – 1:30** | Menu **Projets** → basculer en **Kanban** → filtre **Étape → Non conformes** | « Chaque dossier est dans une colonne. Filtrons ce qui est revenu non conforme. » Ouvrir **PRJ-2026-008** (ONEE, bornage) |
| **1:30 – 2:30** | Dans la fiche, ouvrir la prestation **PRS-2026-107** → montrer l'historique : « Non conforme — [Agent Chantier] Bornes manquantes sur 2 limites… Retour à Exécution » | « Le contrôle a refusé et dit pourquoi, la prestation est repartie au terrain. C'est daté et signé. » Puis ouvrir la prestation livrée **PRS-2026-106** (PRJ-2026-007) → **Générer le PV** | « Et à la fin, le PV s'édite tout seul. » |
| **2:30 – 3:45** | Fermer. Retour Projets, ouvrir **PRJ-2026-002** (Groupe Alliances, stade Demande) → prestation **PRS-2026-101** → **Valider la prestation demandée** → étape « Prestation demandée » : cocher **Pierre Lefèvre**, **4x4**, date de visite **18/09/2026** | « J'affecte une équipe. Regardez : l'outil me signale que Pierre et le 4x4 sont déjà sur une autre mission ce jour-là. » Changer pour **Sara Benjelloun** et le **28/09/2026** → alerte congé. Cocher **Scanner 3D LiDAR** → alerte « non opérationnel ». Choisir une date libre puis **Affecter les ressources** |
| **3:45 – 5:00** | Sélecteur de rôle → **Agent Chantier** (Pierre Lefèvre). Ouvrir la mission **PRS-2026-102** → **Démarrer l'exécution** → saisir « Relevé réalisé, 40 lots implantés », date de fin → **Envoyer au bureau**. Puis rôle → **Agent Contrôle** (Julien Faure), ouvrir **PRS-2026-105** → **Conforme** | « Le terrain n'a que ses missions, sur son téléphone. Il envoie au bureau. Côté contrôle, un clic : conforme, et le dossier passe en livraison. » (Si le temps le permet, revenir en Dispatcher et **Archiver et clôturer** PRS-105 : date, chemin réseau, CD, disque.) |
| **5:00 – 6:15** | Rôle → **Dispatcher** → menu **Cadastre** → déposer votre PDF (ou ouvrir « SAPINO 533 ») | « Ce plan de bornage, avant, on le ressaisissait. Ici : lecture automatique, on vérifie, et la surface est recalculée indépendamment. Écart de moins d'1 m² : conforme. » Montrer le bloc **Revue** (Brouillon → Vérifié → Validé). Puis **Carte** → activer **Lots cadastraux** |
| **6:15 – 7:00** | Menu **Analytique** (4 indicateurs, onglet Qualité), puis retour Vue d'ensemble | « Et pour finir, le pilotage : délais, non-conformités, charge. Tout est alimenté par le travail quotidien, sans saisie en plus. » |

**Pièges à éviter en direct :**
- La prestation PRS-2026-101 a une nature déjà saisie qui n'est pas dans la liste déroulante : le champ peut afficher « — choisir — » tout en étant rempli. À vérifier à la répétition ; sinon choisir « Bornage terrain » dans la liste.
- « Livrées (ce mois) » affiche 0 avec les données actuelles (la seule livraison date de juillet). Ne pas s'en servir comme argument ; utiliser l'Analytique (période « Tout »).
- Les indicateurs de l'Analytique (ex. « délai moyen 49 j », « taux de livraison 11 % ») sortent des **données fictives** : dites-le clairement.

---

## 9. Bénéfices pour l'entreprise

> **Aucun gain chiffré ne peut être annoncé honnêtement** : le projet n'a jamais été mesuré chez Globetudes, et aucune donnée de « avant / après » n'existe. Ne présentez pas de « x % de temps gagné ». À la place : les mécanismes concrets ci-dessous et une proposition de mesure en pilote.

| Bénéfice | Mécanisme concret, tiré du parcours |
|---|---|
| **Temps gagné** | Plus de relance « où en est le dossier ? » (statut visible pour tous) ; PV généré en un clic ; plus de ressaisie manuelle des bornes depuis un PDF ; un lot déjà levé se réutilise au lieu d'être recalculé |
| **Moins d'erreurs** | Alerte avant d'affecter un agent ou un véhicule déjà pris, un agent en congé, un matériel en maintenance ; surface recalculée indépendamment (tolérance 1 m²) ; vérification humaine obligatoire des bornes lues automatiquement ; étalonnage en retard signalé |
| **Traçabilité** | Historique horodaté et signé de chaque action ; motif obligatoire pour chaque retour (non conforme, données insuffisantes, mission non terminée) ; statut de revue des lots (qui a vérifié, qui a validé, quand) |
| **Visibilité de la direction** | Tableau de bord, charge de travail par agent, retards en bandeau, taux de non-conformité par nature de prestation, prestations à reprises répétées |
| **Qualité** | Le compteur de reprises transforme la non-conformité en indicateur ; l'origine (terrain ou bureau) permet de corriger au bon endroit |
| **Satisfaction client (à confirmer)** | Indirecte : moins de retards et de reprises, livraison référencée (référence, chemin réseau, CD, disque). Aucun accès client n'existe dans l'outil |

**Comment prouver ces bénéfices (à proposer à Globetudes) :** pendant un pilote de 4 à 8 semaines sur un type de prestation, mesurer (1) le délai moyen demande → livraison — l'outil le calcule déjà —, (2) le taux de non-conformité, (3) le nombre de conflits de planning évités, (4) le temps de saisie d'un plan de bornage avec et sans import PDF.

---

## 10. Questions probables et réponses honnêtes

| Question | Réponse fondée sur le projet |
|---|---|
| **Sécurité : qui voit quoi ?** | La connexion est par identifiant et mot de passe, avec sessions à durée limitée (1 h, renouvelables 7 jours). Chaque rôle n'a accès qu'aux écrans qui le concernent. **Mais** cette séparation est aujourd'hui appliquée à l'écran ; côté serveur, seul le circuit de validation des lots cadastraux est verrouillé par rôle. Et **la lecture des données est ouverte sans connexion** sur la plupart des données. À corriger avant tout usage réel (section 11). |
| **À qui appartiennent les données ?** | À Globetudes : la base de données et les fichiers sont hébergés là où l'entreprise décide de les installer, sur son propre serveur ou chez un hébergeur choisi. Point de vigilance : la carte et la recherche d'adresse interrogent des services publics en ligne (cartes libres OpenStreetMap et équivalents, imagerie satellite Esri), ce qui leur transmet des zones géographiques et des adresses saisies, pas les dossiers. |
| **Combien ça coûte ?** | Le projet ne contient aucun tarif ni modèle de licence. Les composants utilisés sont des logiciels libres ; les coûts réels seraient l'hébergement, l'installation, la personnalisation, la formation et la maintenance. **À chiffrer par vous, je n'ai aucune base pour annoncer un montant.** |
| **Formation, adoption ?** | L'interface est en français, organisée autour du vocabulaire du métier, et chaque rôle a un écran dédié et simplifié (le terrain ne voit que ses missions). Aucun support de formation n'existe dans le projet : à créer. Piste réaliste : un pilote avec une équipe et un type de prestation. |
| **Et si le terrain n'a pas de réseau ?** | **À confirmer.** Rien dans le projet n'indique un mode hors connexion : l'application demande une connexion pour enregistrer. |
| **Intégration avec nos outils actuels ?** | Existant : export CSV (Excel), GeoJSON et KML, PV en PDF, import de points GPX et CSV. Les chemins réseau (`\\SERVEUR\…`) sont mémorisés comme références mais l'outil ne se connecte pas au serveur de fichiers. **Absent** : lien avec la comptabilité/facturation, la messagerie, les logiciels de dessin/calcul topographique, les instruments. |
| **Peut-on l'adapter à notre façon de travailler ?** | Le parcours (7 étapes), les natures de prestation, les types de livrable et les rôles sont définis dans le code : adaptables, mais par du développement, pas par un écran de configuration. Il faut d'abord valider que le parcours correspond à celui de Globetudes. |
| **La reconnaissance des PDF est-elle fiable ?** | Le lecteur est réglé sur des tableaux cadastraux réels et l'utilisateur vérifie toujours avant d'enregistrer (bornes suspectes signalées). Je n'ai pas de mesure de fiabilité sur un lot de PDF variés : **à tester sur 10 à 20 PDF réels de Globetudes** avant de promettre. |
| **Sauvegarde ?** | Non planifiée à ce jour. |
| **Plusieurs agences / plusieurs clients isolés ?** | Non prévu : une seule organisation (les données de démo parlent d'« Agence Rabat »). |
| **Combien de temps pour aller en production ?** | Je ne peux pas l'estimer honnêtement. Les chantiers sont listés section 11, ils sont de nature « finir ce qui est commencé » plus « sécuriser ». |

---

## 11. Ce qui n'est pas fini / à confirmer / prochaine phase

### 11.1 Ce qui existe mais est partiel (à ne pas présenter comme abouti)
| Sujet | Réalité aujourd'hui | En termes métier |
|---|---|---|
| **Enregistrement de l'équipe et des pièces jointes** | Les **fiches employés et congés**, la **modification d'un client** et les **pièces jointes des matériels et véhicules** sont gérées à l'écran mais **pas enregistrées** : elles disparaissent au rechargement de la page. Sont bien enregistrés : clients (création), projets, prestations, tâches, historique, pièces jointes de projets et prestations, lots cadastraux, **matériel et véhicules (création, fiche, papiers, maintenance)** | **Priorité n°1** : sans cela, l'outil ne peut pas servir au quotidien sur ces volets |
| **Sécurité des données** | Lecture publique de la plupart des données ; droits par rôle appliqués à l'écran mais pas côté serveur (sauf revue des lots) ; le sélecteur de rôle permet à n'importe quel utilisateur de prendre la place d'un autre rôle à l'écran | **Priorité n°2** avant tout usage réel |
| **Comptes de démonstration** | Mot de passe commun `password123` ; clé secrète et mode de test par défaut | À remplacer avant déploiement |
| **Cadastre réservé au bureau** | Seuls Dispatcher/Directrice voient l'onglet ; les agents bureau et contrôle n'y ont pas accès, alors que le texte dit « le bureau vérifie ; le contrôle valide » | Incohérence à trancher : ouvrir l'outil à ces rôles ou reformuler |
| **Limites de terrain approximatives** | Les projets sans limite dessinée reçoivent un contour **fictif** autour de l'épingle, signalé « Emprise indicative » | À masquer ou à retirer pour éviter qu'un client le prenne pour un tracé réel |
| **Reconnaissance de texte sur les photos** | Le texte des images jointes est lu et stocké, mais je n'ai vu aucun écran qui l'exploite (recherche, affichage) | Fonction « en coulisse », à ne pas mettre en avant |
| **Numérotation** | Les numéros `PRJ-2026-…` et `PRS-2026-…` contiennent l'année 2026 en dur | Ne fonctionnera pas correctement en 2027 |
| **Rôles fixes** | Les 5 rôles et les 7 étapes sont figés dans le code | Toute adaptation passe par le développement |
| **Coordonnées de bornes de la démo** | Les coordonnées de « SAPINO 533 » sont **illustratives** (seules les totaux viennent d'un vrai document) | Ne pas les présenter comme un vrai levé |
| **Tests** | 34 tests automatiques réussis, tous côté serveur ; aucun test sur l'interface | Couverture limitée |

### 11.2 À confirmer avec Globetudes
- Le parcours en 7 étapes correspond-il à leur processus réel (mêmes étapes, mêmes noms, mêmes responsables) ?
- Leur liste réelle de natures de prestation et de livrables ; le nombre d'agences, d'utilisateurs, de dossiers par an.
- Leurs pratiques de nommage (numéros de dossier, références, CD/disques).
- Les outils qu'il faudrait connecter (facturation, logiciel de dessin, GNSS).
- Le besoin d'un accès client, d'un mode hors connexion, de notifications par e-mail/SMS.
- Où héberger et qui exploite.

### 11.3 Prochaine phase suggérée
1. **Sécuriser** : connexion obligatoire partout, droits par rôle appliqués côté serveur, mots de passe réels, sauvegardes planifiées, connexion sécurisée (HTTPS).
2. **Terminer l'enregistrement** des employés, congés, matériel, véhicules, maintenance, clients.
3. **Pilote** sur un type de prestation avec une équipe, avec les 4 mesures de la section 9.
4. **Adapter au vocabulaire réel** de Globetudes (étapes, natures, livrables) et importer leurs vraies données de référence.
5. **Ensuite seulement** : accès client, notifications par e-mail/SMS, mode hors connexion pour le terrain, liens vers facturation et outils métiers, recherche de lots directement sur la carte (cité comme idée dans le projet).

---

## 12. Plan de présentation suggéré (12 diapositives)

| # | Titre | Message clé |
|---|---|---|
| 1 | **glbOps — piloter chaque dossier, de la demande à la livraison** | La plateforme de suivi des opérations de Globetudes (visuel : Vue d'ensemble) |
| 2 | **Aujourd'hui : l'information circule entre trop de mains** | Relances, ressaisies, conflits de planning, contrôles sans trace (à valider avec eux, en questions plutôt qu'en affirmations) |
| 3 | **Ce que ça coûte** | Temps perdu, erreurs, direction sans visibilité, terrain refait deux fois |
| 4 | **La solution : un seul suivi pour tous** | Client → projet → prestation → 7 étapes ; chacun voit son travail |
| 5 | **Le parcours de la demande à la livraison** | Le schéma des 7 étapes avec responsable de chacune |
| 6 | **Chaque métier a son écran** | Dispatcher/Direction, terrain, bureau, contrôle : les 5 rôles |
| 7 | **On évite l'erreur avant qu'elle n'arrive** | Conflits d'agent/véhicule, congés, matériel en panne, étalonnage en retard |
| 8 | **La qualité devient mesurable** | Non-conformité motivée, retour à la bonne étape, compteur de reprises, PV automatique |
| 9 | **Cadastre : du PDF au lot vérifié** | Lecture automatique + vérification humaine + surface recalculée + réutilisation |
| 10 | **Le pilotage pour la direction** | Vue d'ensemble, calendrier, carte, analytique |
| 11 | **Démo en direct** | Récit de 6 à 7 min (section 8) |
| 12 | **Où nous en sommes et la suite** | Prototype fonctionnel ; ce qu'il faut terminer et sécuriser ; proposition de pilote avec mesures et prochaine étape |

*Conseil : la diapositive 2 est risquée si vous affirmez leurs pratiques. Formulez-la en questions (« Comment suivez-vous aujourd'hui… ? ») ou faites-la valider avant.*

---

## 13. Annexe technique (courte)

### Pile technique
- **Serveur** : Django 6 + Django REST Framework, authentification JWT (SimpleJWT), base **PostgreSQL/PostGIS** (Docker) ; les colonnes géographiques des lots sont lues et écrites en SQL direct (pas de GeoDjango) ; conversion Lambert Nord Maroc (EPSG:26191) → WGS84 avec pyproj ; PyMuPDF pour le texte et la rasterisation des PDF.
- **Service de reconnaissance de texte** : FastAPI + PaddleOCR PP-OCRv6 (français), conteneur Docker séparé, port 8500 ; le premier appel télécharge le modèle (~80 s observés).
- **Interface** : React 19 + Vite, Tailwind v4, shadcn/ui, framer-motion, maplibre-gl, recharts, jsPDF (PV et export de carte), proj4.
- **Fonds de carte et adresses (services tiers)** : OpenFreeMap, OpenStreetMap, OpenTopoMap, Esri World Imagery, Nominatim.
- **Routes** : une seule page (pas de routeur) ; API sous `http://127.0.0.1:8000/api/` (`/projets/`, `/prestations/`, `/taches/`, `/history/`, `/clients/`, `/resources/`, `/employees/`, `/attachments/`, `/cadastre/lots/…`, `/auth/token/`, `/auth/me/`, `/health/`) ; administration Django sur `/admin/` (comptes `dispatcher` et `directrice`).

### État vérifié le 19/09/2026
| Contrôle | Résultat |
|---|---|
| Base PostGIS et service OCR (Docker) | ✅ En marche |
| Santé du serveur (`/api/health/`) | ✅ `ok` |
| Connexion `dispatcher` / `password123` | ✅ OK |
| Interface (`http://localhost:5173`) | ✅ Affiche la Vue d'ensemble, la Carte et l'Analytique |
| Tests automatiques du serveur | ✅ 34 sur 34 |
| Construction de production de l'interface | ✅ OK (avertissement de taille de fichier uniquement) |
| Lecture d'un PDF cadastral réel / scan | ❌ Non testé (aucun PDF dans le projet) |
| Affichage sur téléphone réel, mode production complet | ❌ Non testé |

### Lancer l'application
```bash
docker compose -f backend/docker-compose.yml up -d          # base de données + OCR
backend/venv/Scripts/python.exe backend/manage.py migrate
backend/venv/Scripts/python.exe backend/manage.py runserver  # http://127.0.0.1:8000
npm --prefix frontend run dev                                # http://localhost:5173
```
Prérequis : fichier `backend/.env` (copie de `backend/.env.example`, non versionné) ; dépendances déjà installées sur ce poste. Sous Windows, utiliser `127.0.0.1` et non `localhost` pour la base et l'OCR (sinon lenteurs de 8 à 30 s).

### Charger les données de démonstration
```bash
backend/venv/Scripts/python.exe backend/manage.py seed_demo        # ⚠️ EFFACE projets, clients, employés, ressources, puis recrée la démo
backend/venv/Scripts/python.exe backend/manage.py seed_cadastre    # lot de démo « SAPINO 533 » (titre 49539) ; sans effet s'il existe déjà
```

### Comptes de démonstration (mot de passe commun : `password123`)
| Identifiant | Rôle affiché | Personne |
|---|---|---|
| `dispatcher` | Dispatcher | (compte bureau) |
| `directrice` | Directrice | (compte direction, administrateur) |
| `emp-001` | Agent Chantier | Pierre Lefèvre |
| `emp-004` | Agent Chantier | Sara Benjelloun |
| `emp-002` | Agent Bureau | Marc Lambert |
| `emp-005` | Agent Bureau | Nadia Chraibi |
| `emp-003` | Agent Contrôle | Julien Faure |
| `emp-006` | Agent Contrôle (inactif) | Omar Idrissi |

### Contenu des données de démonstration
- **4 clients**, **9 projets** (8 fournis par la démo + 1 restant de test), **7 ressources** (5 matériels + 2 véhicules), **6 employés**, **1 congé approuvé** (Sara Benjelloun, 28/09 → 02/10/2026).
- Répartition des prestations : 3 en Demande, 1 en Affectation terrain (PRS-102), 2 en Exécution (PRS-103, PRS-107 non conforme, 1 reprise), 1 en Traitement bureau (PRS-104), 1 en Contrôle (PRS-105), 1 en Livraison (PRS-106, livrée le 20/07/2026). Aucune à l'étape « Prestation demandée ».
- Les dates de la démo sont fixes (août–septembre 2026) : elles vieilliront ; les retards et la période « ce mois » changeront.

### Ce qu'il faudrait ajouter pour une démo plus convaincante
1. **Un plan de bornage PDF réel anonymisé**, idéalement un scan, pour la démo du Cadastre.
2. **Au moins une prestation à l'étape « Prestation demandée »** (elle manque dans le pipeline).
3. **Une livraison datée du mois en cours** pour que « Livrées (ce mois) » ne soit pas à zéro.
4. **Des noms fictifs** pour clients et employés (voir ci-dessous).
5. **Quelques pièces jointes** (photos terrain, livrable) sur des prestations : aucune n'existe en démo.
6. **Plus d'historique** : 8 prestations donnent des graphiques d'analyse très maigres.
7. **Un identifiant de direction avec un vrai nom** (voir ci-dessous).

---

## 14. Textes et libellés à corriger avant de montrer l'outil à un client

| # | Problème | Où | Correction suggérée |
|---|---|---|---|
| 1 | **Le bandeau « 1 prestation en retard cette semaine » s'affiche deux fois** sur la Vue d'ensemble | Vue d'ensemble | N'en garder qu'un |
| 2 | **Salutation « Bonjour, dispatcher »** (identifiant en minuscules) | Vue d'ensemble, menu bas | Renseigner un prénom/nom pour ces comptes |
| 3 | **Vrais noms d'organismes (SOMADIR, Al Omrane, ONEE, Groupe Alliances) utilisés comme clients fictifs**, avec noms de contacts inventés | Toute la démo | Remplacer par des noms fictifs : montrer de faux dossiers de vrais organismes devant un prestataire du même secteur est risqué |
| 4 | **Noms français (Lefèvre, Lambert, Faure…) avec téléphones marocains** ; adresses e-mail en `@globetudes.ma` (le site est en `.com`) | Employés | Remplacer par des noms cohérents et des adresses fictives claires (ex. `@exemple.ma`) |
| 5 | **Données de test résiduelles** : projet « tf222 / Tiddas », lot « 5tt5 », doublon « SAPINO 533 » | Base actuelle | Nettoyer par la commande de rechargement |
| 6 | **Contours de terrain fictifs** avec la mention « Emprise indicative — géométrie exacte non renseignée » | Carte | Masquer ou désactiver pour la démo |
| 7 | **Rôle « Directrice »** au féminin fixe ; l'ordre des mots « Dispatcher » est un anglicisme | Rôles, menus | Envisager « Direction » et « Ordonnancement » (à valider avec eux) |
| 8 | **Sélecteur de rôle** visible en bas du menu : il donne l'impression que n'importe qui peut « devenir » un autre rôle | Menu et barre terrain | Utile en démo, à annoncer comme outil de démonstration ; à retirer en production |
| 9 | **Écran de connexion très sobre** (aucune phrase d'accroche) | Connexion | Ajouter une ligne de présentation |
| 10 | **Titre de l'onglet du navigateur** « Globetudes — Projets & Prestations » et page déclarée en anglais (`lang="en"`) | Navigateur | « glbOps — Globetudes » ; déclarer le français |
| 11 | **Écran de chargement brut** (« Chargement… » seul) et message d'erreur technique au chargement | Démarrage | Écran de chargement soigné |
| 12 | **Logo du menu petit et flou** | Menu gauche | Fournir un logo en haute définition |
| 13 | **Libellés trop techniques par endroits** : « Calcul de Contenances », « Correction Lambert », « Propriété dite » | Cadastre | Corrects pour des géomètres ; prévoir une phrase d'explication pour la direction |
| 14 | **Champ affichant « — choisir — » alors qu'une valeur existe** (PRS-2026-101) | Fiche prestation, étape Demande | Voir le piège section 8 |
| 15 | **Libellé de véhicule « Citadine » pour une Dacia Duster** ; plaque « 12345-A-6 » manifestement factice | Véhicules | Harmoniser |
| 16 | **Le README de l'interface est le texte du modèle par défaut** ; le README principal est minimal | Documentation | Sans importance pour les managers, mais à nettoyer si le dépôt est partagé |

---

## Top 5 des points forts à mettre en avant

1. **Un vrai parcours métier de bout en bout**, de la demande à la livraison, avec les retours motivés (non-conformité, données insuffisantes, mission non terminée) — pas une simple liste de tâches.
2. **Une interface par métier** : le terrain ne voit que ses missions sur mobile, le bureau et le contrôle ont chacun leurs colonnes, la direction a son tableau de bord.
3. **Les alertes préventives** : conflits d'agent et de véhicule, congés, matériel en maintenance, étalonnage en retard — des erreurs qui coûtent une journée de terrain.
4. **L'outil Cadastre** : du PDF au lot vérifié, avec calcul indépendant de la surface, circuit de validation et **réutilisation des lots déjà levés**. C'est ce qui distingue le plus l'outil d'un logiciel de gestion de projets générique.
5. **Le pilotage et la traçabilité** : historique signé, PV automatique, carte et analytique nourris par le travail quotidien, sans double saisie.

## Top 5 des risques à préparer

1. **Sécurité** : lecture publique des données, droits par rôle seulement à l'écran, mots de passe de démo. Questions certaines à un client sérieux ; préparez le plan de correction (section 11.3).
2. **Enregistrement incomplet** : employés, congés, modification de client et pièces jointes des matériels et véhicules ne sont pas sauvegardés. Ne rien créer de ce type en direct ; assumez-le comme « prochaine étape » plutôt que de le découvrir devant eux.
3. **Adéquation au processus réel** : le parcours en 7 étapes est celui du prototype, pas forcément celui de Globetudes. Arrivez avec des questions, pas des certitudes.
4. **Données de démo qui trahissent** : vrais organismes comme clients fictifs, restes de test, contours fictifs sur la carte, lot cadastral aux coordonnées illustratives, chiffres d'analytique issus de fausses données. À nettoyer, ou à annoncer explicitement comme fictifs.
5. **Dépendances du jour J** : internet (cartes et adresses), service de lecture de PDF lent au premier appel (jusqu'à ~80 s pour charger le modèle, jusqu'à 2 min sur un scan), démo non répétée sur les rôles terrain. Faites un tour complet la veille, avec un PDF prêt.
