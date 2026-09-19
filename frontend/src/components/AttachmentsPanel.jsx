import React, { useState } from "react";
import { Paperclip, FolderOpen, X, Image as ImageIcon, FileCheck2, FileQuestion } from "lucide-react";
import { ATTACHMENT_TYPES } from "../constants";
import { formatFileSize, today } from "../utils/dates";

const TYPE_ICONS = { photo: ImageIcon, livrable: FileCheck2, autre: FileQuestion };

const typeInfo = (key) => ATTACHMENT_TYPES.find((t) => t.key === key) || ATTACHMENT_TYPES[2];
const typeIcon = (key) => TYPE_ICONS[key] || FileQuestion;

function AttachmentItem({ a, onRemove, canRemove }) {
  const Icon = a.chemin ? FolderOpen : typeIcon(a.type);
  return (
    <div className="gt-attach-item">
      <span className="gt-attach-ext" title={typeInfo(a.type).label}>
        <Icon size={12} />
      </span>
      <span className="gt-attach-name">
        {a.label && <span className="gt-attach-label">{a.label}</span>}
        {a.chemin ? <span className="gt-mono">{a.chemin}</span> : a.url ? <a href={a.url} target="_blank" rel="noreferrer">{a.name}</a> : a.name}
        {(a.author || a.date) && (
          <span className="gt-attach-author">{[a.author, a.date].filter(Boolean).join(" · ")}</span>
        )}
      </span>
      {!a.chemin && <span className="gt-attach-size">{formatFileSize(a.size)}</span>}
      {canRemove && (
        <button className="gt-iconbtn" onClick={onRemove}>
          <X size={13} />
        </button>
      )}
    </div>
  );
}

function UploadForm({ defaultType, allowedTypes, onAdd, currentUser, placeholder }) {
  const [label, setLabel] = useState("");
  const [chemin, setChemin] = useState("");
  const [type, setType] = useState(defaultType);
  const author = currentUser.name || currentUser.role;

  const addFiles = (fileList) => {
    const files = Array.from(fileList).map((f) => ({
      label: label.trim() || undefined,
      name: f.name,
      size: f.size,
      file: f,
      type,
      author,
      date: today(),
    }));
    if (files.length === 0) return;
    onAdd(files);
    setLabel("");
  };

  const addChemin = () => {
    const c = chemin.trim();
    if (!c) return;
    onAdd([{ label: label.trim() || undefined, chemin: c, type, author, date: today() }]);
    setLabel("");
    setChemin("");
  };

  return (
    <div className="gt-form">
      <div className="gt-formrow">
        {allowedTypes.length > 1 && (
          <select value={type} onChange={(e) => setType(e.target.value)} style={{ flex: 1 }}>
            {allowedTypes.map((k) => (
              <option key={k} value={k}>{typeInfo(k).label}</option>
            ))}
          </select>
        )}
        <input style={{ flex: 2 }} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Description (optionnel)" />
      </div>
      <div className="gt-formrow">
        <label className="gt-btn gt-btn-neutral gt-attach-uploadbtn" style={{ flex: 1 }}>
          <Paperclip size={14} /> {placeholder}
          <input type="file" multiple onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        </label>
      </div>
      <div className="gt-formrow">
        <input
          style={{ flex: 1 }}
          value={chemin}
          onChange={(e) => setChemin(e.target.value)}
          placeholder="Ou un chemin réseau, ex. \\SERVEUR\..."
          className="gt-mono"
        />
        <button type="button" className="gt-btn gt-btn-neutral" disabled={!chemin.trim()} onClick={addChemin}>
          <FolderOpen size={14} /> Ajouter le chemin
        </button>
      </div>
    </div>
  );
}

function AttachmentSection({ title, items, onRemove, canRemove, emptyLabel }) {
  return (
    <div className="gt-attach-section">
      <div className="gt-attach-section-head">{title} ({items.length})</div>
      <div className="gt-attach-list">
        {items.map((a) => (
          <AttachmentItem key={a._index} a={a} onRemove={() => onRemove(a._index)} canRemove={canRemove} />
        ))}
        {items.length === 0 && <div className="gt-list-empty">{emptyLabel}</div>}
      </div>
    </div>
  );
}

// Splits attachments into "what I send" vs "what I receive" sections per role, instead of one
// flat list — each role only sees uploads relevant to them, plus a category (type) per file so
// it's clear at a glance whether it's a terrain photo, a bureau deliverable, or something else.
export default function AttachmentsPanel({ attachments, onAdd, onRemove, currentUser, isOffice }) {
  const indexed = (attachments || []).map((a, i) => ({ ...a, _index: i }));
  const byType = (t) => indexed.filter((a) => (a.type || "autre") === t);
  const note = "Démo — les fichiers ne sont pas réellement téléversés, seul le nom (ou le chemin) est conservé.";

  if (isOffice) {
    return (
      <>
        <UploadForm defaultType="autre" allowedTypes={["photo", "livrable", "autre"]} onAdd={onAdd} currentUser={currentUser} placeholder="Ajouter des fichiers" />
        <AttachmentSection title="Toutes les pièces jointes" items={indexed} onRemove={onRemove} canRemove emptyLabel="Aucune pièce jointe." />
        <div className="gt-attach-note">{note}</div>
      </>
    );
  }

  if (currentUser.role === "Agent Chantier") {
    const mine = byType("photo").filter((a) => a.author === (currentUser.name || currentUser.role));
    return (
      <>
        <div className="gt-attach-sectionlabel">Vous envoyez</div>
        <UploadForm defaultType="photo" allowedTypes={["photo"]} onAdd={onAdd} currentUser={currentUser} placeholder="Ajouter des photos terrain" />
        <AttachmentSection title="Vos photos terrain" items={mine} onRemove={onRemove} canRemove emptyLabel="Aucune photo envoyée pour l'instant." />
        <div className="gt-attach-note">{note}</div>
      </>
    );
  }

  if (currentUser.role === "Agent Bureau") {
    return (
      <>
        <div className="gt-attach-sectionlabel">Vous envoyez</div>
        <UploadForm defaultType="livrable" allowedTypes={["livrable"]} onAdd={onAdd} currentUser={currentUser} placeholder="Ajouter un livrable (PV/DWG)" />
        <AttachmentSection title="Vos livrables" items={byType("livrable")} onRemove={onRemove} canRemove emptyLabel="Aucun livrable envoyé pour l'instant." />
        <div className="gt-attach-sectionlabel">Reçu du terrain</div>
        <AttachmentSection title="Photos de l'agent chantier" items={byType("photo")} onRemove={onRemove} canRemove={false} emptyLabel="Aucune photo reçue pour l'instant." />
        <div className="gt-attach-note">{note}</div>
      </>
    );
  }

  if (currentUser.role === "Agent Contrôle") {
    return (
      <>
        <div className="gt-attach-sectionlabel">Reçu (à contrôler)</div>
        <AttachmentSection title="Livrables bureau" items={byType("livrable")} onRemove={onRemove} canRemove={false} emptyLabel="Aucun livrable reçu." />
        <AttachmentSection title="Photos terrain" items={byType("photo")} onRemove={onRemove} canRemove={false} emptyLabel="Aucune photo reçue." />
        <div className="gt-attach-sectionlabel">Vous envoyez</div>
        <UploadForm defaultType="autre" allowedTypes={["autre"]} onAdd={onAdd} currentUser={currentUser} placeholder="Ajouter une preuve de non-conformité" />
        <AttachmentSection title="Vos observations" items={byType("autre")} onRemove={onRemove} canRemove emptyLabel="Aucune observation ajoutée." />
        <div className="gt-attach-note">{note}</div>
      </>
    );
  }

  return <AttachmentSection title="Pièces jointes" items={indexed} onRemove={onRemove} canRemove={false} emptyLabel="Aucune pièce jointe." />;
}
