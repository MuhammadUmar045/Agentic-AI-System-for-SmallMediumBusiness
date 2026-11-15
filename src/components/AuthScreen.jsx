import React, { useState } from "react";
import {
  Compass, Building2, User, Mail, Lock, Eye, EyeOff, ArrowRight, Sparkles,
} from "lucide-react";
import { C, ROLE_META, AGENTS } from "../data/constants.js";
import { Btn } from "./Primitives.jsx";

function Field({ icon: Icon, endIcon: EndIcon, onEndIconClick, ...props }) {
  return (
    <div style={{ position: "relative" }}>
      <Icon size={16} color={C.inkFaint} style={{ position: "absolute", left: 13, top: 13 }} />
      <input {...props} onChange={(e) => props.onChange(e.target.value)} className="vantage-focus" style={{
        width: "100%", padding: "11px 14px 11px 38px", borderRadius: 10, border: `1.5px solid ${C.line}`,
        fontSize: 14,
      }} />
      {EndIcon && (
        <button type="button" onClick={onEndIconClick} style={{ position: "absolute", right: 10, top: 9, background: "none", border: "none", padding: 4 }}>
          <EndIcon size={16} color={C.inkFaint} />
        </button>
      )}
    </div>
  );
}

function OrgChartVisual({ compact }) {
  const nodes = [
    { key: "finance", label: "Finance", stat: "₨1.18M forecast", angle: -130 },
    { key: "inventory", label: "Inventory", stat: "2 items low", angle: -40 },
    { key: "communication", label: "Communication", stat: "3 drafts ready", angle: 40 },
    { key: "analytics", label: "Analytics", stat: "Report ready", angle: 130 },
  ];
  const r = compact ? 92 : 132;
  const size = compact ? 260 : 340;
  const cx = size / 2, cy = size / 2;
  return (
    <div style={{ position: "relative", width: size, height: size, margin: "0 auto" }}>
      <svg width={size} height={size} style={{ position: "absolute", inset: 0 }}>
        {nodes.map((n) => {
          const rad = (n.angle * Math.PI) / 180;
          const x = cx + r * Math.cos(rad);
          const y = cy + r * Math.sin(rad);
          return <line key={n.key} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,.35)" strokeWidth="2" className="flow-line" />;
        })}
      </svg>
      <div style={{
        position: "absolute", top: cy - 34, left: cx - 34, width: 68, height: 68, borderRadius: "50%",
        background: C.amber, display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 0 0 8px rgba(227,160,8,.15)", zIndex: 2,
      }} className="pulse-ring">
        <Sparkles size={28} color={C.navyDeep} />
      </div>
      {nodes.map((n, i) => {
        const rad = (n.angle * Math.PI) / 180;
        const x = cx + r * Math.cos(rad);
        const y = cy + r * Math.sin(rad);
        const A = AGENTS[n.key];
        return (
          <div key={n.key} className="float-slow" style={{
            position: "absolute", left: x - 62, top: y - 26, width: 124, textAlign: "center",
            animationDelay: `${i * .4}s`,
          }}>
            <div style={{
              display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 4,
              background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.18)",
              borderRadius: 12, padding: "8px 10px", backdropFilter: "blur(2px)",
            }}>
              <A.icon size={16} color="#fff" />
              <span style={{ fontSize: 11, color: "#fff", fontWeight: 700 }}>{n.label}</span>
              <span className="font-mono" style={{ fontSize: 10, color: "rgba(255,255,255,.65)" }}>{n.stat}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AuthScreen({ mode, setMode, onAuth, goBack }) {
  const [form, setForm] = useState({ business: "", owner: "", email: "", password: "" });
  const [role, setRole] = useState("owner");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isSignup = mode === "signup";

  return (
    <div className="vantage-root" style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "1fr 1fr", background: C.surface }}>
      <div style={{ background: C.navyDeep, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 48 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={goBack}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: C.amber, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Compass size={16} color={C.navyDeep} />
          </div>
          <span className="font-display" style={{ color: "#fff", fontSize: 19, fontWeight: 600 }}>Vantage</span>
        </div>
        <div>
          <OrgChartVisual compact />
        </div>
        <div>
          <p className="font-display" style={{ color: "#fff", fontSize: 22, lineHeight: 1.4, maxWidth: 380 }}>
            "I stopped checking five different spreadsheets. I just ask the Planner."
          </p>
          <p style={{ color: "rgba(255,255,255,.55)", fontSize: 13, marginTop: 10 }}>— a Vantage pilot merchant, Islamabad</p>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
        <div style={{ width: "100%", maxWidth: 400 }}>
          <div style={{ display: "flex", gap: 4, background: C.bg, borderRadius: 12, padding: 4, marginBottom: 28 }}>
            <button className="vantage-focus" onClick={() => setMode("signin")} style={{
              flex: 1, padding: "9px 0", borderRadius: 9, border: "none", fontWeight: 700, fontSize: 13.5,
              background: mode === "signin" ? "#fff" : "transparent", color: mode === "signin" ? C.navy : C.inkFaint,
              boxShadow: mode === "signin" ? "0 1px 4px rgba(0,0,0,.08)" : "none",
            }}>Sign in</button>
            <button className="vantage-focus" onClick={() => setMode("signup")} style={{
              flex: 1, padding: "9px 0", borderRadius: 9, border: "none", fontWeight: 700, fontSize: 13.5,
              background: mode === "signup" ? "#fff" : "transparent", color: mode === "signup" ? C.navy : C.inkFaint,
              boxShadow: mode === "signup" ? "0 1px 4px rgba(0,0,0,.08)" : "none",
            }}>Create account</button>
          </div>

          <h2 className="font-display" style={{ fontSize: 26, fontWeight: 600, marginBottom: 6 }}>
            {isSignup ? "Set up your workspace" : "Welcome back"}
          </h2>
          <p style={{ color: C.inkSoft, fontSize: 14, marginBottom: 24 }}>
            {isSignup ? "A few details and Vantage will get to work." : "Sign in to pick up where you left off."}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {isSignup && (
              <Field icon={Building2} placeholder="Business name" value={form.business} onChange={(v) => setForm({ ...form, business: v })} />
            )}
            {isSignup && (
              <Field icon={User} placeholder="Your name" value={form.owner} onChange={(v) => setForm({ ...form, owner: v })} />
            )}
            <Field icon={Mail} placeholder="Email address" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
            <Field icon={Lock} placeholder="Password" type={showPw ? "text" : "password"} value={form.password}
              onChange={(v) => setForm({ ...form, password: v })}
              endIcon={showPw ? EyeOff : Eye} onEndIconClick={() => setShowPw((s) => !s)} />
          </div>

          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: C.inkFaint, marginBottom: 8, textTransform: "uppercase", letterSpacing: .4 }}>
              {isSignup ? "Choose a role to preview" : "Quick demo access"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {["owner", "manager", "cashier"].map((r) => (
                <button key={r} className="vantage-focus" onClick={() => setRole(r)} style={{
                  textAlign: "left", padding: "10px 12px", borderRadius: 10,
                  border: `1.5px solid ${role === r ? C.navy : C.line}`,
                  background: role === r ? "#F3F4FA" : "#fff",
                }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{ROLE_META[r].label}</div>
                  <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 2 }}>{ROLE_META[r].desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 22 }}>
            <Btn variant="amber" full size="lg" disabled={submitting} onClick={async () => {
              setError(""); setSubmitting(true);
              try { await onAuth({ ...form, role }, mode); }
              catch (err) { setError(err.message || "Unable to sign in."); }
              finally { setSubmitting(false); }
            }} >
              {submitting ? "Please wait…" : (isSignup ? "Create workspace" : "Sign in")} <ArrowRight size={16} />
            </Btn>
            {error && <p style={{ color: C.coral, fontSize: 12.5, marginTop: 10, textAlign: "center" }}>{error}</p>}
          </div>
          {!isSignup && (
            <p style={{ fontSize: 12, color: C.inkFaint, marginTop: 12, textAlign: "center" }}>
              Sign in to access your saved Vantage workspace.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
