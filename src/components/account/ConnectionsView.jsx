import React, { useState, useEffect } from "react";
import { MessageSquare, Mail, ShieldCheck, CheckCircle2, AlertTriangle, Save, Key, ExternalLink } from "lucide-react";
import { C } from "../../data/constants.js";
import { Card, Btn, Badge } from "../Primitives.jsx";
import ViewWrap from "../ViewWrap.jsx";
import { accountGetConnections, accountUpdateConnections } from "../../utils/api.js";

export default function ConnectionsView({ showToast }) {
  const [connections, setConnections] = useState({
    whatsapp: {
      phone_number_id: "",
      waba_id: "",
      access_token: "",
      webhook_verified: false,
    },
    smtp: {
      host: "smtp.example.com",
      port: 587,
      username: "notifications@vantage.pk",
      password: "",
      sender_email: "notifications@vantage.pk",
      use_tls: true,
    },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await accountGetConnections();
        if (data) {
          setConnections({
            whatsapp: data.whatsapp || connections.whatsapp,
            smtp: data.smtp || connections.smtp,
          });
        }
      } catch (err) {
        showToast(err.message || "Failed to load connection settings.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      await accountUpdateConnections(connections);
      showToast("Connections & API credentials saved successfully.");
    } catch (err) {
      showToast(err.message || "Failed to save connections.");
    } finally {
      setSaving(false);
    }
  };

  const webhookUrl = `${window.location.origin}/api/whatsapp/webhook`;

  return (
    <ViewWrap
      title="External Connections & Integrations (FR-4.1, FR-6.1, SEC-7)"
      subtitle="Configure Meta WhatsApp Cloud API credentials with HMAC-SHA256 verification and SMTP credentials for HITL customer communications."
    >
      <div style={{ maxWidth: 780 }}>
        <form onSubmit={handleSave}>
          {/* WhatsApp Cloud API */}
          <Card style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 8, color: C.ink }}>
                <MessageSquare size={17} color="#25D366" /> Meta WhatsApp Cloud API
              </div>
              <Badge
                text={connections.whatsapp?.phone_number_id ? "Configured" : "Not Connected"}
                tone={connections.whatsapp?.phone_number_id ? "positive" : "warning"}
              />
            </div>

            <p style={{ fontSize: 12.5, color: C.inkSoft, margin: "0 0 14px" }}>
              Enables automated customer reminders and owner business queries via WhatsApp. Inbound requests are verified via <strong>HMAC-SHA256</strong>.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 4 }}>
                  Phone Number ID
                </label>
                <input
                  type="text"
                  placeholder="e.g. 104829104829104"
                  value={connections.whatsapp?.phone_number_id || ""}
                  onChange={(e) =>
                    setConnections({
                      ...connections,
                      whatsapp: { ...connections.whatsapp, phone_number_id: e.target.value },
                    })
                  }
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 4 }}>
                  WhatsApp Business Account (WABA) ID
                </label>
                <input
                  type="text"
                  placeholder="e.g. 94820194820194"
                  value={connections.whatsapp?.waba_id || ""}
                  onChange={(e) =>
                    setConnections({
                      ...connections,
                      whatsapp: { ...connections.whatsapp, waba_id: e.target.value },
                    })
                  }
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13 }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 4 }}>
                System Access Token
              </label>
              <input
                type="password"
                placeholder="Bearer token with whatsapp_business_messaging permission"
                value={connections.whatsapp?.access_token || ""}
                onChange={(e) =>
                  setConnections({
                    ...connections,
                    whatsapp: { ...connections.whatsapp, access_token: e.target.value },
                  })
                }
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13 }}
              />
            </div>

            <div style={{ background: "#F8FAFC", padding: 12, borderRadius: 8, border: `1px solid ${C.line}` }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.ink, marginBottom: 4 }}>
                Meta Webhook Endpoint URL:
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <code style={{ fontSize: 12, color: C.teal, background: "#FFF", padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.line}`, flex: 1 }}>
                  {webhookUrl}
                </code>
              </div>
              <div style={{ fontSize: 11, color: C.inkLighter, marginTop: 6 }}>
                Meta webhook requests require SHA256 signature verification configured via <code>WHATSAPP_APP_SECRET</code>.
              </div>
            </div>
          </Card>

          {/* SMTP Email Configuration */}
          <Card style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 8, color: C.ink }}>
                <Mail size={17} color={C.teal} /> SMTP Email Relay (Human-in-the-Loop)
              </div>
              <Badge
                text={connections.smtp?.host ? "Configured" : "Not Connected"}
                tone={connections.smtp?.host ? "positive" : "warning"}
              />
            </div>

            <p style={{ fontSize: 12.5, color: C.inkSoft, margin: "0 0 14px" }}>
              Used to dispatch customer billing statements and supplier reorder purchase orders after explicit human approval.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 4 }}>
                  SMTP Server Host
                </label>
                <input
                  type="text"
                  placeholder="smtp.resend.com or smtp.gmail.com"
                  value={connections.smtp?.host || ""}
                  onChange={(e) =>
                    setConnections({
                      ...connections,
                      smtp: { ...connections.smtp, host: e.target.value },
                    })
                  }
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 4 }}>
                  Port
                </label>
                <input
                  type="number"
                  placeholder="587"
                  value={connections.smtp?.port || 587}
                  onChange={(e) =>
                    setConnections({
                      ...connections,
                      smtp: { ...connections.smtp, port: Number(e.target.value) },
                    })
                  }
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13 }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 4 }}>
                  Username / API Key
                </label>
                <input
                  type="text"
                  placeholder="apikey or username"
                  value={connections.smtp?.username || ""}
                  onChange={(e) =>
                    setConnections({
                      ...connections,
                      smtp: { ...connections.smtp, username: e.target.value },
                    })
                  }
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 4 }}>
                  Sender Email Address
                </label>
                <input
                  type="email"
                  placeholder="orders@vantage.pk"
                  value={connections.smtp?.sender_email || ""}
                  onChange={(e) =>
                    setConnections({
                      ...connections,
                      smtp: { ...connections.smtp, sender_email: e.target.value },
                    })
                  }
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13 }}
                />
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                id="tls_toggle"
                checked={connections.smtp?.use_tls ?? true}
                onChange={(e) =>
                  setConnections({
                    ...connections,
                    smtp: { ...connections.smtp, use_tls: e.target.checked },
                  })
                }
                style={{ width: 16, height: 16, accentColor: C.teal }}
              />
              <label htmlFor="tls_toggle" style={{ fontSize: 13, color: C.ink, cursor: "pointer", fontWeight: 500 }}>
                Enforce TLS encryption on outgoing SMTP connections
              </label>
            </div>
          </Card>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Btn type="submit" disabled={saving} style={{ gap: 6 }}>
              <Save size={15} /> {saving ? "Saving..." : "Save Connection Credentials"}
            </Btn>
          </div>
        </form>
      </div>
    </ViewWrap>
  );
}
