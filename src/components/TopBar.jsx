import React, { useState, useEffect, useRef } from "react";
import { Menu, Bell, CheckCircle2, AlertTriangle, Clock, DollarSign, Package, MessageSquare } from "lucide-react";
import { C, ROLE_META } from "../data/constants.js";
import { Badge } from "./Primitives.jsx";

const AGENT_ICONS = { finance: DollarSign, inventory: Package, communication: MessageSquare };

function relativeTime(isoString) {
  if (!isoString) return "";
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function TopBar({ business, role, setMobileOpen, alerts, activity }) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const recentActivity = (activity || []).slice(0, 5);
  const activeAlerts = alerts.length - dismissed;
  const hasNew = activeAlerts > 0;

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderBottom: `1px solid ${C.line}`, background: C.surface, position: "sticky", top: 0, zIndex: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button className="vantage-focus mobile-menu-btn" onClick={() => setMobileOpen(true)} style={{ background: "none", border: "none", alignItems: "center" }}>
          <Menu size={20} />
        </button>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{business || "Your business"}</div>
        <Badge tone={role === "cashier" ? "amber" : (role === "manager" ? "teal" : "info")}>
          {ROLE_META[role]?.label || role}
        </Badge>
      </div>
      <div style={{ position: "relative" }} ref={ref}>
        <button className="vantage-focus" onClick={() => setOpen((o) => !o)} style={{ background: C.bg, border: "none", borderRadius: 10, padding: 9, position: "relative" }}>
          <Bell size={17} color={C.navy} />
          {hasNew && <span className="pulse-ring" style={{ position: "absolute", top: 3, right: 3, width: 9, height: 9, borderRadius: "50%", background: C.coral, border: "2px solid #fff" }} />}
        </button>
        {open && (
          <div className="anim-in" style={{ position: "absolute", right: 0, top: 44, width: 340, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: "0 12px 30px rgba(19,26,44,.15)", zIndex: 20, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px 8px", borderBottom: `1px solid ${C.line}` }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Notifications</div>
              {hasNew && <button onClick={() => setDismissed(alerts.length)} style={{ fontSize: 12, fontWeight: 600, color: C.teal, background: "none", border: "none", cursor: "pointer" }}>Mark all read</button>}
            </div>
            {alerts.length > 0 && (
              <div style={{ padding: "6px 8px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.inkFaint, textTransform: "uppercase", letterSpacing: .4, padding: "4px 6px" }}>Alerts</div>
                {alerts.map((a, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, padding: "8px 6px", borderRadius: 8, background: i >= dismissed ? "rgba(220,76,62,.04)" : "transparent" }}>
                    <AlertTriangle size={14} color={a.tone} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.45 }}>{a.text}</div>
                  </div>
                ))}
              </div>
            )}
            {recentActivity.length > 0 && (
              <div style={{ padding: "6px 8px", borderTop: alerts.length > 0 ? `1px solid ${C.line}` : "none" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.inkFaint, textTransform: "uppercase", letterSpacing: .4, padding: "4px 6px" }}>Recent</div>
                {recentActivity.map((entry, i) => {
                  const Icon = AGENT_ICONS[entry.agent] || Clock;
                  return (
                    <div key={entry.id || i} style={{ display: "flex", gap: 10, padding: "8px 6px", borderRadius: 8 }}>
                      <Icon size={14} color={C.inkSoft} style={{ flexShrink: 0, marginTop: 1 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.4 }}>{entry.text}</div>
                        <div style={{ fontSize: 11, color: C.inkFaint }}>{entry.ts ? relativeTime(entry.ts) : ""}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {alerts.length === 0 && recentActivity.length === 0 && (
              <div style={{ padding: "20px 14px", textAlign: "center" }}>
                <CheckCircle2 size={20} color={C.teal} style={{ margin: "0 auto 8px" }} />
                <div style={{ fontSize: 13, color: C.inkFaint }}>You're all caught up.</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
