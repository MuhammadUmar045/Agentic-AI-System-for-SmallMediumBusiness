import React, { useEffect } from "react";
import { C } from "../data/constants.js";

export default function GlobalStyles() {
  useEffect(() => {
    if (!document.getElementById("vantage-fonts")) {
      const link = document.createElement("link");
      link.id = "vantage-fonts";
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap";
      document.head.appendChild(link);
    }
  }, []);
  return (
    <style>{`
      * { box-sizing: border-box; }
      body { margin: 0; }
      .vantage-root { font-family: 'Inter', system-ui, sans-serif; color: ${C.ink}; }
      .font-display { font-family: 'Fraunces', serif; }
      .font-mono { font-family: 'IBM Plex Mono', monospace; }
      .vantage-root ::selection { background: ${C.amberSoft}; }
      .vantage-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
      .vantage-scroll::-webkit-scrollbar-thumb { background: #D6DAE6; border-radius: 8px; }
      .vantage-scroll::-webkit-scrollbar-track { background: transparent; }
      .vantage-root button { font-family: inherit; cursor: pointer; }
      .vantage-root input, .vantage-root textarea, .vantage-root select { font-family: inherit; }
      .vantage-focus:focus-visible { outline: 2px solid ${C.amber}; outline-offset: 2px; }
      @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      .anim-in { animation: fadeUp .45s ease both; }
      @keyframes dotPulse { 0%,80%,100% { opacity: .25; transform: scale(.8); } 40% { opacity: 1; transform: scale(1); } }
      .think-dot { animation: dotPulse 1.2s infinite ease-in-out; }
      @keyframes ringPulse { 0% { box-shadow: 0 0 0 0 rgba(14,165,160,.45); } 100% { box-shadow: 0 0 0 10px rgba(14,165,160,0); } }
      .pulse-ring { animation: ringPulse 1.4s infinite; }
      @keyframes flowDash { to { stroke-dashoffset: -40; } }
      .flow-line { stroke-dasharray: 6 6; animation: flowDash 1.6s linear infinite; }
      @keyframes floatY { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
      .float-slow { animation: floatY 5s ease-in-out infinite; }
      @keyframes spin360 { to { transform: rotate(360deg); } }
      .spin { animation: spin360 1s linear infinite; }
      @keyframes slideDown { from { opacity: 0; max-height: 0; transform: translateY(-4px); } to { opacity: 1; max-height: 200px; transform: translateY(0); } }
      .agent-step { animation: slideDown .35s ease both; }
      @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
      .shimmer-text { background: linear-gradient(90deg, rgba(14,165,160,.6) 25%, rgba(14,165,160,1) 50%, rgba(14,165,160,.6) 75%); background-size: 200% 100%; -webkit-background-clip: text; -webkit-text-fill-color: transparent; animation: shimmer 2s linear infinite; }
      @keyframes expandWidth { from { width: 0%; } to { width: 100%; } }
      .progress-fill { animation: expandWidth .8s ease-out both; }
      .mobile-menu-btn { display: none; }
      .vantage-sidebar { position: sticky; top: 0; left: 0; height: 100vh; transition: transform .2s ease; z-index: 31; }
      @media (max-width: 880px) {
        .vantage-sidebar { position: fixed !important; transform: translateX(-100%); }
        .vantage-sidebar.mobile-open { transform: translateX(0); }
        .mobile-menu-btn { display: inline-flex !important; }
        .vantage-grid-4 { grid-template-columns: repeat(2, 1fr) !important; }
        .vantage-grid-2 { grid-template-columns: 1fr !important; }
        .vantage-grid-3 { grid-template-columns: 1fr !important; }
      }
      @media (prefers-reduced-motion: reduce) {
        .anim-in, .pulse-ring, .flow-line, .float-slow, .think-dot, .spin, .agent-step, .shimmer-text, .progress-fill { animation: none !important; }
      }
      @media print {
        body * { visibility: hidden !important; }
        .vantage-printable-receipt, .vantage-printable-receipt * { visibility: visible !important; }
        .vantage-printable-receipt { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; margin: 0 !important; padding: 24px !important; background: #fff !important; }
      }
    `}</style>
  );
}
