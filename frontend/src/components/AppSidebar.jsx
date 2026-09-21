import React from "react";
import { LogOut } from "lucide-react";
import { ROLES } from "../constants";
import { NAV_GROUPS } from "../constants/nav";
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

export default function AppSidebar({ visibleTabs, view, setView, currentUser, onRoleChange, onLogout }) {
  const { isMobile, setOpenMobile } = useSidebar();
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
      </SidebarContent>
      <SidebarFooter>
        <div className="gt-sidebar-footer">
          <div className="gt-sidebar-footer-avatar">
            {(currentUser.name || "?").split(/\s+/).filter((w) => /^\p{L}/u.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?"}
          </div>
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
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
