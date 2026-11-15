import React, { useMemo } from "react";
import { TrendingUp, TrendingDown, CheckCircle2, AlertTriangle, Clock, Zap, Store } from "lucide-react";
import { C, AGENTS } from "../data/constants.js";
import { useAppState } from "../context/AppStateContext.jsx";
import { OrgChartVisual } from "./Landing.jsx";
import { Card, Btn, Badge } from "./Primitives.jsx";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid,
  AreaChart, Area,
} from "recharts";

function KpiCard({ label, value, suffix, trend, delta, sparkData, sparkKey, sparkColor }) {
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.inkFaint, textTransform: "uppercase", letterSpacing: .4, marginBottom: 6 }}>{label}</div>
          <div className="font-mono" style={{ fontSize: 26, fontWeight: 700, color: C.ink, marginBottom: 4 }}>
            {value}{suffix && <span style={{ fontSize: 14, fontWeight: 500, color: C.inkSoft }}>{suffix}</span>}
          </div>
          {trend && delta && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color: trend === "up" ? "#0A7873" : C.coral }}>
              {trend === "up" ? <TrendingUp size={13} /> : <TrendingDown size={13} />} {delta}
            </span>
          )}
        </div>
        {sparkData && sparkData.length > 0 && (
          <div style={{ width: 80, height: 40, flexShrink: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                <defs>
                  <linearGradient id={`spark-${sparkKey}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={sparkColor || C.teal} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={sparkColor || C.teal} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke={sparkColor || C.teal} strokeWidth={1.5} fill={`url(#spark-${sparkKey})`} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Card>
  );
}

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

export default function DashboardView({ showToast, onNavigate }) {
  const { state, dispatch, derived } = useAppState();

  const kpis = useMemo(() => {
    const rev = state.finance.kpis.find((k) => k.key === "revenue");
    const profit = state.finance.kpis.find((k) => k.key === "profit");
    const stockHealth = Math.round((state.inventory.length - derived.lowStock.length) / Math.max(1, state.inventory.length) * 100);
    return { rev, profit, stockHealth };
  }, [state.finance.kpis, state.inventory, derived.lowStock]);

  const revenueSparkData = useMemo(() =>
    state.finance.series.filter((s) => s.revenue != null).map((s) => ({ v: s.revenue })),
  [state.finance.series]);

  const profitSpark = useMemo(() => {
    const base = state.finance.kpis.find((k) => k.key === "profit")?.value || 0;
    return [{ v: base * 0.7 }, { v: base * 0.85 }, { v: base * 0.78 }, { v: base * 0.92 }, { v: base * 0.88 }, { v: base }];
  }, [state.finance.kpis]);

  const pendingCount = derived.pendingRecs.length;
  const lowStockCount = derived.lowStock.length;
  const unsentCount = derived.unsentDrafts.length;
  const allClear = pendingCount === 0 && lowStockCount === 0 && unsentCount === 0;

  const approveAll = () => {
    derived.pendingRecs.forEach((r) => dispatch({ type: "APPROVE_REC", id: r.id }));
    if (showToast) showToast(`Approved ${pendingCount} recommendation(s)`);
  };
  const reorderAll = () => {
    derived.lowStock.filter((i) => !i.reordered).forEach((i) => dispatch({ type: "PLACE_REORDER", id: i.id }));
    if (showToast) showToast(`Reordered ${lowStockCount} item(s)`);
  };
  const sendAll = () => {
    derived.unsentDrafts.forEach((d) => dispatch({ type: "SEND_DRAFT", id: d.id }));
    if (showToast) showToast(`Sent ${unsentCount} draft(s)`);
  };

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="anim-in vantage-scroll" style={{ padding: "28px 24px", overflowY: "auto", height: "calc(100vh - 61px)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
          <div>
            <h1 className="font-display" style={{ fontSize: 26, fontWeight: 600, marginBottom: 4 }}>Dashboard</h1>
            <p style={{ fontSize: 13, color: C.inkSoft, margin: 0 }}>{today}</p>
          </div>
          {(pendingCount > 0 || lowStockCount > 0) && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: C.amberSoft, padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 600, color: C.amberDeep }}>
              <AlertTriangle size={13} /> {pendingCount + lowStockCount} item(s) need attention
            </div>
          )}
        </div>

        {/* KPI Row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 22 }} className="vantage-grid-4">
          <KpiCard label="Revenue (MTD)" value={kpis.rev?.display || "\u2014"} trend={kpis.rev?.trend} delta={kpis.rev?.delta} sparkData={revenueSparkData} sparkKey="rev" sparkColor={C.teal} />
          <KpiCard label="Net Profit" value={kpis.profit?.display || "\u2014"} trend={kpis.profit?.trend} delta={kpis.profit?.delta} sparkData={profitSpark} sparkKey="profit" sparkColor="#0A7873" />
          <KpiCard label="Cash Runway" value={derived.runway.toFixed(1)} suffix=" months" trend="up" delta={state.finance.runwayAdjustment > 0 ? `+${state.finance.runwayAdjustment.toFixed(1)}` : null} />
          <KpiCard label="Stock Health" value={kpis.stockHealth} suffix="%" trend={kpis.stockHealth >= 80 ? "up" : "down"} delta={kpis.stockHealth >= 80 ? "Healthy" : `${lowStockCount} low`} />
        </div>

        {/* Main Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 18 }} className="vantage-grid-2">
          {/* Left Column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {/* Department Health Chart */}
            <Card>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Department Health</div>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={derived.deptScores} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EEF0F6" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: C.inkFaint }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: C.inkFaint }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 10, border: `1px solid ${C.line}`, fontSize: 13 }} />
                    <Bar dataKey="score" radius={[6, 6, 0, 0]} fill={C.teal} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Quick Actions */}
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Quick Actions</div>
                {onNavigate && (
                  <Btn variant="subtle" size="sm" onClick={() => onNavigate("pos")}>
                    <Store size={14} /> Open POS Register
                  </Btn>
                )}
              </div>
              {allClear ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#0A7873", fontSize: 14, fontWeight: 600 }}>
                  <CheckCircle2 size={18} /> All clear &mdash; no pending actions across any agent.
                </div>
              ) : (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {pendingCount > 0 && (
                    <Btn variant="ghost" size="sm" onClick={approveAll}>
                      <Zap size={14} /> Approve all pending <Badge tone="low">{pendingCount}</Badge>
                    </Btn>
                  )}
                  {lowStockCount > 0 && (
                    <Btn variant="ghost" size="sm" onClick={reorderAll}>
                      <Zap size={14} /> Reorder low stock <Badge tone="critical">{lowStockCount}</Badge>
                    </Btn>
                  )}
                  {unsentCount > 0 && (
                    <Btn variant="ghost" size="sm" onClick={sendAll}>
                      <Zap size={14} /> Send all drafts <Badge tone="info">{unsentCount}</Badge>
                    </Btn>
                  )}
                </div>
              )}
            </Card>
          </div>

          {/* Right Column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {/* Agent Network */}
            <div style={{ background: C.navyDeep, borderRadius: 16, padding: "20px 20px 10px", border: "none" }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#fff", marginBottom: 8 }}>Agent Network</div>
              <OrgChartVisual compact darkMode />
            </div>

            {/* Activity Feed */}
            <Card style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Recent Activity</div>
                <span style={{ fontSize: 11, color: C.inkFaint, display: "inline-flex", alignItems: "center", gap: 4 }}><Clock size={11} /> Live</span>
              </div>
              {state.activity.length === 0 ? (
                <div style={{ color: C.inkFaint, fontSize: 13, textAlign: "center", padding: "20px 0" }}>No activity yet &mdash; start by approving a recommendation or reordering stock.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {state.activity.slice(0, 8).map((entry) => {
                    const agentMeta = AGENTS[entry.agent];
                    return (
                      <div key={entry.id} className="anim-in" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: agentMeta?.color || C.inkFaint, flexShrink: 0, marginTop: 5 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.45 }}>{entry.text}</div>
                          <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 2 }}>{relativeTime(entry.ts)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
