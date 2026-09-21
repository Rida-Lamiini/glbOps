import React, { useState } from "react";
import { AlertTriangle, Check, Fuel, Gauge, Pencil, ShieldCheck, ClipboardCheck, Receipt, Wrench, UserRound } from "lucide-react";
import { CARBURANTS, vehiculePapers } from "../utils/vehicule";
import { selectableAgentsByRole } from "../utils/employees";
import { notifySuccess } from "../utils/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";

const ICONS = { assurance: ShieldCheck, visite: ClipboardCheck, vignette: Receipt, entretien: Wrench };
const LEVEL_LABEL = { ok: "À jour", soon: "À renouveler", late: "Expiré", none: "Non renseigné" };
const LEVEL_PILL = { ok: "success", soon: "warning", late: "danger", none: "neutral" };
const fmtKm = (n) => (n === "" || n == null ? "—" : `${Number(n).toLocaleString("fr-FR")} km`);

function PaperCard({ paper, lines }) {
  const Icon = ICONS[paper.key];
  return (
    <div className={`vp-card is-${paper.level}`}>
      <div className="vp-card-head">
        <span className="vp-card-icon"><Icon size={16} /></span>
        <span className="vp-card-title">{paper.label}</span>
        <span className={`gt-status-pill ${LEVEL_PILL[paper.level]}`}>
          {paper.level === "late" && <AlertTriangle size={11} />}
          {LEVEL_LABEL[paper.level]}
        </span>
      </div>
      {paper.level !== "none" ? (
        <>
          <div className="vp-card-due">
            <span>{paper.key === "entretien" && paper.kmText && paper.text === paper.kmText ? "Seuil" : "Échéance"}</span>
            <b>{paper.due || paper.text}</b>
            <em>{paper.text}</em>
          </div>
          <span className="rg-cal-track vp-track"><i style={{ width: `${Math.round(paper.elapsed * 100)}%` }} /></span>
        </>
      ) : (
        <div className="vp-card-empty">À renseigner dans « Modifier ».</div>
      )}
      {lines.filter(Boolean).length > 0 && <div className="vp-card-lines">{lines.filter(Boolean).map((l, i) => <span key={i}>{l}</span>)}</div>}
    </div>
  );
}

export default function VehiculePapiers({ item, employees, isOffice, onEdit }) {
  const [editing, setEditing] = useState(false);
  const [d, setD] = useState({});
  const papers = vehiculePapers(item);
  const byKey = Object.fromEntries(papers.map((p) => [p.key, p]));

  const fields = [
    "assuranceCompagnie", "assurancePolice", "assuranceDebut", "assuranceEcheance", "assurancePrime",
    "visiteTechniqueDerniere", "visiteTechniqueProchaine", "vignettePaiement", "vignetteEcheance",
    "kilometrage", "kilometrageDate", "entretienProchainDate", "entretienProchainKm",
    "carburant", "carteCarburant", "conducteur",
  ];
  const start = () => {
    setD(Object.fromEntries(fields.map((f) => [f, item[f] ?? ""])));
    setEditing(true);
  };
  const set = (k) => (v) => setD((prev) => ({ ...prev, [k]: v }));
  const setText = (k) => (e) => set(k)(e.target.value);
  const save = () => {
    const patch = {};
    fields.forEach((f) => { patch[f] = typeof d[f] === "string" ? d[f].trim() : d[f]; });
    onEdit(item.id, patch);
    notifySuccess("Papiers du véhicule mis à jour");
    setEditing(false);
  };

  const drivers = selectableAgentsByRole(employees, "Agent Chantier", [item.conducteur]);

  if (editing) {
    return (
      <section className="gt-section vp">
        <h4><ShieldCheck size={13} strokeWidth={2.2} /> Papiers & entretien — modifier</h4>
        <div className="gt-form">
          <div className="vp-formhead">Assurance</div>
          <div className="gt-formrow">
            <div style={{ flex: 1 }}><Label>Compagnie</Label><Input value={d.assuranceCompagnie} onChange={setText("assuranceCompagnie")} placeholder="ex. Wafa Assurance" /></div>
            <div style={{ flex: 1 }}><Label>N° de police</Label><Input value={d.assurancePolice} onChange={setText("assurancePolice")} placeholder="ex. P-2026-40817" /></div>
          </div>
          <div className="gt-formrow">
            <div style={{ flex: 1 }}><Label>Début</Label><DatePicker value={d.assuranceDebut} onChange={set("assuranceDebut")} /></div>
            <div style={{ flex: 1 }}><Label>Échéance</Label><DatePicker value={d.assuranceEcheance} onChange={set("assuranceEcheance")} /></div>
            <div style={{ flex: 1 }}><Label>Prime annuelle</Label><Input value={d.assurancePrime} onChange={setText("assurancePrime")} placeholder="ex. 7 200 MAD" /></div>
          </div>

          <div className="vp-formhead">Visite technique</div>
          <div className="gt-formrow">
            <div style={{ flex: 1 }}><Label>Dernière visite</Label><DatePicker value={d.visiteTechniqueDerniere} onChange={set("visiteTechniqueDerniere")} /></div>
            <div style={{ flex: 1 }}><Label>Prochaine échéance</Label><DatePicker value={d.visiteTechniqueProchaine} onChange={set("visiteTechniqueProchaine")} /></div>
          </div>

          <div className="vp-formhead">Vignette</div>
          <div className="gt-formrow">
            <div style={{ flex: 1 }}><Label>Date de paiement</Label><DatePicker value={d.vignettePaiement} onChange={set("vignettePaiement")} /></div>
            <div style={{ flex: 1 }}><Label>Échéance</Label><DatePicker value={d.vignetteEcheance} onChange={set("vignetteEcheance")} /></div>
          </div>

          <div className="vp-formhead">Kilométrage & entretien</div>
          <div className="gt-formrow">
            <div style={{ flex: 1 }}><Label>Kilométrage actuel</Label><Input type="number" inputMode="numeric" min="0" value={d.kilometrage} onChange={setText("kilometrage")} placeholder="ex. 84200" /></div>
            <div style={{ flex: 1 }}><Label>Relevé le</Label><DatePicker value={d.kilometrageDate} onChange={set("kilometrageDate")} /></div>
          </div>
          <div className="gt-formrow">
            <div style={{ flex: 1 }}><Label>Prochain entretien (km)</Label><Input type="number" inputMode="numeric" min="0" value={d.entretienProchainKm} onChange={setText("entretienProchainKm")} placeholder="ex. 90000" /></div>
            <div style={{ flex: 1 }}><Label>Prochain entretien (date)</Label><DatePicker value={d.entretienProchainDate} onChange={set("entretienProchainDate")} /></div>
          </div>

          <div className="vp-formhead">Carburant & conducteur</div>
          <div className="gt-formrow">
            <div style={{ flex: 1 }}>
              <Label>Carburant</Label>
              <select value={d.carburant} onChange={setText("carburant")}>
                <option value="">— choisir —</option>
                {CARBURANTS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}><Label>Carte carburant</Label><Input value={d.carteCarburant} onChange={setText("carteCarburant")} placeholder="ex. CC-4471" /></div>
          </div>
          <Label>Conducteur habituel</Label>
          <select value={d.conducteur} onChange={setText("conducteur")}>
            <option value="">— aucun —</option>
            {drivers.map((e) => <option key={e.id} value={e.nom}>{e.nom}</option>)}
          </select>

          <div className="gt-btnrow">
            <Button onClick={save} className="bg-[var(--accent)] text-white hover:opacity-90"><Check size={14} /> Enregistrer</Button>
            <Button variant="outline" onClick={() => setEditing(false)}>Annuler</Button>
          </div>
        </div>
      </section>
    );
  }

  const carburant = CARBURANTS.find((c) => c.key === item.carburant)?.label;
  return (
    <section className="gt-section vp">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h4 style={{ margin: 0 }}><ShieldCheck size={13} strokeWidth={2.2} /> Papiers & entretien</h4>
        {isOffice && (
          <button className="gt-iconbtn" onClick={start} aria-label="Modifier"><Pencil size={13} /></button>
        )}
      </div>

      <div className="vp-grid">
        <PaperCard
          paper={byKey.assurance}
          lines={[item.assuranceCompagnie, item.assurancePolice && `Police ${item.assurancePolice}`, item.assurancePrime && `Prime ${item.assurancePrime}`]}
        />
        <PaperCard
          paper={byKey.visite}
          lines={[item.visiteTechniqueDerniere && `Dernière visite le ${item.visiteTechniqueDerniere}`]}
        />
        <PaperCard
          paper={byKey.vignette}
          lines={[item.vignettePaiement && `Payée le ${item.vignettePaiement}`]}
        />
        <PaperCard
          paper={byKey.entretien}
          lines={[
            item.entretienProchainKm !== "" && `Prochain à ${fmtKm(item.entretienProchainKm)}`,
            item.entretienProchainDate && `ou le ${item.entretienProchainDate}`,
          ]}
        />
      </div>

      <div className="vp-usage">
        <div className="vp-usage-cell">
          <span><Gauge size={11} /> Kilométrage</span>
          <b>{fmtKm(item.kilometrage)}</b>
          {item.kilometrageDate && <em>relevé le {item.kilometrageDate}</em>}
        </div>
        <div className="vp-usage-cell">
          <span><Fuel size={11} /> Carburant</span>
          <b>{carburant || "—"}</b>
          {item.carteCarburant && <em>carte {item.carteCarburant}</em>}
        </div>
        <div className="vp-usage-cell">
          <span><UserRound size={11} /> Conducteur habituel</span>
          <b>{item.conducteur || "—"}</b>
        </div>
      </div>
    </section>
  );
}
