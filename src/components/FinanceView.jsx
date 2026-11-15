import React, { useState, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  UploadCloud, FileDown, Sparkles, MessageCircle, Mail, DollarSign,
  AlertCircle, Users, CheckCircle2, ChevronRight, Phone
} from "lucide-react";
import { C } from "../data/constants.js";
import { useAppState } from "../context/AppStateContext.jsx";
import { parseSimpleCsv, downloadTextFile } from "../utils/helpers.js";
import { Card, Btn, Badge, Trend, ConfirmDialog } from "./Primitives.jsx";
import ViewWrap from "./ViewWrap.jsx";
import DomainAgentDrawer from "./DomainAgentDrawer.jsx";
import CustomerDebitModal from "./CustomerDebitModal.jsx";

export default function FinanceView({ showToast }) {
  const { state, dispatch, derived } = useAppState();
  const { recs, series, kpis } = state.finance;
  const customers = state.customers || [];
  const [confirmReject, setConfirmReject] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const fileInputRef = useRef(null);

  const [agentOpen, setAgentOpen] = useState(false);
  const [agentInitialPrompt, setAgentInitialPrompt] = useState("");
  const [selectedCustomerDebit, setSelectedCustomerDebit] = useState(null);

  const decide = (id, status) => {
    if (status === "approved") dispatch({ type: "APPROVE_REC", id });
    else dispatch({ type: "REJECT_REC", id });
    showToast(`Recommendation ${status}.`);
  };

  const kpiDisplay = kpis.map((k) => k.key === "runway" ? { ...k, display: `${derived.runway.toFixed(1)} mo` } : k);

  const handleUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = parseSimpleCsv(String(reader.result)).filter((r) => r.length >= 2 && r[0] && !isNaN(Number(r[1])));
        if (rows.length === 0) { showToast("Couldn't find month,revenue rows in that file."); return; }
        const newSeries = rows.map(([month, revenue]) => ({ month, revenue: Number(revenue), forecast: null }));
        const lastRevenue = newSeries[newSeries.length - 1].revenue;
        for (let i = 1; i <= 3; i++) {
          newSeries.push({ month: `+${i}`, revenue: null, forecast: Math.round(lastRevenue * Math.pow(1.06, i)) });
        }
        newSeries[rows.length - 1] = { ...newSeries[rows.length - 1], forecast: lastRevenue };
        dispatch({ type: "IMPORT_FINANCE_SERIES", series: newSeries });
        showToast("New financial data imported — forecast recalculated.");
      } catch { showToast("Couldn't parse that file — expected simple CSV (month,revenue)."); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const exportCsv = () => {
    const header = "month,revenue,forecast";
    const rows = series.map((r) => `${r.month},${r.revenue ?? ""},${r.forecast ?? ""}`);
    downloadTextFile("vantage-finance-export.csv", [header, ...rows].join("\n"));
    showToast("Finance data exported.");
  };

  const openAgentWithPrompt = (prompt) => {
    setAgentInitialPrompt(prompt);
    setAgentOpen(true);
  };

  const totalCustomerDebit = (derived.totalDebit ?? customers.reduce((sum, c) => sum + (c.debit || 0), 0));
  const customersWithDebit = (derived.customersWithDebit ?? customers.filter((c) => (c.debit || 0) > 0));

  const handleRecordPayment = (id, amount) => {
    dispatch({ type: "RECORD_CUSTOMER_PAYMENT", id, amount });
  };

  const handleSendDebitReminder = (id, details) => {
    dispatch({
      type: "SEND_CUSTOMER_DEBIT_REMINDER",
      id,
      channel: details.channel,
      text: details.text,
    });
  };

  return (
    <ViewWrap title="Finance Intelligence" subtitle="Profit & loss, forecasts, customer debits (Khata), and budget calls.">
      {/* Top action toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input ref={fileInputRef} type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={handleUpload} />
          <Btn variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}><UploadCloud size={14} /> Upload revenue CSV</Btn>
          <Btn variant="ghost" size="sm" onClick={exportCsv}><FileDown size={14} /> Export data</Btn>
        </div>

        {/* Talk to Agent Button */}
        <button
          onClick={() => {
            setAgentInitialPrompt("");
            setAgentOpen(true);
          }}
          className="vantage-focus"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 16px",
            borderRadius: 10,
            border: "1px solid rgba(14, 165, 160, 0.3)",
            background: "linear-gradient(135deg, #F0FDF4 0%, #DCF5F3 100%)",
            color: C.navyDeep,
            fontWeight: 700,
            fontSize: 13.5,
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(14, 165, 160, 0.18)",
            transition: "all .15s ease",
          }}
        >
          <Sparkles size={16} color={C.teal} />
          Talk to Agent
          <span style={{ fontSize: 10.5, background: C.teal, color: "#fff", padding: "1px 6px", borderRadius: 999, fontWeight: 700 }}>
            Finance
          </span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="vantage-grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginTop: 10 }}>
        {kpiDisplay.map((k) => (
          <Card key={k.label} style={{ padding: 16, cursor: "pointer" }} >
            <div onClick={() => setExpanded(expanded === k.key ? null : k.key)}>
              <div style={{ fontSize: 12.5, color: C.inkFaint, fontWeight: 600 }}>{k.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, margin: "6px 0" }} className="font-mono">{k.display}</div>
              <Trend dir={k.trend} delta={k.delta} />
            </div>
            {expanded === k.key && (
              <div className="anim-in" style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.line}`, fontSize: 12, color: C.inkSoft, lineHeight: 1.5 }}>
                {k.key === "runway" && `Base estimate 5.4 months, +${derived.runwayAdjustment?.toFixed?.(1) ?? state.finance.runwayAdjustment.toFixed(1)} months from ${derived.approvedRecs.length} approved recommendation(s).`}
                {k.key === "profit" && `Derived from ${derived.approvedRecs.length} applied optimization(s) worth ~₨${derived.totalImpact.toLocaleString()} combined.`}
                {(k.key === "revenue" || k.key === "expenses") && "Synced from your latest uploaded revenue data and POS sales."}
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Revenue & Forecast Chart */}
      <Card style={{ marginTop: 18 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Revenue & 90-day forecast</div>
        <div style={{ fontSize: 12.5, color: C.inkFaint, marginBottom: 8 }}>Solid line: actuals · dashed line: forecast (₨ thousands)</div>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series}>
              <CartesianGrid stroke={C.line} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: C.inkFaint }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: C.inkFaint }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Line type="monotone" dataKey="revenue" stroke={C.teal} strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="forecast" stroke={C.teal} strokeWidth={2.5} strokeDasharray="6 5" dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* CUSTOMER DEBITS & ACCOUNTS RECEIVABLE (KHATA) SECTION */}
      <div style={{ marginTop: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: C.navy, display: "flex", alignItems: "center", gap: 8 }}>
              Customer Debits & Accounts Receivable (Khata)
              <span style={{ fontSize: 11, background: C.coralSoft, color: C.coral, padding: "2px 8px", borderRadius: 999, fontWeight: 700 }}>
                ₨{totalCustomerDebit.toLocaleString()} Total Outstanding
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: C.inkSoft, marginTop: 2 }}>
              Track outstanding customer balances, send one-click WhatsApp & email payment reminders, and record collections.
            </div>
          </div>
          <button
            onClick={() => openAgentWithPrompt("Show customer debits and receivables")}
            className="vantage-focus"
            style={{
              fontSize: 12.5,
              fontWeight: 700,
              color: C.teal,
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Sparkles size={14} /> Ask Finance Agent to Review Debits →
          </button>
        </div>

        <Card style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: C.bg, textAlign: "left" }}>
                {["Customer Name", "Contact Person & City", "Phone (WhatsApp)", "Email", "Debit Balance", "Credit Limit", "Status", ""].map((h) => (
                  <th key={h} style={{ padding: "11px 16px", color: C.inkFaint, fontWeight: 700, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => {
                const pctLimit = c.creditLimit > 0 ? Math.min(100, Math.round((c.debit / c.creditLimit) * 100)) : 0;
                const isOverdue = c.status === "overdue" && c.debit > 0;
                return (
                  <tr key={c.id} style={{ borderTop: `1px solid ${C.line}` }}>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ fontWeight: 700, color: C.navy }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: C.inkFaint }}>Last: {c.lastPurchase}</div>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ fontWeight: 600 }}>{c.contactPerson}</div>
                      <div style={{ fontSize: 11.5, color: C.inkFaint }}>{c.city}</div>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ fontFamily: "monospace", fontSize: 12.5 }}>{c.phone}</span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ fontSize: 12, color: C.inkSoft }}>{c.email}</span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: c.debit > 0 ? (isOverdue ? C.coral : C.navy) : "#0A7873" }}>
                        ₨{c.debit.toLocaleString()}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ fontSize: 11.5, color: C.inkSoft }}>₨{c.creditLimit.toLocaleString()}</div>
                      <div style={{ width: 70, height: 4, background: "#E5E8F0", borderRadius: 999, marginTop: 3 }}>
                        <div style={{ width: `${pctLimit}%`, height: "100%", background: pctLimit > 80 ? C.coral : C.teal, borderRadius: 999 }} />
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span
                        style={{
                          padding: "3px 8px",
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 700,
                          background: isOverdue ? C.coralSoft : c.debit === 0 ? C.tealSoft : C.amberSoft,
                          color: isOverdue ? C.coral : c.debit === 0 ? "#0A7873" : C.amberDeep,
                        }}
                      >
                        {c.debit === 0 ? "CLEARED" : c.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        {c.debit > 0 ? (
                          <>
                            <button
                              onClick={() => setSelectedCustomerDebit(c)}
                              className="vantage-focus"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                padding: "5px 9px",
                                borderRadius: 8,
                                border: "none",
                                background: "#25D366",
                                color: "#fff",
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                              title="Send WhatsApp Reminder"
                            >
                              <MessageCircle size={13} /> WhatsApp
                            </button>
                            <Btn
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedCustomerDebit(c)}
                            >
                              <Mail size={13} /> Email
                            </Btn>
                          </>
                        ) : (
                          <span style={{ fontSize: 12, color: "#0A7873", fontWeight: 600 }}>All Paid</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Pending Recommendations Section */}
      <div style={{ marginTop: 22 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Pending recommendations</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {recs.length === 0 && <Card style={{ fontSize: 13.5, color: C.inkFaint }}>No recommendations right now — check back after your next data sync.</Card>}
          {recs.map((r) => (
            <Card key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>{r.title}</div>
                <div style={{ fontSize: 13, color: C.inkSoft, marginTop: 3 }}>{r.detail}</div>
                {r.impactLabel && <div style={{ fontSize: 12, color: "#0A7873", fontWeight: 700, marginTop: 4 }}>{r.impactLabel}</div>}
              </div>
              {r.status === "pending" ? (
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <Btn variant="danger" size="sm" onClick={() => setConfirmReject(r)}>Reject</Btn>
                  <Btn variant="primary" size="sm" onClick={() => decide(r.id, "approved")}>Approve</Btn>
                </div>
              ) : (
                <Badge tone={r.status === "approved" ? "ok" : "neutral"}>{r.status}</Badge>
              )}
            </Card>
          ))}
        </div>
      </div>

      {/* Reject Confirmation Dialog */}
      <ConfirmDialog
        open={!!confirmReject}
        title="Reject this recommendation?"
        body={confirmReject ? `"${confirmReject.title}" — the Finance Agent won't resurface this unless something changes.` : ""}
        confirmLabel="Reject"
        danger
        onCancel={() => setConfirmReject(null)}
        onConfirm={() => { decide(confirmReject.id, "rejected"); setConfirmReject(null); }}
      />

      {/* Customer Debit / Payment Modal */}
      <CustomerDebitModal
        open={!!selectedCustomerDebit}
        customer={selectedCustomerDebit}
        onClose={() => setSelectedCustomerDebit(null)}
        onRecordPayment={handleRecordPayment}
        onSendReminder={handleSendDebitReminder}
        showToast={showToast}
      />

      {/* Domain Agent Drawer (Strict Finance Mode) */}
      <DomainAgentDrawer
        open={agentOpen}
        onClose={() => setAgentOpen(false)}
        domain="finance"
        showToast={showToast}
        initialPrompt={agentInitialPrompt}
      />
    </ViewWrap>
  );
}
