import React, { useState, useEffect } from "react";
import {
  Users, UserPlus, Trash2, Store, ShieldCheck, Crown,
  Lock, Mail, User, CheckCircle2, XCircle, AlertCircle, Eye, EyeOff, UserCheck, Briefcase
} from "lucide-react";
import { C, ROLE_META } from "../data/constants.js";
import { Card, Btn, Badge, ConfirmDialog } from "./Primitives.jsx";
import ViewWrap from "./ViewWrap.jsx";
import {
  accountListRoles,
  accountInviteRole,
  accountToggleRoleStatus,
  accountUpdateUserRole,
} from "../utils/api.js";

export default function TeamView({ showToast, role, profile }) {
  const isOwner = role === "owner" || role === "admin";
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmStatusAction, setConfirmStatusAction] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPw, setShowPw] = useState(false);

  // Form state
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "cashier",
  });
  const [formError, setFormError] = useState("");

  const loadTeam = async () => {
    if (!isOwner) return;
    setLoading(true);
    try {
      const data = await accountListRoles();
      setMembers(data || []);
    } catch {
      setMembers([
        { id: "owner-1", owner: profile.owner || "Store Owner", email: profile.email || "owner@store.com", role: "owner", status: "active", created_at: "Primary Account" }
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTeam();
  }, [isOwner]);

  const handleAddMember = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      setFormError("All fields are required.");
      return;
    }
    if (form.password.length < 6) {
      setFormError("Password must be at least 6 characters.");
      return;
    }

    setSubmitting(true);
    try {
      const created = await accountInviteRole({
        full_name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
      });
      showToast(`Added ${created.full_name || form.name} as ${(created.role || form.role).toUpperCase()}.`);
      setModalOpen(false);
      setForm({ name: "", email: "", password: "", role: "cashier" });
      loadTeam();
    } catch (err) {
      setFormError(err.message || "Failed to add team member.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (id, currentStatus, name) => {
    const targetStatus = currentStatus === "active" ? "suspended" : "active";
    try {
      await accountToggleRoleStatus(id, targetStatus);
      showToast(`${name}'s account marked as ${targetStatus}.`);
      loadTeam();
    } catch (err) {
      showToast(err.message || "Could not change status.");
    } finally {
      setConfirmStatusAction(null);
    }
  };

  const handleChangeRole = async (userId, newRole) => {
    try {
      await accountUpdateUserRole(userId, newRole);
      showToast(`User role updated to ${newRole.toUpperCase()}.`);
      loadTeam();
    } catch (err) {
      showToast(err.message || "Failed to change role.");
    }
  };

  const ownerCount = members.filter((m) => m.role === "owner" && m.status === "active").length;
  const managerCount = members.filter((m) => m.role === "manager").length;
  const hrCount = members.filter((m) => m.role === "hr_officer").length;
  const cashierCount = members.filter((m) => m.role === "cashier").length;
  const staffCount = members.filter((m) => m.role === "staff").length;

  return (
    <ViewWrap
      title="Team & Role Access Control (FR-P.3, SEC-4)"
      subtitle="Manage logins and assign one of the 5 system roles: Owner, Manager, HR Officer, Cashier, and Staff Member."
      action={
        isOwner && (
          <Btn onClick={() => { setFormError(""); setModalOpen(true); }} style={{ gap: 6 }}>
            <UserPlus size={15} /> Add Team Member
          </Btn>
        )
      }
    >
      {/* 5-Role KPI Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 20 }}>
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: C.inkSoft, fontWeight: 600 }}>Total Accounts</span>
            <Users size={16} color={C.teal} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.ink, marginTop: 6 }}>{members.length}</div>
          <div style={{ fontSize: 11, color: C.inkLighter, marginTop: 4 }}>Across all departments</div>
        </Card>

        <Card style={{ borderLeft: `3px solid #1F2A44` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: C.ink, fontWeight: 700 }}>Owners</span>
            <Crown size={15} color="#1F2A44" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>{ownerCount}</div>
          <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 4 }}>Full administrative & P&L</div>
        </Card>

        <Card style={{ borderLeft: `3px solid ${C.teal}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: C.teal, fontWeight: 700 }}>Managers</span>
            <ShieldCheck size={15} color={C.teal} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color: C.teal }}>{managerCount}</div>
          <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 4 }}>Operations & Inventory</div>
        </Card>

        <Card style={{ borderLeft: `3px solid #8B5CF6` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#8B5CF6", fontWeight: 700 }}>HR Officers</span>
            <UserCheck size={15} color="#8B5CF6" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color: "#8B5CF6" }}>{hrCount}</div>
          <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 4 }}>Employees & Attendance</div>
        </Card>

        <Card style={{ borderLeft: `3px solid #F59E0B` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#D97706", fontWeight: 700 }}>Cashiers & Staff</span>
            <Store size={15} color="#D97706" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color: "#D97706" }}>
            {cashierCount + staffCount}
          </div>
          <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 4 }}>POS and floor staff</div>
        </Card>
      </div>

      {/* Staff Members List */}
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.line}` }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: C.ink }}>Team Directory & System Logins</h3>
            <p style={{ fontSize: 12.5, color: C.inkSoft, margin: "2px 0 0" }}>Manage logins and role permissions for all store personnel.</p>
          </div>
          {loading && <span style={{ fontSize: 12, color: C.inkSoft }}>Refreshing team...</span>}
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#F8FAFC", color: C.inkSoft, fontSize: 11.5, textTransform: "uppercase" }}>
                <th style={{ padding: "11px 16px" }}>Member</th>
                <th style={{ padding: "11px 16px" }}>Assigned Role</th>
                <th style={{ padding: "11px 16px" }}>Permissions Scope</th>
                <th style={{ padding: "11px 16px" }}>Status</th>
                {isOwner && <th style={{ padding: "11px 16px", textAlign: "right" }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const isUserOwner = m.role === "owner";
                const isSuspended = m.status === "suspended";
                return (
                  <tr key={m.id} style={{ borderBottom: `1px solid ${C.lineLighter}`, opacity: isSuspended ? 0.6 : 1 }}>
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: "50%",
                            background: isUserOwner ? "#1F2A44" : "#E2E8F0",
                            color: isUserOwner ? "#FFF" : C.ink,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 700,
                            fontSize: 13,
                          }}
                        >
                          {isUserOwner ? <Crown size={15} /> : <User size={15} />}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: C.ink }}>
                            {m.full_name || m.owner || "Team Member"}
                          </div>
                          <div style={{ fontSize: 12, color: C.inkSoft }}>{m.email}</div>
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: "14px 16px" }}>
                      {isOwner && m.id !== profile.id ? (
                        <select
                          value={m.role}
                          onChange={(e) => handleChangeRole(m.id, e.target.value)}
                          style={{
                            padding: "4px 8px",
                            borderRadius: 6,
                            border: `1px solid ${C.line}`,
                            fontSize: 12,
                            fontWeight: 600,
                            background: "#FFF",
                            color: C.ink,
                          }}
                        >
                          <option value="owner">Owner</option>
                          <option value="manager">Manager</option>
                          <option value="hr_officer">HR Officer</option>
                          <option value="cashier">Cashier</option>
                          <option value="staff">Staff</option>
                        </select>
                      ) : (
                        <span
                          style={{
                            padding: "3px 8px",
                            borderRadius: 6,
                            fontSize: 11.5,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            background: isUserOwner ? "#1F2A44" : "#F1F5F9",
                            color: isUserOwner ? "#FFF" : C.ink,
                          }}
                        >
                          {m.role}
                        </span>
                      )}
                    </td>

                    <td style={{ padding: "14px 16px", color: C.inkSoft, fontSize: 12.5 }}>
                      {ROLE_META[m.role]?.desc || "Standard access"}
                    </td>

                    <td style={{ padding: "14px 16px" }}>
                      <Badge
                        text={isSuspended ? "Suspended" : "Active"}
                        tone={isSuspended ? "negative" : "positive"}
                      />
                    </td>

                    {isOwner && (
                      <td style={{ padding: "14px 16px", textAlign: "right" }}>
                        {isUserOwner && ownerCount <= 1 ? (
                          <span style={{ fontSize: 11, color: C.inkLighter }}>Primary Owner</span>
                        ) : (
                          <button
                            onClick={() =>
                              setConfirmStatusAction({
                                id: m.id,
                                name: m.full_name || m.owner || m.email,
                                currentStatus: m.status || "active",
                              })
                            }
                            style={{
                              border: "none",
                              background: "transparent",
                              color: isSuspended ? C.teal : "#DC4C3E",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                              textDecoration: "underline",
                            }}
                          >
                            {isSuspended ? "Reactivate" : "Suspend"}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 5-Role Permissions Matrix */}
      <Card style={{ padding: 22 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px", color: C.ink }}>
          5-Role Permissions Matrix (SEC-4)
        </h3>
        <p style={{ fontSize: 12.5, color: C.inkSoft, margin: "0 0 16px" }}>
          Granular capability matrix enforced at the FastAPI dependency layer, Supabase RLS, and React frontend navigation:
        </p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.line}`, textAlign: "left", background: "#F8FAFC" }}>
                <th style={{ padding: "10px 14px", color: C.inkSoft, textTransform: "uppercase", fontSize: 11 }}>Module / Action</th>
                <th style={{ padding: "10px 14px", color: C.ink, fontWeight: 700 }}>Owner</th>
                <th style={{ padding: "10px 14px", color: C.teal, fontWeight: 700 }}>Manager</th>
                <th style={{ padding: "10px 14px", color: "#8B5CF6", fontWeight: 700 }}>HR Officer</th>
                <th style={{ padding: "10px 14px", color: "#D97706", fontWeight: 700 }}>Cashier</th>
                <th style={{ padding: "10px 14px", color: C.inkSoft, fontWeight: 700 }}>Staff</th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: "POS Counter Checkout & Sales", owner: true, manager: true, hr: false, cashier: true, staff: true },
                { name: "Inventory Management & PO Approvals", owner: true, manager: true, hr: false, cashier: false, staff: true },
                { name: "Executive Finance Ledger & Anomalies", owner: true, manager: false, hr: false, cashier: false, staff: false },
                { name: "Employee Directory & Salary Edits", owner: true, manager: true, hr: true, cashier: false, staff: false },
                { name: "HR Attendance Correction & Leave Review", owner: true, manager: true, hr: true, cashier: false, staff: false },
                { name: "Draft Payroll Runs", owner: true, manager: true, hr: true, cashier: false, staff: false },
                { name: "Approve & Finalise Payroll (HITL Gate)", owner: true, manager: true, hr: false, cashier: false, staff: false },
                { name: "Self-Service Clock & Payslip Download", owner: true, manager: true, hr: true, cashier: true, staff: true },
                { name: "HR Policy Assistant (pgvector RAG)", owner: true, manager: true, hr: true, cashier: true, staff: true },
                { name: "Manage Roles & User Status", owner: true, manager: false, hr: false, cashier: false, staff: false },
                { name: "Subscription Billing & Upgrade", owner: true, manager: false, hr: false, cashier: false, staff: false },
              ].map((row, idx) => (
                <tr key={idx} style={{ borderBottom: `1px solid ${C.lineLighter}` }}>
                  <td style={{ padding: "10px 14px", fontWeight: 600, color: C.ink }}>{row.name}</td>
                  <td style={{ padding: "10px 14px" }}>
                    {row.owner ? <CheckCircle2 size={16} color="#166534" /> : <XCircle size={16} color="#CBD5E1" />}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    {row.manager ? <CheckCircle2 size={16} color="#166534" /> : <XCircle size={16} color="#CBD5E1" />}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    {row.hr ? <CheckCircle2 size={16} color="#166534" /> : <XCircle size={16} color="#CBD5E1" />}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    {row.cashier ? <CheckCircle2 size={16} color="#166534" /> : <XCircle size={16} color="#CBD5E1" />}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    {row.staff ? <CheckCircle2 size={16} color="#166534" /> : <XCircle size={16} color="#CBD5E1" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add Staff Modal */}
      {modalOpen && (
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
              width: "100%",
              maxWidth: 500,
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "20px 24px", borderBottom: `1px solid ${C.line}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: C.ink }}>Invite Team Member</h3>
                <p style={{ fontSize: 12.5, color: C.inkSoft, margin: "2px 0 0" }}>Create system login credentials with role-based access.</p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: C.inkSoft }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddMember} style={{ padding: 24 }}>
              {/* Role Selector */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 6 }}>
                  Select System Role
                </label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: `1.5px solid ${C.line}`,
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  <option value="owner">Owner — Full Administrative & Financial Authority</option>
                  <option value="manager">Manager — POS, Inventory, Communications & HR</option>
                  <option value="hr_officer">HR Officer — Employee Records, Attendance, Leave & Payroll</option>
                  <option value="cashier">Cashier — POS Counter Checkout & Self-Service</option>
                  <option value="staff">Staff — Store Floor Operations & Self-Service</option>
                </select>
              </div>

              {/* Name */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 4 }}>
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tariq Mehmood"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${C.line}`, fontSize: 13 }}
                />
              </div>

              {/* Email */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 4 }}>
                  Login Email
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. employee@vantage.pk"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${C.line}`, fontSize: 13 }}
                />
              </div>

              {/* Password */}
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 4 }}>
                  Password (min. 6 characters)
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPw ? "text" : "password"}
                    required
                    placeholder="Create a temporary password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    style={{ width: "100%", padding: "10px 38px 10px 12px", borderRadius: 8, border: `1.5px solid ${C.line}`, fontSize: 13 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    style={{ position: "absolute", right: 10, top: 10, background: "none", border: "none", cursor: "pointer", color: C.inkSoft }}
                  >
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {formError && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#DC4C3E", fontSize: 12.5, marginBottom: 14 }}>
                  <AlertCircle size={14} /> {formError}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <Btn type="button" variant="secondary" onClick={() => setModalOpen(false)}>
                  Cancel
                </Btn>
                <Btn type="submit" disabled={submitting}>
                  {submitting ? "Inviting..." : "Create Account"}
                </Btn>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Status Dialog */}
      <ConfirmDialog
        open={!!confirmStatusAction}
        title={confirmStatusAction?.currentStatus === "active" ? "Suspend Account?" : "Reactivate Account?"}
        body={
          confirmStatusAction
            ? `Are you sure you want to ${
                confirmStatusAction.currentStatus === "active" ? "suspend login access for" : "reactivate access for"
              } ${confirmStatusAction.name}?`
            : ""
        }
        confirmLabel={confirmStatusAction?.currentStatus === "active" ? "Suspend" : "Reactivate"}
        danger={confirmStatusAction?.currentStatus === "active"}
        onCancel={() => setConfirmStatusAction(null)}
        onConfirm={() =>
          handleToggleStatus(confirmStatusAction.id, confirmStatusAction.currentStatus, confirmStatusAction.name)
        }
      />
    </ViewWrap>
  );
}
