import React, { useRef, useState } from "react";
import LotSuggestions from "../cadastre/LotSuggestions";
import { motion } from "framer-motion";
import { X, ChevronRight, Building2 } from "lucide-react";
import { backdropVariants, modalVariants } from "../../lib/motionVariants";
import { reverseGeocode } from "../../utils/geocode";
import LocationPicker from "../LocationPicker";
import { NATURES } from "../../constants";
import { notifySuccess } from "../../utils/notify";

export default function NewProjetModal({ onClose, onCreate, clients, presetClient, presetLocation }) {
  const [selectedClientId, setSelectedClientId] = useState(presetClient ? presetClient.id : "");
  const [newClientNom, setNewClientNom] = useState("");
  const [refFonciere, setRefFonciere] = useState("");
  const [situation, setSituation] = useState(presetLocation?.situation || "");
  const [nature, setNature] = useState(NATURES[0]);
  const [lat, setLat] = useState(presetLocation ? String(presetLocation.lat.toFixed(5)) : "");
  const [lng, setLng] = useState(presetLocation ? String(presetLocation.lng.toFixed(5)) : "");
  const [geocoding, setGeocoding] = useState(false);
  const [reuseLotIds, setReuseLotIds] = useState([]);
  const toggleLot = (id) => setReuseLotIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const geocodeAbort = useRef(null);

  const handlePick = (pickedLat, pickedLng) => {
    setLat(String(pickedLat.toFixed(5)));
    setLng(String(pickedLng.toFixed(5)));
    if (situation.trim()) return;
    geocodeAbort.current?.abort();
    const controller = new AbortController();
    geocodeAbort.current = controller;
    setGeocoding(true);
    reverseGeocode(pickedLat, pickedLng, controller.signal)
      .then((label) => { if (label) setSituation(label); })
      .catch(() => {})
      .finally(() => setGeocoding(false));
  };

  const creatingNewClient = !presetClient && selectedClientId === "__new__";
  const clientReady = presetClient ? true : creatingNewClient ? newClientNom.trim().length > 0 : selectedClientId !== "";

  const submit = () => {
    if (!clientReady || !situation) return;
    const latNum = parseFloat(lat.replace(",", "."));
    const lngNum = parseFloat(lng.replace(",", "."));
    onCreate({
      clientId: presetClient ? presetClient.id : creatingNewClient ? null : selectedClientId,
      newClientNom: presetClient ? null : creatingNewClient ? newClientNom.trim() : null,
      refFonciere,
      situation,
      nature,
      lat: Number.isFinite(latNum) ? latNum : null,
      lng: Number.isFinite(lngNum) ? lngNum : null,
      reuseLotIds,
    });
    notifySuccess("Projet créé");
    onClose();
  };

  return (
    <motion.div className="gt-drawer-backdrop" onClick={onClose} variants={backdropVariants} initial="hidden" animate="visible" exit="exit">
      <motion.div className="gt-modal" onClick={(e) => e.stopPropagation()} variants={modalVariants} initial="hidden" animate="visible" exit="exit">
        <div className="gt-drawer-head">
          <div className="gt-drawer-client">Nouveau projet</div>
          <button className="gt-iconbtn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="gt-form" style={{ padding: "16px 20px 20px" }}>
          {presetClient ? (
            <>
              <label>Client</label>
              <div className="gt-chip" style={{ width: "fit-content" }}>
                <Building2 size={12} /> {presetClient.nom} ({presetClient.id})
              </div>
            </>
          ) : (
            <>
              <label>Client</label>
              <select value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)}>
                <option value="">— choisir un client —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.nom} ({c.id})</option>
                ))}
                <option value="__new__">+ Nouveau client…</option>
              </select>
              {creatingNewClient && (
                <input value={newClientNom} onChange={(e) => setNewClientNom(e.target.value)} placeholder="Nom du nouveau client" autoFocus />
              )}
            </>
          )}
          <label>Référence foncière</label>
          <input value={refFonciere} onChange={(e) => setRefFonciere(e.target.value)} placeholder="ex. TF/12345/R" />
          <LotSuggestions
            titre={refFonciere}
            lat={lat ? parseFloat(lat.replace(",", ".")) : null}
            lng={lng ? parseFloat(lng.replace(",", ".")) : null}
            selected={reuseLotIds}
            onToggle={toggleLot}
          />
          <label>Situation / localisation</label>
          <input value={situation} onChange={(e) => setSituation(e.target.value)} placeholder="ex. Hay Riad, Rabat" />
          <label>Nature du projet</label>
          <select value={nature} onChange={(e) => setNature(e.target.value)}>
            {NATURES.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <label>Coordonnées GPS (pour la carte, facultatif)</label>
          <LocationPicker
            lat={lat ? parseFloat(lat.replace(",", ".")) : null}
            lng={lng ? parseFloat(lng.replace(",", ".")) : null}
            onPick={handlePick}
            geocoding={geocoding}
          />
          <div className="gt-formrow">
            <input type="number" step="any" style={{ flex: 1 }} value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Latitude, ex. 33.9716" />
            <input type="number" step="any" style={{ flex: 1 }} value={lng} onChange={(e) => setLng(e.target.value)} placeholder="Longitude, ex. -6.8498" />
          </div>
          <button className="gt-btn gt-btn-primary" onClick={submit} disabled={!clientReady || !situation}>
            Créer le projet <ChevronRight size={14} />
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
