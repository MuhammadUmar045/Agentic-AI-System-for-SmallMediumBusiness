import React, { useState, useEffect, useRef, useCallback } from "react";
import { Sparkles, Send, CheckCircle2, Info, ArrowUpRight, Loader2, Circle, ChevronDown, ChevronRight, Copy, Check } from "lucide-react";
import { C, AGENTS } from "../data/constants.js";
import { useAppState } from "../context/AppStateContext.jsx";
import { agentChat, getAccessToken } from "../utils/api.js";

function findRecByText(text, recs) {
  const t = text.toLowerCase();
  return recs.find((r) => t.includes(r.title.toLowerCase().split(" ").slice(0, 3).join(" ")) || r.title.toLowerCase().split(" ").some((w) => w.length > 4 && t.includes(w)));
}
function findItemByText(text, items) {
  const t = text.toLowerCase();
  return items.find((i) => t.includes(i.name.toLowerCase()) || i.name.toLowerCase().split(" ").some((w) => w.length > 3 && t.includes(w)));
}
function findDraftByText(text, drafts) {
  const t = text.toLowerCase();
  return drafts.find((d) => t.includes(d.customer.toLowerCase()) || d.customer.toLowerCase().split(" ").some((w) => w.length > 3 && t.includes(w)));
}
function extractQuantity(text) {
  const m = text.match(/(\d+)\s*(unit|pcs|kg|pack|piece|item|box)?s?\b/i);
  return m ? parseInt(m[1], 10) : null;
}
function extractItemName(text, keywords) {
  let cleaned = text;
  keywords.forEach((kw) => { cleaned = cleaned.replace(new RegExp(kw, "gi"), ""); });
  cleaned = cleaned.replace(/\d+\s*(unit|pcs|kg|pack|piece|item|box)?s?\b/gi, "").replace(/\bof\b/gi, "").trim();
  const words = cleaned.split(/\s+/).filter((w) => w.length > 1);
  return words.length > 0 ? words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ") : null;
}

function applyActions(actions, dispatch) {
  actions.forEach((a) => dispatch(a));
}

const AGENT_THINKING_TEXT = {
  finance: "Reviewing financial data and recommendations…",
  inventory: "Scanning stock levels and thresholds…",
  communication: "Checking customer messages and drafts…",
  analytics: "Aggregating cross-department metrics…",
};

function planTurn(text, state, derived, dispatch, role) {
  const t = text.toLowerCase();
  const actions = [];
  const isOwner = role === "owner";

  if (/(approve)/.test(t) && isOwner) {
    const rec = findRecByText(t, derived.pendingRecs);
    if (rec) {
      actions.push({ type: "APPROVE_REC", id: rec.id });
      return {
        intro: "On it — approving that on your behalf.", agents: ["finance"],
        result: `Approved "${rec.title}". ${rec.impactLabel}, and I've nudged your cash runway estimate accordingly.`,
        cta: { label: "Open Finance workspace", section: "finance" }, actions,
        trail: [`Matched recommendation #${rec.id}`, `Estimated impact: ${rec.impactLabel}`],
      };
    }
  }
  if (/(reject|decline)/.test(t) && /(rec|ad spend|supplier|recommendation)/.test(t) && isOwner) {
    const rec = findRecByText(t, derived.pendingRecs);
    if (rec) {
      actions.push({ type: "REJECT_REC", id: rec.id });
      return {
        intro: "Understood — rejecting that recommendation.", agents: ["finance"],
        result: `Rejected "${rec.title}". I won't resurface this one unless something changes.`,
        cta: { label: "Open Finance workspace", section: "finance" }, actions,
        trail: [`Matched recommendation #${rec.id}`],
      };
    }
  }
  if (/(reorder|restock|order more)/.test(t)) {
    const item = findItemByText(t, state.inventory.filter((i) => !i.reordered));
    if (item) {
      actions.push({ type: "PLACE_REORDER", id: item.id });
      return {
        intro: "Checking stock and placing that order.", agents: ["inventory"],
        result: `Reorder placed for ${item.name} (currently ${item.stock} units, threshold ${item.threshold}). I'll flag it here once it lands.`,
        cta: { label: "Open Inventory workspace", section: "inventory" }, actions,
        trail: [`${item.name}: ${item.stock}/${item.threshold} units`, "Reorder request logged"],
      };
    }
  }
  // CRUD: Add inventory item
  if (/(add|create|new)\b/.test(t) && /(item|product|stock|inventory|unit)/.test(t)) {
    const qty = extractQuantity(t) || 1;
    const name = extractItemName(t, ["add", "create", "new", "item", "product", "stock", "inventory", "to", "the", "my", "units", "of", "in", "please"]);
    if (name) {
      actions.push({ type: "ADD_INVENTORY_ITEM", name, stock: qty, threshold: 50 });
      return {
        intro: "Adding that to your inventory now.", agents: ["inventory"],
        result: `Added "${name}" with ${qty} unit(s) to inventory. Default reorder threshold set to 50.`,
        cta: { label: "Open Inventory workspace", section: "inventory" }, actions,
        trail: [`Product: ${name}`, `Initial stock: ${qty}`, "Threshold: 50"],
      };
    }
  }
  // CRUD: Update inventory stock
  if (/(update|change|set)\b/.test(t) && /(stock|quantity|units)/.test(t)) {
    const qty = extractQuantity(t);
    const item = findItemByText(t, state.inventory);
    if (item && qty !== null) {
      actions.push({ type: "UPDATE_INVENTORY_STOCK", id: item.id, stock: qty });
      return {
        intro: "Updating the stock count now.", agents: ["inventory"],
        result: `Updated "${item.name}" stock from ${item.stock} to ${qty} units.`,
        cta: { label: "Open Inventory workspace", section: "inventory" }, actions,
        trail: [`${item.name}: ${item.stock} → ${qty}`],
      };
    }
  }
  // CRUD: Delete inventory item
  if (/(remove|delete)\b/.test(t) && /(item|product)/.test(t)) {
    const item = findItemByText(t, state.inventory);
    if (item) {
      actions.push({ type: "DELETE_INVENTORY_ITEM", id: item.id });
      return {
        intro: "Removing that item from your inventory.", agents: ["inventory"],
        result: `Removed "${item.name}" from inventory.`,
        cta: { label: "Open Inventory workspace", section: "inventory" }, actions,
        trail: [`Removed: ${item.name}`],
      };
    }
  }
  if (/(send|dispatch)/.test(t) && /(follow.?up|message|draft|email|promo)/.test(t) || (/(send)/.test(t) && findDraftByText(t, state.drafts))) {
    const draft = findDraftByText(t, state.drafts.filter((d) => !d.sent));
    if (draft) {
      actions.push({ type: "SEND_DRAFT", id: draft.id });
      return {
        intro: "Sending that draft now.", agents: ["communication"],
        result: `Sent the ${draft.type.toLowerCase()} to ${draft.customer}.`,
        cta: { label: "Open Communication workspace", section: "communication" }, actions,
        trail: [`Recipient: ${draft.customer}`, `Type: ${draft.type}`],
      };
    }
  }
  // CRUD: Add draft
  if (/(draft|compose|write)\b/.test(t) && /(email|message|promo|follow)/.test(t)) {
    const customer = extractItemName(t, ["draft", "compose", "write", "email", "message", "promo", "follow", "up", "for", "to", "a", "an", "the", "my", "new", "please"]);
    if (customer) {
      const draftType = /(promo)/.test(t) ? "Promo" : "Follow-up";
      actions.push({ type: "ADD_DRAFT", customer, draftType, text: "" });
      return {
        intro: "Drafting that message now.", agents: ["communication"],
        result: `Created a new ${draftType.toLowerCase()} draft for ${customer}. Head to the Communication workspace to edit and send it.`,
        cta: { label: "Open Communication workspace", section: "communication" }, actions,
        trail: [`Customer: ${customer}`, `Type: ${draftType}`],
      };
    }
  }
  // CRUD: Delete draft
  if (/(delete|remove)\b/.test(t) && /(draft|message)/.test(t)) {
    const draft = findDraftByText(t, state.drafts);
    if (draft) {
      actions.push({ type: "DELETE_DRAFT", id: draft.id });
      return {
        intro: "Removing that draft.", agents: ["communication"],
        result: `Deleted the draft for ${draft.customer}.`,
        cta: { label: "Open Communication workspace", section: "communication" }, actions,
        trail: [`Deleted: ${draft.customer} — ${draft.type}`],
      };
    }
  }
  if (/(generate|build|create).*(report)/.test(t) || /^report$/.test(t.trim())) {
    return {
      intro: "Pulling live numbers from every agent for this.", agents: ["analytics"],
      result: "Your report is ready in the Analytics workspace — it now reflects live approvals, stock levels, and sent messages, not fixed sample data.",
      cta: { label: "Open Analytics workspace", section: "analytics" }, actions: [],
      trail: ["Aggregated Finance, Inventory, and Communication state"],
    };
  }

  if (/(debit|khata|receivable|owe)/.test(t)) {
    const custDebits = (state.customers || []).filter((c) => (c.debit || 0) > 0);
    const totalDeb = custDebits.reduce((sum, c) => sum + (c.debit || 0), 0);
    return {
      intro: "Pulling ledger data and customer debits.",
      agents: ["finance"],
      result: `You have ${custDebits.length} customer(s) with outstanding debits totaling ₨${totalDeb.toLocaleString()}: ${custDebits.map((c) => `${c.name} (₨${c.debit.toLocaleString()})`).join(", ")}. Head to the Finance workspace to send WhatsApp or email payment reminders.`,
      cta: { label: "Open Finance workspace", section: "finance" },
      actions: [],
      trail: [`Total customer debits: ₨${totalDeb.toLocaleString()}`, `${custDebits.length} debit accounts`],
    };
  }

  if (/(profit|revenue|expense|budget|cash|financ)/.test(t)) {
    const pending = derived.pendingRecs.length;
    return {
      intro: "Got it — looping in the Finance Agent to pull your numbers.",
      agents: ["finance"],
      result: pending > 0
        ? `Net profit is trending up, but there ${pending === 1 ? "is" : "are"} ${pending} recommendation${pending === 1 ? "" : "s"} still waiting on you — together worth about ₨${derived.pendingImpact ? derived.pendingImpact.toLocaleString() : "0"}+ if approved. Cash runway is currently ${derived.runway.toFixed(1)} months.`
        : `All finance recommendations are cleared for now. Cash runway is holding at ${derived.runway.toFixed(1)} months, boosted by the actions you've already approved.`,
      cta: { label: "Open Finance workspace", section: "finance" }, actions: [],
      trail: [`${pending} pending recommendation(s)`, `Cash runway: ${derived.runway.toFixed(1)} months`],
    };
  }
  if (/(stock|inventory|reorder|supply|warehouse)/.test(t)) {
    const low = derived.lowStock;
    return {
      intro: "On it — checking current stock against demand forecasts.",
      agents: ["inventory"],
      result: low.length > 0
        ? `${low.length} item${low.length > 1 ? "s are" : " is"} below its reorder threshold right now: ${low.map((i) => i.name).join(", ")}. Say "reorder <item>" and I'll place it.`
        : "Everything is above its reorder threshold at the moment — nothing needs action.",
      cta: { label: "Open Inventory workspace", section: "inventory" }, actions: [],
      trail: low.map((i) => `${i.name}: ${i.stock}/${i.threshold}`),
    };
  }
  if (/(email|customer|follow.?up|message|draft|promo)/.test(t)) {
    const unsent = derived.unsentDrafts;
    return {
      intro: "Sure — bringing in the Communication Agent.",
      agents: ["communication"],
      result: unsent.length > 0
        ? `${unsent.length} draft${unsent.length > 1 ? "s are" : " is"} ready and unsent: ${unsent.map((d) => d.customer).join(", ")}. Say "send the message to <customer>" and I'll send it.`
        : "Every drafted message has already been sent — I'll draft new ones as fresh order activity comes in.",
      cta: { label: "Open Communication workspace", section: "communication" }, actions: [],
      trail: unsent.map((d) => `${d.customer} — ${d.type}`),
    };
  }
  if (/(report|analytics|performance|summary|kpi)/.test(t)) {
    return {
      intro: "Pulling data from every agent to put this together.",
      agents: ["analytics"],
      result: `Performance snapshot: ${derived.approvedRecs.length} finance action(s) applied, ${derived.lowStock.length} inventory item(s) need attention, ${derived.sentDrafts.length}/${state.drafts.length} customer messages sent.`,
      cta: { label: "Open Analytics workspace", section: "analytics" }, actions: [],
      trail: ["Live cross-agent snapshot"],
    };
  }

  return {
    intro: "Got it. Breaking this into tasks and looping in the team.",
    agents: ["finance", "inventory", "communication"],
    result: `Here's the plan: Finance reviews the ${derived.pendingRecs.length} pending recommendation(s), Inventory checks the ${derived.lowStock.length} item(s) near threshold, and Communication follows up with customers on unsent drafts. I'll track all three toward your goal.`,
    cta: { label: "Track progress in Analytics", section: "analytics" }, actions: [],
    trail: ["Goal decomposed across 3 agents"],
  };
}

const SUGGESTIONS = [
  "Increase Q4 profit by 15%",
  "Add 5 units of Sultan Ghee",
  "Check inventory before the Eid rush",
  "Generate this month's performance report",
];

/* ─── Agent Pipeline (Claude-style interactive queue) ─── */

function AgentStep({ agent, status, detail, elapsed, defaultExpanded }) {
  const [expanded, setExpanded] = useState(defaultExpanded || status === "working");
  const A = AGENTS[agent];
  if (!A) return null;

  useEffect(() => {
    if (status === "working" || status === "thinking") setExpanded(true);
    if (status === "done" && !defaultExpanded) {
      const t = setTimeout(() => setExpanded(false), 600);
      return () => clearTimeout(t);
    }
  }, [status]);

  const statusIcon = {
    queued: <Circle size={12} color={C.inkFaint} />,
    thinking: <div className="think-dot" style={{ width: 8, height: 8, borderRadius: "50%", background: C.teal }} />,
    working: <Loader2 size={14} color={C.teal} className="spin" />,
    done: <CheckCircle2 size={14} color="#0A7873" />,
  };

  return (
    <div className="agent-step" style={{
      border: `1px solid ${status === "done" ? "#DCF5F3" : status === "working" || status === "thinking" ? C.tealSoft : C.line}`,
      borderLeft: `3px solid ${status === "done" ? "#0A7873" : status === "working" || status === "thinking" ? C.teal : C.inkFaint}`,
      borderRadius: "4px 10px 10px 4px",
      background: status === "working" || status === "thinking" ? "rgba(14,165,160,.03)" : "#fff",
      padding: "10px 14px",
      transition: "all .3s ease",
    }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, cursor: status === "done" ? "pointer" : "default" }}
        onClick={() => status === "done" && setExpanded((e) => !e)}
      >
        {statusIcon[status]}
        <A.icon size={14} color={A.color} />
        <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, flex: 1 }}>{A.label}</span>
        {status === "working" && <span className="shimmer-text" style={{ fontSize: 11, fontWeight: 600 }}>Processing</span>}
        {status === "thinking" && <span className="shimmer-text" style={{ fontSize: 11, fontWeight: 600 }}>Analyzing</span>}
        {status === "queued" && <span style={{ fontSize: 11, color: C.inkFaint }}>Queued</span>}
        {status === "done" && elapsed && <span className="font-mono" style={{ fontSize: 10, color: C.inkFaint }}>{elapsed}</span>}
        {status === "done" && (expanded ? <ChevronDown size={13} color={C.inkFaint} /> : <ChevronRight size={13} color={C.inkFaint} />)}
      </div>
      {expanded && detail && detail.length > 0 && (
        <div style={{ marginTop: 8, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 3 }}>
          {detail.map((line, i) => (
            <div key={i} style={{ fontSize: 12, color: C.inkSoft, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "#0A7873" }}>›</span> {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AgentPipeline({ agents, agentStates }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
      {agents.map((agent) => {
        const s = agentStates[agent] || { status: "queued" };
        return <AgentStep key={agent} agent={agent} status={s.status} detail={s.detail} elapsed={s.elapsed} />;
      })}
    </div>
  );
}

/* ─── Markdown Formatter ─── */

function formatInline(line) {
  // Convert **bold** to <strong>, *italic* to <em>
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
  // Split by explicit newlines, or detect numbered lists jammed together like "1) ... 2) ..."
  let cleaned = text
    .replace(/(\d+)\)\s+\*\*/g, "\n$1) **")  // force line break before "1) **"
    .replace(/\(FYI\)/g, "\n(FYI)")           // force line break before (FYI)
    .replace(/;\s*\*\*/g, ";\n**");           // force break after semicolons before bold
  
  const lines = cleaned.split("\n").map((l) => l.trim()).filter(Boolean);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {lines.map((line, i) => {
        // Detect numbered list items: "1) ..." or "1. ..."
        const numMatch = line.match(/^(\d+)[.)]\s*(.*)/);
        if (numMatch) {
          return (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span className="font-mono" style={{ fontSize: 12, fontWeight: 700, color: C.teal, minWidth: 18, flexShrink: 0, marginTop: 1 }}>{numMatch[1]}.</span>
              <span style={{ lineHeight: 1.5 }}>{formatInline(numMatch[2])}</span>
            </div>
          );
        }
        // Detect bullet items: "- ..." or "• ..."
        const bulletMatch = line.match(/^[-•]\s*(.*)/);
        if (bulletMatch) {
          return (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", paddingLeft: 4 }}>
              <span style={{ color: C.teal, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>·</span>
              <span style={{ lineHeight: 1.5 }}>{formatInline(bulletMatch[1])}</span>
            </div>
          );
        }
        // Regular paragraph
        return <div key={i} style={{ lineHeight: 1.55 }}>{formatInline(line)}</div>;
      })}
    </div>
  );
}

/* ─── Typewriter Effect ─── */

function TypewriterText({ text, speed = 18 }) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!text) return;
    setDisplayed("");
    setDone(false);
    let i = 0;
    const words = text.split(" ");
    const timer = setInterval(() => {
      i++;
      setDisplayed(words.slice(0, i).join(" "));
      if (i >= words.length) { clearInterval(timer); setDone(true); }
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);
  if (done) return <FormattedText text={text} />;
  return <>{displayed}<span style={{ opacity: 1, transition: "opacity .2s" }}>▍</span></>;
}

function CopyButton({ text }) {
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
      style={{ background: "none", border: "none", padding: 4, cursor: "pointer", color: copied ? "#0A7873" : C.inkFaint, transition: "color .2s" }}
      title={copied ? "Copied!" : "Copy response"}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

/* ─── Chat Messages ─── */

function ChatMessage({ m, onNavigate }) {
  if (m.role === "user") {
    return (
      <div className="anim-in" style={{ alignSelf: "flex-end", marginLeft: "auto", maxWidth: "78%", background: C.navy, color: "#fff", padding: "11px 16px", borderRadius: "16px 16px 4px 16px", fontSize: 14.5 }}>
        {m.text}
      </div>
    );
  }
  if (m.role === "planner") {
    return (
      <div className="anim-in" style={{ display: "flex", gap: 10, maxWidth: "88%" }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: C.navy, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Sparkles size={14} color={C.amber} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ background: C.bg, padding: "11px 16px", borderRadius: "4px 16px 16px 16px", fontSize: 14.5, marginBottom: m.pipeline ? 0 : 0 }}>{m.text}</div>
          {m.pipeline && <AgentPipeline agents={m.pipeline.agents} agentStates={m.pipeline.states} />}
        </div>
      </div>
    );
  }
  const A = AGENTS[m.agent];
  return (
    <div className="anim-in" style={{ display: "flex", gap: 10, maxWidth: "82%" }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, background: A.soft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <A.icon size={14} color={A.color} />
      </div>
      <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderLeft: `3px solid ${A.color}`, borderRadius: "4px 14px 14px 4px", padding: "13px 16px", flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: A.color, textTransform: "uppercase", letterSpacing: .4 }}>{A.label}</div>
          <CopyButton text={m.text} />
        </div>
        <div style={{ fontSize: 14.5, marginBottom: (m.cta || m.trail) ? 10 : 0 }}><TypewriterText text={m.text} /></div>
        {m.trail && m.trail.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: m.cta ? 10 : 0, background: C.bg, borderRadius: 8, padding: "8px 10px" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: C.inkFaint, textTransform: "uppercase", letterSpacing: .3, display: "flex", alignItems: "center", gap: 4 }}><Info size={10} /> What I checked</div>
            {m.trail.map((line, i) => <div key={i} style={{ fontSize: 12, color: C.inkSoft }}>· {line}</div>)}
          </div>
        )}
        {m.cta && (
          <button className="vantage-focus" onClick={() => onNavigate(m.cta.section)} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700, color: C.navy, background: "none", border: "none", padding: 0 }}>
            {m.cta.label} <ArrowUpRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function ChatPlanner({ onNavigate, ownerName, role }) {
  const { state, dispatch, derived } = useAppState();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const idRef = useRef(1);
  const bottomRef = useRef(null);
  const conversationRef = useRef(null);
  const nextId = () => idRef.current++;
  const timersRef = useRef([]);
  useEffect(() => {
    return () => { timersRef.current.forEach((t) => clearTimeout(t)); };
  }, []);
  const safeTimeout = (fn, ms) => { const t = setTimeout(fn, ms); timersRef.current.push(t); return t; };

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const updatePipelineState = (thinkId, agent, update) => {
    setMessages((m) => m.map((msg) => {
      if (msg.id !== thinkId || !msg.pipeline) return msg;
      return { ...msg, pipeline: { ...msg.pipeline, states: { ...msg.pipeline.states, [agent]: { ...msg.pipeline.states[agent], ...update } } } };
    }));
  };

  const send = useCallback(async (raw) => {
    const text = (raw ?? input).trim();
    if (!text || sending) return;
    setSending(true);
    setMessages((m) => [...m, { id: nextId(), role: "user", text }]);
    setInput("");
    if (getAccessToken()) {
      try {
        const serverTurn = await agentChat(text, conversationRef.current, state);
        conversationRef.current = serverTurn.conversation_id;
        const thinkId = nextId();
        const agents = serverTurn.agents?.length ? serverTurn.agents : ["finance"];
        const startTime = Date.now();
        // Initialize pipeline with all agents queued
        const initialStates = {};
        agents.forEach((a) => { initialStates[a] = { status: "queued", detail: [] }; });
        setMessages((m) => [...m, {
          id: thinkId, role: "planner",
          text: "Breaking this down and routing to agents…",
          pipeline: { agents, states: initialStates },
        }]);
        // Animate each agent through thinking → working → done
        agents.forEach((a, i) => {
          safeTimeout(() => {
            updatePipelineState(thinkId, a, { status: "thinking", detail: [AGENT_THINKING_TEXT[a] || "Analyzing…"] });
          }, 200 + i * 500);
          safeTimeout(() => {
            updatePipelineState(thinkId, a, { status: "working" });
          }, 500 + i * 500);
          safeTimeout(() => {
            const elapsed = `${((Date.now() - startTime) / 1000).toFixed(1)}s`;
            const detail = [AGENT_THINKING_TEXT[a] || "Done"];
            // Add action-specific details
            const actionLabels = { APPROVE_REC: "Approved recommendation", REJECT_REC: "Rejected recommendation", PLACE_REORDER: "Placed reorder", SEND_DRAFT: "Sent draft", ADD_INVENTORY_ITEM: "Added inventory item", UPDATE_INVENTORY_STOCK: "Updated stock", DELETE_INVENTORY_ITEM: "Removed item", ADD_DRAFT: "Created draft", DELETE_DRAFT: "Deleted draft" };
            const actionAgentMap = { APPROVE_REC: "finance", REJECT_REC: "finance", PLACE_REORDER: "inventory", ADD_INVENTORY_ITEM: "inventory", UPDATE_INVENTORY_STOCK: "inventory", DELETE_INVENTORY_ITEM: "inventory", SEND_DRAFT: "communication", ADD_DRAFT: "communication", DELETE_DRAFT: "communication" };
            (serverTurn.actions || []).forEach((act) => {
              if (actionAgentMap[act.type] === a) detail.push(`✓ ${actionLabels[act.type] || act.type}`);
            });
            updatePipelineState(thinkId, a, { status: "done", detail, elapsed });
          }, 800 + i * 500);
        });
        // After all agents done, dispatch actions and show final response
        const totalDelay = 800 + agents.length * 500 + 300;
        safeTimeout(() => {
          const actions = serverTurn.actions || [];
          const blockedTypes = role !== "owner" ? ["APPROVE_REC", "REJECT_REC"] : [];
          const allowed = actions.filter((a) => !blockedTypes.includes(a.type));
          allowed.forEach((a) => dispatch(a));
          const blocked = actions.filter((a) => blockedTypes.includes(a.type));
          const trail = [];
          if (allowed.length) trail.push(`Executed ${allowed.length} action(s)`);
          if (blocked.length) trail.push(`Blocked ${blocked.length} action(s) — requires owner role`);
          const lastAgent = agents[agents.length - 1];
          const ctaMap = { finance: "Finance", inventory: "Inventory", communication: "Communication", analytics: "Analytics" };
          const cta = ctaMap[lastAgent] ? { label: `Open ${ctaMap[lastAgent]} workspace`, section: lastAgent } : null;
          setMessages((m) => [...m, { id: nextId(), role: "agent", agent: lastAgent, text: serverTurn.message, cta, trail: trail.length ? trail : undefined }]);
          setSending(false);
        }, totalDelay);
        return;
      } catch (error) {
        if (error.status === 401) {
          // Token expired — will fall through to local planner
        }
        // Fall through to local planner on any API error
      }
    }
    const plan = planTurn(text, state, derived, dispatch, role);
    const thinkId = nextId();
    const startTime = Date.now();
    // Initialize pipeline
    const initialStates = {};
    plan.agents.forEach((a) => { initialStates[a] = { status: "queued", detail: [] }; });
    safeTimeout(() => {
      setMessages((m) => [...m, {
        id: thinkId, role: "planner", text: plan.intro,
        pipeline: { agents: plan.agents, states: initialStates },
      }]);
      plan.agents.forEach((a, i) => {
        safeTimeout(() => {
          updatePipelineState(thinkId, a, { status: "thinking", detail: [AGENT_THINKING_TEXT[a] || "Analyzing…"] });
        }, 350 + i * 550);
        safeTimeout(() => {
          updatePipelineState(thinkId, a, { status: "working" });
        }, 600 + i * 550);
        safeTimeout(() => {
          const elapsed = `${((Date.now() - startTime) / 1000).toFixed(1)}s`;
          const trailForAgent = plan.trail || [];
          updatePipelineState(thinkId, a, { status: "done", detail: trailForAgent, elapsed });
        }, 850 + i * 550);
      });
      const totalDelay = 850 + plan.agents.length * 550 + 300;
      safeTimeout(() => {
        if (plan.actions && plan.actions.length) applyActions(plan.actions, dispatch);
        setMessages((m) => [...m, { id: nextId(), role: "agent", agent: plan.agents[plan.agents.length - 1], text: plan.result, cta: plan.cta, trail: plan.trail }]);
        setSending(false);
      }, totalDelay);
    }, 450);
  }, [input, state, derived, dispatch, role, sending]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 61px)" }}>
      <div className="vantage-scroll" style={{ flex: 1, overflowY: "auto", padding: "28px 24px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          {messages.length === 0 && (
            <div className="anim-in" style={{ textAlign: "center", padding: "60px 0 30px" }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: C.navy, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
                <Sparkles size={24} color={C.amber} />
              </div>
              <h2 className="font-display" style={{ fontSize: 24, fontWeight: 600, marginBottom: 6 }}>
                {ownerName ? `What should we work on, ${ownerName.split(" ")[0]}?` : "What should we work on?"}
              </h2>
              <p style={{ color: C.inkSoft, fontSize: 14, marginBottom: 24 }}>Set a goal, ask a question, or say "add 5 units of Sultan Ghee" — I can act, not just talk.</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="vantage-focus" onClick={() => send(s)} style={{
                    padding: "9px 14px", borderRadius: 999, border: `1.5px solid ${C.line}`, background: "#fff", fontSize: 13, fontWeight: 600, color: C.navy,
                  }}>{s}</button>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {messages.map((m) => (
              <ChatMessage key={m.id} m={m} onNavigate={onNavigate} />
            ))}
          </div>
          <div ref={bottomRef} />
        </div>
      </div>

      <div style={{ padding: "16px 24px 22px", borderTop: `1px solid ${C.line}` }}>
        <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", gap: 10, alignItems: "flex-end", background: C.bg, borderRadius: 16, padding: 8 }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Message the Planner Agent…"
            rows={1}
            className="vantage-focus"
            style={{ flex: 1, resize: "none", border: "none", background: "transparent", padding: "10px 8px", fontSize: 14.5, outline: "none" }}
          />
          <button className="vantage-focus" onClick={() => send()} disabled={sending} style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: "10px 18px", fontSize: 14, fontWeight: 600, borderRadius: 10, border: "1px solid transparent",
            background: C.navy, color: "#fff", opacity: sending ? 0.7 : 1, transition: "opacity .2s",
          }}>{sending ? <Loader2 size={15} className="spin" /> : <Send size={15} />}</button>
        </div>
      </div>
    </div>
  );
}
