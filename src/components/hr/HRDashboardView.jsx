import React, { useState, useEffect } from "react";
import { Users, Clock, Calendar, CheckCircle2, AlertTriangle, ArrowRight, Activity, DollarSign } from "lucide-react";
import { C } from "../../data/constants.js";
import { Card, Btn, Badge } from "../Primitives.jsx";
import ViewWrap from "../ViewWrap.jsx";
import {
  hrListEmployees,
  hrListAttendance,
  hrListLeave,
  hrCreatePayrollRun,
  hrCheckIn,
  hrCheckOut,
} from "../../utils/api.js";

export default function HRDashboardView({ showToast, onNavigate, role }) {
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [todayCheckedIn, setTodayCheckedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  const isManagement = ["owner", "manager", "hr_officer"].includes(role);

  const loadData = async () => {
    try {
      setLoading(true);
      const [empData, attData, leaveData] = await Promise.all([
        hrListEmployees().catch(() => []),
        hrListAttendance({ from_date: new Date().toISOString().slice(0, 10) }).catch(() => []),
        hrListLeave().catch(() => []),
      ]);
      setEmployees(empData || []);
      setAttendance(attData || []);
      setLeaves(leaveData || []);

      const todayStr = new Date().toISOString().slice(0, 10);
      const myRecord = (attData || []).find((r) => r.work_date?.startsWith(todayStr));
      setTodayCheckedIn(Boolean(myRecord && myRecord.check_in && !myRecord.check_out));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleQuickClock = async () => {
    try {
      if (!todayCheckedIn) {
        await hrCheckIn();
        showToast("Successfully checked in for today!");
      } else {
        await hrCheckOut();
        showToast("Successfully checked out for today!");
      }
      loadData();
    } catch (err) {
      showToast(err.message || "Clock action failed");
    }
  };

  const activeEmployees = employees.filter((e) => e.employment_status === "active");
  const presentToday = attendance.filter((a) => a.status === "present" || a.check_in);
  const pendingLeaves = leaves.filter((l) => l.status === "pending");

  return (
    <ViewWrap title="HR & Workforce Overview" subtitle="Real-time employee activity, attendance health, and operational readiness.">
      {/* Top Metric Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14, marginBottom: 20 }}>
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.inkFaint, textTransform: "uppercase" }}>Active Staff</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: C.navy, marginTop: 4 }}>{activeEmployees.length}</div>
            </div>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: C.tealSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Users size={20} color={C.teal} />
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.inkFaint, textTransform: "uppercase" }}>Present Today</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: C.teal, marginTop: 4 }}>{presentToday.length}</div>
            </div>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: C.tealSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Clock size={20} color={C.teal} />
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.inkFaint, textTransform: "uppercase" }}>Pending Leaves</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: pendingLeaves.length > 0 ? C.amberDeep : C.ink, marginTop: 4 }}>
                {pendingLeaves.length}
              </div>
            </div>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: C.amberSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Calendar size={20} color={C.amberDeep} />
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.inkFaint, textTransform: "uppercase" }}>Current Month Payroll</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.navy, marginTop: 8 }}>
                <Badge tone="info">{new Date().toLocaleString("default", { month: "short", year: "numeric" })}</Badge>
              </div>
            </div>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "#E7EAF3", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <DollarSign size={20} color={C.navy} />
            </div>
          </div>
        </Card>
      </div>

      {/* Main Grid: Clock-in action + Pending Leaves */}
      <div style={{ display: "grid", gridTemplateColumns: isManagement ? "1.2fr 1fr" : "1fr", gap: 16 }}>
        {/* Self-Service Punch Clock Card */}
        <Card>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
            <Activity size={16} color={C.teal} /> Self-Service Attendance Clock
          </div>
          <p style={{ fontSize: 13, color: C.inkSoft, marginBottom: 16 }}>
            Record your daily shift time. Check out at the end of your shift to automatically compute net working hours.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Btn
              variant={todayCheckedIn ? "danger" : "primary"}
              onClick={handleQuickClock}
            >
              {todayCheckedIn ? "Clock Out (End Shift)" : "Clock In (Start Shift)"}
            </Btn>
            <span style={{ fontSize: 13, color: todayCheckedIn ? "#0A7873" : C.inkFaint, fontWeight: 600 }}>
              {todayCheckedIn ? "● Shift in progress" : "○ Currently not checked in"}
            </span>
          </div>
        </Card>

        {/* Pending Leave Requests (Management View) */}
        {isManagement && (
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Pending Leave Reviews</div>
              <Btn variant="ghost" size="sm" onClick={() => onNavigate("hr_leave")}>
                View all <ArrowRight size={13} />
              </Btn>
            </div>
            {pendingLeaves.length === 0 ? (
              <div style={{ color: C.inkFaint, fontSize: 13, padding: "20px 0", textAlign: "center" }}>
                No pending leave requests awaiting approval.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {pendingLeaves.slice(0, 4).map((l) => (
                  <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: C.bg, borderRadius: 8 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{l.employee_name || "Employee"}</div>
                      <div style={{ fontSize: 11.5, color: C.inkSoft }}>
                        {l.leave_type.toUpperCase()} &bull; {l.start_date} to {l.end_date}
                      </div>
                    </div>
                    {l.is_flagged ? <Badge tone="critical">Flagged</Badge> : <Badge tone="low">Pending</Badge>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </ViewWrap>
  );
}
