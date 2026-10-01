import React, { useState } from "react";
import { motion } from "framer-motion";
import { X, ChevronRight } from "lucide-react";
import { backdropVariants, modalVariants } from "../../lib/motionVariants";
import { notifySuccess } from "../../utils/notify";

const EMPLOYEE_ROLES = ["Agent Chantier", "Agent Bureau", "Agent Contrôle"];

export default function NewEmployeeModal({ onClose, onCreate }) {
  const [nom, setNom] = useState("");
  const [role, setRole] = useState(EMPLOYEE_ROLES[0]);
  const [poste, setPoste] = useState("");

  const submit = () => {
    if (!nom.trim()) return;
    onCreate({ nom: nom.trim(), role, poste: poste.trim() });
    notifySuccess("Employé créé");
    onClose();
  };

  return (
    <motion.div className="gt-drawer-backdrop" onClick={onClose} variants={backdropVariants} initial="hidden" animate="visible" exit="exit">
      <motion.div className="gt-modal" onClick={(e) => e.stopPropagation()} variants={modalVariants} initial="hidden" animate="visible" exit="exit">
        <div className="gt-drawer-head">
          <div className="gt-drawer-client">Nouvel employé</div>
          <button className="gt-iconbtn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="gt-form" style={{ padding: "16px 20px 20px" }}>
          <label>Nom</label>
          <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="ex. Pierre Lefèvre" autoFocus onKeyDown={(e) => e.key === "Enter" && submit()} />
          <label>Rôle</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {EMPLOYEE_ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <label>Poste (facultatif)</label>
          <input value={poste} onChange={(e) => setPoste(e.target.value)} placeholder="ex. Topographe" />
          <button className="gt-btn gt-btn-primary" onClick={submit} disabled={!nom.trim()}>
            Créer l'employé <ChevronRight size={14} />
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
