import React from "react";
import { TrendingUp, TrendingDown, CheckCircle2 } from "lucide-react";
import { C } from "../data/constants.js";

export function Btn({ children, variant = "primary", size = "md", onClick, disabled, type = "button", full }) {
  const pad = size === "sm" ? "6px 14px" : size === "lg" ? "14px 26px" : "10px 18px";
  const fontSize = size === "sm" ? 13 : size === "lg" ? 16 : 14;
  const base = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
    padding: pad, fontSize, fontWeight: 600, borderRadius: 10, border: "1px solid transparent",
    transition: "all .15s ease", width: full ? "100%" : "auto", opacity: disabled ? 0.55 : 1,
    pointerEvents: disabled ? "none" : "auto",
  };
  const variants = {
    primary: { background: C.navy, color: "#fff" },
    amber: { background: C.amber, color: C.navyDeep },
    ghost: { background: "transparent", color: C.navy, border: `1px solid ${C.line}` },
    ghostLight: { background: "rgba(255,255,255,.08)", color: "#fff", border: "1px solid rgba(255,255,255,.28)" },
    subtle: { background: C.bg, color: C.navy },
    danger: { background: "transparent", color: C.coral, border: `1px solid ${C.coralSoft}` },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className="vantage-focus"
      style={{ ...base, ...variants[variant] }}>
      {children}
    </button>
  );
}

export function Card({ children, style }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, padding: 20, ...style }}>
      {children}
    </div>
  );
}

export function Badge({ children, text, tone = "neutral" }) {
  const tones = {
    neutral: { bg: "#EEF0F6", fg: C.inkSoft },
    ok: { bg: C.tealSoft, fg: "#0A7873" },
    positive: { bg: C.tealSoft, fg: "#0A7873" },
    teal: { bg: C.tealSoft, fg: "#0A7873" },
    low: { bg: C.amberSoft, fg: C.amberDeep },
    warning: { bg: C.amberSoft, fg: C.amberDeep },
    amber: { bg: C.amberSoft, fg: C.amberDeep },
    critical: { bg: C.coralSoft, fg: C.coral },
    negative: { bg: C.coralSoft, fg: C.coral },
    info: { bg: "#E7EAF3", fg: C.navy },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span style={{ background: t.bg, color: t.fg, fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999, letterSpacing: .2 }}>
      {children ?? text}
    </span>
  );
}

export function Trend({ dir, delta }) {
  const up = dir === "up";
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color: up ? "#0A7873" : C.coral }}>
      <Icon size={13} /> {delta}
    </span>
  );
}

export function Toast({ message }) {
  if (!message) return null;
  return (
    <div className="anim-in" style={{
      position: "fixed", bottom: 24, right: 24, background: C.navyDeep, color: "#fff",
      padding: "12px 18px", borderRadius: 12, fontSize: 14, fontWeight: 500, zIndex: 200,
      boxShadow: "0 12px 30px rgba(19,26,44,.35)", display: "flex", alignItems: "center", gap: 10, maxWidth: 320,
    }}>
      <CheckCircle2 size={16} color={C.teal} /> {message}
    </div>
  );
}

export function ConfirmDialog({ open, title, body, confirmLabel = "Confirm", danger, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(19,26,44,.45)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onCancel}>
      <div className="anim-in" onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 22, width: "100%", maxWidth: 360, boxShadow: "0 20px 50px rgba(19,26,44,.25)" }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 13.5, color: C.inkSoft, marginBottom: 18, lineHeight: 1.55 }}>{body}</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn variant="ghost" size="sm" onClick={onCancel}>Cancel</Btn>
          <Btn variant={danger ? "danger" : "primary"} size="sm" onClick={onConfirm}>{confirmLabel}</Btn>
        </div>
      </div>
    </div>
  );
}
