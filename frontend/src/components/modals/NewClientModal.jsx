import React, { useState } from "react";
import { motion } from "framer-motion";
import { X, ChevronRight } from "lucide-react";
import { backdropVariants, modalVariants } from "../../lib/motionVariants";
import { notifySuccess } from "../../utils/notify";

export default function NewClientModal({ onClose, onCreate }) {
  const [nom, setNom] = useState("");
  const [code, setCode] = useState("");

  const submit = () => {
    if (!nom.trim()) return;
    onCreate({ nom: nom.trim(), id: code.trim() || undefined });
    notifySuccess("Client créé");
    onClose();
  };

  return (
    <motion.div className="gt-drawer-backdrop" onClick={onClose} variants={backdropVariants} initial="hidden" animate="visible" exit="exit">
      <motion.div className="gt-modal" onClick={(e) => e.stopPropagation()} variants={modalVariants} initial="hidden" animate="visible" exit="exit">
        <div className="gt-drawer-head">
          <div className="gt-drawer-client">Nouveau client</div>
          <button className="gt-iconbtn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="gt-form" style={{ padding: "16px 20px 20px" }}>
          <label>Nom du client / maître d'ouvrage</label>
          <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="ex. SOMADIR Immobilier" autoFocus onKeyDown={(e) => e.key === "Enter" && submit()} />
          <label>Code client <span className="gt-hint">(facultatif)</span></label>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="laissé vide = généré automatiquement (CLI-XXXX)" className="gt-mono" onKeyDown={(e) => e.key === "Enter" && submit()} />
          <div className="gt-attach-note">Laissez le code vide pour un CLI-XXXX généré automatiquement, ou saisissez votre propre référence (ex. un code interne existant).</div>
          <button className="gt-btn gt-btn-primary" onClick={submit} disabled={!nom.trim()}>
            Créer le client <ChevronRight size={14} />
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
