import React, { useState, useEffect, useCallback } from "react";
import { Sparkles, ArrowRight, X, LayoutDashboard, Package, MessageSquare } from "lucide-react";
import { C } from "../data/constants.js";

const TOUR_KEY = "vantage_onboarding_done";

const STEPS = [
  {
    title: "Welcome to Vantage",
    body: "Your AI-powered operations center. This quick tour shows you the essentials.",
    icon: Sparkles,
    iconBg: C.amber,
    iconColor: C.navyDeep,
  },
  {
    title: "Your Dashboard",
    body: "See real-time KPIs, department health, and quick actions — all in one place. This is your home base.",
    icon: LayoutDashboard,
    iconBg: C.tealSoft,
    iconColor: "#0A7873",
  },
  {
    title: "Talk to the Planner",
    body: 'Navigate to the Planner and type commands like "add 5 units of Sultan Ghee" or "approve the ad spend recommendation". It can act, not just talk.',
    icon: Sparkles,
    iconBg: C.navy,
    iconColor: C.amber,
  },
  {
    title: "You're all set!",
    body: "Explore Finance, Inventory, Communication, and Analytics workspaces. Every agent action waits for your approval.",
    icon: Package,
    iconBg: C.amberSoft,
    iconColor: C.amberDeep,
  },
];

export default function OnboardingTour({ onComplete }) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(TOUR_KEY)) {
      const timer = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const finish = useCallback(() => {
    localStorage.setItem(TOUR_KEY, "1");
    setVisible(false);
    if (onComplete) onComplete();
  }, [onComplete]);

  const next = () => {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else finish();
  };

  if (!visible) return null;

  const s = STEPS[step];
  const Icon = s.icon;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(19,26,44,.55)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(3px)" }}>
      <div className="anim-in" style={{ background: "#fff", borderRadius: 20, padding: "32px 28px 24px", width: "100%", maxWidth: 420, boxShadow: "0 24px 60px rgba(19,26,44,.3)", position: "relative" }}>
        <button onClick={finish} style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", cursor: "pointer", color: C.inkFaint }}>
          <X size={18} />
        </button>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: s.iconBg, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
          <Icon size={24} color={s.iconColor} />
        </div>
        <h2 className="font-display" style={{ fontSize: 22, fontWeight: 600, textAlign: "center", marginBottom: 8 }}>{s.title}</h2>
        <p style={{ color: C.inkSoft, fontSize: 14, lineHeight: 1.6, textAlign: "center", marginBottom: 24 }}>{s.body}</p>
        {/* Progress dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 20 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{ width: i === step ? 20 : 8, height: 8, borderRadius: 999, background: i === step ? C.navy : C.line, transition: "all .3s ease" }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          {step > 0 && (
            <button className="vantage-focus" onClick={() => setStep((s) => s - 1)} style={{
              padding: "10px 20px", fontSize: 14, fontWeight: 600, borderRadius: 10, border: `1px solid ${C.line}`,
              background: "transparent", color: C.navy,
            }}>Back</button>
          )}
          <button className="vantage-focus" onClick={next} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "10px 22px", fontSize: 14, fontWeight: 600, borderRadius: 10, border: "1px solid transparent",
            background: C.navy, color: "#fff",
          }}>
            {step === STEPS.length - 1 ? "Get started" : "Next"} <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
