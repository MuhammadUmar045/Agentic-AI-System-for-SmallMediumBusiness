import React, { useState, useEffect } from "react";
import { Users, Plus, Search, ShieldCheck, Mail, Phone, Lock, Eye, EyeOff } from "lucide-react";
import { C } from "../../data/constants.js";
import { Card, Btn, Badge } from "../Primitives.jsx";
import ViewWrap from "../ViewWrap.jsx";
import { hrListEmployees, hrCreateEmployee, hrUpdateEmployee, hrDeactivateEmployee } from "../../utils/api.js";

export default function EmployeesView({ showToast, role }) {
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Form State
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    role: "staff",
    base_salary: 45000,
    department: "Operations",
    create_login: false,
    login_password: "Password123!",
  });

  const canEditSalary = ["owner", "manager"].includes(role);
  const isManagement = ["owner", "manager", "hr_officer"].includes(role);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const data = await hrListEmployees();
      setEmployees(data || []);
    } catch (err) {
      showToast(err.message || "Failed to load employees");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.full_name || !form.email) {
      showToast("Name and email are required");
      return;
    }
    try {
      await hrCreateEmployee({
        ...form,
        base_salary: Number(form.base_salary) || 0,
      });
      showToast(`Employee "${form.full_name}" created successfully.`);
      setShowModal(false);
      setForm({
        full_name: "",
        email: "",
        phone: "",
        role: "staff",
        base_salary: 45000,
        department: "Operations",
        create_login: false,
        login_password: "Password123!",
      });
      fetchEmployees();
    } catch (err) {
      showToast(err.message || "Failed to create employee");
    }
  };

  const handleDeactivate = async (id, name) => {
    if (!window.confirm(`Are you sure you want to deactivate ${name}?`)) return;
    try {
      await hrDeactivateEmployee(id);
      showToast(`Employee "${name}" deactivated.`);
      fetchEmployees();
    } catch (err) {
      showToast(err.message || "Deactivation failed");
    }
  };

  const filtered = employees.filter((e) =>
    (e.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (e.email || "").toLowerCase().includes(search.toLowerCase()) ||
    (e.role || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <ViewWrap title="Employees & Roles (FR-5.1)" subtitle="Manage business workforce records, salary structures, and permissions.">
      {/* Top Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.line}`, minWidth: 260 }}>
          <Search size={14} color={C.inkFaint} />
          <input
            placeholder="Search by name, email, or role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ border: "none", outline: "none", fontSize: 13, width: "100%" }}
          />
        </div>

        {isManagement && (
          <Btn variant="primary" onClick={() => setShowModal(true)}>
            <Plus size={15} /> Add Employee
          </Btn>
        )}
      </div>

      {/* Employees Table */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.bg, borderBottom: `1px solid ${C.line}` }}>
                <th style={{ padding: "12px 16px", color: C.inkFaint, fontWeight: 700 }}>Employee</th>
                <th style={{ padding: "12px 16px", color: C.inkFaint, fontWeight: 700 }}>Role</th>
                <th style={{ padding: "12px 16px", color: C.inkFaint, fontWeight: 700 }}>Department</th>
                <th style={{ padding: "12px 16px", color: C.inkFaint, fontWeight: 700 }}>Base Salary</th>
                <th style={{ padding: "12px 16px", color: C.inkFaint, fontWeight: 700 }}>Status</th>
                {isManagement && <th style={{ padding: "12px 16px", color: C.inkFaint, fontWeight: 700, textAlign: "right" }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 24, textAlign: "center", color: C.inkFaint }}>
                    {loading ? "Loading workforce records..." : "No employees found."}
                  </td>
                </tr>
              ) : (
                filtered.map((emp) => (
                  <tr key={emp.id} style={{ borderBottom: `1px solid ${C.line}` }}>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ fontWeight: 700, color: C.ink }}>{emp.full_name}</div>
                      <div style={{ fontSize: 11.5, color: C.inkSoft }}>{emp.email} &bull; {emp.phone || "No phone"}</div>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <Badge tone={emp.role === "owner" ? "info" : (emp.role === "manager" ? "low" : "neutral")}>
                        {emp.role.replace("_", " ").toUpperCase()}
                      </Badge>
                    </td>
                    <td style={{ padding: "12px 16px", color: C.inkSoft }}>{emp.department || "Operations"}</td>
                    <td style={{ padding: "12px 16px", fontWeight: 600, color: C.navy }}>
                      {emp.base_salary != null ? `PKR ${emp.base_salary.toLocaleString()}` : "•••••• (Hidden)"}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {emp.employment_status === "active" ? (
                        <span style={{ color: "#0A7873", fontWeight: 700, fontSize: 12 }}>● Active</span>
                      ) : (
                        <span style={{ color: C.coral, fontWeight: 700, fontSize: 12 }}>○ Inactive</span>
                      )}
                    </td>
                    {isManagement && (
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        {emp.employment_status === "active" && (
                          <button
                            onClick={() => handleDeactivate(emp.id, emp.full_name)}
                            style={{ background: "none", border: "none", color: C.coral, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                          >
                            Deactivate
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add Employee Modal */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 500, padding: 24, boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 14, color: C.navy }}>Add New Employee</div>
            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.inkFaint }}>Full Name *</label>
                <input
                  required
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.line}`, marginTop: 4, fontSize: 13.5 }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: C.inkFaint }}>Email Address *</label>
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.line}`, marginTop: 4, fontSize: 13.5 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: C.inkFaint }}>Phone (WhatsApp)</label>
                  <input
                    value={form.phone}
                    placeholder="+92 300 1234567"
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.line}`, marginTop: 4, fontSize: 13.5 }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: C.inkFaint }}>Assigned Role</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.line}`, marginTop: 4, fontSize: 13.5, background: "#fff" }}
                  >
                    <option value="staff">Staff Member</option>
                    <option value="cashier">Cashier Counter</option>
                    <option value="hr_officer">HR Officer</option>
                    <option value="manager">Store Manager</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: C.inkFaint }}>Base Salary (PKR) *</label>
                  <input
                    type="number"
                    value={form.base_salary}
                    onChange={(e) => setForm({ ...form, base_salary: e.target.value })}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.line}`, marginTop: 4, fontSize: 13.5 }}
                  />
                </div>
              </div>

              {/* Login Credentials Toggle */}
              <div style={{ padding: "10px 12px", background: C.bg, borderRadius: 8, marginTop: 4 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={form.create_login}
                    onChange={(e) => setForm({ ...form, create_login: e.target.checked })}
                  />
                  <span>Create App Login Credentials for this Employee</span>
                </label>
                {form.create_login && (
                  <div style={{ marginTop: 8 }}>
                    <label style={{ fontSize: 11.5, color: C.inkSoft }}>Initial Password:</label>
                    <input
                      type="password"
                      value={form.login_password}
                      onChange={(e) => setForm({ ...form, login_password: e.target.value })}
                      style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.line}`, marginTop: 2, fontSize: 13 }}
                    />
                  </div>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                <Btn variant="ghost" onClick={() => setShowModal(false)}>Cancel</Btn>
                <Btn variant="primary" type="submit">Create Record</Btn>
              </div>
            </form>
          </div>
        </div>
      )}
    </ViewWrap>
  );
}
