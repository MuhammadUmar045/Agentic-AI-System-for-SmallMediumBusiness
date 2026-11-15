import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles, DollarSign, Package, X, Send, ArrowUpRight, Copy, Check,
  Info, MessageCircle, Mail, Phone, Truck, CheckCircle2, AlertTriangle,
  RotateCw, Plus, Minus
} from "lucide-react";
import { C, AGENTS } from "../data/constants.js";
import { useAppState } from "../context/AppStateContext.jsx";
import { invStatus } from "../utils/helpers.js";
import { Btn, Badge, Card } from "./Primitives.jsx";

function formatInline(line) {
  const parts = [];
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0;
  let match;
  while ((match = regex.exec(line)) !== null) {
    if (match.index > last) parts.push(line.slice(last, match.index));
    if (match[1]) parts.push(<strong key={match.index} style={{ fontWeight: 700 }}>{match[1]}</strong>);
    else if (match[2]) parts.push(<em key={match.index}>{match[2]}</em>);
    last = regex.lastIndex;
  }
  if (last < line.length) parts.push(line.slice(last));
  return parts.length > 0 ? parts : [line];
}

function FormattedText({ text }) {
  if (!text) return null;
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {lines.map((line, i) => {
        const numMatch = line.match(/^(\d+)[.)]\s*(.*)/);
        if (numMatch) {
          return (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span className="font-mono" style={{ fontSize: 12, fontWeight: 700, color: C.teal, minWidth: 18, flexShrink: 0, marginTop: 1 }}>{numMatch[1]}.</span>
              <span style={{ lineHeight: 1.5 }}>{formatInline(numMatch[2])}</span>
            </div>
          );
        }
        const bulletMatch = line.match(/^[-•*]\s*(.*)/);
        if (bulletMatch) {
          return (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", paddingLeft: 4 }}>
              <span style={{ color: C.teal, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>·</span>
              <span style={{ lineHeight: 1.5 }}>{formatInline(bulletMatch[1])}</span>
            </div>
          );
        }
        return <div key={i} style={{ lineHeight: 1.55 }}>{formatInline(line)}</div>;
      })}
    </div>
  );
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className="vantage-focus"
      style={{ background: "none", border: "none", padding: 4, cursor: "pointer", color: copied ? "#0A7873" : C.inkFaint }}
      title="Copy"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

export default function DomainAgentDrawer({
  open,
  onClose,
  domain, // "finance" | "inventory"
  showToast,
  initialPrompt,
  targetItem,
}) {
  const { state, dispatch, derived } = useAppState();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const bottomRef = useRef(null);
  const initializedRef = useRef(false);

  const isFinance = domain === "finance";
  const agentColor = isFinance ? C.teal : C.amberDeep;
  const agentBg = isFinance ? C.tealSoft : C.amberSoft;
  const agentName = isFinance ? "Finance Intelligence Agent" : "Inventory Optimization Agent";
  const AgentIcon = isFinance ? DollarSign : Package;

  useEffect(() => {
    if (open) {
      if (!initializedRef.current || messages.length === 0) {
        initializedRef.current = true;
        const welcomeText = isFinance
          ? `Hello! I am your dedicated **Finance Intelligence Agent**.\n\nI specialize strictly in your business finances: profit & loss, 90-day forecasts, cash runway, pending budget calls, and **customer debits (Khata)** with WhatsApp and email reminders.\n\n*(Note: I strictly decline non-finance questions — for stock and reorders, please use the Inventory Agent.)*`
          : `Hello! I am your dedicated **Inventory Optimization Agent**.\n\nI monitor your live stock against AI reorder thresholds, track suppliers, and can automatically write restock purchase orders and email or WhatsApp suppliers directly.\n\n*(Note: I strictly decline non-inventory questions — for finance and runway, please use the Finance Agent.)*`;

        const initMsgs = [{ id: 1, role: "agent", text: welcomeText }];
        setMessages(initMsgs);

        if (initialPrompt) {
          handleUserSend(initialPrompt, initMsgs);
        }
      }
    }
  }, [open, domain, initialPrompt]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  const financeSuggestions = [
    "What is our net profit and cash runway?",
    "Show customer debits and receivables",
    "Review pending recommendations",
    "Send WhatsApp debit reminder to Ahmed Traders",
  ];

  const inventorySuggestions = [
    "Which items are below reorder threshold?",
    "Reorder Cooking Oil 1L from supplier",
    "Show all suppliers and contacts",
    "Reorder all low stock items now",
  ];

  const suggestions = isFinance ? financeSuggestions : inventorySuggestions;

  const handleUserSend = (rawText, currentMessages = messages) => {
    const text = (rawText ?? input).trim();
    if (!text || thinking) return;

    const userMsg = { id: Date.now(), role: "user", text };
    const nextMsgs = [...currentMessages, userMsg];
    setMessages(nextMsgs);
    setInput("");
    setThinking(true);

    setTimeout(() => {
      const response = processDomainTurn(text, domain, state, derived, dispatch, showToast);
      setMessages([...nextMsgs, { id: Date.now() + 1, role: "agent", ...response }]);
      setThinking(false);
    }, 600);
  };

  const executeAction = (action) => {
    if (action.type === "SEND_SUPPLIER_REORDER") {
      dispatch(action);
      showToast(`Purchase order sent to ${action.supplierName} (${action.channel || 'Email'}).`);
    } else if (action.type === "SEND_CUSTOMER_DEBIT_REMINDER") {
      dispatch(action);
      showToast(`${action.channel} reminder sent to ${action.customerName}.`);
    } else if (action.type === "APPROVE_REC") {
      dispatch({ type: "APPROVE_REC", id: action.id });
      showToast("Recommendation approved!");
    } else if (action.type === "REJECT_REC") {
      dispatch({ type: "REJECT_REC", id: action.id });
      showToast("Recommendation rejected.");
    } else if (action.type === "PLACE_REORDER") {
      dispatch({ type: "PLACE_REORDER", id: action.id });
      showToast("Reorder placed with supplier.");
    }
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(19, 26, 44, 0.45)",
        zIndex: 500,
        display: "flex",
        justifyContent: "flex-end",
      }}
      onClick={onClose}
    >
      <div
        className="anim-in"
        style={{
          width: "100%",
          maxWidth: 540,
          background: "#FFFFFF",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          boxShadow: "-8px 0 35px rgba(19, 26, 44, 0.2)",
          borderLeft: `1px solid ${C.line}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: `1px solid ${C.line}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#FAFAFD",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: agentBg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AgentIcon size={18} color={agentColor} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 15, color: C.navy }}>{agentName}</span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                    padding: "2px 7px",
                    borderRadius: 6,
                    background: isFinance ? C.tealSoft : C.amberSoft,
                    color: isFinance ? "#0A7873" : C.amberDeep,
                  }}
                >
                  Strict {isFinance ? "Finance" : "Inventory"}
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: C.inkSoft }}>
                {isFinance
                  ? "P&L, Cash Runway, Recommendations, Customer Debits"
                  : "Live Stock, Thresholds, Suppliers & Reorder Purchase Orders"}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="vantage-focus"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: C.inkFaint,
              padding: 6,
              borderRadius: 8,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Quick Suggestion Chips */}
        <div
          style={{
            padding: "10px 16px",
            background: "#F6F7FB",
            borderBottom: `1px solid ${C.line}`,
            display: "flex",
            gap: 6,
            overflowX: "auto",
            whiteSpace: "nowrap",
          }}
        >
          {suggestions.map((s, idx) => (
            <button
              key={idx}
              className="vantage-focus"
              onClick={() => handleUserSend(s)}
              style={{
                padding: "5px 11px",
                borderRadius: 999,
                border: `1px solid ${C.line}`,
                background: "#fff",
                fontSize: 11.5,
                fontWeight: 600,
                color: C.navy,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Messages Scroll Area */}
        <div
          className="vantage-scroll"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {messages.map((m) => {
            if (m.role === "user") {
              return (
                <div
                  key={m.id}
                  style={{
                    alignSelf: "flex-end",
                    maxWidth: "82%",
                    background: C.navy,
                    color: "#fff",
                    padding: "10px 14px",
                    borderRadius: "14px 14px 4px 14px",
                    fontSize: 13.5,
                    lineHeight: 1.45,
                  }}
                >
                  {m.text}
                </div>
              );
            }

            return (
              <div
                key={m.id}
                style={{
                  alignSelf: "flex-start",
                  maxWidth: "92%",
                  background: "#FAFAFD",
                  border: `1px solid ${m.isBoundary ? C.coralSoft : C.line}`,
                  borderLeft: `3px solid ${m.isBoundary ? C.coral : agentColor}`,
                  borderRadius: "4px 14px 14px 14px",
                  padding: "12px 14px",
                  fontSize: 13.5,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: m.isBoundary ? C.coral : agentColor,
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                    }}
                  >
                    {m.isBoundary ? "Domain Boundary" : agentName}
                  </span>
                  <CopyBtn text={m.text} />
                </div>

                <FormattedText text={m.text} />

                {/* Reasoning Trail */}
                {m.trail && m.trail.length > 0 && (
                  <div
                    style={{
                      marginTop: 8,
                      background: "#fff",
                      border: `1px solid ${C.line}`,
                      borderRadius: 8,
                      padding: "7px 10px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        color: C.inkFaint,
                        textTransform: "uppercase",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        marginBottom: 4,
                      }}
                    >
                      <Info size={11} /> What I Checked
                    </div>
                    {m.trail.map((t, ti) => (
                      <div key={ti} style={{ fontSize: 11.5, color: C.inkSoft }}>
                        · {t}
                      </div>
                    ))}
                  </div>
                )}

                {/* Action Card inside message */}
                {m.actionCard && (
                  <div
                    style={{
                      marginTop: 10,
                      background: "#FFFFFF",
                      border: `1px solid ${C.line}`,
                      borderRadius: 10,
                      padding: "12px 14px",
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: C.navy }}>
                      {m.actionCard.title}
                    </div>
                    {m.actionCard.details && (
                      <div style={{ fontSize: 12, color: C.inkSoft, marginBottom: 10, lineHeight: 1.5 }}>
                        {m.actionCard.details}
                      </div>
                    )}
                    {m.actionCard.preview && (
                      <div
                        style={{
                          background: "#F6F7FB",
                          padding: 10,
                          borderRadius: 6,
                          fontSize: 12,
                          color: C.ink,
                          fontFamily: "monospace",
                          whiteSpace: "pre-wrap",
                          marginBottom: 10,
                          maxHeight: 140,
                          overflowY: "auto",
                        }}
                      >
                        {m.actionCard.preview}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {m.actionCard.actions.map((act, ai) => (
                        <button
                          key={ai}
                          onClick={() => {
                            if (act.url) {
                              window.open(act.url, "_blank");
                            }
                            if (act.action) {
                              executeAction(act.action);
                            }
                          }}
                          className="vantage-focus"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "6px 12px",
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 600,
                            border: "none",
                            background: act.primary ? agentColor : act.whatsapp ? "#25D366" : C.bg,
                            color: act.primary || act.whatsapp ? "#fff" : C.navy,
                            cursor: "pointer",
                          }}
                        >
                          {act.icon && <act.icon size={13} />}
                          {act.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {thinking && (
            <div
              style={{
                alignSelf: "flex-start",
                padding: "8px 14px",
                background: "#FAFAFD",
                borderRadius: "14px 14px 14px 4px",
                border: `1px solid ${C.line}`,
                fontSize: 12.5,
                color: C.inkSoft,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <RotateCw size={14} className="spin-slow" color={agentColor} />
              <span>{isFinance ? "Analyzing financial metrics & debits…" : "Scanning stock levels & suppliers…"}</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input Bar */}
        <div
          style={{
            padding: "12px 16px",
            borderTop: `1px solid ${C.line}`,
            background: "#FAFAFD",
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleUserSend();
            }}
            style={{ display: "flex", gap: 8 }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                isFinance
                  ? "Ask only about profit, runway, or customer debits…"
                  : "Ask only about stock, thresholds, suppliers, reorders…"
              }
              className="vantage-focus"
              style={{
                flex: 1,
                padding: "10px 14px",
                borderRadius: 10,
                border: `1.5px solid ${C.line}`,
                fontSize: 13.5,
                outline: "none",
                background: "#fff",
              }}
            />
            <button
              type="submit"
              disabled={!input.trim() || thinking}
              className="vantage-focus"
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                border: "none",
                background: agentColor,
                color: "#fff",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 6,
                cursor: !input.trim() || thinking ? "not-allowed" : "pointer",
                opacity: !input.trim() || thinking ? 0.6 : 1,
              }}
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   STRICT DOMAIN PROCESSING ENGINE
────────────────────────────────────────────────────────────── */

function processDomainTurn(rawText, domain, state, derived, dispatch, showToast) {
  const text = rawText.toLowerCase().trim();
  const isFinance = domain === "finance";

  // 1. STRICT DOMAIN BOUNDARY CHECK
  if (isFinance) {
    // If in Finance and asking about Inventory:
    const inventoryKeywords = ["inventory", "stock", "reorder", "warehouse", "shelf", "atta", "rice", "oil", "sugar", "detergent", "tea", "lentils", "spices", "biscuits", "sku", "threshold", "restock"];
    const matchedInv = inventoryKeywords.filter((w) => new RegExp(`\\b${w}\\b`, "i").test(text));
    // Check if it's strictly an inventory question not about supplier payment or cost
    if (matchedInv.length > 0 && !/(cost|expense|payment|bill|price|debit|supplier payment terms)/i.test(text)) {
      return {
        isBoundary: true,
        text: `⚠️ **Domain Boundary Notice:**\n\nI am exclusively the **Finance Intelligence Agent**. I do not manage physical inventory, stock counts, or product reorders.\n\nTo check stock, review thresholds, or reorder items with suppliers, please open the **Inventory workspace** and click **"Talk to Agent"** there.`,
        trail: [`Blocked inventory query: [${matchedInv.join(", ")}]`, "Enforced strict finance boundary"],
      };
    }
  } else {
    // If in Inventory and asking about Finance:
    const financeKeywords = ["profit", "revenue", "expense", "runway", "ebitda", "margin", "p&l", "forecast", "cashflow", "cash flow", "debit", "receivable", "khata", "tax", "billing", "budget"];
    const matchedFin = financeKeywords.filter((w) => new RegExp(`\\b${w}\\b`, "i").test(text));
    if (matchedFin.length > 0) {
      return {
        isBoundary: true,
        text: `⚠️ **Domain Boundary Notice:**\n\nI am exclusively the **Inventory Optimization Agent**. I do not calculate profit & loss, cash runway, or revenue forecasts.\n\nTo analyze your financials, review budget recommendations, or manage customer debits, please open the **Finance workspace** and click **"Talk to Agent"** there.`,
        trail: [`Blocked finance query: [${matchedFin.join(", ")}]`, "Enforced strict inventory boundary"],
      };
    }
  }

  // 2. DOMAIN LOGIC
  if (isFinance) {
    return handleFinanceQuery(text, state, derived, dispatch);
  } else {
    return handleInventoryQuery(text, state, derived, dispatch);
  }
}

/* ─── FINANCE AGENT LOGIC ─── */
function handleFinanceQuery(t, state, derived, dispatch) {
  const customers = state.customers || [];
  const recs = state.finance.recs || [];
  const customersWithDebit = customers.filter((c) => (c.debit || 0) > 0);
  const totalDebit = customersWithDebit.reduce((sum, c) => sum + (c.debit || 0), 0);

  // A. Customer Debits / Khata / Receivables
  if (/(debit|khata|receivable|owe|owing|due|balance|customer)/.test(t)) {
    // Check if asking about a specific customer
    const foundCustomer = customers.find((c) => t.includes(c.name.toLowerCase()) || t.includes(c.contactPerson.toLowerCase().split(" ")[0]));

    if (foundCustomer) {
      const waMessage = encodeURIComponent(
        `Dear ${foundCustomer.contactPerson || foundCustomer.name}, gentle reminder from Vantage Store: Your current outstanding debit balance is ₨${foundCustomer.debit.toLocaleString()}. Kindly arrange payment via Raast or bank transfer. Thank you!`
      );
      const emailSubject = encodeURIComponent(`Payment Reminder: Outstanding Debit Balance - ₨${foundCustomer.debit.toLocaleString()}`);
      const emailBody = encodeURIComponent(
        `Dear ${foundCustomer.contactPerson || foundCustomer.name},\n\nThis is a polite reminder from Vantage Store regarding your outstanding debit balance of ₨${foundCustomer.debit.toLocaleString()}.\n\nAccount Status: ${foundCustomer.status.toUpperCase()}\nCredit Limit: ₨${foundCustomer.creditLimit.toLocaleString()}\nLast Purchase: ${foundCustomer.lastPurchase}\n\nPlease transfer to our Raast ID: vantage@raast or settle at our counter.\n\nThank you,\nFinance Department\nVantage Store`
      );

      const reminderAction = {
        type: "SEND_CUSTOMER_DEBIT_REMINDER",
        id: foundCustomer.id,
        customerName: foundCustomer.name,
        channel: "WhatsApp",
        text: `WhatsApp reminder for ₨${foundCustomer.debit.toLocaleString()} sent to ${foundCustomer.name}.`,
      };

      return {
        text: `Here is the debit status for **${foundCustomer.name}**:\n\n• **Outstanding Debit:** ₨${foundCustomer.debit.toLocaleString()}\n• **Contact Person:** ${foundCustomer.contactPerson} (${foundCustomer.city})\n• **Phone:** ${foundCustomer.phone}\n• **Email:** ${foundCustomer.email}\n• **Credit Limit:** ₨${foundCustomer.creditLimit.toLocaleString()} (using ${Math.round((foundCustomer.debit / foundCustomer.creditLimit) * 100)}%)\n• **Status:** ${foundCustomer.status.toUpperCase()}\n\nWould you like me to dispatch a debit reminder via WhatsApp or Email?`,
        trail: [`Matched customer: ${foundCustomer.name}`, `Debit: ₨${foundCustomer.debit.toLocaleString()}`],
        actionCard: {
          title: `Debit Reminder for ${foundCustomer.name}`,
          details: `Debit Balance: ₨${foundCustomer.debit.toLocaleString()} · Phone: ${foundCustomer.phone}`,
          actions: [
            {
              label: "Send via WhatsApp",
              icon: MessageCircle,
              whatsapp: true,
              url: `https://wa.me/${foundCustomer.phone.replace(/[^0-9]/g, "")}?text=${waMessage}`,
              action: reminderAction,
            },
            {
              label: "Send Email",
              icon: Mail,
              primary: true,
              url: `mailto:${foundCustomer.email}?subject=${emailSubject}&body=${emailBody}`,
              action: { ...reminderAction, channel: "Email" },
            },
          ],
        },
      };
    }

    // List all customer debits
    const listSummary = customersWithDebit
      .map((c) => `• **${c.name}**: ₨${c.debit.toLocaleString()} (${c.status}) — Ph: ${c.phone}`)
      .join("\n");

    return {
      text: `We currently have **${customersWithDebit.length} customers** with outstanding debit balances totaling **₨${totalDebit.toLocaleString()}**:\n\n${listSummary}\n\nYou can say *"Send reminder to Ahmed Traders"* or use the buttons below to reach out directly.`,
      trail: [`Total receivables: ₨${totalDebit.toLocaleString()}`, `${customersWithDebit.length} customer debit accounts`],
    };
  }

  // B. Approve / Reject recommendation
  if (/(approve)/.test(t)) {
    const rec = recs.find((r) => r.status === "pending" && (t.includes(r.title.toLowerCase()) || t.includes("ad") || t.includes("supplier") || t.includes("1") || t.includes("rec")));
    if (rec) {
      dispatch({ type: "APPROVE_REC", id: rec.id });
      return {
        text: `Approved **"${rec.title}"**! This ${rec.impactLabel.toLowerCase()} and increases your cash runway by +${rec.runwayBoost || 0.3} months.`,
        trail: [`Approved recommendation #${rec.id}`, `Runway boost: +${rec.runwayBoost} mo`],
      };
    }
  }

  if (/(reject|decline)/.test(t)) {
    const rec = recs.find((r) => r.status === "pending" && (t.includes(r.title.toLowerCase()) || t.includes("ad") || t.includes("supplier") || t.includes("2") || t.includes("rec")));
    if (rec) {
      dispatch({ type: "REJECT_REC", id: rec.id });
      return {
        text: `Rejected **"${rec.title}"**. I have dismissed this recommendation and will not resurface it unless market conditions change.`,
        trail: [`Rejected recommendation #${rec.id}`],
      };
    }
  }

  // C. Profit / Runway / Forecast / General Finance
  const runway = derived.runway.toFixed(1);
  const pendingCount = derived.pendingRecs.length;
  const kpis = state.finance.kpis || [];
  const rev = kpis.find((k) => k.key === "revenue")?.display || "₨9.8L";
  const exp = kpis.find((k) => k.key === "expenses")?.display || "₨6.9L";
  const profit = kpis.find((k) => k.key === "profit")?.display || "₨2.9L";

  return {
    text: `Here is your current financial health summary:\n\n• **Revenue (MTD):** ${rev} (+6.2% trend)\n• **Operating Expenses:** ${exp}\n• **Net Profit:** ${profit} (+8.4% margin)\n• **Cash Runway:** ${runway} months (base 5.4 mo + approved adjustments)\n• **Total Customer Debits (Khata):** ₨${totalDebit.toLocaleString()} across ${customersWithDebit.length} accounts\n• **Pending Recommendations:** ${pendingCount} pending review\n\nWould you like me to detail any specific KPI, review customer debits, or evaluate budget cuts?`,
    trail: [`Net Profit: ${profit}`, `Cash runway: ${runway} mo`, `Accounts receivable: ₨${totalDebit.toLocaleString()}`],
  };
}

/* ─── INVENTORY AGENT LOGIC ─── */
function handleInventoryQuery(t, state, derived, dispatch) {
  const items = state.inventory || [];
  const suppliers = state.suppliers || [];
  const lowItems = items.filter((i) => invStatus(i) !== "ok");

  // A. Automatic Reorder & Supplier Message Generation
  if (/(reorder|restock|order|buy|procure)/.test(t)) {
    // Check if reordering specific item
    let target = items.find((i) => t.includes(i.name.toLowerCase()) || i.name.toLowerCase().split(" ").some((w) => w.length > 3 && t.includes(w)));
    if (!target && lowItems.length > 0) {
      target = lowItems[0];
    }

    if (target) {
      const supplier = suppliers.find((s) => s.id === target.supplierId) || suppliers[0];
      const reorderQty = Math.max(20, (target.threshold - target.stock) + 25);

      const emailSubject = encodeURIComponent(`Purchase Order: ${reorderQty} units of ${target.name} (SKU: ${target.sku}) - Vantage Store`);
      const emailBodyText = `To: ${supplier.name} (${supplier.email})\nAttn: ${supplier.contactPerson}\n\nDear ${supplier.contactPerson},\n\nWe would like to place an official Purchase Order to restock inventory:\n\n• Product: ${target.name} (SKU: ${target.sku})\n• Quantity: ${reorderQty} units\n• Current Stock: ${target.stock} units (Safety Threshold: ${target.threshold})\n• Target Delivery: Within ${supplier.leadTime}\n• Payment Terms: ${supplier.paymentTerms}\n• Delivery Address: Vantage Store Central Warehouse, Plot 14-B Commercial Area\n\nPlease confirm order receipt and expected dispatch schedule at your earliest.\n\nBest regards,\nInventory & Procurement Team\nVantage Store\nContact: +92 300 0000000`;
      const emailBody = encodeURIComponent(emailBodyText);

      const waText = encodeURIComponent(
        `Dear ${supplier.contactPerson} (${supplier.name}), Vantage Store would like to place an order for ${reorderQty} units of ${target.name} (SKU: ${target.sku}). Delivery within ${supplier.leadTime}. Please confirm availability. Thank you!`
      );

      const poAction = {
        type: "SEND_SUPPLIER_REORDER",
        itemId: target.id,
        supplierName: supplier.name,
        qty: reorderQty,
        channel: "Email",
        message: emailBodyText,
      };

      return {
        text: `I have prepared a restock Purchase Order for **${target.name}**:\n\n• **Current Stock:** ${target.stock} units (Threshold: ${target.threshold})\n• **Recommended Reorder:** **${reorderQty} units**\n• **Matched Supplier:** **${supplier.name}**\n• **Supplier Email:** ${supplier.email}\n• **Supplier Phone:** ${supplier.phone}\n• **Lead Time:** ${supplier.leadTime}\n• **Terms:** ${supplier.paymentTerms}\n\nI have automatically drafted the supplier message below. Click **"Send Message to Supplier"** to record the order and dispatch it:`,
        trail: [
          `Product: ${target.name} (${target.stock}/${target.threshold})`,
          `Selected Supplier: ${supplier.name} (${supplier.email})`,
          `Drafted Purchase Order (${reorderQty} units)`,
        ],
        actionCard: {
          title: `Purchase Order · ${target.name}`,
          details: `Supplier: ${supplier.name} · Recipient: ${supplier.email}`,
          preview: emailBodyText,
          actions: [
            {
              label: "Send Message to Supplier",
              icon: Mail,
              primary: true,
              url: `mailto:${supplier.email}?subject=${emailSubject}&body=${emailBody}`,
              action: poAction,
            },
            {
              label: "Send via WhatsApp",
              icon: MessageCircle,
              whatsapp: true,
              url: `https://wa.me/${supplier.phone.replace(/[^0-9]/g, "")}?text=${waText}`,
              action: { ...poAction, channel: "WhatsApp" },
            },
          ],
        },
      };
    }
  }

  // B. Supplier Directory
  if (/(supplier|vendor|distributor|who supplies)/.test(t)) {
    const supList = suppliers
      .map(
        (s) =>
          `• **${s.name}** (Attn: ${s.contactPerson})\n  Email: ${s.email} · Phone: ${s.phone}\n  Products: ${s.products.join(", ")}\n  Terms: ${s.paymentTerms}`
      )
      .join("\n\n");

    return {
      text: `Here is our approved **Supplier Directory**:\n\n${supList}\n\nTo place an order with any supplier, tell me *"Reorder <item name>"* and I will automatically draft and address the message.`,
      trail: [`Listed ${suppliers.length} active suppliers`],
    };
  }

  // C. Low Stock / Below Threshold Check
  if (/(low|threshold|below|alert|status|stock)/.test(t)) {
    if (lowItems.length === 0) {
      return {
        text: `Good news! All **${items.length} inventory products** are currently healthy and above their reorder thresholds. No immediate reorders needed.`,
        trail: ["All stock levels optimal"],
      };
    }

    const lowList = lowItems
      .map((i) => `• **${i.name}**: ${i.stock} units left (Threshold: ${i.threshold}) · Supplier: ${i.supplierName}`)
      .join("\n");

    return {
      text: `There ${lowItems.length === 1 ? "is" : "are"} currently **${lowItems.length} item(s) below reorder threshold**:\n\n${lowList}\n\nYou can click **"Confirm reorder"** in the table or say *"Reorder Cooking Oil"* and I'll generate the supplier email immediately.`,
      trail: lowItems.map((i) => `${i.name}: ${i.stock}/${i.threshold}`),
    };
  }

  // Default inventory overview
  return {
    text: `Inventory Snapshot:\n\n• **Total Products:** ${items.length} items in catalog\n• **Items Below Threshold:** ${lowItems.length} items need restock\n• **Suppliers on file:** ${suppliers.length} commercial distributors\n\nHow can I help you manage inventory? Say *"Which items are below threshold?"* or *"Reorder Cooking Oil 1L from supplier"*.`,
    trail: [`Catalog count: ${items.length}`, `Items requiring attention: ${lowItems.length}`],
  };
}
