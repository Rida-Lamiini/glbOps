import React, { useEffect, useState } from "react";
import { ExternalLink, FileX2, Loader2 } from "lucide-react";

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api").replace(/\/api\/?$/, "");
const IMAGE_RE = /\.(png|jpe?g|webp|gif)$/i;

export const resolveMediaUrl = (url) => (url && url.startsWith("/") ? `${API_ORIGIN}${url}` : url || "");

/** The source plan of a lot. Images render as-is; PDFs are fetched as a blob because Django's
 *  X-Frame-Options would refuse to be framed straight from the media URL. */
export default function LotPlanViewer({ url }) {
  const src = resolveMediaUrl(url);
  const isImage = IMAGE_RE.test(src.split("?")[0]);
  const [blobUrl, setBlobUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setBlobUrl(null);
    setFailed(false);
    if (!src || isImage) return undefined;
    let cancelled = false;
    let objectUrl = null;
    fetch(src)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(r.status))))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, isImage]);

  let body;
  if (!src) {
    body = <div className="cad-plan-empty"><FileX2 size={22} /><strong>Aucun plan lié</strong>Ce lot n'a pas de fichier source enregistré.</div>;
  } else if (failed) {
    body = <div className="cad-plan-empty"><FileX2 size={22} /><strong>Plan introuvable</strong>Le fichier n'a pas pu être chargé.</div>;
  } else if (isImage) {
    body = <div className="cad-plan-img"><img src={src} alt="Plan source du lot" /></div>;
  } else if (!blobUrl) {
    body = <div className="cad-plan-empty"><Loader2 size={20} className="gt-spin-icon" />Chargement du plan…</div>;
  } else {
    body = <iframe className="cad-plan-frame" src={blobUrl} title="Plan source du lot" />;
  }

  return (
    <section className="cad-panel cad-plan">
      <div className="cad-top">
        <h2>Plan source</h2>
        {src && <a className="cad-btn" href={src} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Ouvrir</a>}
      </div>
      {body}
    </section>
  );
}
