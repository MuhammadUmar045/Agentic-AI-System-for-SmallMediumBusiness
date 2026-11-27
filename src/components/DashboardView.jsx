import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, Boxes, CheckCircle2,
  Clock3, PackagePlus, Plus, RefreshCw, ShoppingBag, Wallet,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { C } from "../data/constants.js";
import { useAppState } from "../context/AppStateContext.jsx";
import { financeListLedger, getWorkspace } from "../utils/api.js";
import { Card, Btn, Badge } from "./Primitives.jsx";

const EMPTY_WORKSPACE = {
  finance: { recs: [] }, inventory: [], pos: { sales: [] }, activity: [],
};
const POLL_INTERVAL_MS = 30_000;

function formatMoney(value, currency = "PKR") {
  return new Intl.NumberFormat("en-PK", {
    style: "currency", currency, maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function dateKey(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function activityTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function MetricCard({ label, value, detail, icon: Icon, tone = C.teal }) {
  return (
    <Card style={{ padding: 18, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: C.inkFaint, fontSize: 12, fontWeight: 700, letterSpacing: .35, textTransform: "uppercase" }}>{label}</div>
          <div className="font-mono" style={{ marginTop: 10, color: C.ink, fontSize: 25, lineHeight: 1.2, fontWeight: 700, overflowWrap: "anywhere" }}>{value}</div>
          <div style={{ color: C.inkSoft, fontSize: 12, marginTop: 7, minHeight: 17 }}>{detail}</div>
        </div>
        <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 12, display: "grid", placeItems: "center", background: `${tone}14`, color: tone }}>
          <Icon size={19} />
        </div>
      </div>
    </Card>
  );
}

function EmptyPanel({ icon: Icon, title, detail, action, onAction }) {
  return (
    <div style={{ padding: "34px 18px", textAlign: "center", display: "grid", justifyItems: "center", gap: 10 }}>
      <div style={{ width: 42, height: 42, borderRadius: 14, background: C.bg, display: "grid", placeItems: "center", color: C.inkSoft }}><Icon size={20} /></div>
      <div style={{ fontWeight: 700, fontSize: 14, color: C.ink }}>{title}</div>
      <div style={{ color: C.inkSoft, fontSize: 13, lineHeight: 1.55, maxWidth: 440 }}>{detail}</div>
      {action && <Btn variant="ghost" size="sm" onClick={onAction}><Plus size={14} />{action}</Btn>}
    </div>
  );
}

export default function DashboardView({ showToast, onNavigate, business = "", role = "owner" }) {
  const { dispatch } = useAppState();
  const canSeeFinance = role === "owner" || role === "manager";
  const [workspace, setWorkspace] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [ledgerReady, setLedgerReady] = useState(!canSeeFinance);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setLoadError("");
    try {
      const [workspaceResponse, ledgerResponse] = await Promise.all([
        getWorkspace(),
        canSeeFinance ? financeListLedger({ limit: 500 }).catch((error) => ({ __error: error })) : Promise.resolve(null),
      ]);
      const nextWorkspace = workspaceResponse?.state || {};
      setWorkspace(nextWorkspace);
      if (canSeeFinance) {
        if (ledgerResponse?.__error) {
          setLedgerReady(false);
          setLoadError("Financial records could not be refreshed. Retry to load current figures.");
        } else {
          setLedger(Array.isArray(ledgerResponse) ? ledgerResponse.filter((entry) => !entry.is_voided) : []);
          setLedgerReady(true);
        }
      }
      setUpdatedAt(new Date());
    } catch (error) {
      setLoadError(error?.message || "Could not load your workspace. Check your connection and retry.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canSeeFinance]);

  useEffect(() => {
    let active = true;
    const runRefresh = async (options) => {
      if (active) await refresh(options);
    };
    runRefresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") runRefresh({ quiet: true });
    }, POLL_INTERVAL_MS);
    const onFocus = () => runRefresh({ quiet: true });
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const data = workspace ? {
    ...EMPTY_WORKSPACE,
    ...workspace,
    finance: { ...EMPTY_WORKSPACE.finance, ...(workspace.finance || {}) },
    pos: { ...EMPTY_WORKSPACE.pos, ...(workspace.pos || {}) },
    inventory: Array.isArray(workspace.inventory) ? workspace.inventory : [],
    activity: Array.isArray(workspace.activity) ? workspace.activity : [],
  } : EMPTY_WORKSPACE;

  const summary = useMemo(() => {
    const now = new Date();
    const thisMonth = monthKey(now);
    const priorDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const priorMonth = `${priorDate.getFullYear()}-${String(priorDate.getMonth() + 1).padStart(2, "0")}`;
    const monthTotals = (month) => ledger.reduce((totals, row) => {
      if (!String(row.entry_date || "").startsWith(month)) return totals;
      if (row.entry_type === "revenue") totals.revenue += Number(row.amount) || 0;
      if (row.entry_type === "expense") totals.expenses += Number(row.amount) || 0;
      return totals;
    }, { revenue: 0, expenses: 0 });
    const current = monthTotals(thisMonth);
    const previous = monthTotals(priorMonth);
    const inventory = data.inventory;
    const lowStock = inventory.filter((item) => !item.reordered && Number(item.stock ?? item.quantity ?? 0) < Number(item.threshold ?? item.reorder_level ?? 0));

    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start = new Date(end);
    start.setDate(start.getDate() - 13);
    const byDate = new Map();
    for (let i = 0; i < 14; i += 1) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      const key = dateKey(day);
      byDate.set(key, { date: key, label: new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(day), revenue: 0, expenses: 0 });
    }
    ledger.forEach((row) => {
      const key = dateKey(row.entry_date);
      const point = byDate.get(key);
      if (!point) return;
      if (row.entry_type === "revenue") point.revenue += Number(row.amount) || 0;
      if (row.entry_type === "expense") point.expenses += Number(row.amount) || 0;
    });
    const chartData = [...byDate.values()];
    const hasChartData = chartData.some((point) => point.revenue !== 0 || point.expenses !== 0);

    return {
      revenue: current.revenue,
      expenses: current.expenses,
      profit: current.revenue - current.expenses,
      previous,
      inventoryCount: inventory.length,
      lowStock,
      chartData,
      hasChartData,
      activity: data.activity
        .filter((entry) => !(entry.agent === "system" && String(entry.text || "").startsWith("Workspace initialized for ")))
        .sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0))
        .slice(0, 6),
      recommendations: (data.finance.recs || []).filter((item) => item.status === "pending"),
    };
  }, [data, ledger]);

  const money = (amount) => formatMoney(amount, data.currency || "PKR");
  const percentChange = (current, previous) => {
    if (!previous) return null;
    const change = ((current - previous) / Math.abs(previous)) * 100;
    return `${change >= 0 ? "+" : ""}${change.toFixed(0)}% vs last month`;
  };
  const today = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date());
  const noDataYet = canSeeFinance && ledgerReady && ledger.length === 0 && data.inventory.length === 0;
  const pendingCount = summary.recommendations.length;
  const handleAddInventory = () => onNavigate?.("inventory");
  const handleAddTransaction = () => onNavigate?.("transactions");

  const approveAll = () => {
    summary.recommendations.forEach((recommendation) => dispatch({ type: "APPROVE_REC", id: recommendation.id }));
    if (summary.recommendations.length) showToast?.(`Approved ${summary.recommendations.length} recommendation(s)`);
  };

  if (loading && !workspace) {
    return (
      <div className="vantage-scroll" style={{ padding: "32px 24px", height: "calc(100vh - 61px)" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <h1 className="font-display" style={{ margin: "0 0 6px", fontSize: 28 }}>Loading your dashboard</h1>
          <p style={{ margin: 0, color: C.inkSoft, fontSize: 13 }}>Fetching the latest records for {business || "your workspace"}…</p>
          <div className="vantage-grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginTop: 26 }}>
            {[0, 1, 2, 3].map((key) => <div key={key} style={{ height: 116, borderRadius: 16, border: `1px solid ${C.line}`, background: "linear-gradient(100deg,#f6f7fa 30%,#fff 50%,#f6f7fa 70%)", backgroundSize: "200% 100%", animation: "shimmer 1.6s linear infinite" }} />)}
          </div>
        </div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="vantage-scroll" style={{ padding: "32px 24px", height: "calc(100vh - 61px)" }}>
        <div style={{ maxWidth: 780, margin: "40px auto" }}>
          <Card><EmptyPanel icon={AlertTriangle} title="Your dashboard could not connect" detail={loadError || "We couldn't retrieve your saved workspace."} action="Try again" onAction={() => refresh()} /></Card>
        </div>
      </div>
    );
  }

  return (
    <div className="anim-in vantage-scroll" style={{ padding: "30px 24px 42px", overflowY: "auto", height: "calc(100vh - 61px)" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
          <div>
            <div style={{ color: C.teal, fontSize: 11, fontWeight: 800, letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 5 }}>Business overview</div>
          <h1 className="font-display" style={{ fontSize: 29, fontWeight: 600, margin: 0 }}>{business ? `Welcome to ${business}` : "Your business at a glance"}</h1>
            <p style={{ fontSize: 13, color: C.inkSoft, margin: "7px 0 0" }}>{today}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ color: C.inkFaint, fontSize: 11, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, background: loadError ? C.amber : "#1DA883", boxShadow: loadError ? "none" : "0 0 0 3px #1DA88322" }} />
              {updatedAt ? `Database sync · ${updatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Waiting for database"}
            </span>
            <Btn variant="ghost" size="sm" disabled={refreshing} onClick={() => refresh({ quiet: true })}><RefreshCw size={14} className={refreshing ? "spin" : ""} /> Refresh</Btn>
          </div>
        </header>

        {loadError && <div role="status" style={{ padding: "10px 14px", borderRadius: 10, background: C.amberSoft, color: C.amberDeep, fontSize: 12, marginBottom: 16 }}>{loadError}</div>}

        {noDataYet && (
          <Card style={{ marginBottom: 18, padding: "22px 24px", background: "linear-gradient(115deg,#14243d,#1b3853)", color: "#fff", border: "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div style={{ width: 46, height: 46, flexShrink: 0, borderRadius: 15, background: "rgba(255,255,255,.1)", display: "grid", placeItems: "center", color: "#f6bf50" }}><ShoppingBag size={22} /></div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>Your workspace is ready</div>
                <div style={{ color: "rgba(255,255,255,.7)", fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>This dashboard will fill in as your business records arrive. Add your first items or transaction to begin.</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Btn variant="amber" size="sm" onClick={handleAddInventory}><PackagePlus size={14} /> Add inventory</Btn>
                <Btn variant="ghostLight" size="sm" onClick={handleAddTransaction}><Plus size={14} /> Record transaction</Btn>
              </div>
            </div>
          </Card>
        )}

        <section aria-label="Business metrics" className="vantage-grid-4" style={{ display: "grid", gridTemplateColumns: `repeat(${canSeeFinance ? 4 : 2}, minmax(0, 1fr))`, gap: 14, marginBottom: 18 }}>
          {canSeeFinance && <>
            <MetricCard label="Revenue this month" value={ledgerReady ? money(summary.revenue) : "—"} detail={ledgerReady ? (percentChange(summary.revenue, summary.previous.revenue) || (summary.revenue ? "Recorded revenue" : "No revenue recorded yet")) : "Financial data unavailable"} icon={Wallet} tone="#16877f" />
            <MetricCard label="Expenses this month" value={ledgerReady ? money(summary.expenses) : "—"} detail={ledgerReady ? (percentChange(summary.expenses, summary.previous.expenses) || (summary.expenses ? "Recorded expenses" : "No expenses recorded yet")) : "Financial data unavailable"} icon={ArrowDownRight} tone="#d28b23" />
            <MetricCard label="Net this month" value={ledgerReady ? money(summary.profit) : "—"} detail={ledgerReady ? "Revenue minus recorded expenses" : "Financial data unavailable"} icon={summary.profit >= 0 ? ArrowUpRight : ArrowDownRight} tone={summary.profit >= 0 ? "#16877f" : C.coral} />
          </>}
          <MetricCard label="Inventory tracked" value={summary.inventoryCount.toLocaleString()} detail={summary.inventoryCount ? `${summary.lowStock.length} below reorder level` : "No items added yet"} icon={Boxes} tone="#6476b8" />
          {!canSeeFinance && <MetricCard label="Items needing restock" value={summary.lowStock.length.toLocaleString()} detail={summary.lowStock.length ? "Below reorder level" : "No low stock items"} icon={AlertTriangle} tone={summary.lowStock.length ? C.amber : "#16877f"} />}
        </section>

        <section className="vantage-grid-2" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.55fr) minmax(280px, 1fr)", gap: 16 }}>
          <Card style={{ minWidth: 0, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 750 }}>Revenue & expenses</h2>
                <div style={{ color: C.inkFaint, fontSize: 12, marginTop: 4 }}>Daily totals · last 14 days · from saved ledger entries</div>
              </div>
              {ledgerReady && <Badge tone={summary.hasChartData ? "ok" : "neutral"}>{summary.hasChartData ? "Live ledger" : "No records yet"}</Badge>}
            </div>
            {!canSeeFinance ? (
              <EmptyPanel icon={BarChart3} title="Financial overview is private" detail="Your role doesn't have permission to view this business's financial records." />
            ) : !ledgerReady ? (
              <EmptyPanel icon={RefreshCw} title="Financial data unavailable" detail="The current ledger could not be loaded. Retry to fetch the latest totals." action="Retry" onAction={() => refresh({ quiet: true })} />
            ) : !summary.hasChartData ? (
              <EmptyPanel icon={BarChart3} title="No transactions in this period" detail="When revenue or expense entries are recorded, their daily totals will appear here." action="Record a transaction" onAction={handleAddTransaction} />
            ) : (
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={summary.chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="dashboardRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.teal} stopOpacity={.23} /><stop offset="95%" stopColor={C.teal} stopOpacity={0} /></linearGradient>
                      <linearGradient id="dashboardExpenses" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.amber} stopOpacity={.2} /><stop offset="95%" stopColor={C.amber} stopOpacity={0} /></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 5" vertical={false} stroke={C.line} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.inkFaint }} axisLine={false} tickLine={false} minTickGap={22} />
                    <YAxis tick={{ fontSize: 11, fill: C.inkFaint }} axisLine={false} tickLine={false} tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value} />
                    <Tooltip formatter={(value, name) => [money(value), name === "revenue" ? "Revenue" : "Expenses"]} labelStyle={{ color: C.ink }} contentStyle={{ borderRadius: 12, border: `1px solid ${C.line}`, boxShadow: "0 8px 22px #10182816" }} />
                    <Area type="monotone" dataKey="revenue" name="revenue" stroke={C.teal} strokeWidth={2.5} fill="url(#dashboardRevenue)" activeDot={{ r: 5 }} />
                    <Area type="monotone" dataKey="expenses" name="expenses" stroke={C.amber} strokeWidth={2} fill="url(#dashboardExpenses)" activeDot={{ r: 5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <Card style={{ minWidth: 0, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 750 }}>Inventory attention</h2>
                <div style={{ color: C.inkFaint, fontSize: 12, marginTop: 4 }}>Based on items in your workspace</div>
              </div>
              {summary.lowStock.length > 0 && <Badge tone="low">{summary.lowStock.length} low</Badge>}
            </div>
            {data.inventory.length === 0 ? (
              <EmptyPanel icon={Boxes} title="No inventory recorded" detail="Add your catalog to track stock and reorder levels." action="Add first item" onAction={handleAddInventory} />
            ) : summary.lowStock.length === 0 ? (
              <div style={{ padding: "26px 12px", textAlign: "center" }}><CheckCircle2 size={23} color="#16877f" /><div style={{ fontWeight: 700, fontSize: 14, marginTop: 10 }}>No items below reorder level</div><div style={{ fontSize: 12, color: C.inkFaint, marginTop: 5 }}>All {data.inventory.length} tracked items are above their recorded threshold.</div></div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {summary.lowStock.slice(0, 5).map((item) => (
                  <div key={item.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 11px", border: `1px solid ${C.line}`, borderRadius: 11 }}>
                    <div style={{ minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div><div style={{ color: C.inkFaint, fontSize: 11, marginTop: 3 }}>Reorder at {Number(item.threshold ?? item.reorder_level ?? 0).toLocaleString()}</div></div>
                    <span style={{ color: C.amberDeep, fontSize: 12, whiteSpace: "nowrap", fontWeight: 750 }}>{Number(item.stock ?? item.quantity ?? 0).toLocaleString()} left</span>
                  </div>
                ))}
                {onNavigate && <button className="vantage-focus" onClick={handleAddInventory} style={{ justifySelf: "start", border: 0, background: "none", color: C.teal, padding: "8px 2px", fontSize: 12, fontWeight: 700 }}>Open inventory →</button>}
              </div>
            )}
          </Card>

          <Card style={{ minWidth: 0, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <div><h2 style={{ margin: 0, fontSize: 15, fontWeight: 750 }}>Recent activity</h2><div style={{ color: C.inkFaint, fontSize: 12, marginTop: 4 }}>Saved workspace activity</div></div>
              <Clock3 size={16} color={C.inkFaint} />
            </div>
            {summary.activity.length === 0 ? (
              <EmptyPanel icon={Clock3} title="No activity recorded" detail="Actions you take in your workspace will appear here." />
            ) : <div style={{ display: "grid", gap: 13 }}>
              {summary.activity.map((entry) => <div key={entry.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ width: 8, height: 8, marginTop: 5, flexShrink: 0, borderRadius: 99, background: entry.agent === "finance" ? C.teal : entry.agent === "inventory" ? C.amber : C.inkFaint }} />
                <div style={{ minWidth: 0, flex: 1 }}><div style={{ color: C.ink, fontSize: 12, lineHeight: 1.5 }}>{entry.text}</div><div style={{ color: C.inkFaint, fontSize: 10.5, marginTop: 3 }}>{activityTime(entry.ts)}</div></div>
              </div>)}
            </div>}
          </Card>

          {canSeeFinance && <Card style={{ minWidth: 0, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <div><h2 style={{ margin: 0, fontSize: 15, fontWeight: 750 }}>Pending recommendations</h2><div style={{ color: C.inkFaint, fontSize: 12, marginTop: 4 }}>From your saved finance workspace</div></div>
              {pendingCount > 0 && <Badge tone="info">{pendingCount}</Badge>}
            </div>
            {!pendingCount ? <EmptyPanel icon={CheckCircle2} title="No pending recommendations" detail="Recommendations will appear here when they have been saved for this workspace." /> : <>
              <div style={{ display: "grid", gap: 9 }}>
                {summary.recommendations.slice(0, 3).map((recommendation) => <div key={recommendation.id} style={{ border: `1px solid ${C.line}`, borderRadius: 11, padding: "11px 12px" }}><div style={{ fontSize: 13, fontWeight: 650 }}>{recommendation.title}</div>{recommendation.detail && <div style={{ fontSize: 11.5, color: C.inkSoft, lineHeight: 1.45, marginTop: 4 }}>{recommendation.detail}</div>}</div>)}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}><Btn variant="ghost" size="sm" onClick={() => onNavigate?.("finance")}>Review finance</Btn><Btn variant="subtle" size="sm" onClick={approveAll}>Approve all</Btn></div>
            </>}
          </Card>}
        </section>
      </div>
    </div>
  );
}
