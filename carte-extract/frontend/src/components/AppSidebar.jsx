import React, { useRef, useState } from "react";
import { LogOut, DatabaseZap, DatabaseBackup } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import DataDialog from "./DataDialog";
import { apiGet, apiPost } from "../lib/api";
import { notifyError, notifySuccess } from "../utils/notify";
import { ROLES } from "../constants";
import { NAV_GROUPS } from "../constants/nav";
import PersonAvatar from "./PersonAvatar";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

export default function AppSidebar({ visibleTabs, view, setView, currentUser, onRoleChange, onLogout, onOpenProfile }) {
  const { isMobile, setOpenMobile } = useSidebar();
  const bundleInput = useRef(null);
  const [importing, setImporting] = useState(false);
  const [showData, setShowData] = useState(false);
  const [version, setVersion] = useState("");
  React.useEffect(() => {
    apiGet("/health/").then((h) => setVersion(h.version || "")).catch(() => {});
  }, []);
  const office = currentUser.role === "Dispatcher" || currentUser.role === "Directrice";

  // An update bundle (.zip) exported from the main glbOps: new/changed lots, clients, projets and plans.
  const importBundle = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiPost("/bundle/import/", form);
      const c = res.counts || {};
      notifySuccess(`Mise à jour importée : ${c["cadastre.lot"] || 0} lots, ${c["clients.client"] || 0} clients, ${c["projets.projet"] || 0} projets.`);
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      const m = /"detail":"([^"]+)"/.exec(err.message || "");
      notifyError(m ? m[1] : "La mise à jour n'a pas pu être importée.");
      setImporting(false);
    }
  };
  const go = (key) => {
    setView(key);
    if (isMobile) setOpenMobile(false);
  };
  return (
    <Sidebar variant="sidebar" collapsible="icon" className="border-sidebar-border">
      <SidebarHeader>
        <div className="gt-sidebar-brand">
          <span className="gt-sidebar-brand-plate">
            <img src="/logo.png" alt="Globetudes" className="gt-sidebar-brand-mark" />
          </span>
          <span className="gt-sidebar-wordmark">
            <strong>Globetudes</strong>
            <em>glbOps · Opérations</em>
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) => visibleTabs.includes(item.key));
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton isActive={view === item.key} onClick={() => go(item.key)} tooltip={item.label}>
                        <span className="gt-sidebar-icon" style={{ "--icon-color": item.color }}>
                          <item.icon size={15} />
                        </span>
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
        {office && (
          <SidebarGroup>
            <SidebarGroupLabel>Données</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => bundleInput.current?.click()} disabled={importing} tooltip="Importer une mise à jour (.zip)">
                    <span className="gt-sidebar-icon" style={{ "--icon-color": "var(--accent)" }}>
                      <DatabaseZap size={15} />
                    </span>
                    <span>{importing ? "Import en cours…" : "Importer une mise à jour"}</span>
                  </SidebarMenuButton>
                  <input ref={bundleInput} type="file" accept=".zip,application/zip" style={{ display: "none" }} onChange={importBundle} />
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => setShowData(true)} tooltip="Sauvegardes et version">
                    <span className="gt-sidebar-icon" style={{ "--icon-color": "var(--status-info)" }}>
                      <DatabaseBackup size={15} />
                    </span>
                    <span>Sauvegardes</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <AnimatePresence>{showData && <DataDialog office={office} onClose={() => setShowData(false)} />}</AnimatePresence>
      <SidebarFooter>
        <div className="gt-sidebar-footer">
          <button type="button" className="gt-sidebar-footer-avatar gt-sidebar-profilebtn" onClick={onOpenProfile} title="Mon profil" aria-label="Mon profil">
            <PersonAvatar name={currentUser.name} size={34} />
          </button>
          <div className="gt-sidebar-footer-text">
            <div className="gt-sidebar-footer-name">{(currentUser.name || "").charAt(0).toUpperCase() + (currentUser.name || "").slice(1)}</div>
            <select
              className="gt-sidebar-roleselect"
              value={currentUser.role}
              onChange={(e) => onRoleChange(e.target.value)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          {onLogout && (
            <button className="gt-sidebar-logout" onClick={onLogout} title="Déconnexion">
              <LogOut size={15} />
            </button>
          )}
        </div>
        {version && (
          <button type="button" className="gt-sidebar-version" onClick={() => setShowData(true)} title="Version et sauvegardes">
            Version {version}
          </button>
        )}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
