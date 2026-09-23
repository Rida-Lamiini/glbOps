import React, { useState } from "react";
import DrawerTabs from "./DrawerTabs";
import { motion } from "framer-motion";
import { X, Check, Pencil, Folder, AlertTriangle, Plus, Phone, Mail, MapPin, Briefcase, User, StickyNote , FolderOpen } from "lucide-react";
import { computeClientStats } from "../utils/stats";
import { formatTimestamp } from "../utils/dates";
import { notifySuccess, notifyError } from "../utils/notify";
import { backdropVariants, drawerVariants } from "../lib/motionVariants";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function ClientDrawer({ client, projects, onClose, onOpenProjet, onNewProjetForClient, onEditClient, isOffice }) {
  const [tab, setTab] = useState("infos");
  const [editing, setEditing] = useState(false);
  const [nomDraft, setNomDraft] = useState(client.nom);
  const [codeDraft, setCodeDraft] = useState(client.code);

  const [editingContact, setEditingContact] = useState(false);
  const [contactDraft, setContactDraft] = useState(client.contact || "");
  const [telephoneDraft, setTelephoneDraft] = useState(client.telephone || "");
  const [emailDraft, setEmailDraft] = useState(client.email || "");
  const [adresseDraft, setAdresseDraft] = useState(client.adresse || "");
  const [secteurDraft, setSecteurDraft] = useState(client.secteur || "");

  const [notesDraft, setNotesDraft] = useState(client.notes || "");

  const stats = computeClientStats(client, projects);

  const submitEdit = () => {
    if (!nomDraft.trim()) {
      notifyError("Le nom du client est requis");
      return;
    }
    onEditClient(client.id, { nom: nomDraft.trim(), code: codeDraft.trim() || client.code });
    notifySuccess("Client modifié");
    setEditing(false);
  };

  const startEditContact = () => {
    setContactDraft(client.contact || "");
    setTelephoneDraft(client.telephone || "");
    setEmailDraft(client.email || "");
    setAdresseDraft(client.adresse || "");
    setSecteurDraft(client.secteur || "");
    setEditingContact(true);
  };

  const submitContact = () => {
    onEditClient(client.id, {
      contact: contactDraft.trim(),
      telephone: telephoneDraft.trim(),
      email: emailDraft.trim(),
      adresse: adresseDraft.trim(),
      secteur: secteurDraft.trim(),
    });
    notifySuccess("Coordonnées mises à jour");
    setEditingContact(false);
  };

  const saveNotes = () => {
    onEditClient(client.id, { notes: notesDraft });
    notifySuccess("Note enregistrée");
  };

  return (
    <motion.div className="gt-drawer-backdrop" onClick={onClose} variants={backdropVariants} initial="hidden" animate="visible" exit="exit">
      <motion.div className="gt-drawer" onClick={(e) => e.stopPropagation()} variants={drawerVariants} initial="hidden" animate="visible" exit="exit">
        <div className="gt-drawer-head">
          <div style={{ flex: 1 }}>
            {editing ? (
              <div className="gt-renamebox">
                <input value={codeDraft} onChange={(e) => setCodeDraft(e.target.value)} placeholder="Code client" className="gt-mono" />
                <input value={nomDraft} onChange={(e) => setNomDraft(e.target.value)} placeholder="Nom du client" autoFocus onKeyDown={(e) => e.key === "Enter" && submitEdit()} />
                <button className="gt-iconbtn" onClick={submitEdit}>
                  <Check size={16} />
                </button>
              </div>
            ) : (
              <>
                <div className="gt-mono gt-drawer-id">{client.code}</div>
                <div className="gt-drawer-client">
                  {client.nom}
                  {isOffice && (
                    <button className="gt-iconbtn gt-rename-btn" onClick={() => { setNomDraft(client.nom); setCodeDraft(client.code); setEditing(true); }}>
                      <Pencil size={13} />
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
          <button className="gt-iconbtn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="gt-drawer-meta">
          <span className="gt-chip"><Folder size={12} /> {stats.nbProjects} projet{stats.nbProjects > 1 ? "s" : ""}</span>
          <span className="gt-chip">{stats.nbPrestations} prestation{stats.nbPrestations > 1 ? "s" : ""}</span>
          <span className="gt-chip">{stats.enCours} en cours</span>
          {stats.nonConf > 0 && (
            <span className="gt-chip" style={{ borderColor: "var(--bad)", color: "var(--bad)" }}>
              <AlertTriangle size={11} /> {stats.nonConf} non-conformité{stats.nonConf > 1 ? "s" : ""}
            </span>
          )}
          {stats.lastActivity != null && <span className="gt-chip">Dernière activité : {formatTimestamp(stats.lastActivity)}</span>}
        </div>

        <DrawerTabs
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "infos", label: "Infos", icon: User },
            { key: "projets", label: "Projets", icon: FolderOpen, count: stats.projects.length },
          ]}
        />

        <div className="gt-drawer-body" role="tabpanel">
          {tab === "infos" && (
          <section className="gt-section">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h4 style={{ margin: 0 }}><User size={13} strokeWidth={2.2} /> Coordonnées</h4>
              {isOffice && !editingContact && (
                <button className="gt-iconbtn" onClick={startEditContact}>
                  <Pencil size={13} />
                </button>
              )}
            </div>
            {!editingContact ? (
              <div className="gt-resource-grid" style={{ marginTop: 8 }}>
                <div className="gt-resource-cell">
                  <span className="gt-resource-cell-label"><User size={10} /> Contact</span>
                  <span>{client.contact || "—"}</span>
                </div>
                <div className="gt-resource-cell">
                  <span className="gt-resource-cell-label"><Briefcase size={10} /> Secteur</span>
                  <span>{client.secteur || "—"}</span>
                </div>
                <div className="gt-resource-cell">
                  <span className="gt-resource-cell-label"><Phone size={10} /> Téléphone</span>
                  <span className="gt-mono">{client.telephone || "—"}</span>
                </div>
                <div className="gt-resource-cell">
                  <span className="gt-resource-cell-label"><Mail size={10} /> Email</span>
                  <span>{client.email || "—"}</span>
                </div>
                <div className="gt-resource-cell" style={{ gridColumn: "1 / -1" }}>
                  <span className="gt-resource-cell-label"><MapPin size={10} /> Adresse</span>
                  <span>{client.adresse || "—"}</span>
                </div>
              </div>
            ) : (
              <div className="gt-form" style={{ marginTop: 8 }}>
                <Label>Personne de contact</Label>
                <Input value={contactDraft} onChange={(e) => setContactDraft(e.target.value)} placeholder="ex. Rania El Fassi" />
                <Label>Secteur d'activité</Label>
                <Input value={secteurDraft} onChange={(e) => setSecteurDraft(e.target.value)} placeholder="ex. Promotion immobilière" />
                <div className="gt-formrow">
                  <div style={{ flex: 1 }}>
                    <Label>Téléphone</Label>
                    <Input value={telephoneDraft} onChange={(e) => setTelephoneDraft(e.target.value)} placeholder="06 XX XX XX XX" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Label>Email</Label>
                    <Input value={emailDraft} onChange={(e) => setEmailDraft(e.target.value)} placeholder="contact@client.ma" />
                  </div>
                </div>
                <Label>Adresse</Label>
                <Input value={adresseDraft} onChange={(e) => setAdresseDraft(e.target.value)} placeholder="ex. 12 Avenue Annakhil, Rabat" />
                <div className="gt-btnrow">
                  <Button onClick={submitContact} className="bg-[var(--accent)] text-white hover:opacity-90">
                    <Check size={14} /> Enregistrer
                  </Button>
                  <Button variant="outline" onClick={() => setEditingContact(false)}>
                    Annuler
                  </Button>
                </div>
              </div>
            )}
          </section>
          )}

          {tab === "projets" && (
          <section className="gt-section">
            <h4>Projets ({stats.projects.length})</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Projet</TableHead>
                  <TableHead>Nature / situation</TableHead>
                  <TableHead>Prestations</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.projects.map((pr) => (
                  <TableRow key={pr.id} className="cursor-pointer" onClick={() => onOpenProjet(pr.id)}>
                    <TableCell className="font-mono">{pr.id}</TableCell>
                    <TableCell className="font-semibold">{pr.naturePrestationProjet || pr.situation}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {pr.prestations.length} prestation{pr.prestations.length > 1 ? "s" : ""}
                    </TableCell>
                  </TableRow>
                ))}
                {stats.projects.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground text-center">
                      Aucun projet pour ce client.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {isOffice && (
              <Button className="mt-3" onClick={() => onNewProjetForClient(client)}>
                <Plus size={14} /> Nouveau projet pour ce client
              </Button>
            )}
          </section>
          )}

          {tab === "infos" && (
          <section className="gt-section">
            <h4><StickyNote size={13} strokeWidth={2.2} /> Notes internes</h4>
            {isOffice ? (
              <>
                <Textarea
                  rows={3}
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="Notes internes sur ce client (préférences, historique de la relation, points d'attention...)"
                />
                <Button
                  size="sm"
                  className="mt-2 bg-[var(--accent)] text-white hover:opacity-90"
                  onClick={saveNotes}
                  disabled={notesDraft === (client.notes || "")}
                >
                  Enregistrer la note
                </Button>
              </>
            ) : client.notes ? (
              <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{client.notes}</div>
            ) : (
              <div className="gt-list-empty">Aucune note.</div>
            )}
          </section>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
