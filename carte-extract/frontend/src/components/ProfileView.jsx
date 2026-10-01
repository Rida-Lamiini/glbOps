import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, KeyRound, Loader2, Mail, Phone, Save, ShieldCheck } from "lucide-react";
import { apiGet, apiPatch, apiPost } from "../lib/api";
import { STAGES, STAGE_COLORS } from "../constants";
import { visibleToUser } from "../utils/access";
import { notifyError, notifySuccess } from "../utils/notify";
import { serverMessage } from "../utils/serverMessage";
import "./profile.css";

const monogram = (name) =>
  (name || "?").split(/\s+/).filter((w) => /^\p{L}/u.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

const ROLE_BLURB = {
  Dispatcher: "Coordination des projets et affectations",
  Directrice: "Direction et pilotage",
  "Agent Chantier": "Levés et exécution terrain",
  "Agent Bureau": "Traitement et livrables",
  "Agent Contrôle": "Contrôle qualité",
};

const CONGE_LABEL = { en_attente: "En attente", approuve: "Approuvé", refuse: "Refusé" };

// apiFetch throws "PATCH /path failed (400): {json}" — the field errors are the JSON part.
const fieldErrors = (e) => {
  const raw = String(e?.message || "");
  try {
    return JSON.parse(raw.slice(raw.indexOf("): ") + 3));
  } catch {
    return null;
  }
};

/** Full-page profile of the signed-in user: identity, contact details, password, and a read on
 *  their own activity. Role and name stay with the office (Employés), so they are display-only. */
export default function ProfileView({ projets, employees, onBack, onSaved }) {
  const [me, setMe] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [email, setEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const [saving, setSaving] = useState(false);
  const [contactErrors, setContactErrors] = useState({});

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdErrors, setPwdErrors] = useState({});

  useEffect(() => {
    apiGet("/auth/me/")
      .then((data) => {
        setMe(data);
        setEmail(data.email || "");
        setTelephone(data.telephone || "");
      })
      .catch(() => setLoadError(true));
  }, []);

  const isOffice = me?.role === "Dispatcher" || me?.role === "Directrice";

  const mine = useMemo(() => {
    if (!me) return [];
    const who = { role: me.role, name: me.name };
    return projets.flatMap((pr) => pr.prestations.filter((p) => visibleToUser(p, who)));
  }, [projets, me]);

  const activity = useMemo(() => {
    const byStage = STAGES.map((s) => ({ ...s, n: mine.filter((p) => p.stage === s.key).length }));
    const delivered = byStage.find((s) => s.key === "livraison").n;
    return { total: mine.length, delivered, active: mine.length - delivered, byStage };
  }, [mine]);

  const conges = useMemo(() => {
    const emp = employees.find((e) => e.id === me?.employee_id);
    return (emp?.conges || []).filter((c) => c.statut !== "refuse").slice(0, 4);
  }, [employees, me]);

  const dirty = me && (email !== (me.email || "") || telephone !== (me.telephone || ""));

  const saveContact = async () => {
    setSaving(true);
    setContactErrors({});
    try {
      const data = await apiPatch("/auth/me/", { email, telephone });
      setMe(data);
      onSaved?.(data);
      notifySuccess("Profil mis à jour");
    } catch (e) {
      const errors = fieldErrors(e);
      if (errors) setContactErrors(errors);
      else notifyError("Le profil n'a pas pu être enregistré.");
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async () => {
    setPwdErrors({});
    if (next !== confirm) {
      setPwdErrors({ confirm: ["Les deux mots de passe ne correspondent pas."] });
      return;
    }
    setPwdBusy(true);
    try {
      await apiPost("/auth/change-password/", { current_password: current, new_password: next });
      setCurrent("");
      setNext("");
      setConfirm("");
      notifySuccess("Mot de passe modifié");
    } catch (e) {
      const errors = fieldErrors(e);
      if (errors) setPwdErrors(errors);
      else notifyError(serverMessage(e, "Le mot de passe n'a pas pu être modifié."));
    } finally {
      setPwdBusy(false);
    }
  };

  if (loadError) {
    return (
      <div className="pf">
        <button className="pf-back" onClick={onBack}><ArrowLeft size={16} /> Retour</button>
        <div className="pf-card">Impossible de charger le profil.</div>
      </div>
    );
  }
  if (!me) return <div className="pf"><div className="pf-card"><Loader2 size={16} className="gt-spin-icon" /> Chargement…</div></div>;

  const maxStage = Math.max(1, ...activity.byStage.map((s) => s.n));
  const since = me.date_embauche ? new Date(me.date_embauche).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) : null;

  return (
    <div className="pf">
      <button className="pf-back" onClick={onBack}><ArrowLeft size={16} /> Retour</button>

      <header className="pf-hero">
        <div className="pf-monogram" aria-hidden="true"><span>{monogram(me.name)}</span></div>
        <div className="pf-hero-text">
          <div className="pf-eyebrow">{me.role}{me.employee_id ? ` · ${me.employee_id}` : ""}</div>
          <h1>{me.name}</h1>
          <p>{[me.poste || ROLE_BLURB[me.role], since && `Depuis ${since}`].filter(Boolean).join(" · ")}</p>
        </div>
      </header>

      <div className="pf-grid">
        <div className="pf-main">
          <section className="pf-card">
            <h2>Coordonnées</h2>
            <div className="pf-fields">
              <label className="pf-field">
                <span><Mail size={13} /> E-mail</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom@societe.ma" />
                {contactErrors.email && <em className="pf-error">{contactErrors.email.join(" ")}</em>}
              </label>
              <label className="pf-field">
                <span><Phone size={13} /> Téléphone</span>
                <input type="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="06 00 00 00 00" />
                {contactErrors.telephone && <em className="pf-error">{contactErrors.telephone.join(" ")}</em>}
              </label>
              <label className="pf-field">
                <span>Identifiant</span>
                <input value={me.username} readOnly className="pf-readonly gt-mono" />
                <small>Le nom, le rôle et l'identifiant sont gérés par la direction.</small>
              </label>
            </div>
            <div className="pf-actions">
              <button className="gt-btn gt-btn-primary" onClick={saveContact} disabled={!dirty || saving}>
                {saving ? <Loader2 size={14} className="gt-spin-icon" /> : <Save size={14} />} Enregistrer
              </button>
            </div>
          </section>

          <section className="pf-card">
            <h2><ShieldCheck size={16} /> Sécurité</h2>
            <div className="pf-fields">
              <label className="pf-field">
                <span><KeyRound size={13} /> Mot de passe actuel</span>
                <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
                {pwdErrors.current_password && <em className="pf-error">{pwdErrors.current_password.join(" ")}</em>}
              </label>
              <label className="pf-field">
                <span>Nouveau mot de passe</span>
                <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
                {pwdErrors.new_password && <em className="pf-error">{pwdErrors.new_password.join(" ")}</em>}
                <small>8 caractères minimum, pas trop courant, différent de vos informations personnelles.</small>
              </label>
              <label className="pf-field">
                <span>Confirmer le nouveau mot de passe</span>
                <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                {pwdErrors.confirm && <em className="pf-error">{pwdErrors.confirm.join(" ")}</em>}
              </label>
            </div>
            <div className="pf-actions">
              <button className="gt-btn gt-btn-primary" onClick={savePassword} disabled={!current || !next || !confirm || pwdBusy}>
                {pwdBusy ? <Loader2 size={14} className="gt-spin-icon" /> : <Check size={14} />} Changer le mot de passe
              </button>
            </div>
          </section>
        </div>

        <aside className="pf-rail">
          <section className="pf-card">
            <h2>{isOffice ? "Activité globale" : "Mon activité"}</h2>
            <div className="pf-kpis">
              <div><strong>{activity.total}</strong><span>Prestations</span></div>
              <div><strong>{activity.active}</strong><span>En cours</span></div>
              <div><strong>{activity.delivered}</strong><span>Livrées</span></div>
            </div>
            <div className="pf-stages" aria-label="Répartition par étape">
              {activity.byStage.map((s) => (
                <div className="pf-stage" key={s.key}>
                  <span>{s.label}</span>
                  <i><b style={{ width: `${(s.n / maxStage) * 100}%`, background: STAGE_COLORS[s.key] }} /></i>
                  <em>{s.n}</em>
                </div>
              ))}
            </div>
          </section>

          <section className="pf-card">
            <h2>Congés</h2>
            {conges.length === 0 ? (
              <p className="pf-muted">Aucun congé enregistré.</p>
            ) : (
              <ul className="pf-conges">
                {conges.map((c) => (
                  <li key={c.id}>
                    <div><strong>{c.type}</strong><span className="gt-mono">{c.dateDebut} → {c.dateFin}</span></div>
                    <em className={`pf-pill ${c.statut}`}>{CONGE_LABEL[c.statut] || c.statut}</em>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
