import React, { useState, useEffect } from "react";
import { DollarSign, Download, CheckCircle2, AlertTriangle, FileText, Send, Calendar, RefreshCw } from "lucide-react";
import { C } from "../../data/constants.js";
import { Card, Btn, Badge } from "../Primitives.jsx";
import ViewWrap from "../ViewWrap.jsx";
import {
  hrListPayrollRuns,
  hrGetPayrollRun,
  hrCreatePayrollRun,
  hrUpdatePayslip,
  hrSubmitPayrollRun,
  hrApprovePayrollRun,
  hrListMyPayslips,
  hrDownloadPayslipBlob,
} from "../../utils/api.js";

export default function PayrollView({ showToast, role }) {
  const isManagement = ["owner", "manager", "hr_officer"].includes(role);
  const canApprove = ["owner", "manager"].includes(role);

  const [runs, setRuns] = useState([]);
  const [activeRunId, setActiveRunId] = useState("");
  const [currentRun, setCurrentRun] = useState(null);
  const [myPayslips, setMyPayslips] = useState([]);
  const [loading, setLoading] = useState(true);

  // Month input for new run
  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
  const [drafting, setDrafting] = useState(false);

  // Editing payslip bonus
  const [editingSlip, setEditingSlip] = useState(null);
  const [bonusInput, setBonusInput] = useState(0);

  const loadData = async () => {
    try {
      setLoading(true);
      if (isManagement) {
        const runList = await hrListPayrollRuns().catch(() => []);
        setRuns(runList || []);
        if (runList && runList.length > 0) {
          const runToLoad = activeRunId || runList[0].id;
          setActiveRunId(runToLoad);
          const fullRun = await hrGetPayrollRun(runToLoad);
          setCurrentRun(fullRun);
        } else {
          setCurrentRun(null);
        }
      } else {
        const slips = await hrListMyPayslips().catch(() => []);
        setMyPayslips(slips || []);
      }
    } catch (err) {
      showToast(err.message || "Failed to load payroll records");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [role]);

  const handleSelectRun = async (runId) => {
    setActiveRunId(runId);
    try {
      setLoading(true);
      const fullRun = await hrGetPayrollRun(runId);
      setCurrentRun(fullRun);
    } catch (err) {
      showToast(err.message || "Failed to load payroll run");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRun = async () => {
    try {
      setDrafting(true);
      const newRun = await hrCreatePayrollRun(selectedMonth);
      showToast(`Payroll run drafted for ${selectedMonth}`);
      await loadData();
      if (newRun && newRun.id) {
        handleSelectRun(newRun.id);
      }
    } catch (err) {
      showToast(err.message || "Failed to generate payroll run");
    } finally {
      setDrafting(false);
    }
  };

  const handleSaveBonus = async (slipId) => {
    try {
      await hrUpdatePayslip(slipId, Number(bonusInput) || 0);
      showToast("Payslip adjustments updated");
      setEditingSlip(null);
      if (activeRunId) {
        const fullRun = await hrGetPayrollRun(activeRunId);
        setCurrentRun(fullRun);
      }
    } catch (err) {
      showToast(err.message || "Failed to update bonus/overtime");
    }
  };

  const handleSubmitForApproval = async () => {
    if (!currentRun) return;
    try {
      await hrSubmitPayrollRun(currentRun.id);
      showToast("Payroll run submitted for Owner/Manager approval");
      handleSelectRun(currentRun.id);
    } catch (err) {
      showToast(err.message || "Failed to submit payroll run");
    }
  };

  const handleApproveFinalise = async () => {
    if (!currentRun) return;
    if (!window.confirm("Confirm finalising payroll? This records an immutable audit log. Note: As per policy, the system does not execute automated bank transfers.")) {
      return;
    }
    try {
      await hrApprovePayrollRun(currentRun.id);
      showToast("Payroll run finalised! Payslips are now available for employee download.");
      handleSelectRun(currentRun.id);
    } catch (err) {
      showToast(err.message || "Failed to approve payroll run");
    }
  };

  const handleDownloadPayslip = async (payslipId, empName) => {
    try {
      const blob = await hrDownloadPayslipBlob(payslipId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Payslip_${empName || "Employee"}.html`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showToast("Payslip document downloaded.");
    } catch (err) {
      showToast(err.message || "Failed to download payslip.");
    }
  };

  // Self-Service View for Cashier / Staff
  if (!isManagement) {
    return (
      <ViewWrap title="My Payslips & Compensation (FR-5.4)" subtitle="Access and download your official monthly compensation statements.">
        <Card>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <DollarSign size={18} color={C.teal} /> My Finalised Payslips
          </div>
          {loading ? (
            <div style={{ textAlign: "center", padding: "30px", color: C.inkSoft }}>Loading payslips...</div>
          ) : myPayslips.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: C.inkSoft }}>
              <FileText size={32} style={{ margin: "0 auto 10px", opacity: 0.4 }} />
              <div style={{ fontWeight: 600 }}>No finalised payslips available yet</div>
              <p style={{ fontSize: 12.5, marginTop: 4 }}>Once your monthly payroll is finalised by management, your payslips will appear here.</p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.line}`, textAlign: "left", color: C.inkSoft }}>
                    <th style={{ padding: "10px 12px", fontWeight: 600 }}>Month</th>
                    <th style={{ padding: "10px 12px", fontWeight: 600 }}>Base Salary</th>
                    <th style={{ padding: "10px 12px", fontWeight: 600 }}>Unpaid Deductions</th>
                    <th style={{ padding: "10px 12px", fontWeight: 600 }}>Bonus & Overtime</th>
                    <th style={{ padding: "10px 12px", fontWeight: 600 }}>Net Take-Home</th>
                    <th style={{ padding: "10px 12px", fontWeight: 600 }}>Status</th>
                    <th style={{ padding: "10px 12px", fontWeight: 600, textAlign: "right" }}>Document</th>
                  </tr>
                </thead>
                <tbody>
                  {myPayslips.map((slip) => (
                    <tr key={slip.id} style={{ borderBottom: `1px solid ${C.lineLighter}` }}>
                      <td style={{ padding: "12px", fontWeight: 600, color: C.ink }}>
                        {slip.payroll_month || "Current"}
                      </td>
                      <td style={{ padding: "12px", color: C.inkSoft }}>₨{Number(slip.base_salary || 0).toLocaleString()}</td>
                      <td style={{ padding: "12px", color: "#DC4C3E" }}>
                        {slip.leave_deduction > 0 ? `-₨${Number(slip.leave_deduction).toLocaleString()}` : "₨0"}
                      </td>
                      <td style={{ padding: "12px", color: "#166534" }}>
                        {slip.bonus_overtime > 0 ? `+₨${Number(slip.bonus_overtime).toLocaleString()}` : "₨0"}
                      </td>
                      <td style={{ padding: "12px", fontWeight: 700, color: C.ink }}>
                        ₨{Number(slip.net_salary || 0).toLocaleString()}
                      </td>
                      <td style={{ padding: "12px" }}>
                        <Badge text={slip.status} tone={slip.status === "finalised" ? "positive" : "warning"} />
                      </td>
                      <td style={{ padding: "12px", textAlign: "right" }}>
                        <button
                          onClick={() => handleDownloadPayslip(slip.id, slip.employee_name)}
                          style={{
                            border: `1px solid ${C.line}`,
                            background: "#FFF",
                            color: C.ink,
                            padding: "5px 10px",
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                          }}
                        >
                          <Download size={13} /> Payslip
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </ViewWrap>
    );
  }

  // Management View (Owner, Manager, HR Officer)
  const anyIncomplete = currentRun?.payslips?.some((s) => s.status === "incomplete");

  return (
    <ViewWrap
      title="Payroll Calculation & Approvals (FR-5.4, UC-7)"
      subtitle="Draft monthly payroll runs, apply unpaid leave deductions, and finalise payouts with Human-in-the-Loop approval."
    >
      {/* Top Controls: Selector & Generator */}
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16, marginBottom: 20 }} className="vantage-grid-2">
        <Card>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.ink, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <Calendar size={16} color={C.teal} /> Payroll Runs Directory
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <select
              value={activeRunId}
              onChange={(e) => handleSelectRun(e.target.value)}
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: 8,
                border: `1px solid ${C.line}`,
                background: "#FFF",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.payroll_month} — Status: {r.status.toUpperCase()} (₨{Number(r.total_net_salary || 0).toLocaleString()})
                </option>
              ))}
              {runs.length === 0 && <option value="">No payroll runs created yet</option>}
            </select>
            <Btn variant="secondary" onClick={loadData} title="Refresh">
              <RefreshCw size={14} />
            </Btn>
          </div>
        </Card>

        <Card>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.ink, marginBottom: 10 }}>Generate New Run</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: `1px solid ${C.line}`,
                fontSize: 13,
              }}
            />
            <Btn onClick={handleCreateRun} disabled={drafting}>
              {drafting ? "Calculating..." : "Draft Payroll"}
            </Btn>
          </div>
        </Card>
      </div>

      {/* Active Run Banner & Actions */}
      {currentRun && (
        <Card style={{ marginBottom: 20, background: "#FFF", border: `1px solid ${C.line}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>
                  Month: {currentRun.payroll_month}
                </span>
                <Badge
                  text={currentRun.status.toUpperCase()}
                  tone={
                    currentRun.status === "finalised"
                      ? "positive"
                      : currentRun.status === "incomplete"
                      ? "negative"
                      : "warning"
                  }
                />
              </div>
              <div style={{ fontSize: 13, color: C.inkSoft, marginTop: 4 }}>
                Total Net Payout: <strong style={{ color: C.ink, fontSize: 14 }}>₨{Number(currentRun.total_net_salary || 0).toLocaleString()}</strong> &bull; {currentRun.payslips?.length || 0} active employees
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {currentRun.status === "incomplete" && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#DC4C3E", fontSize: 12.5, fontWeight: 600 }}>
                  <AlertTriangle size={15} /> Resolve incomplete attendance before submission
                </div>
              )}

              {["draft", "incomplete"].includes(currentRun.status) && (
                <Btn
                  variant="secondary"
                  disabled={anyIncomplete}
                  onClick={handleSubmitForApproval}
                  style={{ gap: 6 }}
                >
                  <Send size={14} /> Submit for Approval
                </Btn>
              )}

              {currentRun.status === "pending_approval" && (
                <>
                  {canApprove ? (
                    <Btn
                      onClick={handleApproveFinalise}
                      style={{ background: "#166534", borderColor: "#166534", gap: 6 }}
                    >
                      <CheckCircle2 size={14} /> Approve & Finalise Run
                    </Btn>
                  ) : (
                    <span style={{ fontSize: 12.5, color: "#E3A008", fontWeight: 600 }}>
                      Pending Owner / Manager Approval
                    </span>
                  )}
                </>
              )}

              {currentRun.status === "finalised" && (
                <span style={{ fontSize: 12.5, color: "#166534", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                  <CheckCircle2 size={14} /> Finalised (No Bank Transfer Dispatched)
                </span>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Payslips Table */}
      <Card>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <FileText size={16} color={C.teal} /> Employee Payslips Breakup
        </div>

        {!currentRun ? (
          <div style={{ textAlign: "center", padding: "40px", color: C.inkSoft }}>
            Select an existing payroll run or draft a new one above.
          </div>
        ) : currentRun.payslips?.length === 0 ? (
          <div style={{ textAlign: "center", padding: "30px", color: C.inkSoft }}>
            No active employee records found for this payroll cycle.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.line}`, textAlign: "left", color: C.inkSoft }}>
                  <th style={{ padding: "10px 12px", fontWeight: 600 }}>Employee</th>
                  <th style={{ padding: "10px 12px", fontWeight: 600 }}>Base Salary</th>
                  <th style={{ padding: "10px 12px", fontWeight: 600 }}>Unpaid Days</th>
                  <th style={{ padding: "10px 12px", fontWeight: 600 }}>Leave Deduction</th>
                  <th style={{ padding: "10px 12px", fontWeight: 600 }}>Bonus / Overtime</th>
                  <th style={{ padding: "10px 12px", fontWeight: 600 }}>Net Take-Home</th>
                  <th style={{ padding: "10px 12px", fontWeight: 600 }}>Status</th>
                  <th style={{ padding: "10px 12px", fontWeight: 600, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentRun.payslips.map((slip) => (
                  <tr key={slip.id} style={{ borderBottom: `1px solid ${C.lineLighter}` }}>
                    <td style={{ padding: "12px", fontWeight: 600, color: C.ink }}>
                      {slip.employee_name || slip.employee_id.slice(0, 8)}
                    </td>
                    <td style={{ padding: "12px", color: C.inkSoft }}>
                      ₨{Number(slip.base_salary || 0).toLocaleString()}
                    </td>
                    <td style={{ padding: "12px", color: C.inkSoft }}>
                      {slip.unpaid_leave_days || 0} d
                    </td>
                    <td style={{ padding: "12px", color: slip.leave_deduction > 0 ? "#DC4C3E" : C.inkSoft }}>
                      {slip.leave_deduction > 0 ? `-₨${Number(slip.leave_deduction).toLocaleString()}` : "₨0"}
                    </td>
                    <td style={{ padding: "12px" }}>
                      {editingSlip === slip.id ? (
                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <input
                            type="number"
                            value={bonusInput}
                            onChange={(e) => setBonusInput(e.target.value)}
                            style={{ width: 80, padding: "4px 6px", fontSize: 12, border: `1px solid ${C.line}`, borderRadius: 4 }}
                          />
                          <button
                            onClick={() => handleSaveBonus(slip.id)}
                            style={{ background: C.teal, color: "#FFF", border: "none", borderRadius: 4, padding: "4px 8px", fontSize: 11, cursor: "pointer" }}
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingSlip(null)}
                            style={{ background: "#E5E8F0", border: "none", borderRadius: 4, padding: "4px 6px", fontSize: 11, cursor: "pointer" }}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ color: "#166534", fontWeight: 500 }}>
                            +₨{Number(slip.bonus_overtime || 0).toLocaleString()}
                          </span>
                          {["draft", "incomplete"].includes(currentRun.status) && (
                            <button
                              onClick={() => { setEditingSlip(slip.id); setBonusInput(slip.bonus_overtime || 0); }}
                              style={{ background: "transparent", border: "none", color: C.teal, fontSize: 11, cursor: "pointer", textDecoration: "underline" }}
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "12px", fontWeight: 700, color: C.ink }}>
                      ₨{Number(slip.net_salary || 0).toLocaleString()}
                    </td>
                    <td style={{ padding: "12px" }}>
                      {slip.status === "incomplete" ? (
                        <span
                          title={slip.notes || "Incomplete attendance records"}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            color: "#DC4C3E",
                            fontSize: 11.5,
                            fontWeight: 600,
                            background: "#FEF2F2",
                            padding: "2px 6px",
                            borderRadius: 4,
                          }}
                        >
                          <AlertTriangle size={12} /> Incomplete
                        </span>
                      ) : (
                        <Badge
                          text={slip.status}
                          tone={slip.status === "finalised" ? "positive" : "warning"}
                        />
                      )}
                    </td>
                    <td style={{ padding: "12px", textAlign: "right" }}>
                      <button
                        onClick={() => handleDownloadPayslip(slip.id, slip.employee_name)}
                        style={{
                          border: `1px solid ${C.line}`,
                          background: "#FFF",
                          color: C.ink,
                          padding: "4px 8px",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 500,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <Download size={12} /> PDF/HTML
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </ViewWrap>
  );
}
