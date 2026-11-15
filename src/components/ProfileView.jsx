import React, { useState, useEffect } from "react";
import { Users, ShieldCheck, Store, Crown, ArrowRight, Phone, Lock, Save } from "lucide-react";
import { C, PLANS, ROLE_META } from "../data/constants.js";
import { Card, Btn, Badge } from "./Primitives.jsx";
import ViewWrap from "./ViewWrap.jsx";
import { accountGetProfile, accountUpdateProfile, accountChangePassword } from "../utils/api.js";

export default function ProfileView({ profile, setProfile, showToast, onNavigate, role = "owner" }) {
  const isOwner = role === "owner" || role === "admin";
  const planInfo = PLANS.find((p) => p.id === (profile.plan || "standard")) || PLANS[1];

  const [formData, setFormData] = useState({
    business_name: profile.business || "",
    full_name: profile.owner || "",
    email: profile.email || "",
    phone_number: "",
  });
  const [savingProfile, setSavingProfile] = useState(false);

  // Password change state
  const [pwForm, setPwForm] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [changingPw, setChangingPw] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const p = await accountGetProfile();
        if (p) {
          setFormData({
            business_name: p.business_name || profile.business || "",
            full_name: p.full_name || profile.owner || "",
            email: p.email || profile.email || "",
            phone_number: p.phone_number || "",
          });
        }
      } catch {
        // keep defaults
      }
    })();
  }, [profile]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    try {
      setSavingProfile(true);
      const res = await accountUpdateProfile({
        business_name: formData.business_name,
        full_name: formData.full_name,
        phone_number: formData.phone_number,
      });
      setProfile((prev) => ({
        ...prev,
        business: res.business_name || formData.business_name,
        owner: res.full_name || formData.full_name,
      }));
      showToast("Profile details updated successfully.");
    } catch (err) {
      showToast(err.message || "Failed to update profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (pwForm.new_password.length < 6) {
      showToast("New password must be at least 6 characters.");
      return;
    }
    if (pwForm.new_password !== pwForm.confirm_password) {
      showToast("New passwords do not match.");
      return;
    }

    try {
      setChangingPw(true);
      await accountChangePassword(pwForm.current_password, pwForm.new_password);
      showToast("Password updated successfully.");
      setPwForm({ current_password: "", new_password: "", confirm_password: "" });
    } catch (err) {
      showToast(err.message || "Failed to change password.");
    } finally {
      setChangingPw(false);
    }
  };

  return (
    <ViewWrap title="Profile & Account Settings (FR-P.2, FR-6.1)" subtitle="Manage personal identification, WhatsApp-linked mobile number, and security credentials.">
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }} className="vantage-grid-2">
        <div>
          {/* Business & Personal Info */}
          <Card style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, color: C.ink }}>Profile Information</div>
            <form onSubmit={handleSaveProfile}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 600, marginBottom: 4 }}>Business Name</div>
                <input
                  value={formData.business_name}
                  disabled={!isOwner}
                  onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                  style={{
                    width: "100%", padding: "9px 12px", borderRadius: 8,
                    border: `1px solid ${C.line}`, fontSize: 13,
                    background: !isOwner ? "#F8FAFC" : "#fff",
                  }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 600, marginBottom: 4 }}>Full Name</div>
                <input
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  style={{
                    width: "100%", padding: "9px 12px", borderRadius: 8,
                    border: `1px solid ${C.line}`, fontSize: 13,
                  }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 600, marginBottom: 4 }}>Email Address</div>
                <input
                  value={formData.email}
                  disabled
                  style={{
                    width: "100%", padding: "9px 12px", borderRadius: 8,
                    border: `1px solid ${C.line}`, fontSize: 13,
                    background: "#F8FAFC", color: C.inkSoft,
                  }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                  <Phone size={13} color="#25D366" /> Mobile Phone Number (WhatsApp Linked)
                </div>
                <input
                  placeholder="e.g. +923001234567"
                  value={formData.phone_number}
                  onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                  style={{
                    width: "100%", padding: "9px 12px", borderRadius: 8,
                    border: `1px solid ${C.line}`, fontSize: 13,
                  }}
                />
                <span style={{ fontSize: 11, color: C.inkLighter, marginTop: 4, display: "block" }}>
                  Used to authenticate incoming WhatsApp webhook commands with your tenant account.
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Btn type="submit" disabled={savingProfile} style={{ gap: 6 }}>
                  <Save size={14} /> {savingProfile ? "Saving..." : "Save Details"}
                </Btn>
              </div>
            </form>
          </Card>

          {/* Change Password Card */}
          <Card>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, color: C.ink, display: "flex", alignItems: "center", gap: 8 }}>
              <Lock size={15} color={C.teal} /> Security & Password
            </div>

            <form onSubmit={handleChangePassword}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 600, marginBottom: 4 }}>Current Password</div>
                <input
                  type="password"
                  required
                  value={pwForm.current_password}
                  onChange={(e) => setPwForm({ ...pwForm, current_password: e.target.value })}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13 }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 600, marginBottom: 4 }}>New Password</div>
                  <input
                    type="password"
                    required
                    value={pwForm.new_password}
                    onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13 }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 600, marginBottom: 4 }}>Confirm New Password</div>
                  <input
                    type="password"
                    required
                    value={pwForm.confirm_password}
                    onChange={(e) => setPwForm({ ...pwForm, confirm_password: e.target.value })}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13 }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Btn type="submit" variant="secondary" disabled={changingPw}>
                  {changingPw ? "Updating..." : "Change Password"}
                </Btn>
              </div>
            </form>
          </Card>
        </div>

        {/* Right side: Role Scope & Subscription */}
        <div>
          <Card style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <ShieldCheck size={16} color={C.teal} /> Role Authority
            </div>

            <div style={{ padding: "14px 16px", borderRadius: 10, background: "#F8FAFC", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                {role === "owner" ? <Crown size={16} color="#1F2A44" /> : (role === "cashier" ? <Store size={16} color="#D97706" /> : <ShieldCheck size={16} color={C.teal} />)}
                <span style={{ fontWeight: 700, fontSize: 14, color: C.ink }}>{ROLE_META[role]?.label || role}</span>
              </div>
              <p style={{ fontSize: 12.5, color: C.inkSoft, margin: 0, lineHeight: 1.5 }}>
                {ROLE_META[role]?.desc}
              </p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Badge tone="info">Subscription: {planInfo.name}</Badge>
              {isOwner && (
                <button
                  onClick={() => onNavigate && onNavigate("billing")}
                  style={{ background: "none", border: "none", color: C.teal, fontSize: 12.5, fontWeight: 600, padding: 0, cursor: "pointer" }}
                >
                  Manage Billing →
                </button>
              )}
            </div>
          </Card>

          {isOwner && (
            <Card>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 6 }}>Team & Role Administration</div>
              <p style={{ fontSize: 12.5, color: C.inkSoft, marginBottom: 12 }}>
                Assign manager roles, register cashier terminals, or invite HR officers.
              </p>
              <Btn variant="secondary" onClick={() => onNavigate && onNavigate("manage_roles")} style={{ gap: 6 }}>
                <Users size={14} /> Open Team Roles <ArrowRight size={14} />
              </Btn>
            </Card>
          )}
        </div>
      </div>
    </ViewWrap>
  );
}
