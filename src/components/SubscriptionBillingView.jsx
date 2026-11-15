import React, { useState, useEffect } from "react";
import { CheckCircle2, Sparkles, AlertTriangle, ArrowUpRight } from "lucide-react";
import { C, PLANS } from "../data/constants.js";
import { Btn, Card } from "./Primitives.jsx";
import ViewWrap from "./ViewWrap.jsx";
import { accountGetBilling, accountUpgradePlan } from "../utils/api.js";

export default function SubscriptionBillingView({ profile, setProfile, showToast }) {
  const [cycle, setCycle] = useState("monthly");
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);

  const loadBilling = async () => {
    try {
      setLoading(true);
      const data = await accountGetBilling();
      setBilling(data);
    } catch {
      // keep fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBilling();
  }, []);

  const currentPlan = billing?.plan || profile.plan || "standard";

  const handleUpgrade = async (targetPlanId) => {
    try {
      setUpgrading(true);
      const res = await accountUpgradePlan(targetPlanId);
      showToast(`Subscription upgraded to ${targetPlanId.toUpperCase()}! Query allowance refreshed.`);
      setProfile((prev) => ({ ...prev, plan: targetPlanId }));
      loadBilling();
    } catch (err) {
      showToast(err.message || "Failed to upgrade subscription.");
    } finally {
      setUpgrading(false);
    }
  };

  const queriesUsed = billing?.queries_used ?? 0;
  const queriesAllowance = billing?.query_allowance ?? 100;
  const queriesRemaining = billing?.queries_remaining ?? Math.max(0, queriesAllowance - queriesUsed);
  const pct = Math.min(100, Math.round((queriesUsed / (queriesAllowance || 1)) * 100));
  const isLimitReached = queriesRemaining <= 0;

  return (
    <ViewWrap
      title="Subscription & AI Usage Meter (FR-P.5)"
      subtitle="Track your monthly AI query consumption across all agent tasks, HR assistance, and operational planners."
    >
      {/* Real-time AI Query Meter */}
      <Card style={{ marginBottom: 24, border: isLimitReached ? "1px solid #FCA5A5" : `1px solid ${C.line}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Sparkles size={18} color={C.teal} />
            <span style={{ fontWeight: 700, fontSize: 15, color: C.ink }}>
              AI Query Consumption Meter
            </span>
          </div>
          <div style={{ fontSize: 13, color: C.inkSoft }}>
            Active Tier: <strong style={{ color: C.ink, textTransform: "capitalize" }}>{currentPlan}</strong>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: isLimitReached ? "#DC4C3E" : C.ink }}>
            {queriesUsed} <span style={{ fontSize: 14, fontWeight: 500, color: C.inkSoft }}>/ {queriesAllowance} queries used</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: isLimitReached ? "#DC4C3E" : C.teal }}>
            {queriesRemaining} remaining ({pct}%)
          </div>
        </div>

        <div style={{ width: "100%", background: "#E2E8F0", height: 8, borderRadius: 4, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: isLimitReached ? "#DC4C3E" : pct > 80 ? "#E3A008" : C.teal,
              transition: "width 0.4s ease",
            }}
          />
        </div>

        {isLimitReached && (
          <div style={{ marginTop: 14, background: "#FEF2F2", padding: "10px 14px", borderRadius: 8, display: "flex", alignItems: "center", gap: 8, color: "#991B1B", fontSize: 12.5 }}>
            <AlertTriangle size={16} />
            <span>
              Monthly query allowance exhausted. Upgrade to <strong>Pro</strong> or <strong>Enterprise</strong> below to continue running AI planning and HR reasoning.
            </span>
          </div>
        )}
      </Card>

      {/* Cycle Toggle */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 4, background: "#EEF2F6", borderRadius: 999, padding: 4 }}>
          {["monthly", "annual"].map((c) => (
            <button
              key={c}
              onClick={() => setCycle(c)}
              style={{
                padding: "8px 18px",
                borderRadius: 999,
                border: "none",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                background: cycle === c ? "#FFF" : "transparent",
                color: cycle === c ? C.ink : C.inkSoft,
                boxShadow: cycle === c ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              }}
            >
              {c === "monthly" ? "Monthly Billing" : "Annual Billing (Save 15%)"}
            </button>
          ))}
        </div>
      </div>

      {/* Pricing Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18 }} className="vantage-grid-3">
        {PLANS.map((p) => {
          const isCurrent = currentPlan === p.id;
          return (
            <div
              key={p.id}
              style={{
                position: "relative",
                borderRadius: 14,
                padding: 24,
                background: "#FFF",
                border: p.popular ? `2px solid ${C.teal}` : `1px solid ${C.line}`,
                boxShadow: p.popular ? "0 12px 24px rgba(0,0,0,0.06)" : "none",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {p.popular && (
                <div
                  style={{
                    position: "absolute",
                    top: -12,
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: C.teal,
                    color: "#FFF",
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "3px 10px",
                    borderRadius: 999,
                  }}
                >
                  RECOMMENDED
                </div>
              )}

              <div style={{ fontWeight: 700, fontSize: 18, color: C.ink }}>{p.name}</div>
              <div style={{ fontSize: 13, color: C.inkSoft, margin: "6px 0 16px", minHeight: 34 }}>
                {p.tagline}
              </div>

              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 18 }}>
                <span style={{ fontSize: 28, fontWeight: 700, color: C.ink }}>
                  ₨{Number(p.price[cycle] || 0).toLocaleString()}
                </span>
                <span style={{ fontSize: 13, color: C.inkSoft }}>/mo</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24, flex: 1 }}>
                {p.features.map((f) => (
                  <div key={f} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: C.ink }}>
                    <CheckCircle2 size={15} color={C.teal} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span>{f}</span>
                  </div>
                ))}
              </div>

              <Btn
                disabled={isCurrent || upgrading}
                onClick={() => handleUpgrade(p.id)}
                style={{
                  width: "100%",
                  justifyContent: "center",
                  background: isCurrent ? "#E2E8F0" : C.teal,
                  color: isCurrent ? C.inkSoft : "#FFF",
                  borderColor: isCurrent ? "#E2E8F0" : C.teal,
                }}
              >
                {isCurrent ? "Current Plan" : upgrading ? "Upgrading..." : `Upgrade to ${p.name}`}
              </Btn>
            </div>
          );
        })}
      </div>
    </ViewWrap>
  );
}
