import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { AppStateProvider, useAppState, createBlankStoreState } from "./context/AppStateContext.jsx";
import { loadPersisted, clearPersisted, savePersisted } from "./utils/helpers.js";
import { ROLE_NAV, ROLE_META } from "./data/constants.js";
import GlobalStyles from "./components/GlobalStyles.jsx";
import Landing from "./components/Landing.jsx";
import AuthScreen from "./components/AuthScreen.jsx";
import Sidebar from "./components/Sidebar.jsx";
import TopBar from "./components/TopBar.jsx";
import CommandPalette from "./components/CommandPalette.jsx";
import ChatPlanner from "./components/ChatPlanner.jsx";
import DashboardView from "./components/DashboardView.jsx";
import POSView from "./components/POSView.jsx";
import FinanceView from "./components/FinanceView.jsx";
import InventoryView from "./components/InventoryView.jsx";
import CommunicationView from "./components/CommunicationView.jsx";
import AnalyticsView from "./components/AnalyticsView.jsx";
import ConnectPOSView from "./components/ConnectPOSView.jsx";
import SubscriptionBillingView from "./components/SubscriptionBillingView.jsx";
import ProfileView from "./components/ProfileView.jsx";
import AdminView from "./components/AdminView.jsx";
import TeamView from "./components/TeamView.jsx";
import TransactionsView from "./components/finance/TransactionsView.jsx";
import HRDashboardView from "./components/hr/HRDashboardView.jsx";
import EmployeesView from "./components/hr/EmployeesView.jsx";
import AttendanceView from "./components/hr/AttendanceView.jsx";
import LeaveView from "./components/hr/LeaveView.jsx";
import PayrollView from "./components/hr/PayrollView.jsx";
import HRAssistantView from "./components/hr/HRAssistantView.jsx";
import BusinessSetupView from "./components/account/BusinessSetupView.jsx";
import ConnectionsView from "./components/account/ConnectionsView.jsx";
import { Toast } from "./components/Primitives.jsx";
import OnboardingTour from "./components/OnboardingTour.jsx";
import { getAccessToken, getWorkspace, me, saveWorkspace, setAccessToken, signIn, signUp } from "./utils/api.js";

function AppShell() {
  const [stage, setStage] = useState("landing"); // landing | auth | app
  const [authMode, setAuthMode] = useState("signin");
  const [profile, setProfile] = useState({ business: "", owner: "", email: "" });
  const [role, setRole] = useState("owner");
  const [active, setActive] = useState("chat");
  const [chatKey, setChatKey] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const { state, dispatch, derived, activeBusinessId, setActiveBusinessId } = useAppState();

  const saveTimerRef = useRef(null);

  // Restore session on page refresh
  useEffect(() => {
    const token = getAccessToken();
    if (!token || stage !== "landing") return;
    let cancelled = false;
    (async () => {
      try {
        const user = await me();
        if (cancelled) return;
        const bizId = String(user.business_id || user.id);
        setActiveBusinessId(bizId);
        setProfile({ business: user.business, owner: user.owner, email: user.email, plan: user.plan, business_id: bizId });
        setRole(user.role);
        const allowedNav = ROLE_NAV[user.role] || ROLE_NAV.cashier || ["pos"];
        setActive(allowedNav[0]);
        const workspace = await getWorkspace().catch(() => ({}));
        if (cancelled) return;
        if (workspace?.state && Object.keys(workspace.state).length) {
          dispatch({ type: "HYDRATE", payload: workspace.state });
          savePersisted(workspace.state, bizId);
        } else {
          const cached = loadPersisted(bizId);
          if (cached) {
            dispatch({ type: "HYDRATE", payload: cached });
          } else {
            const blank = createBlankStoreState(user.business, user.owner);
            dispatch({ type: "HYDRATE", payload: blank });
            savePersisted(blank, bizId);
          }
        }
        setIsHydrated(true);
        setStage("app");
      } catch {
        setAccessToken(null);
        setActiveBusinessId(null);
        setIsHydrated(false);
        dispatch({ type: "CLEAR_STORE" });
      }
    })();
    return () => { cancelled = true; };
  }, [dispatch, setActiveBusinessId]);

  const showToast = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(""), 2800); }, []);

  const handleAuth = async (form, mode) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setIsHydrated(false);

    const session = await (mode === "signup" ? signUp(form) : signIn(form));
    setAccessToken(session.access_token);
    const user = session.user;
    const bizId = String(user.business_id || user.id);

    setActiveBusinessId(bizId);
    setProfile({ business: user.business, owner: user.owner, email: user.email, plan: user.plan, business_id: bizId });
    setRole(user.role);
    const allowedNav = ROLE_NAV[user.role] || ROLE_NAV.cashier || ["pos"];
    setActive(allowedNav[0]);

    if (mode === "signup") {
      // Clean, fresh, dedicated store for this new signup
      const freshState = createBlankStoreState(user.business, user.owner);
      dispatch({ type: "HYDRATE", payload: freshState });
      savePersisted(freshState, bizId);
      // Persist the fresh store to backend immediately so the database has its own separate row
      await saveWorkspace(freshState).catch(() => {});
    } else {
      // Existing user sign in
      const workspace = await getWorkspace().catch(() => ({}));
      if (workspace?.state && Object.keys(workspace.state).length) {
        dispatch({ type: "HYDRATE", payload: workspace.state });
        savePersisted(workspace.state, bizId);
      } else {
        const cached = loadPersisted(bizId);
        const targetState = cached || createBlankStoreState(user.business, user.owner);
        dispatch({ type: "HYDRATE", payload: targetState });
        savePersisted(targetState, bizId);
      }
    }

    setIsHydrated(true);
    setStage("app");
  };

  const handleSignOut = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    clearPersisted();
    setAccessToken(null);
    setActiveBusinessId(null);
    setIsHydrated(false);
    setProfile({ business: "", owner: "", email: "" });
    dispatch({ type: "CLEAR_STORE" });
    setStage("landing");
  }, [dispatch, setActiveBusinessId]);

  const handleNavigate = useCallback((section, resetChat) => {
    const allowed = ROLE_NAV[role] || ROLE_NAV.staff || [];
    if (!allowed.includes(section)) {
      showToast(`Access restricted: Your assigned role (${role}) cannot access this section.`);
      return;
    }
    setActive(section);
    if (resetChat) setChatKey((k) => k + 1);
  }, [role, showToast]);

  useEffect(() => {
    if (stage !== "app") return;
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage]);

  useEffect(() => {
    if (stage !== "app" || !isHydrated || !activeBusinessId || !getAccessToken()) return undefined;
    saveTimerRef.current = setTimeout(() => {
      saveWorkspace(state).catch(() => {});
    }, 800);
    return () => clearTimeout(saveTimerRef.current);
  }, [state, stage, isHydrated, activeBusinessId]);

  const alerts = useMemo(() => {
    if (role === "cashier") {
      return derived.lowStock.slice(0, 2).map((i) => ({ text: `${i.name} stock is low (${i.stock} left).`, tone: "#DC4C3E" }));
    }
    const list = [];
    derived.lowStock.slice(0, 2).forEach((i) => list.push({ text: `${i.name} is below its reorder threshold.`, tone: "#DC4C3E" }));
    if (role === "owner" && derived.pendingRecs.length > 0) {
      list.push({ text: `${derived.pendingRecs.length} finance recommendation(s) waiting on your approval.`, tone: "#E3A008" });
    }
    if (derived.unsentDrafts.length > 0) {
      list.push({ text: `${derived.unsentDrafts.length} customer message(s) drafted and ready to send.`, tone: "#1F2A44" });
    }
    return list;
  }, [derived, role]);

  if (stage === "landing") {
    return (
      <div className="vantage-root">
        <GlobalStyles />
        <Landing goToSignup={() => { setAuthMode("signup"); setStage("auth"); }} goToSignin={() => { setAuthMode("signin"); setStage("auth"); }} />
      </div>
    );
  }

  if (stage === "auth") {
    return (
      <div className="vantage-root">
        <GlobalStyles />
        <AuthScreen mode={authMode} setMode={setAuthMode} onAuth={handleAuth} goBack={() => setStage("landing")} />
      </div>
    );
  }

  return (
    <div className="vantage-root" style={{ display: "flex", background: "#F6F7FB", minHeight: "100vh" }}>
      <GlobalStyles />
      <Sidebar role={role} active={active} onNavigate={handleNavigate} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}
        onSignOut={handleSignOut} onOpenPalette={() => setPaletteOpen(true)} pendingCount={derived.pendingRecs.length} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <TopBar business={profile.business} role={role} setMobileOpen={setMobileOpen} alerts={alerts} activity={state.activity} />
        {active === "chat" && <ChatPlanner key={chatKey} onNavigate={handleNavigate} ownerName={profile.owner} role={role} />}
        {active === "dashboard" && <DashboardView showToast={showToast} onNavigate={handleNavigate} business={profile.business} role={role} />}
        {active === "pos" && <POSView showToast={showToast} onNavigate={handleNavigate} ownerName={profile.owner} businessName={profile.business} role={role} />}
        {active === "finance" && <FinanceView showToast={showToast} />}
        {active === "transactions" && <TransactionsView showToast={showToast} />}
        {active === "inventory" && <InventoryView showToast={showToast} />}
        {active === "communication" && <CommunicationView showToast={showToast} />}
        {active === "analytics" && <AnalyticsView showToast={showToast} />}
        
        {/* HR / Employees Module */}
        {active === "hr_dashboard" && <HRDashboardView showToast={showToast} onNavigate={handleNavigate} />}
        {active === "hr_employees" && <EmployeesView showToast={showToast} role={role} />}
        {active === "hr_attendance" && <AttendanceView showToast={showToast} role={role} />}
        {active === "hr_leave" && <LeaveView showToast={showToast} role={role} />}
        {active === "hr_payroll" && <PayrollView showToast={showToast} role={role} />}
        {active === "hr_policies" && <HRAssistantView showToast={showToast} role={role} />}

        {/* Account Module */}
        {(active === "team" || active === "manage_roles") && <TeamView showToast={showToast} role={role} profile={profile} />}
        {active === "business_setup" && <BusinessSetupView showToast={showToast} />}
        {active === "connections" && <ConnectionsView showToast={showToast} />}
        {active === "connectpos" && <ConnectPOSView showToast={showToast} onNavigate={handleNavigate} />}
        {active === "billing" && <SubscriptionBillingView profile={profile} setProfile={setProfile} showToast={showToast} />}
        {active === "profile" && <ProfileView profile={profile} setProfile={setProfile} showToast={showToast} onNavigate={handleNavigate} role={role} />}
        {active === "admin" && <AdminView />}
      </div>
      <Toast message={toast} />
      <OnboardingTour />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onNavigate={handleNavigate} role={role} />
    </div>
  );
}

export default function App() {
  return (
    <AppStateProvider>
      <AppShell />
    </AppStateProvider>
  );
}
