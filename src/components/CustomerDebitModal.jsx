import React, { useState } from "react";
import { X, MessageCircle, Mail, DollarSign, CheckCircle2, User, Phone, MapPin } from "lucide-react";
import { C } from "../data/constants.js";
import { Btn, Badge } from "./Primitives.jsx";

export default function CustomerDebitModal({
  open,
  customer,
  onClose,
  onRecordPayment,
  onSendReminder,
  showToast,
}) {
  if (!open || !customer) return null;

  const [paymentAmount, setPaymentAmount] = useState("");
  const [activeTab, setActiveTab] = useState("reminder"); // "reminder" | "payment"

  const defaultWaMessage = `Dear ${customer.contactPerson || customer.name}, gentle reminder from Vantage Store: Your current outstanding debit balance is ₨${customer.debit.toLocaleString()}. Kindly arrange payment via Raast or bank transfer at your earliest convenience. Thank you!`;
  const [waMessage, setWaMessage] = useState(defaultWaMessage);

  const defaultEmailSubject = `Payment Reminder: Outstanding Debit Balance - ₨${customer.debit.toLocaleString()} (Vantage Store)`;
  const defaultEmailBody = `Dear ${customer.contactPerson || customer.name},\n\nThis is a polite reminder from Vantage Store regarding your outstanding debit balance.\n\nAccount Summary:\n• Customer: ${customer.name}\n• Outstanding Balance: ₨${customer.debit.toLocaleString()}\n• Account Status: ${customer.status.toUpperCase()}\n• Credit Limit: ₨${customer.creditLimit.toLocaleString()}\n• Last Transaction: ${customer.lastPurchase}\n\nKindly remit payment via Raast (vantage@raast) or counter transfer.\n\nThank you for your business,\nFinance & Accounts\nVantage Store`;
  const [emailSubject, setEmailSubject] = useState(defaultEmailSubject);
  const [emailBody, setEmailBody] = useState(defaultEmailBody);

  const handleSendWhatsApp = () => {
    const cleanPhone = (customer.phone || "").replace(/[^0-9]/g, "");
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(waMessage)}`, "_blank");
    onSendReminder(customer.id, {
      customerName: customer.name,
      channel: "WhatsApp",
      text: waMessage,
    });
    showToast(`WhatsApp reminder sent to ${customer.name}.`);
    onClose();
  };

  const handleSendEmail = () => {
    window.open(`mailto:${customer.email}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`, "_blank");
    onSendReminder(customer.id, {
      customerName: customer.name,
      channel: "Email",
      text: emailBody,
    });
    showToast(`Debit statement emailed to ${customer.name}.`);
    onClose();
  };

  const handleSavePayment = (e) => {
    e.preventDefault();
    const amount = Number(paymentAmount);
    if (!amount || amount <= 0) {
      showToast("Please enter a valid payment amount.");
      return;
    }
    onRecordPayment(customer.id, amount);
    showToast(`Recorded payment of ₨${amount.toLocaleString()} from ${customer.name}.`);
    onClose();
  };

  const pctLimit = customer.creditLimit > 0 ? Math.min(100, Math.round((customer.debit / customer.creditLimit) * 100)) : 0;

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
          maxWidth: 540,
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
            padding: "16px 20px",
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
                background: C.tealSoft,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <DollarSign size={18} color={C.teal} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: C.navy }}>
                {customer.name}
              </div>
              <div style={{ fontSize: 12, color: C.inkSoft }}>
                Debit Ledger & Communication
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

        {/* Customer Overview Banner */}
        <div style={{ padding: "16px 20px", background: "#F6F7FB", borderBottom: `1px solid ${C.line}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.inkFaint, textTransform: "uppercase" }}>
                Outstanding Debit Balance
              </span>
              <div style={{ fontSize: 24, fontWeight: 800, color: customer.debit > 0 ? C.coral : "#0A7873" }}>
                ₨{customer.debit.toLocaleString()}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <span
                style={{
                  padding: "3px 10px",
                  borderRadius: 999,
                  fontSize: 11.5,
                  fontWeight: 700,
                  background: customer.status === "overdue" ? C.coralSoft : customer.status === "cleared" ? C.tealSoft : C.amberSoft,
                  color: customer.status === "overdue" ? C.coral : customer.status === "cleared" ? "#0A7873" : C.amberDeep,
                }}
              >
                {customer.status.toUpperCase()}
              </span>
              <div style={{ fontSize: 11.5, color: C.inkSoft, marginTop: 4 }}>
                Limit: ₨{customer.creditLimit.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Credit limit progress */}
          <div style={{ width: "100%", height: 6, background: "#E5E8F0", borderRadius: 999, overflow: "hidden", marginBottom: 6 }}>
            <div style={{ width: `${pctLimit}%`, height: "100%", background: pctLimit > 80 ? C.coral : C.teal, borderRadius: 999 }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.inkFaint }}>
            <span>{pctLimit}% of credit limit utilized</span>
            <span>Contact: {customer.contactPerson} ({customer.phone})</span>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${C.line}`, background: "#fff" }}>
          <button
            onClick={() => setActiveTab("reminder")}
            className="vantage-focus"
            style={{
              flex: 1,
              padding: "10px",
              border: "none",
              borderBottom: activeTab === "reminder" ? `2.5px solid ${C.teal}` : "2.5px solid transparent",
              background: "none",
              fontWeight: 700,
              fontSize: 13,
              color: activeTab === "reminder" ? C.teal : C.inkFaint,
              cursor: "pointer",
            }}
          >
            Send Reminder (WhatsApp / Email)
          </button>
          <button
            onClick={() => setActiveTab("payment")}
            className="vantage-focus"
            style={{
              flex: 1,
              padding: "10px",
              border: "none",
              borderBottom: activeTab === "payment" ? `2.5px solid ${C.teal}` : "2.5px solid transparent",
              background: "none",
              fontWeight: 700,
              fontSize: 13,
              color: activeTab === "payment" ? C.teal : C.inkFaint,
              cursor: "pointer",
            }}
          >
            Record Payment Received
          </button>
        </div>

        {/* Tab Content */}
        <div style={{ padding: "18px 20px", flex: 1, overflowY: "auto" }}>
          {activeTab === "reminder" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: C.navy, display: "block", marginBottom: 5 }}>
                  WhatsApp Message Draft
                </label>
                <textarea
                  value={waMessage}
                  onChange={(e) => setWaMessage(e.target.value)}
                  rows={3}
                  className="vantage-focus"
                  style={{
                    width: "100%",
                    padding: 10,
                    borderRadius: 8,
                    border: `1px solid ${C.line}`,
                    fontSize: 12.5,
                    resize: "vertical",
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: C.navy, display: "block", marginBottom: 5 }}>
                  Email Statement Draft
                </label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="vantage-focus"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: `1px solid ${C.line}`,
                    fontSize: 12,
                    marginBottom: 6,
                    fontWeight: 600,
                  }}
                />
                <textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  rows={5}
                  className="vantage-focus"
                  style={{
                    width: "100%",
                    padding: 10,
                    borderRadius: 8,
                    border: `1px solid ${C.line}`,
                    fontSize: 12,
                    resize: "vertical",
                    fontFamily: "monospace",
                  }}
                />
              </div>
            </div>
          ) : (
            <form onSubmit={handleSavePayment} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: C.navy, display: "block", marginBottom: 6 }}>
                  Payment Amount Received (₨)
                </label>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontWeight: 700, color: C.inkSoft }}>
                    ₨
                  </span>
                  <input
                    type="number"
                    min="1"
                    max={customer.debit}
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder={`Max: ${customer.debit}`}
                    className="vantage-focus"
                    style={{
                      width: "100%",
                      padding: "10px 12px 10px 32px",
                      borderRadius: 10,
                      border: `1.5px solid ${C.line}`,
                      fontSize: 16,
                      fontWeight: 700,
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setPaymentAmount(String(customer.debit))}
                  className="vantage-focus"
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: `1px solid ${C.line}`,
                    background: C.bg,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Pay Full (₨{customer.debit.toLocaleString()})
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentAmount(String(Math.round(customer.debit / 2)))}
                  className="vantage-focus"
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: `1px solid ${C.line}`,
                    background: C.bg,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Pay 50% (₨{Math.round(customer.debit / 2).toLocaleString()})
                </button>
              </div>

              <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 4 }}>
                Recording this payment will immediately reduce this customer's debit balance and log the transaction in the activity audit trail.
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 20px",
            borderTop: `1px solid ${C.line}`,
            background: "#FAFAFD",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Btn variant="ghost" size="sm" onClick={onClose}>
            Close
          </Btn>
          {activeTab === "reminder" ? (
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
                <MessageCircle size={15} /> WhatsApp Reminder
              </button>
              <Btn variant="primary" size="sm" onClick={handleSendEmail}>
                <Mail size={15} /> Email Statement
              </Btn>
            </div>
          ) : (
            <Btn variant="primary" size="sm" onClick={handleSavePayment}>
              Save Payment Received
            </Btn>
          )}
        </div>
      </div>
    </div>
  );
}
