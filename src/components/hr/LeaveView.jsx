import React, { useState, useEffect } from "react";
import { Calendar, CheckCircle2, XCircle, AlertTriangle, Plus, FileText, Clock, UserCheck } from "lucide-react";
import { C } from "../../data/constants.js";
import { Card, Btn, Badge } from "../Primitives.jsx";
import ViewWrap from "../ViewWrap.jsx";
import { hrListLeave, hrCreateLeave, hrReviewLeave, hrListEmployees } from "../../utils/api.js";

export default function LeaveView({ showToast, role }) {
  const [leaves, setLeaves] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [selectedEmp, setSelectedEmp] = useState("");
  const [loading, setLoading] = useState(true);

  // New Leave Request Modal
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applyForm, setApplyForm] = useState({
    employee_id: "",
    leave_type: "annual",
    start_date: new Date().toISOString().split("T")[0],
    end_date: new Date().toISOString().split("T")[0],
    reason: "",
  });

  // Review Modal
  const [reviewingLeave, setReviewingLeave] = useState(null);
  const [reviewForm, setReviewForm] = useState({ status: "approved", comment: "" });

  const isManagement = ["owner", "manager", "hr_officer"].includes(role);

  const fetchLeaveData = async () => {
    try {
      setLoading(true);
      const [leaveData, empData] = await Promise.all([
        hrListLeave(selectedEmp ? { employee_id: selectedEmp } : {}),
        isManagement ? hrListEmployees().catch(() => []) : Promise.resolve([]),
      ]);
      setLeaves(leaveData || []);
      setEmployees(empData || []);
    } catch (err) {
      showToast(err.message || "Failed to load leave records");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaveData();
  }, [selectedEmp]);

  const handleApplyLeave = async (e) => {
    e.preventDefault();
    if (!applyForm.start_date || !applyForm.end_date) {
      showToast("Please choose valid start and end dates.");
      return;
    }
    if (new Date(applyForm.end_date) < new Date(applyForm.start_date)) {
      showToast("End date must be greater than or equal to start date.");
      return;
    }

    try {
      const res = await hrCreateLeave({
        employee_id: applyForm.employee_id || undefined,
        leave_type: applyForm.leave_type,
        start_date: applyForm.start_date,
        end_date: applyForm.end_date,
        reason: applyForm.reason,
      });

      if (res.is_flagged) {
        showToast("Leave submitted with flags (insufficient balance or date overlap). Pending review.");
      } else {
        showToast("Leave request submitted successfully.");
      }
      setShowApplyModal(false);
      fetchLeaveData();
    } catch (err) {
      showToast(err.message || "Failed to submit leave request.");
    }
  };

  const handleReviewAction = async (e) => {
    e.preventDefault();
    if (!reviewingLeave) return;

    try {
      await hrReviewLeave(reviewingLeave.id, reviewForm.status, reviewForm.comment);
      showToast(`Leave request has been marked ${reviewForm.status}. Audit logged.`);
      setReviewingLeave(null);
      fetchLeaveData();
    } catch (err) {
      showToast(err.message || "Failed to review leave.");
    }
  };

  const openReviewModal = (leave, initialStatus) => {
    setReviewingLeave(leave);
    setReviewForm({ status: initialStatus, comment: "" });
  };

  const pendingCount = leaves.filter((l) => l.status === "pending").length;
  const approvedCount = leaves.filter((l) => l.status === "approved").length;
  const flaggedCount = leaves.filter((l) => l.is_flagged && l.status === "pending").length;

  return (
    <ViewWrap title="Leave Management (FR-5.3)" subtitle="Submit, track, and approve annual, sick, and unpaid leave with automatic overlap and quota validation.">
      {/* Metric Cards & Actions */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 20 }}>
        <Card>
          <div style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600 }}>Total Requests</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: C.ink, marginTop: 4 }}>{leaves.length}</div>
          <div style={{ fontSize: 12, color: C.inkLighter, marginTop: 4 }}>Across all active cycles</div>
        </Card>
        <Card>
          <div style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600 }}>Pending Approval</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: pendingCount > 0 ? "#E3A008" : C.ink, marginTop: 4 }}>
            {pendingCount}
          </div>
          <div style={{ fontSize: 12, color: C.inkLighter, marginTop: 4 }}>Awaiting manager action</div>
        </Card>
        <Card>
          <div style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600 }}>Flagged Inconsistencies</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: flaggedCount > 0 ? "#DC4C3E" : C.teal, marginTop: 4 }}>
            {flaggedCount}
          </div>
          <div style={{ fontSize: 12, color: C.inkLighter, marginTop: 4 }}>Balance or overlap alerts</div>
        </Card>
        <Card style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <Btn onClick={() => setShowApplyModal(true)} style={{ width: "100%", justifyContent: "center", gap: 6 }}>
            <Plus size={16} /> Request Leave
          </Btn>
        </Card>
      </div>

      {/* Filter Bar */}
      {isManagement && (
        <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
          <select
            value={selectedEmp}
            onChange={(e) => setSelectedEmp(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: `1px solid ${C.line}`,
              background: "#FFF",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            <option value="">All Employees</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.full_name} ({emp.role})
              </option>
            ))}
          </select>
          <span style={{ fontSize: 12.5, color: C.inkSoft }}>
            Showing {leaves.length} record{leaves.length === 1 ? "" : "s"}
          </span>
        </div>
      )}

      {/* Leave Table Card */}
      <Card>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <Calendar size={16} color={C.teal} /> Leave Requests
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "30px", color: C.inkSoft, fontSize: 13 }}>Loading leave requests...</div>
        ) : leaves.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: C.inkSoft }}>
            <FileText size={32} style={{ margin: "0 auto 10px", opacity: 0.4 }} />
            <div style={{ fontWeight: 600 }}>No leave applications found</div>
            <p style={{ fontSize: 12.5, marginTop: 4 }}>Click "Request Leave" above to apply for paid or unpaid time off.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.line}`, textAlign: "left", color: C.inkSoft }}>
                  <th style={{ padding: "10px 12px", fontWeight: 600 }}>Employee</th>
                  <th style={{ padding: "10px 12px", fontWeight: 600 }}>Type</th>
                  <th style={{ padding: "10px 12px", fontWeight: 600 }}>Duration</th>
                  <th style={{ padding: "10px 12px", fontWeight: 600 }}>Reason</th>
                  <th style={{ padding: "10px 12px", fontWeight: 600 }}>Status</th>
                  <th style={{ padding: "10px 12px", fontWeight: 600 }}>Flag</th>
                  {isManagement && <th style={{ padding: "10px 12px", fontWeight: 600, textAlign: "right" }}>Decision</th>}
                </tr>
              </thead>
              <tbody>
                {leaves.map((l) => (
                  <tr key={l.id} style={{ borderBottom: `1px solid ${C.lineLighter}` }}>
                    <td style={{ padding: "12px", fontWeight: 600, color: C.ink }}>
                      {l.employee_name || l.employee_id.slice(0, 8)}
                    </td>
                    <td style={{ padding: "12px" }}>
                      <span
                        style={{
                          textTransform: "capitalize",
                          padding: "3px 8px",
                          borderRadius: 6,
                          fontSize: 11.5,
                          fontWeight: 600,
                          background: l.leave_type === "unpaid" ? "#FEE2E2" : "#E0F2FE",
                          color: l.leave_type === "unpaid" ? "#991B1B" : "#0369A1",
                        }}
                      >
                        {l.leave_type}
                      </span>
                    </td>
                    <td style={{ padding: "12px", color: C.inkSoft }}>
                      <div>{l.start_date} → {l.end_date}</div>
                      <div style={{ fontSize: 11, color: C.inkLighter }}>{l.days_count || 1} day(s)</div>
                    </td>
                    <td style={{ padding: "12px", color: C.inkSoft, maxWidth: 220 }}>
                      <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {l.reason || "—"}
                      </div>
                    </td>
                    <td style={{ padding: "12px" }}>
                      {l.status === "approved" && <Badge text="Approved" tone="positive" />}
                      {l.status === "rejected" && <Badge text="Rejected" tone="negative" />}
                      {l.status === "pending" && <Badge text="Pending Review" tone="warning" />}
                    </td>
                    <td style={{ padding: "12px" }}>
                      {l.is_flagged ? (
                        <span
                          title={l.flag_reason || "Insufficient balance or schedule clash"}
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
                          <AlertTriangle size={12} /> Flagged
                        </span>
                      ) : (
                        <span style={{ color: C.inkLighter, fontSize: 12 }}>—</span>
                      )}
                    </td>
                    {isManagement && (
                      <td style={{ padding: "12px", textAlign: "right" }}>
                        {l.status === "pending" ? (
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button
                              onClick={() => openReviewModal(l, "approved")}
                              style={{
                                border: "none",
                                background: "#DCFCE7",
                                color: "#166534",
                                padding: "4px 8px",
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <CheckCircle2 size={13} /> Approve
                            </button>
                            <button
                              onClick={() => openReviewModal(l, "rejected")}
                              style={{
                                border: "none",
                                background: "#FEE2E2",
                                color: "#991B1B",
                                padding: "4px 8px",
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <XCircle size={13} /> Reject
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: 11.5, color: C.inkLighter }}>
                            Reviewed {l.review_comment ? `(${l.review_comment})` : ""}
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal: Submit Leave Request */}
      {showApplyModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 16,
          }}
        >
          <div
            style={{
              background: "#FFF",
              borderRadius: 12,
              padding: 24,
              width: "100%",
              maxWidth: 480,
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: C.ink }}>Apply for Leave</div>
              <button
                onClick={() => setShowApplyModal(false)}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: C.inkSoft }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleApplyLeave} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {isManagement && employees.length > 0 && (
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 4 }}>
                    Employee (Leave blank for Self)
                  </label>
                  <select
                    value={applyForm.employee_id}
                    onChange={(e) => setApplyForm({ ...applyForm, employee_id: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${C.line}`,
                      fontSize: 13,
                    }}
                  >
                    <option value="">Myself (Logged-in User)</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.full_name} ({emp.role})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 4 }}>
                  Leave Type
                </label>
                <select
                  value={applyForm.leave_type}
                  onChange={(e) => setApplyForm({ ...applyForm, leave_type: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: `1px solid ${C.line}`,
                    fontSize: 13,
                  }}
                >
                  <option value="annual">Annual Leave (Paid)</option>
                  <option value="sick">Sick Leave (Paid)</option>
                  <option value="casual">Casual Leave (Paid)</option>
                  <option value="unpaid">Unpaid Leave (Payroll Deducted)</option>
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 4 }}>
                    Start Date
                  </label>
                  <input
                    type="date"
                    required
                    value={applyForm.start_date}
                    onChange={(e) => setApplyForm({ ...applyForm, start_date: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${C.line}`,
                      fontSize: 13,
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 4 }}>
                    End Date
                  </label>
                  <input
                    type="date"
                    required
                    value={applyForm.end_date}
                    onChange={(e) => setApplyForm({ ...applyForm, end_date: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${C.line}`,
                      fontSize: 13,
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 4 }}>
                  Reason & Context
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="State the purpose of your leave..."
                  value={applyForm.reason}
                  onChange={(e) => setApplyForm({ ...applyForm, reason: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: `1px solid ${C.line}`,
                    fontSize: 13,
                    resize: "vertical",
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
                <Btn variant="secondary" type="button" onClick={() => setShowApplyModal(false)}>
                  Cancel
                </Btn>
                <Btn type="submit">Submit Request</Btn>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Review Leave Decision */}
      {reviewingLeave && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 16,
          }}
        >
          <div
            style={{
              background: "#FFF",
              borderRadius: 12,
              padding: 24,
              width: "100%",
              maxWidth: 440,
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 16, color: C.ink, marginBottom: 12 }}>
              {reviewForm.status === "approved" ? "Approve Leave Request" : "Reject Leave Request"}
            </div>
            <p style={{ fontSize: 13, color: C.inkSoft, margin: "0 0 16px" }}>
              Are you sure you want to mark this request for{" "}
              <strong>{reviewingLeave.employee_name || "Employee"}</strong> ({reviewingLeave.start_date} to {reviewingLeave.end_date}) as{" "}
              <strong style={{ color: reviewForm.status === "approved" ? "#166534" : "#991B1B" }}>
                {reviewForm.status.toUpperCase()}
              </strong>
              ? This decision will be recorded in the audit trail.
            </p>

            <form onSubmit={handleReviewAction} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 4 }}>
                  Decision Comment (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Approved as requested / Project deadline conflict"
                  value={reviewForm.comment}
                  onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: `1px solid ${C.line}`,
                    fontSize: 13,
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
                <Btn variant="secondary" type="button" onClick={() => setReviewingLeave(null)}>
                  Cancel
                </Btn>
                <Btn
                  type="submit"
                  style={{
                    background: reviewForm.status === "approved" ? "#166534" : "#991B1B",
                    borderColor: reviewForm.status === "approved" ? "#166534" : "#991B1B",
                  }}
                >
                  Confirm {reviewForm.status === "approved" ? "Approval" : "Rejection"}
                </Btn>
              </div>
            </form>
          </div>
        </div>
      )}
    </ViewWrap>
  );
}
