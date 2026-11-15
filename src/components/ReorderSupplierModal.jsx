import React, { useState, useEffect } from "react";
import { X, Mail, MessageCircle, Truck, Package, Sparkles, Check, ChevronRight } from "lucide-react";
import { C } from "../data/constants.js";
import { Btn, Badge } from "./Primitives.jsx";

export default function ReorderSupplierModal({
  open,
  item,
  suppliers = [],
  onClose,
  onConfirmReorder,
  showToast,
}) {
  if (!open || !item) return null;

  const supplier =
    suppliers.find((s) => s.id === item.supplierId) ||
    suppliers.find((s) => s.name === item.supplierName) ||
    suppliers[0] || {
      name: item.supplierName || "Default Supplier",
      contactPerson: "Procurement Desk",
      email: item.supplierEmail || "orders@supplier.com",
      phone: item.supplierPhone || "+92 300 0000000",
      leadTime: "24-48 hours",
      paymentTerms: "Net 30 days",
    };

  const defaultQty = Math.max(20, (item.threshold - item.stock) + 25);
  const [qty, setQty] = useState(defaultQty);
  const [recipientEmail, setRecipientEmail] = useState(supplier.email);
  const [supplierPhone, setSupplierPhone] = useState(supplier.phone);

  const generateBody = (orderQty) => {
    return `To: ${supplier.name} (${supplier.email})\nAttn: ${supplier.contactPerson}\n\nDear ${supplier.contactPerson},\n\nWe would like to place an urgent Purchase Order to restock our inventory:\n\n• Product: ${item.name} (SKU: ${item.sku || 'SKU-001'})\n• Reorder Quantity: ${orderQty} units\n• Current Stock: ${item.stock} units (Safety Threshold: ${item.threshold})\n• Required Delivery: Within ${supplier.leadTime}\n• Payment Terms: ${supplier.paymentTerms}\n• Delivery Address: Vantage Central Warehouse, Plot 14-B Commercial Zone\n\nPlease confirm availability and dispatch schedule at your earliest convenience.\n\nThank you,\nProcurement & Inventory Team\nVantage Store`;
  };

  const [message, setMessage] = useState(generateBody(defaultQty));

  useEffect(() => {
    setMessage(generateBody(qty));
  }, [qty]);

  const subject = `[Purchase Order] ${qty} units of ${item.name} - Vantage Store`;

  const handleSendEmail = () => {
    const mailto = `mailto:${recipientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
    window.open(mailto, "_blank");
    onConfirmReorder(item.id, {
      supplierName: supplier.name,
      qty,
      channel: "Email",
      message,
    });
    showToast(`Purchase order emailed to ${supplier.name} (${recipientEmail}).`);
    onClose();
  };

  const handleSendWhatsApp = () => {
    const waText = `*Purchase Order - Vantage Store*\n\nDear ${supplier.contactPerson} (${supplier.name}),\nWe would like to order *${qty} units of ${item.name}* (SKU: ${item.sku}).\nDelivery: within ${supplier.leadTime}.\nTerms: ${supplier.paymentTerms}.\nPlease confirm availability. Thank you!`;
    const cleanPhone = (supplierPhone || "").replace(/[^0-9]/g, "");
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(waText)}`, "_blank");
    onConfirmReorder(item.id, {
      supplierName: supplier.name,
      qty,
      channel: "WhatsApp",
      message: waText,
    });
    showToast(`Purchase order sent to ${supplier.name} on WhatsApp.`);
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(19, 26, 44, 0.5)",
        zIndex: 600,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        className="anim-in"
        style={{
          background: "#FFFFFF",
          borderRadius: 16,
          width: "100%",
          maxWidth: 580,
          boxShadow: "0 25px 60px rgba(19, 26, 44, 0.3)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 22px",
            borderBottom: `1px solid ${C.line}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#FAFAFD",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: C.amberSoft,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Package size={18} color={C.amberDeep} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: C.navy }}>
                Reorder from Supplier
              </div>
              <div style={{ fontSize: 12, color: C.inkSoft }}>
                Agent-assisted Purchase Order generation
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

        {/* Modal Body */}
        <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16, maxHeight: "75vh", overflowY: "auto" }}>
          {/* Item details card */}
          <div
            style={{
              background: "#F6F7FB",
              borderRadius: 12,
              padding: 14,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: C.navy }}>{item.name}</div>
              <div style={{ fontSize: 12.5, color: C.inkSoft, marginTop: 2 }}>
                Current Stock: <span style={{ fontWeight: 700, color: C.coral }}>{item.stock}</span> · Threshold: <span style={{ fontWeight: 700 }}>{item.threshold}</span> · SKU: {item.sku}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 600 }}>Reorder Qty:</div>
              <div style={{ display: "flex", alignItems: "center", background: "#fff", borderRadius: 8, border: `1px solid ${C.line}` }}>
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.max(5, q - 5))}
                  style={{ border: "none", background: "none", padding: "6px 10px", cursor: "pointer", fontWeight: 700 }}
                >
                  -
                </button>
                <span style={{ fontWeight: 700, fontSize: 14, minWidth: 28, textAlign: "center" }}>
                  {qty}
                </span>
                <button
                  type="button"
                  onClick={() => setQty((q) => q + 5)}
                  style={{ border: "none", background: "none", padding: "6px 10px", cursor: "pointer", fontWeight: 700 }}
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Supplier Info */}
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.inkFaint, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Matched Supplier
              </div>
              <span style={{ fontSize: 11, color: "#0A7873", fontWeight: 700, background: C.tealSoft, padding: "2px 8px", borderRadius: 999 }}>
                Terms: {supplier.paymentTerms}
              </span>
            </div>
            <div style={{ fontWeight: 700, fontSize: 14.5, color: C.navy }}>{supplier.name}</div>
            <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 2 }}>
              Contact: {supplier.contactPerson} · Lead Time: {supplier.leadTime}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.inkFaint, display: "block", marginBottom: 3 }}>
                  Supplier Email
                </label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  className="vantage-focus"
                  style={{
                    width: "100%",
                    padding: "7px 10px",
                    borderRadius: 8,
                    border: `1px solid ${C.line}`,
                    fontSize: 12.5,
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.inkFaint, display: "block", marginBottom: 3 }}>
                  Supplier Phone (WhatsApp)
                </label>
                <input
                  type="text"
                  value={supplierPhone}
                  onChange={(e) => setSupplierPhone(e.target.value)}
                  className="vantage-focus"
                  style={{
                    width: "100%",
                    padding: "7px 10px",
                    borderRadius: 8,
                    border: `1px solid ${C.line}`,
                    fontSize: 12.5,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Agent Generated Purchase Order Message */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Sparkles size={14} color={C.amberDeep} />
                <span style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>
                  Agent-Written Purchase Order
                </span>
              </div>
              <span style={{ fontSize: 11, color: C.inkFaint }}>Editable preview</span>
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={8}
              className="vantage-focus"
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: 10,
                border: `1px solid ${C.line}`,
                fontSize: 12.5,
                lineHeight: 1.5,
                fontFamily: "monospace",
                resize: "vertical",
                background: "#FAFAFD",
              }}
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: "14px 22px",
            borderTop: `1px solid ${C.line}`,
            background: "#FAFAFD",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Btn variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Btn>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleSendWhatsApp}
              className="vantage-focus"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                border: "none",
                background: "#25D366",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              <MessageCircle size={15} /> Send via WhatsApp
            </button>
            <Btn variant="primary" size="sm" onClick={handleSendEmail}>
              <Mail size={15} /> Send Message to Supplier
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
