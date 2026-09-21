import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await onLogin(username, password);
    } catch (err) {
      setError(err.message || "Connexion impossible");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "var(--background)" }}>
      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: 16, width: 320, padding: 32, borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)" }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <img src="/logo.png" alt="Globetudes" style={{ height: 40 }} />
          <div style={{ fontSize: 15, fontWeight: 600 }}>Connexion</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Label htmlFor="username">Identifiant</Label>
          <Input
            id="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Label htmlFor="password">Mot de passe</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        {error && <div style={{ color: "var(--destructive)", fontSize: 13 }}>{error}</div>}

        <Button type="submit" disabled={submitting || !username || !password}>
          {submitting ? "Connexion..." : "Se connecter"}
        </Button>
      </form>
    </div>
  );
}
