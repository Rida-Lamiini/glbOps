import React, { useCallback, useEffect, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Gauge, Loader2 } from "lucide-react";
import { apiGet, apiPost } from "../lib/api";
import { notifyError, notifySuccess } from "../utils/notify";
import { serverMessage } from "../utils/serverMessage";

const fmtWhen = (iso) =>
  new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * Who has this item, and the check-out / check-in form. Used on the QR scan page and in the "Sorties"
 * tab of the resource drawer. `onChange` receives the fresh state so the caller can update its own copy.
 */
export default function ResourceMovements({ resource, onChange, showHistory = true }) {
  const isVehicle = resource.type === "vehicule";
  const out = resource.sortieCourante;
  const [note, setNote] = useState("");
  const [km, setKm] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(null);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await apiGet(`/resources/${resource.id}/movements/`));
    } catch {
      setHistory([]);
    }
  }, [resource.id]);

  useEffect(() => {
    if (showHistory) loadHistory();
  }, [showHistory, loadHistory]);

  const blocked = !out && resource.status && resource.status !== "operationnel";

  const submit = async (kind) => {
    setBusy(true);
    try {
      const body = { kind, note: note.trim() };
      if (isVehicle && km !== "") body.kilometrage = Number(km);
      const res = await apiPost(`/resources/${resource.id}/movements/`, body);
      notifySuccess(kind === "sortie" ? "Sortie enregistrée" : "Retour enregistré");
      setNote("");
      setKm("");
      onChange?.({
        sortieCourante: res.sortie_courante
          ? { parNom: res.sortie_courante.par_nom, at: res.sortie_courante.at, note: res.sortie_courante.note, kilometrage: res.sortie_courante.kilometrage }
          : null,
        ...(isVehicle && res.kilometrage != null ? { kilometrage: res.kilometrage } : {}),
      });
      if (showHistory) loadHistory();
    } catch (err) {
      notifyError(serverMessage(err, "L'opération n'a pas pu être enregistrée."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rm">
      <div className={`rm-state ${out ? "is-out" : "is-in"}`}>
        <span className="rm-state-icon">{out ? <ArrowUpFromLine size={18} /> : <ArrowDownToLine size={18} />}</span>
        <div>
          <strong>{out ? `Sorti par ${out.parNom || "un collègue"}` : "Disponible au dépôt"}</strong>
          <span>{out ? `depuis le ${fmtWhen(out.at)}${out.note ? ` — ${out.note}` : ""}` : "Aucune sortie en cours"}</span>
        </div>
      </div>

      <label className="rm-field">
        <span>Note (chantier, mission…) <em>facultatif</em></span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex. Bornage Salé" maxLength={300} />
      </label>
      {isVehicle && (
        <label className="rm-field">
          <span><Gauge size={11} /> Kilométrage {out ? "au retour" : "au départ"} <em>facultatif</em></span>
          <input type="number" inputMode="numeric" min="0" value={km} onChange={(e) => setKm(e.target.value)} placeholder={resource.kilometrage !== "" && resource.kilometrage != null ? `actuel : ${resource.kilometrage}` : "ex. 84200"} />
        </label>
      )}

      {out ? (
        <button type="button" className="rm-btn is-return" disabled={busy} onClick={() => submit("retour")}>
          {busy ? <Loader2 size={16} className="gt-spin-icon" /> : <ArrowDownToLine size={16} />} Enregistrer le retour
        </button>
      ) : (
        <button type="button" className="rm-btn" disabled={busy || blocked} onClick={() => submit("sortie")}>
          {busy ? <Loader2 size={16} className="gt-spin-icon" /> : <ArrowUpFromLine size={16} />} Enregistrer la sortie
        </button>
      )}
      {blocked && <p className="rm-warn">Sortie impossible : la ressource n'est pas opérationnelle.</p>}

      {showHistory && (
        <div className="rm-history">
          <h4>Historique récent</h4>
          {history === null ? (
            <div className="gt-list-empty">Chargement…</div>
          ) : history.length === 0 ? (
            <div className="gt-list-empty">Aucun mouvement enregistré.</div>
          ) : (
            <ul>
              {history.map((h) => (
                <li key={h.id}>
                  <span className={`rm-dot is-${h.kind}`} />
                  <div>
                    <b>{h.kind === "sortie" ? "Sortie" : "Retour"}</b> · {h.par_nom || "—"}
                    {h.kilometrage != null && <> · {Number(h.kilometrage).toLocaleString("fr-FR")} km</>}
                    <small>{fmtWhen(h.at)}{h.note ? ` — ${h.note}` : ""}</small>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
