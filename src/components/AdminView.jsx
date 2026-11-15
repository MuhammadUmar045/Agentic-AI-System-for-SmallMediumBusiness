import React, { useState } from "react";
import { ListChecks } from "lucide-react";
import { C, AGENTS } from "../data/constants.js";
import { useAppState } from "../context/AppStateContext.jsx";
import { Card, Badge, Btn, ConfirmDialog } from "./Primitives.jsx";
import ViewWrap from "./ViewWrap.jsx";

export default function AdminView() {
  const { state, derived } = useAppState();
  const [users, setUsers] = useState([
    { name: "Ali Raza", role: "Owner", status: "Active" },
    { name: "Sana Malik", role: "Staff", status: "Active" },
    { name: "Bilal Khan", role: "Staff", status: "Suspended" },
  ]);
  const [confirmToggle, setConfirmToggle] = useState(null);
  const toggle = (i) => setUsers((u) => u.map((x, idx) => idx === i ? { ...x, status: x.status === "Active" ? "Suspended" : "Active" } : x));
  const health = [
    { label: "Uptime", value: "99.98%" },
    { label: "Avg API response", value: "180 ms" },
    { label: "Agents online", value: "4 / 4" },
    { label: "Actions logged", value: String(state.activity.length) },
  ];
  return (
    <ViewWrap title="Admin Monitoring" subtitle="Platform health, agent status, and account management.">
      <div className="vantage-grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {health.map((h) => (
          <Card key={h.label} style={{ padding: 16 }}>
            <div style={{ fontSize: 12.5, color: C.inkFaint, fontWeight: 600 }}>{h.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 6 }} className="font-mono">{h.value}</div>
          </Card>
        ))}
      </div>
      <Card style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Agent activity</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Object.entries(AGENTS).map(([k, A]) => (
            <div key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: C.bg, borderRadius: 9 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><A.icon size={15} color={A.color} /><span style={{ fontSize: 13.5, fontWeight: 600 }}>{A.label}</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#0A7873", fontWeight: 700 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#0A7873" }} /> Online
              </div>
            </div>
          ))}
        </div>
      </Card>
      {state.activity.length > 0 && (
        <Card style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}><ListChecks size={15} /> Recent actions across the workspace</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }} className="vantage-scroll">
            {state.activity.slice(0, 12).map((a) => {
              const A = AGENTS[a.agent];
              return (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, padding: "6px 8px", borderRadius: 7, background: C.bg }}>
                  {A && <A.icon size={12} color={A.color} />}
                  <span style={{ flex: 1 }}>{a.text}</span>
                  <span style={{ color: C.inkFaint, fontSize: 11 }}>{new Date(a.ts).toLocaleTimeString()}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
      <Card style={{ marginTop: 16, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px 0", fontWeight: 700 }}>User accounts</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, marginTop: 8 }}>
          <tbody>
            {users.map((u, i) => (
              <tr key={i} style={{ borderTop: `1px solid ${C.line}` }}>
                <td style={{ padding: "12px 16px", fontWeight: 600 }}>{u.name}</td>
                <td style={{ padding: "12px 16px" }}><Badge tone="neutral">{u.role}</Badge></td>
                <td style={{ padding: "12px 16px" }}><Badge tone={u.status === "Active" ? "ok" : "critical"}>{u.status}</Badge></td>
                <td style={{ padding: "12px 16px", textAlign: "right" }}>
                  <Btn variant="ghost" size="sm" onClick={() => setConfirmToggle({ index: i, user: u })}>{u.status === "Active" ? "Suspend" : "Reactivate"}</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <ConfirmDialog
        open={!!confirmToggle}
        title={confirmToggle?.user.status === "Active" ? "Suspend this account?" : "Reactivate this account?"}
        body={confirmToggle ? `${confirmToggle.user.name} will ${confirmToggle.user.status === "Active" ? "lose" : "regain"} access immediately.` : ""}
        confirmLabel={confirmToggle?.user.status === "Active" ? "Suspend" : "Reactivate"}
        danger={confirmToggle?.user.status === "Active"}
        onCancel={() => setConfirmToggle(null)}
        onConfirm={() => { toggle(confirmToggle.index); setConfirmToggle(null); }}
      />
    </ViewWrap>
  );
}
