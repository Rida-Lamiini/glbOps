import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, DatabaseBackup, RotateCcw, Info } from "lucide-react";
import { backdropVariants, modalVariants } from "../lib/motionVariants";
import { apiGet, apiPost } from "../lib/api";
import { notifyError, notifySuccess } from "../utils/notify";

const fmtSize = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`);
const fmtDate = (iso) => new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
const serverMessage = (err, fallback) => /"detail":"([^"]+)"/.exec(err?.message || "")?.[1] || fallback;

// Version + mode of the app, and (office, standalone mode) the local backups with a restore.
export default function DataDialog({ office, onClose }) {
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // backup name awaiting confirmation
  const [restarting, setRestarting] = useState(false);

  const load = () => apiGet("/backups/").then(setInfo).catch(() => setInfo({ mode: "unknown", version: "", backups: [] }));
  useEffect(() => { load(); }, []);

  const backupNow = async () => {
    setBusy(true);
    try {
      await apiPost("/backups/", {});
      notifySuccess("Sauvegarde créée.");
      await load();
    } catch (err) {
      notifyError(serverMessage(err, "La sauvegarde a échoué."));
    } finally {
      setBusy(false);
    }
  };

  const restore = async (name) => {
    setBusy(true);
    try {
      const res = await apiPost("/backups/restore/", { name });
      setRestarting(true);
      notifySuccess(res.restarting ? "Restauration en cours : l'application redémarre…" : "Restauration programmée : relancez l'application pour l'appliquer.");
    } catch (err) {
      notifyError(serverMessage(err, "La restauration a échoué."));
      setBusy(false);
    }
    setConfirm(null);
  };

  const local = info?.mode === "local";

  return (
    <motion.div className="gt-drawer-backdrop" onClick={onClose} variants={backdropVariants} initial="hidden" animate="visible" exit="exit">
      <motion.div className="gt-modal" style={{ width: 540 }} onClick={(e) => e.stopPropagation()} variants={modalVariants} initial="hidden" animate="visible" exit="exit">
        <div className="gt-drawer-head">
          <div className="gt-drawer-client">Version et sauvegardes</div>
          <button className="gt-iconbtn" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>
        <div className="gt-form" style={{ padding: "16px 20px 20px" }}>
          <div className="gt-attach-note" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Info size={14} />
            <span>
              <strong>Carte — Globétudes</strong> · version <span className="gt-mono">{info?.version || "…"}</span> ·{" "}
              {info == null ? "…" : local ? "mode local (données sur ce poste)" : info.mode === "online" ? "mode en ligne (base partagée)" : "mode inconnu"}
            </span>
          </div>

          {office && info && !local && info.mode === "online" && (
            <div className="gt-attach-note" style={{ marginTop: 12 }}>
              Les données sont dans la base partagée : ses sauvegardes sont gérées par le fournisseur (Neon : activez la restauration à un instant
              donné dans sa console, puis « Restore » pour revenir en arrière).
            </div>
          )}

          {office && local && (
            <>
              <label style={{ marginTop: 16 }}>Sauvegardes locales</label>
              <div className="gt-attach-note">
                Une sauvegarde automatique est faite chaque jour (14 conservées) : base de données + plans et pièces jointes.
                {info.folder && <> Dossier : <span className="gt-mono">{info.folder}</span></>}
              </div>
              <button className="gt-btn gt-btn-primary" onClick={backupNow} disabled={busy || restarting} style={{ marginTop: 10 }}>
                <DatabaseBackup size={14} /> Sauvegarder maintenant
              </button>
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
                {info.backups.length === 0 && <div className="gt-attach-note">Aucune sauvegarde pour le moment.</div>}
                {info.backups.map((b) => (
                  <div key={b.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", border: "1px solid var(--border-subtle)", borderRadius: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13 }}>{fmtDate(b.created)}</div>
                      <div className="gt-mono" style={{ fontSize: 11, color: "var(--status-neutral)", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {b.name.includes("auto") ? "automatique" : b.name.includes("avant-restauration") ? "avant restauration" : "manuelle"} · {fmtSize(b.size)}
                      </div>
                    </div>
                    {confirm === b.name ? (
                      <>
                        <button className="gt-btn" onClick={() => restore(b.name)} disabled={busy}>Confirmer</button>
                        <button className="gt-btn" onClick={() => setConfirm(null)}>Annuler</button>
                      </>
                    ) : (
                      <button className="gt-btn" onClick={() => setConfirm(b.name)} disabled={busy || restarting}>
                        <RotateCcw size={13} /> Restaurer
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {confirm && (
                <div className="gt-dup-warn" role="alert" style={{ marginTop: 10 }}>
                  Restaurer remplace toutes les données actuelles par celles de cette sauvegarde, puis redémarre l'application. L'état actuel est sauvegardé d'abord (« avant restauration »).
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
