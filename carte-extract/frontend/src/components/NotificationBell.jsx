import React from "react";
import { Bell } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";

const KIND_COLOR = { bad: "var(--bad)", warn: "var(--amber)", info: "var(--accent)" };

export default function NotificationBell({ notifications, onOpen }) {
  const count = notifications.length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="gt-notif-bell" aria-label="Notifications">
          <Bell size={16} />
          {count > 0 && <span className="gt-notif-badge">{count > 9 ? "9+" : count}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="gt-notif-panel">
        {notifications.length === 0 ? (
          <div className="gt-notif-empty">Aucune notification.</div>
        ) : (
          notifications.map((n) => (
            <DropdownMenuItem key={n.id} onClick={() => onOpen(n)} className="gt-notif-item">
              <span className="gt-notif-dot" style={{ background: KIND_COLOR[n.kind] || "var(--muted)" }} />
              <span className="gt-notif-text">
                <span className="gt-notif-label">{n.label}</span>
                {n.detail && <span className="gt-notif-detail">{n.detail}</span>}
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
