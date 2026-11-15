import React, { useState, useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";
import { C, AGENTS } from "../data/constants.js";

export function OrgChartVisual({ compact, darkMode = true }) {
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
          return <line key={n.key} x1={cx} y1={cy} x2={x} y2={y} stroke={darkMode ? "rgba(255,255,255,.35)" : "rgba(31,42,68,.2)"} strokeWidth="2" className="flow-line" />;
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
              background: darkMode ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.95)", border: darkMode ? "1px solid rgba(255,255,255,.18)" : `1px solid ${C.line}`,
              borderRadius: 12, padding: "8px 10px", backdropFilter: "blur(2px)",
            }}>
              <A.icon size={16} color={darkMode ? "#fff" : A.color} />
              <span style={{ fontSize: 11, color: darkMode ? "#fff" : C.ink, fontWeight: 700 }}>{n.label}</span>
              <span className="font-mono" style={{ fontSize: 10, color: darkMode ? "rgba(255,255,255,.65)" : C.inkSoft }}>{n.stat}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Landing({ goToSignup, goToSignin }) {
  // --- GOAL PLANNER STATE ---
  const [goalInput, setGoalInput] = useState("");
  const [tasks, setTasks] = useState([]);
  const [runId, setRunId] = useState(0);
  const tasksTimerRef = useRef([]);

  const PLANS = {
    profit: [
      ["FINANCE", "Analyse P&L and find top 3 cost leaks"],
      ["INVENTORY", "Flag slow-moving stock tying up cash"],
      ["COMMS", "Draft promo email for best sellers"],
      ["REPORTS", "Schedule weekly profit-progress report"],
    ],
    stock: [
      ["INVENTORY", "Scan stock levels vs. 90-day demand"],
      ["FINANCE", "Forecast cash needed for reorders"],
      ["COMMS", "Draft supplier emails (awaiting approval)"],
      ["REPORTS", "Set low-stock alert dashboard"],
    ],
    pay: [
      ["FINANCE", "List invoices overdue > 15 days"],
      ["COMMS", "Draft polite payment reminders"],
      ["FINANCE", "Rank customers by payment risk"],
      ["REPORTS", "Generate receivables ageing report"],
    ],
    def: [
      ["PLANNER", "Break goal into measurable milestones"],
      ["FINANCE", "Pull relevant financial baselines"],
      ["COMMS", "Draft stakeholder update"],
      ["REPORTS", "Create progress tracker"],
    ],
  };

  const runPlanner = (text) => {
    if (!text || !text.trim()) return;
    tasksTimerRef.current.forEach((t) => clearTimeout(t));
    tasksTimerRef.current = [];

    const nextRun = runId + 1;
    setRunId(nextRun);
    setTasks([]);

    const l = text.toLowerCase();
    const key = /profit|revenue|cost|margin/.test(l)
      ? "profit"
      : /stock|inventory|reorder/.test(l)
      ? "stock"
      : /pay|invoice|overdue|recover|debit/.test(l)
      ? "pay"
      : "def";

    const planItems = PLANS[key];
    planItems.forEach((item, index) => {
      const t1 = setTimeout(() => {
        setTasks((prev) => [
          ...prev,
          { id: index, agent: item[0], task: item[1], status: "queued…" },
        ]);
      }, index * 600);
      tasksTimerRef.current.push(t1);

      const t2 = setTimeout(() => {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === index ? { ...t, status: "✓ assigned", done: true } : t
          )
        );
      }, index * 600 + 700);
      tasksTimerRef.current.push(t2);
    });
  };

  useEffect(() => {
    // Initial run after short delay
    const initialTimer = setTimeout(() => {
      setGoalInput("Increase profit by 15% this quarter");
      runPlanner("Increase profit by 15% this quarter");
    }, 900);
    return () => {
      clearTimeout(initialTimer);
      tasksTimerRef.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  const handleGoalSubmit = (e) => {
    e.preventDefault();
    runPlanner(goalInput);
  };

  const handleChipClick = (g) => {
    setGoalInput(g);
    runPlanner(g);
  };

  // --- STATS ANIMATION ---
  const [stats, setStats] = useState({
    businesses: 0,
    revenue: 0,
    uptime: 0,
    agents: 0,
  });
  const statsRef = useRef(null);
  const [hasAnimatedStats, setHasAnimatedStats] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !hasAnimatedStats) {
          setHasAnimatedStats(true);
          const duration = 1400;
          const startTime = performance.now();

          const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out cubic
            const ease = 1 - Math.pow(1 - progress, 3);

            setStats({
              businesses: Math.round(2400 * ease),
              revenue: Number((4.2 * ease).toFixed(1)),
              uptime: Number((99.8 * ease).toFixed(1)),
              agents: Math.round(6 * ease),
            });

            if (progress < 1) {
              requestAnimationFrame(animate);
            }
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.3 }
    );

    if (statsRef.current) observer.observe(statsRef.current);
    return () => observer.disconnect();
  }, [hasAnimatedStats]);

  // --- AGENTS DATA & TABS ---
  const AGENTS_LIST = [
    {
      icon: "💰",
      name: "Finance Intelligence",
      tagline:
        "Upload transactions, get AI P&L analysis, 90-day forecasts and recommendations to approve.",
      metrics: [
        ["Revenue forecast", 82],
        ["Cost anomalies caught", 64],
        ["Forecast accuracy", 91],
      ],
      tags: ["P&L", "FORECAST", "CSV UPLOAD"],
    },
    {
      icon: "📦",
      name: "Inventory Optimization",
      tagline:
        "Real-time stock monitoring with AI reorder alerts. Confirm a reorder and supplier emails are auto-drafted.",
      metrics: [
        ["Stock health", 76],
        ["Stock-outs avoided", 88],
        ["Reorder time saved", 70],
      ],
      tags: ["REORDER ALERTS", "SUPPLIER DRAFTS"],
    },
    {
      icon: "✉️",
      name: "Communications Agent",
      tagline:
        "Professional emails for follow-ups, payment reminders and promotions. You approve before sending.",
      metrics: [
        ["Drafts approved", 93],
        ["Replies received", 58],
        ["Time saved", 85],
      ],
      tags: ["HUMAN-APPROVED", "FOLLOW-UPS"],
    },
    {
      icon: "🎯",
      name: "Goal Planner",
      tagline:
        "Type a goal in plain language. The AI breaks it into tasks and assigns them across all agents.",
      metrics: [
        ["Goals on track", 72],
        ["Tasks auto-assigned", 95],
        ["Milestones hit", 68],
      ],
      tags: ["PLAIN LANGUAGE", "MULTI-AGENT"],
    },
    {
      icon: "📊",
      name: "Auto Reports",
      tagline:
        "Business reports with AI narrative summaries pulled from your real operational data.",
      metrics: [
        ["Data coverage", 97],
        ["Report time cut", 90],
        ["Insights per report", 60],
      ],
      tags: ["PDF EXPORT", "WEEKLY"],
    },
    {
      icon: "🔒",
      name: "Enterprise Security",
      tagline:
        "Full tenant isolation, JWT auth, bcrypt passwords and RLS policies. Each business sees only its own data.",
      metrics: [
        ["Tenant isolation", 100],
        ["Auth hardening", 96],
        ["Policy coverage", 94],
      ],
      tags: ["JWT", "BCRYPT", "RLS"],
    },
  ];

  const [activeAgentIndex, setActiveAgentIndex] = useState(0);
  const activeAgent = AGENTS_LIST[activeAgentIndex];

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveAgentIndex((prev) => (prev + 1) % AGENTS_LIST.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // --- ROI CALCULATOR STATE ---
  const [adminHours, setAdminHours] = useState(30);
  const [hourlyCost, setHourlyCost] = useState(500);

  const estimatedSaving = Math.round(adminHours * hourlyCost * 4.3 * 0.6);
  const recommendedTier =
    estimatedSaving >= 19999 ? "Pro" : estimatedSaving >= 7999 ? "Growth" : "Starter";
  const tierCost = { Starter: 2999, Growth: 7999, Pro: 19999 }[recommendedTier];
  const paybackMultiplier = (estimatedSaving / tierCost).toFixed(1);

  // --- PRICING STATE ---
  const [billingCycle, setBillingCycle] = useState("monthly"); // "monthly" | "yearly"
  const discountMultiplier = billingCycle === "yearly" ? 0.8 : 1;

  const formatPKR = (val) => "₨" + Math.round(val).toLocaleString("en-US");

  const plans = [
    {
      id: "starter",
      name: "Starter",
      basePrice: 2999,
      subtitle: "1 user · 200 queries/mo",
      features: [
        "Finance + Inventory agents",
        "Basic reporting",
        "14-day free trial",
      ],
      recommended: false,
    },
    {
      id: "growth",
      name: "Growth",
      basePrice: 7999,
      subtitle: "10 users · 500 queries/mo",
      features: [
        "All 6 AI agents",
        "Goal planner",
        "PDF reports",
        "14-day free trial",
      ],
      recommended: true,
    },
    {
      id: "pro",
      name: "Pro",
      basePrice: 19999,
      subtitle: "Unlimited users & queries",
      features: [
        "Everything in Growth",
        "Priority API access",
        "Dedicated support",
      ],
      recommended: false,
    },
  ];

  // Marquee items
  const marqueeItems = [
    "FINANCE INTELLIGENCE",
    "INVENTORY OPTIMIZATION",
    "COMMUNICATIONS AGENT",
    "GOAL PLANNER",
    "AUTO REPORTS",
    "ENTERPRISE SECURITY",
  ];

  return (
    <div className="aicoo-landing">
      <style>{`
        .aicoo-landing {
          --bg: #0a1020;
          --bg2: #0f1830;
          --card: #121c36;
          --line: #1f2d4d;
          --tx: #eef2fb;
          --mut: #8b9abb;
          --acc: #e8a33d;
          --ok: #3ecf8e;
          background: var(--bg);
          color: var(--tx);
          font-family: 'IBM Plex Sans', system-ui, sans-serif;
          line-height: 1.6;
          min-height: 100vh;
          overflow-x: hidden;
        }

        .aicoo-landing * {
          box-sizing: border-box;
        }

        .aicoo-mono {
          font-family: 'IBM Plex Mono', ui-monospace, monospace;
        }

        .aicoo-wrap {
          max-width: 1120px;
          margin: 0 auto;
          padding: 0 20px;
        }

        /* Nav */
        .aicoo-nav {
          position: sticky;
          top: 0;
          z-index: 50;
          background: rgba(10, 16, 32, 0.88);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--line);
        }
        .aicoo-nav .aicoo-wrap {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 64px;
          gap: 16px;
        }
        .aicoo-logo {
          font-weight: 700;
          letter-spacing: 0.05em;
          font-size: 17px;
          text-decoration: none;
          color: var(--tx);
        }
        .aicoo-logo b {
          color: var(--acc);
        }
        .aicoo-links {
          display: flex;
          gap: 24px;
          color: var(--mut);
          font-size: 14px;
        }
        .aicoo-links a {
          color: inherit;
          text-decoration: none;
          transition: color 0.15s ease;
        }
        .aicoo-links a:hover {
          color: var(--tx);
        }
        .aicoo-live {
          font-size: 11px;
          color: var(--mut);
          letter-spacing: 0.08em;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .aicoo-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--ok);
          box-shadow: 0 0 0 0 var(--ok);
          animation: aicoo-pulse 2s infinite;
        }
        @keyframes aicoo-pulse {
          70% { box-shadow: 0 0 0 8px transparent; }
          100% { box-shadow: 0 0 0 0 transparent; }
        }

        /* Buttons */
        .aicoo-btn {
          display: inline-block;
          border: 1px solid var(--line);
          background: transparent;
          color: var(--tx);
          padding: 9px 18px;
          border-radius: 8px;
          font: 600 14px 'IBM Plex Sans';
          cursor: pointer;
          transition: all 0.2s ease;
          text-decoration: none;
          text-align: center;
        }
        .aicoo-btn:hover {
          border-color: var(--acc);
          transform: translateY(-1px);
        }
        .aicoo-btn.p {
          background: var(--acc);
          color: #1a1204;
          border-color: var(--acc);
        }
        .aicoo-btn.p:hover {
          box-shadow: 0 8px 24px rgba(232, 163, 61, 0.35);
        }

        /* Hero */
        .aicoo-hero {
          position: relative;
          text-align: center;
          padding: 72px 0 56px;
          background:
            radial-gradient(600px 300px at 50% 0, rgba(232, 163, 61, 0.14), transparent),
            linear-gradient(var(--line) 1px, transparent 1px) 0 0 / 100% 56px,
            linear-gradient(90deg, var(--line) 1px, transparent 1px) 0 0 / 56px 100%;
        }
        .aicoo-hero:after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(transparent 40%, var(--bg));
          pointer-events: none;
        }
        .aicoo-hero > .aicoo-wrap {
          position: relative;
          z-index: 1;
        }
        .aicoo-pill {
          display: inline-block;
          border: 1px solid var(--line);
          border-radius: 99px;
          padding: 5px 14px;
          font-size: 11px;
          letter-spacing: 0.14em;
          color: var(--acc);
          background: var(--bg);
        }
        .aicoo-hero h1 {
          font-size: clamp(34px, 5.5vw, 60px);
          line-height: 1.08;
          margin: 22px 0 16px;
          letter-spacing: -0.02em;
          font-weight: 700;
        }
        .aicoo-hero h1 em {
          font-style: normal;
          color: var(--acc);
        }
        .aicoo-sub {
          max-width: 620px;
          margin: 0 auto 28px;
          color: var(--mut);
          font-size: 18px;
        }

        /* Demo Box */
        .aicoo-demo {
          max-width: 760px;
          margin: 44px auto 0;
          background: var(--card);
          border: 1px solid var(--line);
          border-radius: 14px;
          text-align: left;
          box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45);
          overflow: hidden;
        }
        .aicoo-demo header {
          display: flex;
          gap: 6px;
          align-items: center;
          padding: 11px 16px;
          border-bottom: 1px solid var(--line);
          font-size: 11px;
          color: var(--mut);
          letter-spacing: 0.1em;
          background: rgba(10, 16, 32, 0.6);
        }
        .aicoo-demo header i {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: var(--line);
          display: inline-block;
        }
        .aicoo-demo form {
          display: flex;
          gap: 8px;
          padding: 14px;
        }
        .aicoo-demo input {
          flex: 1;
          min-width: 0;
          background: var(--bg);
          border: 1px solid var(--line);
          color: var(--tx);
          padding: 11px 14px;
          border-radius: 8px;
          font: 14px 'IBM Plex Mono', monospace;
          outline: none;
        }
        .aicoo-demo input:focus {
          border-color: var(--acc);
        }
        .aicoo-chips {
          padding: 0 14px 12px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .aicoo-chip {
          font: 12px 'IBM Plex Mono', monospace;
          color: var(--mut);
          border: 1px dashed var(--line);
          border-radius: 99px;
          padding: 4px 12px;
          cursor: pointer;
          background: none;
          transition: all 0.15s ease;
        }
        .aicoo-chip:hover {
          color: var(--acc);
          border-color: var(--acc);
        }
        .aicoo-tasks {
          padding: 4px 14px 16px;
          min-height: 150px;
          display: grid;
          gap: 8px;
        }
        .aicoo-task {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          background: var(--bg);
          border: 1px solid var(--line);
          border-radius: 8px;
          font-size: 13.5px;
          animation: aicoo-in 0.35s forwards;
        }
        @keyframes aicoo-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .aicoo-task .ag {
          font: 600 11px 'IBM Plex Mono', monospace;
          letter-spacing: 0.1em;
          color: var(--acc);
          min-width: 95px;
        }
        .aicoo-task .st {
          margin-left: auto;
          font: 11.5px 'IBM Plex Mono', monospace;
          color: var(--mut);
        }
        .aicoo-task.done .st {
          color: var(--ok);
        }
        .aicoo-empty {
          color: var(--mut);
          font: 13px 'IBM Plex Mono', monospace;
          padding: 40px 0;
          text-align: center;
        }

        /* Marquee Ticker */
        .aicoo-tick {
          margin-top: 24px;
          overflow: hidden;
          border: 1px solid var(--line);
          border-radius: 10px;
          background: var(--bg2);
          mask: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
          -webkit-mask: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
        }
        .aicoo-tick-inner {
          display: flex;
          gap: 36px;
          width: max-content;
          padding: 12px 0;
          animation: aicoo-mq 28s linear infinite;
          font: 12px 'IBM Plex Mono', monospace;
          letter-spacing: 0.1em;
          color: var(--mut);
        }
        .aicoo-tick:hover .aicoo-tick-inner {
          animation-play-state: paused;
        }
        @keyframes aicoo-mq {
          to { transform: translateX(-50%); }
        }
        .aicoo-note {
          font: 11px 'IBM Plex Mono', monospace;
          letter-spacing: 0.1em;
          color: var(--mut);
          margin-top: 18px;
        }

        /* Stats */
        .aicoo-stats {
          background: #f6f7fb;
          color: #111827;
        }
        .aicoo-stats .aicoo-wrap {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          padding: 34px 20px;
          text-align: center;
        }
        .aicoo-stats b {
          display: inline-block;
          font: 600 30px 'IBM Plex Mono', monospace;
          border-bottom: 2px solid var(--acc);
        }
        .aicoo-stats span {
          display: block;
          font-size: 13px;
          color: #6b7280;
          margin-top: 6px;
        }

        /* Sections */
        .aicoo-sec {
          padding: 80px 0;
        }
        .aicoo-eyebrow {
          font: 600 12px 'IBM Plex Mono', monospace;
          letter-spacing: 0.2em;
          color: var(--acc);
          text-align: center;
          text-transform: uppercase;
        }
        .aicoo-sec h2 {
          font-size: clamp(26px, 4vw, 38px);
          text-align: center;
          margin: 8px 0 10px;
          letter-spacing: -0.01em;
          font-weight: 700;
        }
        .aicoo-lead {
          text-align: center;
          color: var(--mut);
          max-width: 560px;
          margin: 0 auto 40px;
        }

        /* Agents Stack */
        .aicoo-agents {
          display: grid;
          grid-template-columns: 260px 1fr;
          gap: 20px;
        }
        .aicoo-tabs {
          display: grid;
          gap: 8px;
          align-content: start;
        }
        .aicoo-tab {
          display: flex;
          gap: 12px;
          align-items: center;
          text-align: left;
          background: var(--card);
          border: 1px solid var(--line);
          color: var(--mut);
          padding: 13px 14px;
          border-radius: 10px;
          cursor: pointer;
          font: 500 14px 'IBM Plex Sans';
          transition: all 0.2s ease;
        }
        .aicoo-tab:hover {
          color: var(--tx);
          transform: translateX(3px);
        }
        .aicoo-tab.on {
          color: var(--tx);
          border-color: var(--acc);
          background: linear-gradient(90deg, rgba(232, 163, 61, 0.15), var(--card));
        }
        .aicoo-panel {
          background: var(--card);
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 28px;
          min-height: 330px;
        }
        .aicoo-panel h3 {
          margin: 6px 0 8px;
          font-size: 24px;
          font-weight: 700;
        }
        .aicoo-panel p {
          color: var(--mut);
          margin: 0 0 20px;
        }
        .aicoo-big {
          font-size: 34px;
        }
        .aicoo-meter {
          display: grid;
          gap: 10px;
        }
        .aicoo-row {
          display: grid;
          grid-template-columns: 140px 1fr 60px;
          gap: 12px;
          align-items: center;
          font: 12px 'IBM Plex Mono', monospace;
          color: var(--mut);
        }
        .aicoo-bar {
          height: 8px;
          background: var(--bg);
          border-radius: 9px;
          overflow: hidden;
        }
        .aicoo-bar i {
          display: block;
          height: 100%;
          background: linear-gradient(90deg, var(--acc), #f5c46f);
          border-radius: 9px;
          transition: width 0.8s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .aicoo-tag {
          display: inline-block;
          margin: 14px 8px 0 0;
          font: 11px 'IBM Plex Mono', monospace;
          border: 1px solid var(--line);
          border-radius: 6px;
          padding: 3px 9px;
          color: var(--ok);
        }

        /* ROI Calculator */
        .aicoo-roi {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          background: var(--bg2);
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 30px;
        }
        .aicoo-ctl label {
          display: flex;
          justify-content: space-between;
          font-size: 14px;
          margin: 16px 0 6px;
          color: var(--mut);
        }
        .aicoo-ctl label b {
          color: var(--tx);
          font-family: 'IBM Plex Mono', monospace;
        }
        .aicoo-roi input[type=range] {
          width: 100%;
          accent-color: var(--acc);
          cursor: pointer;
        }
        .aicoo-out {
          background: var(--bg);
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 24px;
          text-align: center;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .aicoo-out .big {
          font: 600 38px 'IBM Plex Mono', monospace;
          color: var(--ok);
          margin: 6px 0;
        }
        .aicoo-out small {
          color: var(--mut);
        }

        /* Pricing */
        .aicoo-tog {
          display: flex;
          justify-content: center;
          gap: 4px;
          width: max-content;
          margin: 0 auto 34px;
          padding: 4px;
          background: var(--card);
          border: 1px solid var(--line);
          border-radius: 99px;
        }
        .aicoo-tog button {
          border: 0;
          background: none;
          color: var(--mut);
          padding: 8px 18px;
          border-radius: 99px;
          cursor: pointer;
          font: 600 13px 'IBM Plex Sans';
          transition: all 0.2s ease;
        }
        .aicoo-tog button.on {
          background: var(--acc);
          color: #1a1204;
        }
        .aicoo-plans {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
          align-items: stretch;
        }
        .aicoo-plan {
          position: relative;
          background: var(--card);
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 28px;
          transition: all 0.25s ease;
          display: flex;
          flex-direction: column;
        }
        .aicoo-plan:hover {
          transform: translateY(-6px);
          border-color: var(--acc);
        }
        .aicoo-plan.rec {
          background: linear-gradient(var(--card), #1a1e2c);
          border-color: var(--acc);
        }
        .aicoo-plan .badge {
          position: absolute;
          top: -12px;
          left: 20px;
          background: var(--acc);
          color: #1a1204;
          font: 700 10px 'IBM Plex Mono', monospace;
          letter-spacing: 0.12em;
          padding: 4px 12px;
          border-radius: 99px;
        }
        .aicoo-price {
          font: 600 34px 'IBM Plex Mono', monospace;
          margin: 10px 0 2px;
        }
        .aicoo-price small {
          font-size: 14px;
          color: var(--mut);
        }
        .aicoo-plan ul {
          list-style: none;
          padding: 0;
          margin: 18px 0 24px;
          flex: 1;
          color: var(--mut);
          font-size: 14px;
        }
        .aicoo-plan li {
          padding: 5px 0;
        }
        .aicoo-plan li:before {
          content: "▸ ";
          color: var(--acc);
        }
        .aicoo-plan .aicoo-btn {
          width: 100%;
        }

        /* FAQ */
        .aicoo-faq-item {
          background: var(--card);
          border: 1px solid var(--line);
          border-radius: 10px;
          margin-bottom: 10px;
          padding: 16px 20px;
          max-width: 760px;
          margin-inline: auto;
          cursor: pointer;
        }
        .aicoo-faq-item summary {
          cursor: pointer;
          font-weight: 600;
          list-style: none;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .aicoo-faq-item summary::-webkit-details-marker {
          display: none;
        }
        .aicoo-faq-item summary:after {
          content: "+";
          color: var(--acc);
          font: 20px 'IBM Plex Mono', monospace;
        }
        .aicoo-faq-item[open] summary:after {
          content: "–";
        }
        .aicoo-faq-item p {
          color: var(--mut);
          margin: 12px 0 0;
          font-size: 14.5px;
          line-height: 1.6;
        }

        /* CTA */
        .aicoo-cta {
          text-align: center;
          padding: 80px 0;
          background: radial-gradient(500px 220px at 50% 100%, rgba(232, 163, 61, 0.18), transparent);
        }

        /* Footer */
        .aicoo-footer {
          border-top: 1px solid var(--line);
          padding: 26px 0;
          color: var(--mut);
          font-size: 13px;
        }
        .aicoo-footer .aicoo-wrap {
          display: flex;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 10px;
        }

        /* Responsive */
        @media (max-width: 820px) {
          .aicoo-links, .aicoo-live { display: none; }
          .aicoo-agents, .aicoo-roi, .aicoo-plans { grid-template-columns: 1fr; }
          .aicoo-stats .aicoo-wrap { grid-template-columns: repeat(2, 1fr); }
          .aicoo-tabs { grid-template-columns: 1fr 1fr; }
          .aicoo-row { grid-template-columns: 100px 1fr 50px; }
        }
      `}</style>

      {/* STICKY NAV */}
      <nav className="aicoo-nav">
        <div className="aicoo-wrap">
          <a className="aicoo-logo aicoo-mono" href="#top">
            AI <b>COO</b>
          </a>
          <div className="aicoo-links">
            <a href="#agents">Agents</a>
            <a href="#roi">ROI</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span className="aicoo-live aicoo-mono">
              <i className="aicoo-dot"></i>6 AGENTS ACTIVE
            </span>
            <button className="aicoo-btn" onClick={goToSignin}>
              Sign in
            </button>
            <button className="aicoo-btn p" onClick={goToSignup}>
              Get started free
            </button>
          </div>
        </div>
      </nav>

      {/* HERO SECTION */}
      <header className="aicoo-hero" id="top">
        <div className="aicoo-wrap">
          <span className="aicoo-pill aicoo-mono">● LIVE OPERATIONS DECK</span>
          <h1>
            Your business runs itself.
            <br />
            <em>You set the goals.</em>
          </h1>
          <p className="aicoo-sub">
            AI COO gives SMEs an AI operations team — finance, inventory,
            communications, analytics — working autonomously under your direction.
          </p>
          <div
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button className="aicoo-btn p" onClick={goToSignup}>
              Start free trial →
            </button>
            <a className="aicoo-btn" href="#agents">
              Meet the agents
            </a>
          </div>

          {/* Interactive Live Goal Planner Demo */}
          <div className="aicoo-demo">
            <header className="aicoo-mono">
              <i></i>&nbsp;<i></i>&nbsp;<i></i>&nbsp;&nbsp;GOAL PLANNER — TRY IT LIVE
            </header>
            <form onSubmit={handleGoalSubmit}>
              <input
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                placeholder="Type a business goal…  e.g. Increase profit by 15% this quarter"
                autoComplete="off"
              />
              <button type="submit" className="aicoo-btn p">
                Plan →
              </button>
            </form>
            <div className="aicoo-chips">
              <button
                type="button"
                className="aicoo-chip"
                onClick={() =>
                  handleChipClick("Increase profit by 15% this quarter")
                }
              >
                Increase profit 15%
              </button>
              <button
                type="button"
                className="aicoo-chip"
                onClick={() =>
                  handleChipClick("Reduce stock-outs before Eid sale")
                }
              >
                Avoid stock-outs
              </button>
              <button
                type="button"
                className="aicoo-chip"
                onClick={() =>
                  handleChipClick("Recover overdue customer payments")
                }
              >
                Recover payments
              </button>
            </div>
            <div className="aicoo-tasks">
              {tasks.length === 0 ? (
                <div className="aicoo-empty">
                  // waiting for a goal… pick one above
                </div>
              ) : (
                tasks.map((t) => (
                  <div
                    key={t.id}
                    className={`aicoo-task ${t.done ? "done" : ""}`}
                  >
                    <span className="ag">{t.agent}</span>
                    <span>{t.task}</span>
                    <span className="st">{t.status}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Marquee Ticker */}
          <div className="aicoo-tick">
            <div className="aicoo-tick-inner">
              {[...marqueeItems, ...marqueeItems, ...marqueeItems].map(
                (item, idx) => (
                  <React.Fragment key={idx}>
                    <span>{item}</span>
                    <span style={{ color: "var(--acc)" }}>▸</span>
                  </React.Fragment>
                )
              )}
            </div>
          </div>
          <p className="aicoo-note aicoo-mono">
            14-DAY FREE TRIAL · NO CREDIT CARD REQUIRED
          </p>
        </div>
      </header>

      {/* STATS BANNER */}
      <div className="aicoo-stats" ref={statsRef}>
        <div className="aicoo-wrap">
          <div>
            <b>{stats.businesses.toLocaleString()}+</b>
            <span>Businesses active*</span>
          </div>
          <div>
            <b>₨{stats.revenue}B</b>
            <span>Revenue managed*</span>
          </div>
          <div>
            <b>{stats.uptime}%</b>
            <span>Uptime SLA</span>
          </div>
          <div>
            <b>{stats.agents} agents</b>
            <span>Working 24/7</span>
          </div>
        </div>
      </div>

      {/* THE AGENT STACK SECTION */}
      <section className="aicoo-sec" id="agents">
        <div className="aicoo-wrap">
          <div className="aicoo-eyebrow">THE AGENT STACK</div>
          <h2>Everything your operations need</h2>
          <p className="aicoo-lead">
            Six specialised capabilities coordinated by a Planner. Click an agent
            to see it work.
          </p>
          <div className="aicoo-agents">
            <div className="aicoo-tabs">
              {AGENTS_LIST.map((ag, i) => (
                <button
                  key={ag.name}
                  className={`aicoo-tab ${i === activeAgentIndex ? "on" : ""}`}
                  onClick={() => setActiveAgentIndex(i)}
                >
                  <span>{ag.icon}</span>
                  {ag.name}
                </button>
              ))}
            </div>
            <div className="aicoo-panel">
              <span className="aicoo-big">{activeAgent.icon}</span>
              <div
                className="aicoo-eyebrow aicoo-mono"
                style={{ textAlign: "left", marginTop: 4 }}
              >
                AGENT · 0{activeAgentIndex + 1}
              </div>
              <h3>{activeAgent.name}</h3>
              <p>{activeAgent.tagline}</p>
              <div className="aicoo-meter">
                {activeAgent.metrics.map(([label, pct]) => (
                  <div key={label} className="aicoo-row">
                    <span>{label}</span>
                    <div className="aicoo-bar">
                      <i style={{ width: `${pct}%` }}></i>
                    </div>
                    <span>{pct}%</span>
                  </div>
                ))}
              </div>
              <div>
                {activeAgent.tags.map((tg) => (
                  <span key={tg} className="aicoo-tag">
                    {tg}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ROI CALCULATOR SECTION */}
      <section className="aicoo-sec" id="roi" style={{ paddingTop: 0 }}>
        <div className="aicoo-wrap">
          <div className="aicoo-eyebrow">ROI CALCULATOR</div>
          <h2>See what you'd save</h2>
          <p className="aicoo-lead">
            Drag the sliders — estimate is based on automating 60% of repetitive
            ops work.
          </p>
          <div className="aicoo-roi">
            <div className="aicoo-ctl">
              <label>
                Admin hours / week <b>{adminHours}</b>
              </label>
              <input
                type="range"
                min="5"
                max="120"
                value={adminHours}
                onChange={(e) => setAdminHours(Number(e.target.value))}
              />
              <label>
                Hourly cost (₨) <b>{hourlyCost}</b>
              </label>
              <input
                type="range"
                min="200"
                max="2000"
                step="50"
                value={hourlyCost}
                onChange={(e) => setHourlyCost(Number(e.target.value))}
              />
            </div>
            <div className="aicoo-out">
              <small>Estimated monthly saving</small>
              <div className="big">{formatPKR(estimatedSaving)}</div>
              <small>
                {recommendedTier} plan pays for itself {paybackMultiplier}× over
              </small>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING SECTION */}
      <section className="aicoo-sec" id="pricing" style={{ paddingTop: 0 }}>
        <div className="aicoo-wrap">
          <div className="aicoo-eyebrow">SERVICE TIERS</div>
          <h2>Simple, transparent pricing</h2>
          <p className="aicoo-lead">All plans billed in PKR. Cancel anytime.</p>
          <div className="aicoo-tog">
            <button
              className={billingCycle === "monthly" ? "on" : ""}
              onClick={() => setBillingCycle("monthly")}
            >
              Monthly
            </button>
            <button
              className={billingCycle === "yearly" ? "on" : ""}
              onClick={() => setBillingCycle("yearly")}
            >
              Yearly · save 20%
            </button>
          </div>
          <div className="aicoo-plans">
            {plans.map((p) => {
              const currentPrice = p.basePrice * discountMultiplier;
              return (
                <div
                  key={p.id}
                  className={`aicoo-plan ${p.recommended ? "rec" : ""}`}
                >
                  {p.recommended && <span className="badge">RECOMMENDED</span>}
                  <b>{p.name}</b>
                  <div className="aicoo-price">
                    {formatPKR(currentPrice)}
                    <small>/month</small>
                  </div>
                  <small className="aicoo-mono" style={{ color: "var(--mut)" }}>
                    {p.subtitle}
                  </small>
                  <ul>
                    {p.features.map((feat) => (
                      <li key={feat}>{feat}</li>
                    ))}
                  </ul>
                  <button
                    className={`aicoo-btn ${p.recommended ? "p" : ""}`}
                    onClick={goToSignup}
                  >
                    Start free trial
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ SECTION */}
      <section className="aicoo-sec" id="faq" style={{ paddingTop: 0 }}>
        <div className="aicoo-wrap">
          <div className="aicoo-eyebrow">FAQ</div>
          <h2>Questions, answered</h2>
          <p className="aicoo-lead"></p>
          <details className="aicoo-faq-item">
            <summary>Does the AI act without my approval?</summary>
            <p>
              No. Emails, reorders and recommendations are drafted for you — you
              approve before anything is sent.
            </p>
          </details>
          <details className="aicoo-faq-item">
            <summary>Is my business data private?</summary>
            <p>
              Yes. Every business is a separate tenant with JWT auth, hashed
              passwords and row-level security policies.
            </p>
          </details>
          <details className="aicoo-faq-item">
            <summary>What do I need to get started?</summary>
            <p>
              Sign up, upload your transactions or stock list, and type your
              first goal in plain language.
            </p>
          </details>
          <details className="aicoo-faq-item">
            <summary>Can I change plans later?</summary>
            <p>
              Anytime. Upgrade, downgrade or cancel from your dashboard.
            </p>
          </details>
        </div>
      </section>

      {/* CALL TO ACTION */}
      <section className="aicoo-cta">
        <div className="aicoo-wrap">
          <h2>Ready to put operations on autopilot?</h2>
          <p className="aicoo-lead">Start your 14-day trial. No credit card.</p>
          <button className="aicoo-btn p" onClick={goToSignup}>
            Start free trial →
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="aicoo-footer">
        <div className="aicoo-wrap">
          <span className="aicoo-mono">AI COO © 2026</span>
          <span>*Demo figures for prototype purposes</span>
        </div>
      </footer>
    </div>
  );
}
