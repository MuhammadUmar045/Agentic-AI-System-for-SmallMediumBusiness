import React, { useState, useRef } from "react";
import {
  UploadCloud, FileDown, TrendingUp, TrendingDown, MinusCircle, AlertTriangle,
  Sparkles, Package, Mail, MessageCircle, Truck
} from "lucide-react";
import { C } from "../data/constants.js";
import { useAppState } from "../context/AppStateContext.jsx";
import { invStatus, parseSimpleCsv, downloadTextFile } from "../utils/helpers.js";
import { Card, Btn, Badge } from "./Primitives.jsx";
import ViewWrap from "./ViewWrap.jsx";
import DomainAgentDrawer from "./DomainAgentDrawer.jsx";
import ReorderSupplierModal from "./ReorderSupplierModal.jsx";

export default function InventoryView({ showToast }) {
  const { state, dispatch } = useAppState();
  const items = state.inventory;
  const suppliers = state.suppliers || [];
  const lowCount = items.filter((i) => invStatus(i) !== "ok" && !i.reordered).length;
  const fileInputRef = useRef(null);

  const [agentOpen, setAgentOpen] = useState(false);
  const [selectedReorderItem, setSelectedReorderItem] = useState(null);
  const [agentInitialPrompt, setAgentInitialPrompt] = useState("");

  const handleUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = parseSimpleCsv(String(reader.result)).filter((r) => r.length >= 3 && r[0]);
        if (rows.length === 0) { showToast("Couldn't find name,stock,threshold rows in that file."); return; }
        const items = rows.map(([name, stock, threshold, trend], i) => ({
          id: i + 1, name, stock: Number(stock) || 0, threshold: Number(threshold) || 0, trend: trend || "flat", reordered: false,
        }));
        dispatch({ type: "IMPORT_INVENTORY_ITEMS", items });
        showToast("Inventory imported from file.");
      } catch { showToast("Couldn't parse that file — expected simple CSV (name,stock,threshold,trend)."); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const exportCsv = () => {
    const header = "name,sku,stock,threshold,supplier,trend,status";
    const rows = items.map((i) => `${i.name},${i.sku || ""},${i.stock},${i.threshold},${i.supplierName || ""},${i.trend},${invStatus(i)}`);
    downloadTextFile("vantage-inventory-export.csv", [header, ...rows].join("\n"));
    showToast("Inventory exported.");
  };

  const handleConfirmReorder = (itemId, details) => {
    dispatch({
      type: "SEND_SUPPLIER_REORDER",
      itemId,
      supplierName: details.supplierName,
      qty: details.qty,
      channel: details.channel,
      message: details.message,
    });
  };

  const openAgentWithPrompt = (prompt) => {
    setAgentInitialPrompt(prompt);
    setAgentOpen(true);
  };

  return (
    <ViewWrap title="Inventory Optimization" subtitle="Live stock levels against AI-computed reorder thresholds.">
      {/* Top action toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input ref={fileInputRef} type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={handleUpload} />
          <Btn variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}><UploadCloud size={14} /> Import stock CSV</Btn>
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
            border: "1px solid rgba(184, 127, 4, 0.3)",
            background: "linear-gradient(135deg, #FFF9EB 0%, #FCEFC7 100%)",
            color: C.navyDeep,
            fontWeight: 700,
            fontSize: 13.5,
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(227, 160, 8, 0.2)",
            transition: "all .15s ease",
          }}
        >
          <Sparkles size={16} color={C.amberDeep} />
          Talk to Agent
          <span style={{ fontSize: 10.5, background: C.amberDeep, color: "#fff", padding: "1px 6px", borderRadius: 999, fontWeight: 700 }}>
            Inventory
          </span>
        </button>
      </div>

      {/* Low stock alert banner */}
      {lowCount > 0 && (
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          background: C.coralSoft,
          color: C.coral,
          padding: "10px 16px",
          borderRadius: 12,
          fontSize: 13.5,
          fontWeight: 600,
          marginBottom: 16,
          flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <AlertTriangle size={18} />
            <span>{lowCount} item{lowCount > 1 ? "s" : ""} below the reorder threshold — stock needs replenishment.</span>
          </div>
          <button
            onClick={() => openAgentWithPrompt("Reorder all low stock items now")}
            className="vantage-focus"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: C.coral,
              color: "#fff",
              border: "none",
              padding: "6px 12px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <Sparkles size={13} /> Reorder with Agent
          </button>
        </div>
      )}

      {/* Main Inventory Table */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead>
            <tr style={{ background: C.bg, textAlign: "left" }}>
              {["Product", "Primary Supplier", "Stock", "Reorder threshold", "Demand trend", "Status", ""].map((h) => (
                <th key={h} style={{ padding: "11px 16px", color: C.inkFaint, fontWeight: 700, fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const status = invStatus(i);
              const TrendIcon = i.trend === "up" ? TrendingUp : i.trend === "down" ? TrendingDown : MinusCircle;
              return (
                <tr key={i.id} style={{ borderTop: `1px solid ${C.line}` }}>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ fontWeight: 600, color: C.navy }}>{i.name}</div>
                    <div style={{ fontSize: 11.5, color: C.inkFaint }}>{i.sku} · {i.category}</div>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.inkSoft }}>{i.supplierName}</div>
                    <div style={{ fontSize: 11, color: C.inkFaint }}>{i.supplierEmail}</div>
                  </td>
                  <td style={{ padding: "12px 16px" }} className="font-mono">
                    <span style={{ fontWeight: 700, color: status !== "ok" ? C.coral : C.ink }}>{i.stock}</span>
                  </td>
                  <td style={{ padding: "12px 16px" }} className="font-mono">{i.threshold}</td>
                  <td style={{ padding: "12px 16px" }}><TrendIcon size={15} color={i.trend === "down" ? C.coral : i.trend === "up" ? "#0A7873" : C.inkFaint} /></td>
                  <td style={{ padding: "12px 16px" }}><Badge tone={status}>{status}</Badge></td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>
                    {status !== "ok" && !i.reordered && (
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        <Btn
                          variant="primary"
                          size="sm"
                          onClick={() => setSelectedReorderItem(i)}
                        >
                          <Sparkles size={13} /> Reorder from Supplier
                        </Btn>
                      </div>
                    )}
                    {i.reordered && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#0A7873", fontWeight: 700, fontSize: 12.5, background: C.tealSoft, padding: "4px 10px", borderRadius: 999 }}>
                        <Truck size={13} /> Reorder placed
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* Supplier Directory Quick Card */}
      <div style={{ marginTop: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.navy }}>Approved Suppliers Directory</div>
          <button
            onClick={() => openAgentWithPrompt("Show all suppliers and contacts")}
            className="vantage-focus"
            style={{ fontSize: 12.5, color: C.amberDeep, fontWeight: 700, background: "none", border: "none", cursor: "pointer" }}
          >
            Ask Agent about Suppliers →
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
          {suppliers.map((s) => (
            <Card key={s.id} style={{ padding: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: C.navy }}>{s.name}</div>
              <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 2 }}>Attn: {s.contactPerson}</div>
              <div style={{ fontSize: 11.5, color: C.inkFaint, marginTop: 4 }}>{s.email} · {s.phone}</div>
              <div style={{ fontSize: 11, color: "#0A7873", fontWeight: 600, marginTop: 6, background: C.tealSoft, padding: "2px 6px", borderRadius: 4, width: "fit-content" }}>
                Terms: {s.paymentTerms}
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Reorder Supplier Modal */}
      <ReorderSupplierModal
        open={!!selectedReorderItem}
        item={selectedReorderItem}
        suppliers={suppliers}
        onClose={() => setSelectedReorderItem(null)}
        onConfirmReorder={handleConfirmReorder}
        showToast={showToast}
      />

      {/* Domain Agent Drawer (Strict Inventory Mode) */}
      <DomainAgentDrawer
        open={agentOpen}
        onClose={() => setAgentOpen(false)}
        domain="inventory"
        showToast={showToast}
        initialPrompt={agentInitialPrompt}
      />
    </ViewWrap>
  );
}
