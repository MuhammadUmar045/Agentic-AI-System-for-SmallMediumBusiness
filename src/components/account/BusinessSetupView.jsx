import React, { useState, useEffect } from "react";
import { Building2, Save, Percent, Calendar, AlertCircle, CheckCircle2, ShieldCheck } from "lucide-react";
import { C } from "../../data/constants.js";
import { Card, Btn, Badge } from "../Primitives.jsx";
import ViewWrap from "../ViewWrap.jsx";
import { accountGetBusinessSetup, accountUpdateBusinessSetup } from "../../utils/api.js";

export default function BusinessSetupView({ showToast }) {
  const [form, setForm] = useState({
    name: "Vantage Retail",
    industry: "Retail & FMCG",
    currency: "PKR",
    tax_rate: 0.0,
    annual_leave_days: 14,
    working_days_per_month: 26,
    low_stock_threshold_default: 10,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await accountGetBusinessSetup();
        if (data) {
          setForm({
            name: data.name || "Vantage Retail",
            industry: data.industry || "Retail & FMCG",
            currency: data.currency || "PKR",
            tax_rate: data.tax_rate !== undefined ? data.tax_rate : 0.0,
            annual_leave_days: data.annual_leave_days || 14,
            working_days_per_month: data.working_days_per_month || 26,
            low_stock_threshold_default: data.low_stock_threshold_default || 10,
          });
        }
      } catch (err) {
        showToast(err.message || "Failed to load business setup.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      await accountUpdateBusinessSetup({
        ...form,
        tax_rate: Number(form.tax_rate),
        annual_leave_days: Number(form.annual_leave_days),
        working_days_per_month: Number(form.working_days_per_month),
        low_stock_threshold_default: Number(form.low_stock_threshold_default),
      });
      showToast("Business setup & operational defaults saved.");
    } catch (err) {
      showToast(err.message || "Failed to update business settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ViewWrap
      title="Business Setup & Configuration (FR-P.1, FR-5.3, FR-5.4)"
      subtitle="Configure enterprise parameters, POS tax rates, payroll divisor, and annual leave allowances."
    >
      <div style={{ maxWidth: 720 }}>
        <form onSubmit={handleSave}>
          <Card style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <Building2 size={16} color={C.teal} /> Organization Profile
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 4 }}>
                  Business Name
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 4 }}>
                  Industry Segment
                </label>
                <input
                  type="text"
                  value={form.industry}
                  onChange={(e) => setForm({ ...form, industry: e.target.value })}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13 }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 4 }}>
                  Operational Currency
                </label>
                <input
                  type="text"
                  disabled
                  value={`${form.currency} (Pakistani Rupee - ₨)`}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13, background: "#F8FAFC", color: C.ink }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 4 }}>
                  POS Default Sales Tax Rate (%)
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={form.tax_rate}
                    onChange={(e) => setForm({ ...form, tax_rate: e.target.value })}
                    style={{ width: "100%", padding: "9px 12px 9px 30px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13 }}
                  />
                  <Percent size={14} style={{ position: "absolute", left: 10, top: 11, color: C.inkSoft }} />
                </div>
              </div>
            </div>
          </Card>

          <Card style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <Calendar size={16} color={C.teal} /> HR & Operational Parameters
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 4 }}>
                  Annual Leave Allowance
                </label>
                <input
                  type="number"
                  min="0"
                  max="365"
                  required
                  value={form.annual_leave_days}
                  onChange={(e) => setForm({ ...form, annual_leave_days: e.target.value })}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13 }}
                />
                <span style={{ fontSize: 11, color: C.inkLighter, marginTop: 4, display: "block" }}>Days per year (default 14)</span>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 4 }}>
                  Working Days / Month
                </label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  required
                  value={form.working_days_per_month}
                  onChange={(e) => setForm({ ...form, working_days_per_month: e.target.value })}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13 }}
                />
                <span style={{ fontSize: 11, color: C.inkLighter, marginTop: 4, display: "block" }}>Payroll daily rate divisor (26)</span>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 4 }}>
                  Low-Stock Threshold
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={form.low_stock_threshold_default}
                  onChange={(e) => setForm({ ...form, low_stock_threshold_default: e.target.value })}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13 }}
                />
                <span style={{ fontSize: 11, color: C.inkLighter, marginTop: 4, display: "block" }}>Catalog reorder warning (10)</span>
              </div>
            </div>
          </Card>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Btn type="submit" disabled={saving} style={{ gap: 6 }}>
              <Save size={15} /> {saving ? "Saving..." : "Save Configuration"}
            </Btn>
          </div>
        </form>
      </div>
    </ViewWrap>
  );
}
