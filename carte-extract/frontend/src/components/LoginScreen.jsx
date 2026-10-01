import React, { useState } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, Layers, Loader2, LogIn, MapPinned, TriangleAlert, Workflow } from "lucide-react";

// A cadastral lot's outline (screen-space, not real coordinates) with its bornes numbered like a
// real "Calcul de Contenances" plot — the one motif on the visual side that is actually *ours*
// rather than generic map decoration.
const PLOT_POINTS = [
  [50, 150], [115, 55], [225, 40], [290, 105], [265, 195], [140, 215],
];

const COMPASS_TICKS = Array.from({ length: 24 }, (_, i) => i * 15);

const FACTS = [
  { icon: Workflow, label: "7 étapes", sub: "demande → livraison" },
  { icon: MapPinned, label: "PostGIS", sub: "précision cadastrale" },
  { icon: Layers, label: "1 dossier", sub: "terrain, bureau, contrôle" },
];

function Compass() {
  return (
    <div className="lg-compass" aria-hidden="true">
      <svg viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="56" />
        <circle cx="60" cy="60" r="2.5" fill="currentColor" stroke="none" />
        {COMPASS_TICKS.map((deg) => (
          <line
            key={deg}
            x1="60" y1="6" x2="60" y2={deg % 90 === 0 ? 16 : 11}
            transform={`rotate(${deg} 60 60)`}
            strokeWidth={deg % 90 === 0 ? 1.6 : 1}
          />
        ))}
        <path className="lg-compass-needle" d="M60 18 L67 60 L60 102 L53 60 Z" />
        <text x="60" y="30" textAnchor="middle">N</text>
      </svg>
    </div>
  );
}

function VisualSide() {
  return (
    <div className="lg-visual">
      <div className="lg-visual-grain" />
      <svg className="lg-visual-contours" viewBox="0 0 600 800" preserveAspectRatio="none" aria-hidden="true">
        <path d="M-40 620C60 560 130 660 260 600S440 500 640 570" />
        <path d="M-40 560C80 500 150 600 270 540S430 450 640 510" />
        <path d="M-40 700C70 650 140 730 270 680S440 590 640 650" />
        <path d="M-40 160C80 90 170 210 290 130S470 40 640 120" />
        <path d="M-40 210C90 140 180 250 296 170S460 90 640 160" />
        <path d="M-40 260C95 195 190 295 300 220S450 150 640 210" />
      </svg>

      <div className="lg-visual-inner">
        <div className="lg-visual-top">
          <div className="lg-visual-brand">
            <img src="/logo.png" alt="" />
            <span>Globetudes</span>
          </div>
          <div className="lg-visual-coords">
            <span>34.0209° N · 6.8416° W</span>
            <span>Lambert Nord Maroc · EPSG:26191</span>
          </div>
        </div>

        <motion.div
          className="lg-mapcard"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="lg-mapcard-head">
            <span>Extrait — calcul de contenances</span>
            <span className="lg-mapcard-tag gt-mono">TF/52310-C</span>
          </div>
          <div className="lg-mapcard-body">
            <svg className="lg-plot" viewBox="0 0 340 260" aria-hidden="true">
              <polygon points={PLOT_POINTS.map((p) => p.join(",")).join(" ")} className="lg-plot-fill" />
              <polyline points={[...PLOT_POINTS, PLOT_POINTS[0]].map((p) => p.join(",")).join(" ")} className="lg-plot-line" />
              {PLOT_POINTS.map(([x, y], i) => (
                <g key={i} className={`lg-plot-borne ${i === 0 ? "is-accent" : ""}`}>
                  <circle cx={x} cy={y} r={i === 0 ? 6 : 4} />
                  <text x={x + 9} y={y - 7}>B{i + 1}</text>
                </g>
              ))}
            </svg>
            <Compass />
          </div>
          <div className="lg-mapcard-foot">
            <span>6 bornes</span>
            <span>surface calculée 2&nbsp;430&nbsp;m²</span>
            <span className="lg-mapcard-conforme">conforme</span>
          </div>
        </motion.div>

        <motion.div
          className="lg-visual-bottom"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="lg-visual-copy">
            <div className="lg-visual-eyebrow">Globetudes · Opérations terrain &amp; bureau</div>
            <h1>Chaque borne compte.</h1>
            <p>Du levé sur chantier au dossier cadastral validé — un seul outil pour piloter clients, projets et prestations, précisément cartographiés.</p>
          </div>
          <div className="lg-facts">
            {FACTS.map(({ icon: Icon, label, sub }) => (
              <div className="lg-fact" key={label}>
                <Icon size={15} />
                <div>
                  <strong>{label}</strong>
                  <span>{sub}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [sharedDevice, setSharedDevice] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await onLogin(username, password, sharedDevice);
    } catch (err) {
      setError(err.message || "Connexion impossible");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="lg-shell">
      <VisualSide />

      <div className="lg-formside">
        <motion.form
          className="lg-form"
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="lg-form-brand">
            <img src="/logo.png" alt="Globetudes" />
          </div>
          <div className="lg-form-eyebrow">Espace opérations</div>
          <h2>Connexion</h2>
          <p className="lg-form-sub">Identifiez-vous pour retrouver vos dossiers.</p>

          <label className="lg-field">
            <span>Identifiant</span>
            <input
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              placeholder="ex. dispatcher"
            />
          </label>

          <label className="lg-field">
            <span>Mot de passe</span>
            <div className="lg-passwrap">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
              />
              <button
                type="button"
                className="lg-passtoggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </label>

          <label className="lg-shared">
            <input type="checkbox" checked={sharedDevice} onChange={(e) => setSharedDevice(e.target.checked)} />
            <span>Poste partagé — ne pas rester connecté</span>
          </label>

          {error && (
            <div className="lg-error" role="alert">
              <TriangleAlert size={14} /> {error}
            </div>
          )}

          <button type="submit" className="lg-submit" disabled={submitting || !username || !password}>
            {submitting ? <Loader2 size={16} className="gt-spin-icon" /> : <LogIn size={16} />}
            {submitting ? "Connexion…" : "Se connecter"}
          </button>

          <div className="lg-form-foot">glbOps · usage interne Globetudes</div>
        </motion.form>
      </div>
    </div>
  );
}
