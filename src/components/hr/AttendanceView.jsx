import React, { useState, useEffect } from "react";
import { Clock, CheckCircle2, AlertTriangle, Calendar, Search, Edit3 } from "lucide-react";
import { C } from "../../data/constants.js";
import { Card, Btn, Badge } from "../Primitives.jsx";
import ViewWrap from "../ViewWrap.jsx";
import { hrListAttendance, hrCheckIn, hrCheckOut, hrCorrectAttendance, hrListEmployees } from "../../utils/api.js";

export default function AttendanceView({ showToast, role }) {
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [selectedEmp, setSelectedEmp] = useState("");
  const [loading, setLoading] = useState(true);

  // Correction Modal
  const [correcting, setCorrecting] = useState(null);
  const [correctForm, setCorrectForm] = useState({ check_in: "", check_out: "", reason: "" });

  const isManagement = ["owner", "manager", "hr_officer"].includes(role);

  const fetchAttendance = async () => {
    try {
      setLoading(true);
      const [attData, empData] = await Promise.all([
        hrListAttendance(selectedEmp ? { employee_id: selectedEmp } : {}),
        isManagement ? hrListEmployees().catch(() => []) : Promise.resolve([]),
      ]);
      setRecords(attData || []);
      setEmployees(empData || []);
    } catch (err) {
      showToast(err.message || "Failed to load attendance");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
  }, [selectedEmp]);

  const handleSelfCheckIn = async () => {
    try {
      await hrCheckIn();
      showToast("Checked in successfully!");
      fetchAttendance();
    } catch (err) {
      showToast(err.message);
    }
  };

  const handleSelfCheckOut = async () => {
    try {
      await hrCheckOut();
      showToast("Checked out successfully!");
      fetchAttendance();
    } catch (err) {
      showToast(err.message);
    }
  };

  const handleSaveCorrection = async (e) => {
    e.preventDefault();
    if (!correcting || !correctForm.reason) {
      showToast("A valid correction reason is required for audit logs.");
      return;
    }
    try {
      await hrCorrectAttendance(correcting.id, correctForm.check_in, correctForm.check_out, correctForm.reason);
      showToast("Attendance record corrected and audit logged.");
      setCorrecting(null);
      fetchAttendance();
    } catch (err) {
      showToast(err.message || "Failed to correct attendance");
    }
  };

  const openCorrection = (rec) => {
    setCorrecting(rec);
    setCorrectForm({
      check_in: rec.check_in || "",
      check_out: rec.check_out || "",
      reason: "",
    });
  };

  // Stats calculation
  const totalDays = records.length;
  const completeDays = records.filter((r) => r.status === "present" || r.status === "corrected").length;
  const incompleteDays = records.filter((r) => r.status === "incomplete").length;
  const totalHours = records.reduce((acc, r) => acc + (r.net_hours || 0), 0);

  return (
    <ViewWrap title="Attendance & Shift Clock (FR-5.2)" subtitle="Monitor working hours, incomplete shifts, and HR audit-logged corrections.">
      {/* Top Action & Stats Bar */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 2fr", gap: 16, marginBottom: 20 }} className="vantage-grid-2">
        {/* Quick Clock Card */}
        <Card>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
            <Clock size={16} color={C.teal} /> Daily Punch Clock
          </div>
          <p style={{ fontSize: 12.5, color: C.inkSoft, margin: "0 0 14px" }}>
            Self-service clocking for shifts. Net hours calculate automatically upon clock-out.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn variant="primary" onClick={handleSelfCheckIn}>Check In</Btn>
            <Btn variant="danger" onClick={handleSelfCheckOut}>Check Out</Btn>
          </div>
        </Card>

        {/* Attendance Stats Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <Card style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.inkFaint, textTransform: "uppercase" }}>Completed Shifts</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#0A7873", marginTop: 4 }}>{completeDays}</div>
          </Card>
          <Card style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.inkFaint, textTransform: "uppercase" }}>Incomplete Days</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: incompleteDays > 0 ? C.coral : C.ink, marginTop: 4 }}>{incompleteDays}</div>
          </Card>
          <Card style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.inkFaint, textTransform: "uppercase" }}>Net Hours Logged</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: C.navy, marginTop: 4 }}>{totalHours.toFixed(1)}h</div>
          </Card>
        </div>
      </div>

      {/* Filter Toolbar */}
      {isManagement && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.inkFaint }}>Filter by Employee:</span>
          <select
            value={selectedEmp}
            onChange={(e) => setSelectedEmp(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.line}`, background: "#fff", fontSize: 13 }}
          >
            <option value="">All Employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.full_name} ({e.role})</option>
            ))}
          </select>
        </div>
      )}

      {/* Attendance History Table */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.bg, borderBottom: `1px solid ${C.line}` }}>
                <th style={{ padding: "12px 16px", color: C.inkFaint, fontWeight: 700 }}>Work Date</th>
                <th style={{ padding: "12px 16px", color: C.inkFaint, fontWeight: 700 }}>Employee</th>
                <th style={{ padding: "12px 16px", color: C.inkFaint, fontWeight: 700 }}>Check In</th>
                <th style={{ padding: "12px 16px", color: C.inkFaint, fontWeight: 700 }}>Check Out</th>
                <th style={{ padding: "12px 16px", color: C.inkFaint, fontWeight: 700 }}>Net Hours</th>
                <th style={{ padding: "12px 16px", color: C.inkFaint, fontWeight: 700 }}>Status</th>
                {isManagement && <th style={{ padding: "12px 16px", color: C.inkFaint, fontWeight: 700, textAlign: "right" }}>HR Correction</th>}
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 24, textAlign: "center", color: C.inkFaint }}>
                    {loading ? "Loading attendance records..." : "No attendance logs found for this period."}
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${C.line}` }}>
                    <td style={{ padding: "12px 16px", fontWeight: 600 }}>{r.work_date}</td>
                    <td style={{ padding: "12px 16px" }}>{r.employee_name || "Self"}</td>
                    <td style={{ padding: "12px 16px", color: C.inkSoft }}>
                      {r.check_in ? new Date(r.check_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                    </td>
                    <td style={{ padding: "12px 16px", color: C.inkSoft }}>
                      {r.check_out ? new Date(r.check_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                    </td>
                    <td style={{ padding: "12px 16px", fontWeight: 700, color: C.navy }}>{r.net_hours} hrs</td>
                    <td style={{ padding: "12px 16px" }}>
                      {r.status === "present" && <Badge tone="info">Present</Badge>}
                      {r.status === "corrected" && <Badge tone="low">Corrected</Badge>}
                      {r.status === "incomplete" && <Badge tone="critical">Incomplete</Badge>}
                    </td>
                    {isManagement && (
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        <Btn variant="ghost" size="sm" onClick={() => openCorrection(r)}>
                          <Edit3 size={12} /> Correct
                        </Btn>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Correction Modal */}
      {correcting && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 440, padding: 22, boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}>
            <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 8, color: C.navy }}>HR Attendance Correction</div>
            <p style={{ fontSize: 12.5, color: C.inkSoft, marginBottom: 14 }}>
              Every correction modifies net working hours and is recorded in the immutable audit log.
            </p>
            <form onSubmit={handleSaveCorrection} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: C.inkFaint }}>Check In ISO Timestamp</label>
                <input
                  required
                  value={correctForm.check_in}
                  onChange={(e) => setCorrectForm({ ...correctForm, check_in: e.target.value })}
                  style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.line}`, marginTop: 4, fontSize: 12.5 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: C.inkFaint }}>Check Out ISO Timestamp</label>
                <input
                  required
                  value={correctForm.check_out}
                  onChange={(e) => setCorrectForm({ ...correctForm, check_out: e.target.value })}
                  style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.line}`, marginTop: 4, fontSize: 12.5 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11.5, fontWeight: 600, color: C.inkFaint }}>Audit Correction Reason *</label>
                <input
                  required
                  placeholder="e.g. Employee forgot to punch out due to power cut"
                  value={correctForm.reason}
                  onChange={(e) => setCorrectForm({ ...correctForm, reason: e.target.value })}
                  style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.line}`, marginTop: 4, fontSize: 12.5 }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                <Btn variant="ghost" onClick={() => setCorrecting(null)}>Cancel</Btn>
                <Btn variant="primary" type="submit">Save &amp; Log</Btn>
              </div>
            </form>
          </div>
        </div>
      )}
    </ViewWrap>
  );
}
