import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, Boxes,
  CheckCircle2, Clock3, CreditCard, PackagePlus, Plus, Receipt, RefreshCw,
  ShoppingBag, Sparkles, Store, TrendingUp, Users, Wallet,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { C } from "../data/constants.js";
import { useAppState } from "../context/AppStateContext.jsx";
import {
  financeGetMetrics, financeGetRecommendations, financeListLedger,
  getWorkspace, hrListEmployees, posListSales,
} from "../utils/api.js";
import { Badge, Btn, Card } from "./Primitives.jsx";

const EMPTY_WORKSPACE = {
  finance: { recs: [] }, inventory: [], pos: { sales: [] }, activity: [], customers: [],
};
const POLL_INTERVAL_MS = 30_000;
const RANGE_OPTIONS = [
  { id: "7d", label: "7D", days: 7 },
  { id: "14d", label: "14D", days: 14 },
  { id: "30d", label: "30D", days: 30 },
  { id: "mtd", label: "MTD", days: null },
];
const DONUT_COLORS = [C.teal, C.amber, C.navy, "#6476B8", C.coral, "#2D9C6F"];

function formatMoney(value, currency = "PKR") {
  return new Intl.NumberFormat("en-PK", {
    style: "currency", currency, maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function dateKey(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function activityTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function useAnimatedValue(target, duration = 550) {
  const numericTarget = Number(target) || 0;
  const [display, setDisplay] = useState(numericTarget);
  const prevRef = useRef(numericTarget);

  useEffect(() => {
    const prefersReduced = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (prefersReduced) {
      prevRef.current = numericTarget;
      setDisplay(numericTarget);
      return undefined;
    }

    const start = prevRef.current;
    const diff = numericTarget - start;
    if (Math.abs(diff) < 0.5) {
      prevRef.current = numericTarget;
      setDisplay(numericTarget);
      return undefined;
    }

    let frameId = 0;
    const startedAt = performance.now();
    const tick = (now) => {
      const elapsed = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - ((1 - elapsed) ** 3);
      const next = start + diff * eased;
      setDisplay(next);
      if (elapsed < 1) {
        frameId = requestAnimationFrame(tick);
      } else {
        prevRef.current = numericTarget;
        setDisplay(numericTarget);
      }
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [numericTarget, duration]);

  return display;
}

function HealthRing({ score, hasData }) {
  const clamped = hasData ? Math.max(0, Math.min(100, Math.round(Number(score) || 0))) : 0;
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const strokeColor = !hasData ? C.line : clamped >= 70 ? C.teal : clamped >= 45 ? C.amber : C.coral;

  return (
    <div style={{ position: "relative", width: 102, height: 102, flexShrink: 0 }}>
      <svg width="102" height="102" viewBox="0 0 102 102" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="51" cy="51" r={radius} fill="none" stroke="#EEF1F7" strokeWidth="9" />
        <circle
          cx="51"
          cy="51"
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset .8s cubic-bezier(.16,1,.3,1), stroke .3s ease" }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center",
      }}>
        <div>
          <div className="font-mono" style={{ fontSize: 21, fontWeight: 700, color: C.ink, lineHeight: 1 }}>
            {hasData ? clamped : "—"}
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.inkFaint, marginTop: 3, textTransform: "uppercase" }}>
            {hasData ? "/ 100" : "No data"}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label, rawValue, formatFn, detail, deltaText, deltaPositive,
  icon: Icon, tone = C.teal, sparkData = [], sparkKey = "value", index = 0,
}) {
  const animated = useAnimatedValue(rawValue ?? 0);
  const formatted = rawValue === null || rawValue === undefined ? "—" : formatFn(animated);
  const hasSpark = sparkData.some((d) => Number(d[sparkKey]) !== 0);
  const gradId = `spark-${label.replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <Card
      className="dash-card dash-stagger"
      style={{
        padding: 18,
        minWidth: 0,
        "--i": index,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            color: C.inkFaint, fontSize: 11.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
          }}>
            {label}
          </div>
          <div className="font-mono" style={{
            marginTop: 8, color: C.ink, fontSize: 24, lineHeight: 1.15, fontWeight: 700, overflowWrap: "anywhere",
          }}>
            {formatted}
          </div>
        </div>
        <div style={{
          width: 38, height: 38, flexShrink: 0, borderRadius: 11,
          display: "grid", placeItems: "center", background: `${tone}15`, color: tone,
        }}>
          <Icon size={18} />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8, minHeight: 32 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          {deltaText && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 3, width: "fit-content",
              fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
              background: deltaPositive ? C.tealSoft : C.coralSoft,
              color: deltaPositive ? "#0A7873" : C.coral,
            }}>
              {deltaPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              {deltaText}
            </span>
          )}
          <div style={{ color: C.inkSoft, fontSize: 11.5, lineHeight: 1.35 }}>{detail}</div>
        </div>

        {hasSpark && (
          <div style={{ width: 78, height: 32, flexShrink: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={tone} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={tone} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey={sparkKey}
                  stroke={tone}
                  strokeWidth={2}
                  fill={`url(#${gradId})`}
                  isAnimationActive={true}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Card>
  );
}

function EmptyPanel({ icon: Icon, title, detail, action, onAction }) {
  return (
    <div style={{
      padding: "28px 16px", textAlign: "center", display: "grid", justifyItems: "center", gap: 9,
      borderRadius: 12, background: "#FAFBFD", border: `1px dashed ${C.line}`,
    }}>
      <div style={{
        width: 42, height: 42, borderRadius: 13, background: "#fff", border: `1px solid ${C.line}`,
        display: "grid", placeItems: "center", color: C.teal,
      }}>
        <Icon size={20} />
      </div>
      <div style={{ fontWeight: 700, fontSize: 14, color: C.ink }}>{title}</div>
      <div style={{ color: C.inkSoft, fontSize: 12.5, lineHeight: 1.55, maxWidth: 380 }}>{detail}</div>
      {action && <Btn variant="ghost" size="sm" onClick={onAction}><Plus size={14} />{action}</Btn>}
    </div>
  );
}

function CustomChartTooltip({ active, payload, label, currency }) {
  if (!active || !payload?.length) return null;
  const rev = Number(payload.find((p) => p.dataKey === "revenue")?.value || 0);
  const exp = Number(payload.find((p) => p.dataKey === "expenses")?.value || 0);
  const net = rev - exp;
  return (
    <div style={{
      background: C.navyDeep, color: "#fff", padding: "10px 13px", borderRadius: 11,
      boxShadow: "0 12px 28px rgba(19,26,44,.25)", fontSize: 12, minWidth: 165,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: "rgba(255,255,255,.75)", fontSize: 11 }}>{label}</div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, marginBottom: 3 }}>
        <span style={{ color: "#5CE0D8" }}>Revenue</span>
        <span className="font-mono" style={{ fontWeight: 600 }}>{formatMoney(rev, currency)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, marginBottom: 5 }}>
        <span style={{ color: "#F6BF50" }}>Expenses</span>
        <span className="font-mono" style={{ fontWeight: 600 }}>{formatMoney(exp, currency)}</span>
      </div>
      <div style={{
        display: "flex", justifyContent: "space-between", gap: 14, paddingTop: 5,
        borderTop: "1px solid rgba(255,255,255,.14)", fontWeight: 700,
      }}>
        <span>Net</span>
        <span className="font-mono" style={{ color: net >= 0 ? "#5CE0D8" : "#FF8A80" }}>
          {formatMoney(net, currency)}
        </span>
      </div>
    </div>
  );
}

export default function DashboardView({ showToast, onNavigate, business = "", role = "owner" }) {
  const { dispatch } = useAppState();
  const canSeeFinance = role === "owner" || role === "manager";
  const canSeeHR = role === "owner" || role === "manager" || role === "hr_officer";

  const [workspace, setWorkspace] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [dbRecs, setDbRecs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [posSales, setPosSales] = useState([]);
  const [ledgerReady, setLedgerReady] = useState(!canSeeFinance);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);

  const [range, setRange] = useState("14d");
  const [chartType, setChartType] = useState("area");

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setLoadError("");

    try {
      const [
        workspaceResponse,
        ledgerResponse,
        metricsResponse,
        recsResponse,
        employeesResponse,
        salesResponse,
      ] = await Promise.all([
        getWorkspace(),
        canSeeFinance ? financeListLedger({ limit: 500 }).catch((e) => ({ __error: e })) : Promise.resolve(null),
        canSeeFinance ? financeGetMetrics().catch(() => null) : Promise.resolve(null),
        canSeeFinance ? financeGetRecommendations().catch(() => []) : Promise.resolve([]),
        canSeeHR ? hrListEmployees().catch(() => []) : Promise.resolve([]),
        posListSales(100).catch(() => []),
      ]);

      setWorkspace(workspaceResponse?.state || {});
      if (canSeeFinance) {
        if (ledgerResponse?.__error) {
          setLedgerReady(false);
          setLoadError("Financial records could not be refreshed. Retry to load current figures.");
        } else {
          setLedger(Array.isArray(ledgerResponse) ? ledgerResponse.filter((entry) => !entry.is_voided) : []);
          setLedgerReady(true);
        }
        setMetrics(metricsResponse || null);
        setDbRecs(Array.isArray(recsResponse) ? recsResponse : []);
      }
      if (canSeeHR) {
        setEmployees(Array.isArray(employeesResponse) ? employeesResponse : []);
      }
      setPosSales(Array.isArray(salesResponse) ? salesResponse : []);
      setUpdatedAt(new Date());
    } catch (error) {
      setLoadError(error?.message || "Could not load your workspace. Check your connection and retry.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canSeeFinance, canSeeHR]);

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

  const data = useMemo(() => (workspace ? {
    ...EMPTY_WORKSPACE,
    ...workspace,
    finance: { ...EMPTY_WORKSPACE.finance, ...(workspace.finance || {}) },
    pos: { ...EMPTY_WORKSPACE.pos, ...(workspace.pos || {}) },
    inventory: Array.isArray(workspace.inventory) ? workspace.inventory : [],
    activity: Array.isArray(workspace.activity) ? workspace.activity : [],
  } : EMPTY_WORKSPACE), [workspace]);

  const summary = useMemo(() => {
    const now = new Date();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const activeOpt = RANGE_OPTIONS.find((r) => r.id === range) || RANGE_OPTIONS[1];

    const periodStart = activeOpt.days
      ? new Date(todayEnd.getFullYear(), todayEnd.getMonth(), todayEnd.getDate() - (activeOpt.days - 1))
      : new Date(todayEnd.getFullYear(), todayEnd.getMonth(), 1);
    const spanDays = Math.max(1, Math.round((todayEnd - periodStart) / 86400000) + 1);
    const prevEnd = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate() - 1);
    const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), prevEnd.getDate() - (spanDays - 1));

    const startKey = dateKey(periodStart);
    const endKey = dateKey(todayEnd);
    const prevStartKey = dateKey(prevStart);
    const prevEndKey = dateKey(prevEnd);

    let revenue = 0;
    let expenses = 0;
    let prevRevenue = 0;
    let prevExpenses = 0;
    const expenseByCategory = new Map();

    const byDate = new Map();
    for (let i = 0; i < spanDays; i += 1) {
      const d = new Date(periodStart);
      d.setDate(periodStart.getDate() + i);
      const k = dateKey(d);
      byDate.set(k, {
        date: k,
        label: new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(d),
        revenue: 0,
        expenses: 0,
        net: 0,
      });
    }

    ledger.forEach((row) => {
      const k = dateKey(row.entry_date);
      const amt = Number(row.amount) || 0;
      if (!k) return;

      if (k >= startKey && k <= endKey) {
        if (row.entry_type === "revenue") revenue += amt;
        if (row.entry_type === "expense") {
          expenses += amt;
          const cat = row.category || "General";
          expenseByCategory.set(cat, (expenseByCategory.get(cat) || 0) + amt);
        }
        const pt = byDate.get(k);
        if (pt) {
          if (row.entry_type === "revenue") pt.revenue += amt;
          if (row.entry_type === "expense") pt.expenses += amt;
          pt.net = pt.revenue - pt.expenses;
        }
      } else if (k >= prevStartKey && k <= prevEndKey) {
        if (row.entry_type === "revenue") prevRevenue += amt;
        if (row.entry_type === "expense") prevExpenses += amt;
      }
    });

    const chartData = [...byDate.values()];
    const hasChartData = chartData.some((p) => p.revenue !== 0 || p.expenses !== 0);
    const expenseBreakdown = [...expenseByCategory.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    const inventory = data.inventory;
    const lowStock = inventory.filter(
      (item) => !item.reordered && Number(item.stock ?? item.quantity ?? 0) < Number(item.threshold ?? item.reorder_level ?? 0)
    );

    // Combine DB pos_sales + workspace pos.sales (dedup by invoice)
    const seenInvoices = new Set();
    const mergedSales = [];
    [...posSales, ...(data.pos.sales || [])].forEach((s) => {
      const inv = s.invoice_number || s.id;
      if (inv && seenInvoices.has(inv)) return;
      if (inv) seenInvoices.add(inv);
      mergedSales.push(s);
    });
    mergedSales.sort((a, b) => new Date(b.created_at || b.ts || 0) - new Date(a.created_at || a.ts || 0));

    // Merge DB financial recommendations & workspace recs
    const wsRecs = (data.finance.recs || []).filter((r) => r.status === "pending");
    const dbPendingRecs = dbRecs.filter((r) => r.status === "pending").map((r) => ({
      id: r.id,
      title: r.title,
      detail: r.detail,
      fromDb: true,
    }));
    const recommendations = [...dbPendingRecs, ...wsRecs];

    return {
      revenue,
      expenses,
      profit: revenue - expenses,
      prevRevenue,
      prevExpenses,
      prevProfit: prevRevenue - prevExpenses,
      marginPct: revenue > 0 ? ((revenue - expenses) / revenue) * 100 : 0,
      chartData,
      hasChartData,
      expenseBreakdown,
      inventoryCount: inventory.length,
      lowStock,
      recentSales: mergedSales.slice(0, 5),
      totalSalesCount: mergedSales.length,
      activeEmployees: employees.filter((e) => (e.employment_status || "active") === "active").length,
      activity: data.activity
        .filter((entry) => !(entry.agent === "system" && String(entry.text || "").startsWith("Workspace initialized for ")))
        .sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0))
        .slice(0, 6),
      recommendations,
    };
  }, [data, ledger, posSales, employees, dbRecs, range]);

  const currency = data.currency || "PKR";
  const money = (amount) => formatMoney(amount, currency);
  const deltaInfo = (curr, prev) => {
    if (!prev) return null;
    const pct = ((curr - prev) / Math.abs(prev)) * 100;
    return {
      text: `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}% vs prior`,
      positive: pct >= 0,
    };
  };

  const revDelta = deltaInfo(summary.revenue, summary.prevRevenue);
  const expDelta = deltaInfo(summary.expenses, summary.prevExpenses);
  const netDelta = deltaInfo(summary.profit, summary.prevProfit);

  const todayLabel = new Intl.DateTimeFormat(undefined, {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  }).format(new Date());

  const onboardingSteps = [
    {
      id: "profile",
      title: "Business workspace created",
      done: Boolean(business),
      actionLabel: "Business setup",
      route: "business_setup",
    },
    {
      id: "inventory",
      title: "Add your first product",
      done: summary.inventoryCount > 0,
      actionLabel: "Add product",
      route: "inventory",
    },
    {
      id: "sale",
      title: "Record first sale or transaction",
      done: ledger.length > 0 || summary.totalSalesCount > 0,
      actionLabel: "Open POS",
      route: "pos",
    },
    {
      id: "team",
      title: "Add an employee or team member",
      done: summary.activeEmployees > 0,
      actionLabel: "Add employee",
      route: "hr_employees",
    },
  ];
  const completedSteps = onboardingSteps.filter((s) => s.done).length;
  const showOnboarding = completedSteps < onboardingSteps.length;
  const hasAnyFinanceData = ledger.length > 0;

  const approveAll = () => {
    const wsPending = (data.finance.recs || []).filter((r) => r.status === "pending");
    wsPending.forEach((rec) => dispatch({ type: "APPROVE_REC", id: rec.id }));
    if (wsPending.length) showToast?.(`Approved ${wsPending.length} recommendation(s)`);
    else onNavigate?.("finance");
  };

  if (loading && !workspace) {
    return (
      <div className="vantage-scroll" style={{ padding: "32px 24px", height: "calc(100vh - 61px)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <h1 className="font-display" style={{ margin: "0 0 6px", fontSize: 28 }}>Loading your dashboard</h1>
          <p style={{ margin: 0, color: C.inkSoft, fontSize: 13 }}>
            Syncing real-time records for {business || "your workspace"}…
          </p>
          <div className="vantage-grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginTop: 24 }}>
            {[0, 1, 2, 3].map((k) => (
              <div key={k} style={{
                height: 128, borderRadius: 16, border: `1px solid ${C.line}`,
                background: "linear-gradient(100deg,#f6f7fa 30%,#fff 50%,#f6f7fa 70%)",
                backgroundSize: "200% 100%", animation: "shimmer 1.6s linear infinite",
              }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="vantage-scroll" style={{ padding: "32px 24px", height: "calc(100vh - 61px)" }}>
        <div style={{ maxWidth: 780, margin: "40px auto" }}>
          <Card>
            <EmptyPanel
              icon={AlertTriangle}
              title="Your dashboard could not connect"
              detail={loadError || "We couldn't retrieve your saved workspace."}
              action="Try again"
              onAction={() => refresh()}
            />
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="anim-in vantage-scroll" style={{ padding: "28px 24px 44px", overflowY: "auto", height: "calc(100vh - 61px)" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        {/* Header */}
        <header style={{
          display: "flex", justifyContent: "space-between", alignItems: "flex-end",
          gap: 16, flexWrap: "wrap", marginBottom: 20,
        }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ color: C.teal, fontSize: 11, fontWeight: 800, letterSpacing: 1.1, textTransform: "uppercase" }}>
                Executive Overview
              </span>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600,
                padding: "2px 9px", borderRadius: 999, background: loadError ? C.amberSoft : "#E6F7F2",
                color: loadError ? C.amberDeep : "#0E8A6D",
              }}>
                <span className={loadError ? "" : "live-dot"} style={{
                  width: 6, height: 6, borderRadius: 99, background: loadError ? C.amber : "#1DA883",
                }} />
                {updatedAt ? `Live DB · ${updatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Syncing…"}
              </span>
            </div>
            <h1 className="font-display" style={{ fontSize: 28, fontWeight: 600, margin: 0 }}>
              {business ? `Welcome, ${business}` : "Your business at a glance"}
            </h1>
            <p style={{ fontSize: 13, color: C.inkSoft, margin: "5px 0 0" }}>{todayLabel}</p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div role="group" aria-label="Timeframe" style={{
              display: "inline-flex", background: "#fff", border: `1px solid ${C.line}`,
              borderRadius: 10, padding: 3, gap: 2,
            }}>
              {RANGE_OPTIONS.map((opt) => {
                const active = range === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setRange(opt.id)}
                    style={{
                      border: 0, borderRadius: 7, padding: "5px 11px", fontSize: 12, fontWeight: 700,
                      background: active ? C.navy : "transparent",
                      color: active ? "#fff" : C.inkSoft,
                      transition: "all .15s ease",
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <Btn variant="ghost" size="sm" disabled={refreshing} onClick={() => refresh({ quiet: true })}>
              <RefreshCw size={14} className={refreshing ? "spin" : ""} /> Refresh
            </Btn>
          </div>
        </header>

        {/* Quick Actions Strip */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          <Btn variant="primary" size="sm" onClick={() => onNavigate?.("pos")}><Store size={14} /> Open POS</Btn>
          <Btn variant="ghost" size="sm" onClick={() => onNavigate?.("inventory")}><PackagePlus size={14} /> Add Product</Btn>
          {canSeeFinance && (
            <Btn variant="ghost" size="sm" onClick={() => onNavigate?.("transactions")}><Receipt size={14} /> Log Transaction</Btn>
          )}
          <Btn variant="ghost" size="sm" onClick={() => onNavigate?.("chat")}><Sparkles size={14} color={C.teal} /> Ask AI Planner</Btn>
        </div>

        {loadError && (
          <div role="status" style={{
            padding: "10px 14px", borderRadius: 10, background: C.amberSoft,
            color: C.amberDeep, fontSize: 12, marginBottom: 16,
          }}>
            {loadError}
          </div>
        )}

        {/* Dynamic Onboarding Launchpad for New Stores */}
        {showOnboarding && (
          <Card className="dash-stagger" style={{
            marginBottom: 18, padding: "20px 22px", "--i": 0,
            background: "linear-gradient(120deg, #131A2C 0%, #1F3554 100%)",
            color: "#fff", border: "none",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 12, background: "rgba(255,255,255,.1)",
                  display: "grid", placeItems: "center", color: "#F6BF50", flexShrink: 0,
                }}>
                  <ShoppingBag size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15.5 }}>Launch your store in 4 steps</div>
                  <div style={{ color: "rgba(255,255,255,.7)", fontSize: 12.5, marginTop: 2 }}>
                    Every metric below updates live from your database as you add real business records.
                  </div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="font-mono" style={{ fontSize: 13, fontWeight: 700, color: "#5CE0D8" }}>
                  {completedSteps} of {onboardingSteps.length} completed
                </div>
                <div style={{
                  width: 140, height: 6, borderRadius: 99, background: "rgba(255,255,255,.14)",
                  overflow: "hidden", marginTop: 6,
                }}>
                  <div style={{
                    width: `${(completedSteps / onboardingSteps.length) * 100}%`,
                    height: "100%", background: "#5CE0D8", borderRadius: 99,
                    transition: "width .5s cubic-bezier(.16,1,.3,1)",
                  }} />
                </div>
              </div>
            </div>

            <div className="vantage-grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
              {onboardingSteps.map((step) => (
                <div key={step.id} style={{
                  padding: "11px 12px", borderRadius: 11,
                  background: step.done ? "rgba(14,165,160,.16)" : "rgba(255,255,255,.07)",
                  border: `1px solid ${step.done ? "rgba(92,224,216,.35)" : "rgba(255,255,255,.12)"}`,
                  display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 8,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600 }}>
                    <CheckCircle2 size={15} color={step.done ? "#5CE0D8" : "rgba(255,255,255,.4)"} />
                    <span style={{ opacity: step.done ? 0.9 : 1 }}>{step.title}</span>
                  </div>
                  {!step.done ? (
                    <button
                      type="button"
                      onClick={() => onNavigate?.(step.route)}
                      style={{
                        border: 0, background: "rgba(255,255,255,.12)", color: "#fff",
                        borderRadius: 7, padding: "5px 9px", fontSize: 11.5, fontWeight: 600,
                        display: "inline-flex", alignItems: "center", justifyContent: "space-between",
                      }}
                    >
                      {step.actionLabel} <ArrowRight size={12} />
                    </button>
                  ) : (
                    <span style={{ fontSize: 11, color: "#5CE0D8", fontWeight: 600 }}>Completed</span>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* KPI Hero Row */}
        <section
          aria-label="Business metrics"
          className="vantage-grid-4"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${canSeeFinance ? 4 : 2}, minmax(0, 1fr))`,
            gap: 14,
            marginBottom: 18,
          }}
        >
          {canSeeFinance && (
            <>
              <MetricCard
                index={1}
                label={`Revenue (${range.toUpperCase()})`}
                rawValue={ledgerReady ? summary.revenue : null}
                formatFn={money}
                deltaText={revDelta?.text}
                deltaPositive={revDelta?.positive}
                detail={ledgerReady ? (summary.revenue ? "From live ledger entries" : "No revenue recorded yet") : "Ledger unavailable"}
                icon={Wallet}
                tone={C.teal}
                sparkData={summary.chartData}
                sparkKey="revenue"
              />
              <MetricCard
                index={2}
                label={`Expenses (${range.toUpperCase()})`}
                rawValue={ledgerReady ? summary.expenses : null}
                formatFn={money}
                deltaText={expDelta?.text}
                deltaPositive={expDelta ? !expDelta.positive : true}
                detail={ledgerReady ? (summary.expenses ? "From live ledger entries" : "No expenses recorded yet") : "Ledger unavailable"}
                icon={ArrowDownRight}
                tone={C.amber}
                sparkData={summary.chartData}
                sparkKey="expenses"
              />
              <MetricCard
                index={3}
                label={`Net Profit (${range.toUpperCase()})`}
                rawValue={ledgerReady ? summary.profit : null}
                formatFn={money}
                deltaText={netDelta?.text}
                deltaPositive={netDelta?.positive}
                detail={ledgerReady ? (summary.revenue > 0 ? `${summary.marginPct.toFixed(1)}% net margin` : "Revenue minus expenses") : "Ledger unavailable"}
                icon={TrendingUp}
                tone={summary.profit >= 0 ? C.teal : C.coral}
                sparkData={summary.chartData}
                sparkKey="net"
              />
            </>
          )}

          <MetricCard
            index={4}
            label="Inventory & Team"
            rawValue={summary.inventoryCount}
            formatFn={(v) => Math.round(v).toLocaleString()}
            deltaText={summary.lowStock.length ? `${summary.lowStock.length} low stock` : null}
            deltaPositive={summary.lowStock.length === 0}
            detail={canSeeHR ? `${summary.activeEmployees} active employee(s) · ${summary.totalSalesCount} POS order(s)` : `${summary.lowStock.length} below reorder level`}
            icon={Boxes}
            tone="#6476B8"
          />

          {!canSeeFinance && (
            <MetricCard
              index={5}
              label="Items needing restock"
              rawValue={summary.lowStock.length}
              formatFn={(v) => Math.round(v).toLocaleString()}
              detail={summary.lowStock.length ? "Below reorder level" : "All stock levels healthy"}
              icon={AlertTriangle}
              tone={summary.lowStock.length ? C.amber : C.teal}
            />
          )}
        </section>

        {/* Primary Charts Grid */}
        <section className="vantage-grid-2" style={{
          display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(300px, 1fr)", gap: 16, marginBottom: 16,
        }}>
          {/* Revenue & Expenses Trend */}
          <Card className="dash-card dash-stagger" style={{ minWidth: 0, padding: 20, "--i": 5 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 750 }}>Cashflow & Revenue Trend</h2>
                <div style={{ color: C.inkFaint, fontSize: 12, marginTop: 3 }}>
                  Daily totals · {range.toUpperCase()} · real-time from database ledger
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {canSeeFinance && ledgerReady && summary.hasChartData && (
                  <div style={{ display: "inline-flex", background: C.bg, borderRadius: 8, padding: 2 }}>
                    {["area", "bar"].map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setChartType(type)}
                        style={{
                          border: 0, borderRadius: 6, padding: "4px 9px", fontSize: 11.5, fontWeight: 600,
                          background: chartType === type ? "#fff" : "transparent",
                          color: chartType === type ? C.ink : C.inkSoft,
                          boxShadow: chartType === type ? "0 1px 3px rgba(0,0,0,.08)" : "none",
                        }}
                      >
                        {type === "area" ? "Area" : "Bar"}
                      </button>
                    ))}
                  </div>
                )}
                {ledgerReady && (
                  <Badge tone={summary.hasChartData ? "ok" : "neutral"}>
                    {summary.hasChartData ? "Live ledger" : "No records"}
                  </Badge>
                )}
              </div>
            </div>

            {!canSeeFinance ? (
              <EmptyPanel icon={BarChart3} title="Financial overview is private" detail="Your role doesn't have permission to view this business's financial records." />
            ) : !ledgerReady ? (
              <EmptyPanel icon={RefreshCw} title="Financial data unavailable" detail="The current ledger could not be loaded. Retry to fetch the latest totals." action="Retry" onAction={() => refresh({ quiet: true })} />
            ) : !summary.hasChartData ? (
              <EmptyPanel
                icon={BarChart3}
                title="No transactions in this period"
                detail="Once you record a sale in POS or add a revenue/expense entry, your daily cashflow chart will render here."
                action="Record a transaction"
                onAction={() => onNavigate?.("transactions")}
              />
            ) : (
              <div style={{ height: 270 }}>
                <ResponsiveContainer width="100%" height="100%">
                  {chartType === "area" ? (
                    <AreaChart data={summary.chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                      <defs>
                        <linearGradient id="dashRevGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={C.teal} stopOpacity={0.28} />
                          <stop offset="95%" stopColor={C.teal} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="dashExpGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={C.amber} stopOpacity={0.22} />
                          <stop offset="95%" stopColor={C.amber} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 5" vertical={false} stroke={C.line} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.inkFaint }} axisLine={false} tickLine={false} minTickGap={20} />
                      <YAxis tick={{ fontSize: 11, fill: C.inkFaint }} axisLine={false} tickLine={false} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
                      <Tooltip content={<CustomChartTooltip currency={currency} />} />
                      <Area type="monotone" dataKey="revenue" stroke={C.teal} strokeWidth={2.5} fill="url(#dashRevGrad)" activeDot={{ r: 5 }} />
                      <Area type="monotone" dataKey="expenses" stroke={C.amber} strokeWidth={2} fill="url(#dashExpGrad)" activeDot={{ r: 5 }} />
                    </AreaChart>
                  ) : (
                    <BarChart data={summary.chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 5" vertical={false} stroke={C.line} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.inkFaint }} axisLine={false} tickLine={false} minTickGap={20} />
                      <YAxis tick={{ fontSize: 11, fill: C.inkFaint }} axisLine={false} tickLine={false} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
                      <Tooltip content={<CustomChartTooltip currency={currency} />} />
                      <Bar dataKey="revenue" fill={C.teal} radius={[5, 5, 0, 0]} />
                      <Bar dataKey="expenses" fill={C.amber} radius={[5, 5, 0, 0]} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          {/* Financial Health + Expense Breakdown */}
          <Card className="dash-card dash-stagger" style={{ minWidth: 0, padding: 20, "--i": 6, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 750 }}>Health & Expense Mix</h2>
                <div style={{ color: C.inkFaint, fontSize: 12, marginTop: 3 }}>Calculated from real ledger metrics</div>
              </div>
              {canSeeFinance && metrics && hasAnyFinanceData && (
                <Badge tone={metrics.financial_health_score >= 70 ? "ok" : "low"}>
                  {metrics.financial_health_score >= 70 ? "Healthy" : "Monitor"}
                </Badge>
              )}
            </div>

            {canSeeFinance ? (
              <>
                <div style={{
                  display: "flex", alignItems: "center", gap: 16, padding: "12px 14px",
                  borderRadius: 12, background: "#FAFBFD", border: `1px solid ${C.line}`,
                }}>
                  <HealthRing score={metrics?.financial_health_score} hasData={hasAnyFinanceData && Boolean(metrics)} />
                  <div style={{ display: "grid", gap: 6, flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span style={{ color: C.inkSoft }}>Gross Margin</span>
                      <span className="font-mono" style={{ fontWeight: 700 }}>
                        {hasAnyFinanceData && metrics ? `${Number(metrics.gross_margin_pct || 0).toFixed(1)}%` : "—"}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span style={{ color: C.inkSoft }}>Cash Runway</span>
                      <span className="font-mono" style={{ fontWeight: 700 }}>
                        {hasAnyFinanceData && metrics ? `${Number(metrics.cash_runway_months || 0).toFixed(1)} mo` : "—"}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span style={{ color: C.inkSoft }}>Monthly Burn</span>
                      <span className="font-mono" style={{ fontWeight: 700 }}>
                        {hasAnyFinanceData && metrics ? money(metrics.burn_rate || 0) : "—"}
                      </span>
                    </div>
                  </div>
                </div>

                {summary.expenseBreakdown.length > 0 ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
                    <div style={{ width: 118, height: 118, flexShrink: 0 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={summary.expenseBreakdown}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={34}
                            outerRadius={52}
                            paddingAngle={3}
                          >
                            {summary.expenseBreakdown.map((entry, idx) => (
                              <Cell key={entry.name} fill={DONUT_COLORS[idx % DONUT_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(val) => money(val)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ display: "grid", gap: 6, flex: 1, minWidth: 0 }}>
                      {summary.expenseBreakdown.slice(0, 4).map((cat, idx) => (
                        <div key={cat.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 12 }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                            <span style={{ width: 8, height: 8, borderRadius: 99, flexShrink: 0, background: DONUT_COLORS[idx % DONUT_COLORS.length] }} />
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.inkSoft }}>{cat.name}</span>
                          </span>
                          <span className="font-mono" style={{ fontWeight: 600, fontSize: 11.5 }}>{money(cat.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 12.5, color: C.inkFaint, textAlign: "center", padding: "14px 8px" }}>
                    Expense category breakdown will appear once expense entries are recorded.
                  </div>
                )}
              </>
            ) : (
              <EmptyPanel icon={Users} title="Role-scoped view" detail="Financial health metrics are restricted to owners and managers." />
            )}
          </Card>
        </section>

        {/* Bottom Operational Grid */}
        <section className="vantage-grid-3" style={{
          display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16,
        }}>
          {/* Recent POS Sales */}
          <Card className="dash-card dash-stagger" style={{ minWidth: 0, padding: 20, "--i": 7 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 750 }}>Recent POS Sales</h2>
                <div style={{ color: C.inkFaint, fontSize: 12, marginTop: 3 }}>Real-time checkout orders</div>
              </div>
              <CreditCard size={16} color={C.inkFaint} />
            </div>

            {summary.recentSales.length === 0 ? (
              <EmptyPanel
                icon={Store}
                title="No POS sales yet"
                detail="Completed checkouts from your Point of Sale will appear here in real time."
                action="Open POS"
                onAction={() => onNavigate?.("pos")}
              />
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {summary.recentSales.map((sale) => (
                  <div key={sale.id || sale.invoice_number} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                    padding: "9px 11px", border: `1px solid ${C.line}`, borderRadius: 11,
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {sale.customer_name || "Walk-in Customer"}
                      </div>
                      <div style={{ color: C.inkFaint, fontSize: 11, marginTop: 2 }}>
                        {sale.invoice_number} · {String(sale.payment_method || "cash").toUpperCase()}
                      </div>
                    </div>
                    <span className="font-mono" style={{ color: C.teal, fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap" }}>
                      {money(sale.total)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Inventory Attention */}
          <Card className="dash-card dash-stagger" style={{ minWidth: 0, padding: 20, "--i": 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 750 }}>Inventory Attention</h2>
                <div style={{ color: C.inkFaint, fontSize: 12, marginTop: 3 }}>Tracked items in your store</div>
              </div>
              {summary.lowStock.length > 0 && <Badge tone="low">{summary.lowStock.length} low</Badge>}
            </div>

            {data.inventory.length === 0 ? (
              <EmptyPanel
                icon={Boxes}
                title="No inventory recorded"
                detail="Add products to track live stock counts and reorder alerts."
                action="Add first item"
                onAction={() => onNavigate?.("inventory")}
              />
            ) : summary.lowStock.length === 0 ? (
              <div style={{ padding: "26px 12px", textAlign: "center" }}>
                <CheckCircle2 size={24} color={C.teal} />
                <div style={{ fontWeight: 700, fontSize: 14, marginTop: 10 }}>All stock levels healthy</div>
                <div style={{ fontSize: 12, color: C.inkFaint, marginTop: 5 }}>
                  All {data.inventory.length} tracked item(s) are above reorder thresholds.
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {summary.lowStock.slice(0, 4).map((item) => {
                  const stock = Number(item.stock ?? item.quantity ?? 0);
                  const threshold = Math.max(1, Number(item.threshold ?? item.reorder_level ?? 1));
                  const pct = Math.min(100, Math.round((stock / threshold) * 100));
                  return (
                    <div key={item.id} style={{ padding: "9px 11px", border: `1px solid ${C.line}`, borderRadius: 11 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.name}
                        </span>
                        <span style={{ color: C.amberDeep, fontSize: 11.5, fontWeight: 750, whiteSpace: "nowrap" }}>
                          {stock} / {threshold}
                        </span>
                      </div>
                      <div style={{ height: 5, borderRadius: 99, background: "#EEF1F7", overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: stock === 0 ? C.coral : C.amber, borderRadius: 99 }} />
                      </div>
                    </div>
                  );
                })}
                <button
                  type="button"
                  className="vantage-focus"
                  onClick={() => onNavigate?.("inventory")}
                  style={{ justifySelf: "start", border: 0, background: "none", color: C.teal, padding: "6px 2px", fontSize: 12, fontWeight: 700 }}
                >
                  Manage inventory →
                </button>
              </div>
            )}
          </Card>

          {/* Recent Activity & Recommendations */}
          <Card className="dash-card dash-stagger" style={{ minWidth: 0, padding: 20, "--i": 9 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 750 }}>Activity & Insights</h2>
                <div style={{ color: C.inkFaint, fontSize: 12, marginTop: 3 }}>Live actions & recommendations</div>
              </div>
              {summary.recommendations.length > 0 ? (
                <Badge tone="info">{summary.recommendations.length} pending</Badge>
              ) : (
                <Clock3 size={16} color={C.inkFaint} />
              )}
            </div>

            {canSeeFinance && summary.recommendations.length > 0 && (
              <div style={{
                marginBottom: 12, padding: "10px 12px", borderRadius: 11,
                background: "#F4FBF9", border: `1px solid ${C.tealSoft}`,
              }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>
                  {summary.recommendations[0].title}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <Btn variant="ghost" size="sm" onClick={() => onNavigate?.("finance")}>Review</Btn>
                  <Btn variant="subtle" size="sm" onClick={approveAll}>Approve</Btn>
                </div>
              </div>
            )}

            {summary.activity.length === 0 ? (
              <EmptyPanel
                icon={Clock3}
                title="No activity recorded"
                detail="Sales, inventory updates, and finance actions will stream here."
              />
            ) : (
              <div style={{ display: "grid", gap: 11 }}>
                {summary.activity.slice(0, 4).map((entry) => (
                  <div key={entry.id} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                    <span style={{
                      width: 7, height: 7, marginTop: 5, flexShrink: 0, borderRadius: 99,
                      background: entry.agent === "finance" ? C.teal : entry.agent === "inventory" ? C.amber : C.navy,
                    }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ color: C.ink, fontSize: 12, lineHeight: 1.45 }}>{entry.text}</div>
                      <div style={{ color: C.inkFaint, fontSize: 10.5, marginTop: 2 }}>{activityTime(entry.ts)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}
