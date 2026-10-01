import React, { useState } from "react";
import { motion } from "framer-motion";
import { X, ChevronRight } from "lucide-react";
import { backdropVariants, modalVariants } from "../../lib/motionVariants";
import { notifySuccess } from "../../utils/notify";

export default function NewResourceModal({ title, label, placeholder, onClose, onCreate }) {
  const [nom, setNom] = useState("");

  const submit = () => {
    if (!nom.trim()) return;
    onCreate(nom.trim());
    notifySuccess(`${title.replace(/^Nouveau(x)? /i, "")} créé`);
    onClose();
  };

  return (
    <motion.div className="gt-drawer-backdrop" onClick={onClose} variants={backdropVariants} initial="hidden" animate="visible" exit="exit">
      <motion.div className="gt-modal" onClick={(e) => e.stopPropagation()} variants={modalVariants} initial="hidden" animate="visible" exit="exit">
        <div className="gt-drawer-head">
          <div className="gt-drawer-client">{title}</div>
          <button className="gt-iconbtn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="gt-form" style={{ padding: "16px 20px 20px" }}>
          <label>{label}</label>
          <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder={placeholder} autoFocus onKeyDown={(e) => e.key === "Enter" && submit()} />
          <button className="gt-btn gt-btn-primary" onClick={submit} disabled={!nom.trim()}>
            Créer <ChevronRight size={14} />
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
