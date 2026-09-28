import React from "react";
import { LogOut, UserRound } from "lucide-react";
import { ROLES } from "../constants";

// Shared top strip for the 3 field/support role shells (Agent Chantier/Bureau/Contrôle) — they
// have no sidebar of their own, so this is their only chrome: brand + role/name switcher.
export default function FieldTopstrip({ currentUser, nameOptions, onRoleChange, onNameChange, onLogout, onOpenProfile }) {
  return (
    <div className="ac-topstrip">
      <div className="ac-topstrip-brand">
        <img src="/logo.png" alt="Globetudes" className="ac-topstrip-mark" />
        <span>Globetudes</span>
      </div>
      <div className="gt-userswitch">
        <select className="gt-userselect" value={currentUser.role} onChange={(e) => onRoleChange(e.target.value)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <select className="gt-userselect" value={currentUser.name} onChange={(e) => onNameChange(e.target.value)}>
          {nameOptions.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        {onOpenProfile && (
          <button className="gt-sidebar-logout" onClick={onOpenProfile} title="Mon profil" aria-label="Mon profil">
            <UserRound size={15} />
          </button>
        )}
        {onLogout && (
          <button className="gt-sidebar-logout" onClick={onLogout} title="Déconnexion">
            <LogOut size={15} />
          </button>
        )}
      </div>
    </div>
  );
}
