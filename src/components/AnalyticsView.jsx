import React, { useState } from "react";
import { FileDown, History } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { C } from "../data/constants.js";
import { useAppState } from "../context/AppStateContext.jsx";
import { downloadTextFile } from "../utils/helpers.js";
import { Card, Btn, Trend } from "./Primitives.jsx";
import ViewWrap from "./ViewWrap.jsx";

export default function AnalyticsView({ showToast }) {
  const { state, derived, dispatch } = useAppState();
  const [range, setRange] = useState("This Month");
  const [loading, setLoading] = useState(false);
  const generated = state.reports.length > 0;
  const latest = state.reports[0];

  const generate = () => {
    setLoading(true);
    setTimeout(() => {
      const summary = `Revenue is tracked from ${state.finance.series.filter((s) => s.revenue != null).length} actual months plus a live forecast. ` +
        `Finance has ${derived.approvedRecs.length} approved and ${derived.pendingRecs.length} pending recommendation(s), worth roughly ₨${derived.totalImpact.toLocaleString()} in applied monthly impact. ` +
        `Inventory currently has ${derived.lowStock.length} item(s) at or below their reorder threshold. ` +
        `Communication has sent ${derived.sentDrafts.length} of ${state.drafts.length} drafted customer messages. ` +
        `Recommended focus for ${range.toLowerCase()}: ${derived.lowStock.length > 0 ? "clear the outstanding reorders" : "hold current inventory levels"} and ${derived.pendingRecs.length > 0 ? "review the remaining finance recommendations" : "keep monitoring cash runway"}.`;
      const report = { id: `rep-${Date.now()}`, range, ts: new Date().toISOString(), summary, kpis: state.finance.kpis, deptScores: derived.deptScores };
      dispatch({ type: "GENERATE_REPORT", report });
      setLoading(false);
    }, 800);
  };

  const exportReport = () => {
    if (!latest) return;
    const text = `Vantage Performance Report — ${latest.range}\nGenerated: ${new Date(latest.ts).toLocaleString()}\n\n${latest.summary}\n\nDepartment scores:\n${latest.deptScores.map((d) => `${d.name}: ${d.score}/100`).join("\n")}`;
    downloadTextFile(`vantage-report-${latest.range.replace(/\s+/g, "-").toLowerCase()}.txt`, text);
    showToast("Report exported.");
  };

  return (
    <ViewWrap title="Analytics & Reporting" subtitle="One consolidated view across every agent, built from live workspace data.">
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <select value={range} onChange={(e) => setRange(e.target.value)} className="vantage-focus" style={{ padding: "9px 12px", borderRadius: 10, border: `1.5px solid ${C.line}`, fontSize: 13.5 }}>
          {["This Week", "This Month", "This Quarter"].map((r) => <option key={r}>{r}</option>)}
        </select>
        <Btn variant="primary" onClick={generate} disabled={loading}>{loading ? "Generating…" : "Generate report"}</Btn>
        {generated && <Btn variant="ghost" onClick={exportReport}><FileDown size={14} /> Export latest report</Btn>}
      </div>

      {generated && latest && (
        <div className="anim-in" style={{ marginTop: 20 }}>
          <div className="vantage-grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
            {latest.kpis.map((k) => (
              <Card key={k.label} style={{ padding: 16 }}>
                <div style={{ fontSize: 12.5, color: C.inkFaint, fontWeight: 600 }}>{k.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, margin: "6px 0" }} className="font-mono">{k.display}</div>
                <Trend dir={k.trend} delta={k.delta} />
              </Card>
            ))}
          </div>
          <Card style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Performance by area (live)</div>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={latest.deptScores}>
                  <CartesianGrid stroke={C.line} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: C.inkFaint }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: C.inkFaint }} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Bar dataKey="score" fill={C.coral} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Summary — {latest.range}</div>
            <p style={{ fontSize: 14, lineHeight: 1.65, color: C.inkSoft }}>{latest.summary}</p>
          </Card>

          {state.reports.length > 1 && (
            <Card style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}><History size={15} /> Report history</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {state.reports.slice(1).map((r) => (
                  <div key={r.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "8px 10px", background: C.bg, borderRadius: 8 }}>
                    <span style={{ fontWeight: 600 }}>{r.range}</span>
                    <span style={{ color: C.inkFaint }}>{new Date(r.ts).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </ViewWrap>
  );
}
