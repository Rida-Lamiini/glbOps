import React, { useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { parseCadastrePdf, readApiError } from "./api";

export default function PdfUploadPanel({ onParsed }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState(null);

  async function handleFile(file) {
    setLoading(true);
    setError(null);
    setFileName(file.name);
    try {
      onParsed(await parseCadastrePdf(file));
    } catch (err) {
      setError(
        readApiError(
          err,
          "Échec de l'analyse du PDF. Vérifiez votre connexion et réessayez.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="gt-section">
      <h4>Importer un PDF « Calcul de Contenances »</h4>
      <p className="gt-ocr-sub" style={{ marginBottom: 10 }}>
        Le texte du PDF est extrait automatiquement (OCR si le document est scanné) puis pré-rempli
        ci-dessous pour relecture — rien n'est enregistré avant validation.
      </p>

      <label className={`gt-ocr-drop ${loading ? "busy" : ""}`}>
        {loading ? <Loader2 size={14} className="gt-spin-icon" /> : <FileUp size={14} />}
        {loading
          ? "Analyse en cours… (OCR : jusqu'à une minute pour un document scanné)"
          : "Choisir un fichier PDF"}
        <input
          type="file"
          accept="application/pdf"
          disabled={loading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            // Reset so picking the same file twice still fires a change event.
            e.target.value = "";
          }}
        />
      </label>

      {fileName && (
        <span style={{ marginLeft: 10, fontSize: 12.5, color: "var(--muted)" }}>{fileName}</span>
      )}
      {error && (
        <p className="gt-ocr-warn" style={{ marginTop: 10 }}>
          {error}
        </p>
      )}
    </section>
  );
}
