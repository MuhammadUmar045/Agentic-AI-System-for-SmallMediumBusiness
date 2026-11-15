import React, { useEffect, useRef } from "react";
import { Download, Wifi, Laptop2, Link2, RotateCw, Store } from "lucide-react";
import { C } from "../data/constants.js";
import { useAppState } from "../context/AppStateContext.jsx";
import { Card, Btn, Trend } from "./Primitives.jsx";
import ViewWrap from "./ViewWrap.jsx";

export default function ConnectPOSView({ showToast, onNavigate }) {
  const { state, dispatch, derived } = useAppState();
  const { status, lastSync, sales } = state.pos;
  const intervalRef = useRef(null);

  const connect = () => {
    dispatch({ type: "POS_SET_STATUS", status: "connecting" });
    setTimeout(() => dispatch({ type: "POS_SET_STATUS", status: "syncing" }), 900);
    setTimeout(() => { dispatch({ type: "POS_CONNECTED" }); showToast("POS connected — sales will sync automatically."); }, 2100);
  };
  const disconnect = () => { dispatch({ type: "POS_DISCONNECT" }); showToast("POS disconnected."); };

  useEffect(() => {
    if (status !== "connected") return;
    intervalRef.current = setInterval(() => {
      const items = 1 + Math.floor(Math.random() * 6);
      const total = items * (150 + Math.floor(Math.random() * 500));
      const sale = {
        invoice: `INV-2026-${4800 + Math.floor(Math.random() * 900)}`,
        items, total, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      dispatch({ type: "POS_NEW_SALE", sale });
    }, 15000);
    return () => clearInterval(intervalRef.current);
  }, [status, dispatch]);

  return (
    <ViewWrap title="Connect POS" subtitle="Ring up sales offline on the Vantage POS app, and they land here the moment you're back online.">
      <Card style={{ background: C.navyDeep, border: "none", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
        <div>
          <div style={{ color: C.amber, fontSize: 12, fontWeight: 700, letterSpacing: .4, textTransform: "uppercase", marginBottom: 8 }}>Vantage POS · desktop app</div>
          <div className="font-display" style={{ color: "#fff", fontSize: 20, fontWeight: 600, marginBottom: 6 }}>Sell even when the internet doesn't cooperate.</div>
          <div style={{ color: "rgba(255,255,255,.65)", fontSize: 13.5, maxWidth: 420 }}>
            Install Vantage POS on your counter device, sign in with this same business account, and every
            sale pushes straight into your Finance and Analytics workspace once you're connected.
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
          {onNavigate && (
            <Btn variant="amber" onClick={() => onNavigate("pos")}>
              <Store size={14} /> Open Counter Register (POS)
            </Btn>
          )}
          <Btn variant="ghostLight" onClick={() => showToast("Download started for Windows (demo).")}><Download size={14} /> Windows App</Btn>
          <Btn variant="ghostLight" onClick={() => showToast("Download started for macOS (demo).")}><Download size={14} /> macOS App</Btn>
        </div>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center",
              background: status === "connected" ? C.tealSoft : C.bg,
            }}>
              {status === "connected" ? <Wifi size={19} color="#0A7873" /> : <Laptop2 size={19} color={C.inkFaint} />}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14.5 }}>
                {status === "disconnected" && "Not connected"}
                {status === "connecting" && "Connecting to your POS device…"}
                {status === "syncing" && "Pulling today's sales…"}
                {status === "connected" && "Connected — Front Counter (Windows 11)"}
              </div>
              <div style={{ fontSize: 12.5, color: C.inkFaint, marginTop: 2 }}>
                {status === "disconnected" && "Sign in with the same email and password you use for Vantage."}
                {(status === "connecting" || status === "syncing") && "This only takes a moment."}
                {status === "connected" && `Last synced: ${lastSync ? new Date(lastSync).toLocaleTimeString() : "—"} · new sales sync automatically`}
              </div>
            </div>
          </div>
          {status === "disconnected" && <Btn variant="primary" onClick={connect}><Link2 size={14} /> I've installed it — Connect now</Btn>}
          {(status === "connecting" || status === "syncing") && <RotateCw size={18} className="spin" color={C.inkFaint} />}
          {status === "connected" && <Btn variant="danger" size="sm" onClick={disconnect}>Disconnect</Btn>}
        </div>
      </Card>

      {status === "connected" && (
        <div className="anim-in">
          <div className="vantage-grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginTop: 16 }}>
            <Card style={{ padding: 16 }}>
              <div style={{ fontSize: 12.5, color: C.inkFaint, fontWeight: 600 }}>Today's POS sales</div>
              <div className="font-mono" style={{ fontSize: 20, fontWeight: 700, margin: "6px 0" }}>₨{derived.todaysPosTotal.toLocaleString()}</div>
              <Trend dir="up" delta="synced live" />
            </Card>
            <Card style={{ padding: 16 }}>
              <div style={{ fontSize: 12.5, color: C.inkFaint, fontWeight: 600 }}>Transactions today</div>
              <div className="font-mono" style={{ fontSize: 20, fontWeight: 700, margin: "6px 0" }}>{sales.length}</div>
              <Trend dir="up" delta="auto-updating" />
            </Card>
            <Card style={{ padding: 16 }}>
              <div style={{ fontSize: 12.5, color: C.inkFaint, fontWeight: 600 }}>Sync status</div>
              <div style={{ fontSize: 20, fontWeight: 700, margin: "6px 0", color: "#0A7873" }}>Up to date</div>
              <span style={{ fontSize: 12, color: C.inkFaint }}>New sales appear here roughly every 15s (demo)</span>
            </Card>
          </div>

          <div style={{ marginTop: 18 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Recently synced from POS</div>
            <Card style={{ padding: 0, overflow: "hidden" }}>
              {sales.map((s, i) => (
                <div key={s.invoice + i} className={i === 0 ? "anim-in" : ""} style={{ display: "flex", justifyContent: "space-between", padding: "11px 16px", borderTop: i ? `1px solid ${C.line}` : "none", fontSize: 13.5, flexWrap: "wrap", gap: 6 }}>
                  <span className="font-mono">{s.invoice}</span>
                  <span style={{ color: C.inkSoft }}>{s.items} items</span>
                  <span style={{ color: C.inkFaint }}>{s.time}</span>
                  <span className="font-mono" style={{ fontWeight: 700 }}>₨{s.total}</span>
                </div>
              ))}
            </Card>
          </div>
        </div>
      )}
    </ViewWrap>
  );
}
