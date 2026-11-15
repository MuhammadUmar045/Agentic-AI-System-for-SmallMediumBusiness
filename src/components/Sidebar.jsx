import React from "react";
import {
  Plus, Command, Search, LogOut, Compass,
} from "lucide-react";
import { C, ROLE_NAV, NAV_ITEMS } from "../data/constants.js";
import { Btn } from "./Primitives.jsx";

export default function Sidebar({
  role,
  active,
  onNavigate,
  mobileOpen,
  setMobileOpen,
  onSignOut,
  onOpenPalette,
  pendingCount,
}) {
  const allowedItemIds = ROLE_NAV[role] || ROLE_NAV.cashier || ["pos"];
  const isCashier = role === "cashier";

  // Group items by category: Operations, Finance, Employees, Account
  const grouped = {
    Operations: [],
    Finance: [],
    Employees: [],
    Account: [],
  };

  allowedItemIds.forEach((id) => {
    const item = NAV_ITEMS[id];
    if (item && grouped[item.group]) {
      grouped[item.group].push(item);
    }
  });

  return (
    <>
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 40 }}
        />
      )}
      <div
        className={`vantage-sidebar${mobileOpen ? " mobile-open" : ""}`}
        style={{
          width: 240,
          background: C.navyDeep,
          display: "flex",
          flexDirection: "column",
          padding: "16px 12px",
          height: "100vh",
          overflowY: "auto",
          borderRight: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* Brand Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 8px 14px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: C.amber, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Compass size={18} color={C.navyDeep} />
          </div>
          <div>
            <div className="font-display" style={{ color: "#fff", fontSize: 18, fontWeight: 700, letterSpacing: -0.2 }}>AI COO</div>
            <span style={{ display: "block", fontSize: 10, color: C.amber, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>
              {role === "cashier" ? "POS Register" : (role === "hr_officer" ? "HR Management" : "SMEO Platform")}
            </span>
          </div>
        </div>

        {/* Quick Actions */}
        {!isCashier && (
          <button
            className="vantage-focus"
            onClick={onOpenPalette}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              marginTop: 12,
              marginBottom: 10,
              padding: "7px 10px",
              borderRadius: 8,
              background: "rgba(255,255,255,.06)",
              border: "1px solid rgba(255,255,255,.12)",
              color: "rgba(255,255,255,.7)",
              fontSize: 12,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Search size={13} /> Quick actions
            </span>
            <span className="font-mono" style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 10.5 }}>
              <Command size={10} />K
            </span>
          </button>
        )}

        {/* Navigation Sections */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
          {Object.entries(grouped).map(([groupTitle, items]) => {
            if (items.length === 0) return null;
            return (
              <div key={groupTitle}>
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                    color: "rgba(255,255,255,0.42)",
                    padding: "4px 8px 6px",
                  }}
                >
                  {groupTitle}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {items.map((item) => {
                    const isActive = active === item.id;
                    const showBadge = item.id === "finance" && pendingCount > 0;
                    return (
                      <button
                        key={item.id}
                        className="vantage-focus"
                        onClick={() => {
                          onNavigate(item.id);
                          setMobileOpen(false);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 9,
                          padding: "7.5px 10px",
                          borderRadius: 8,
                          background: isActive ? "rgba(255,255,255,.12)" : "transparent",
                          border: "none",
                          color: isActive ? "#fff" : "rgba(255,255,255,.7)",
                          fontSize: 13,
                          fontWeight: isActive ? 700 : 500,
                          textAlign: "left",
                          width: "100%",
                          justifyContent: "space-between",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                          <item.icon size={15} color={isActive ? C.amber : "rgba(255,255,255,0.7)"} />
                          {item.label}
                        </span>
                        {showBadge && (
                          <span
                            style={{
                              background: C.amber,
                              color: C.navyDeep,
                              borderRadius: 999,
                              fontSize: 10,
                              fontWeight: 800,
                              padding: "1px 6px",
                            }}
                          >
                            {pendingCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Sign Out */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,.08)", paddingTop: 10, marginTop: 12 }}>
          <button
            className="vantage-focus"
            onClick={onSignOut}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              borderRadius: 8,
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,.6)",
              fontSize: 13,
              fontWeight: 600,
              width: "100%",
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </div>
    </>
  );
}
