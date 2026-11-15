import React, { useState, useRef, useEffect, useMemo } from "react";
import { Search, Plus, Command } from "lucide-react";
import { C, ROLE_NAV, NAV_ITEMS } from "../data/constants.js";

export default function CommandPalette({ open, onClose, onNavigate, role }) {
  const [q, setQ] = useState("");
  const inputRef = useRef(null);
  useEffect(() => { if (open) { setQ(""); setTimeout(() => inputRef.current?.focus(), 30); } }, [open]);

  const commands = useMemo(() => {
    const navItems = ROLE_NAV[role] || ROLE_NAV.cashier || ["pos"];
    const navCmds = navItems
      .filter((id) => NAV_ITEMS[id])
      .map((id) => ({ id: `nav-${id}`, label: `Go to ${NAV_ITEMS[id].label}`, icon: NAV_ITEMS[id].icon, action: () => onNavigate(id) }));
    if (role === "cashier") {
      return navCmds;
    }
    return [{ id: "nav-chat-new", label: "Start a new chat with the Planner", icon: Plus, action: () => onNavigate("chat", true) }, ...navCmds];
  }, [role, onNavigate]);

  const filtered = commands.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()));

  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(19,26,44,.45)", zIndex: 300, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "12vh" }} onClick={onClose}>
      <div className="anim-in" onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, boxShadow: "0 24px 60px rgba(19,26,44,.3)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: `1px solid ${C.line}` }}>
          <Search size={16} color={C.inkFaint} />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jump to a workspace or action…"
            className="vantage-focus" style={{ flex: 1, border: "none", outline: "none", fontSize: 14.5 }}
            onKeyDown={(e) => { if (e.key === "Escape") onClose(); if (e.key === "Enter" && filtered[0]) { filtered[0].action(); onClose(); } }} />
          <span className="font-mono" style={{ fontSize: 11, color: C.inkFaint }}>Esc</span>
        </div>
        <div style={{ maxHeight: 320, overflowY: "auto", padding: 6 }}>
          {filtered.length === 0 && <div style={{ padding: 16, fontSize: 13, color: C.inkFaint }}>No matching actions.</div>}
          {filtered.map((c) => (
            <button key={c.id} className="vantage-focus" onClick={() => { c.action(); onClose(); }} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "10px 12px",
              borderRadius: 9, border: "none", background: "transparent", fontSize: 13.5, fontWeight: 600, color: C.ink,
            }}>
              <c.icon size={15} color={C.inkFaint} /> {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
