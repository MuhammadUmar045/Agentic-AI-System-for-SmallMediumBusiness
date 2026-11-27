// Accept either the Render service origin or the documented /api/v1 base URL.
// Some routers are mounted at /api/... while core routes use /api/v1/..., so
// keep the configured base at the service origin before joining either path.
const API_BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000")
  .replace(/\/+$/, "")
  .replace(/\/api(?:\/v1)?$/i, "");
const TOKEN_KEY = "vantage_access_token";
const REQUEST_TIMEOUT_MS = 60000;

export function getAccessToken() { return localStorage.getItem(TOKEN_KEY); }
export function setAccessToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const token = getAccessToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  // Normalize path if missing /api prefix
  const urlPath = path.startsWith("/api") ? path : `/api/v1${path}`;
  const url = new URL(urlPath, `${API_BASE_URL}/`).toString();

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

    // Check for PDF or HTML blob downloads
    if (options.asBlob) {
      if (!response.ok) throw new Error("Failed to download document");
      return await response.blob();
    }

    const body = await response.json().catch(() => ({}));
    if (response.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      const err = new Error(body.detail || "Session expired. Please sign in again.");
      err.status = 401;
      throw err;
    }
    if (!response.ok) throw new Error(body.detail || "The server could not complete the request.");
    return body;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("The server took too long to respond. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// ==================== AUTH & CORE ====================
export const me = () => request("/auth/me");
export const signUp = (form) => request("/auth/register", {
  method: "POST",
  body: JSON.stringify({
    business: form.business,
    owner: form.owner,
    email: form.email,
    password: form.password,
    phone_number: form.phone_number,
  }),
});
export const signIn = (form) => request("/auth/login", {
  method: "POST",
  body: JSON.stringify({ email: form.email, password: form.password }),
});

export const getWorkspace = () => request("/workspace");
export const saveWorkspace = (state) => request("/workspace", {
  method: "PUT",
  body: JSON.stringify({ state }),
});

export const agentChat = (message, conversationId, workspaceState) => request("/agent/chat", {
  method: "POST",
  body: JSON.stringify({ message, conversation_id: conversationId, workspace_state: workspaceState }),
});
export const agentMapCsv = (targetSchema, csvText) => request("/agent/map-csv", {
  method: "POST",
  body: JSON.stringify({ target_schema: targetSchema, csv_text: csvText }),
});

// ==================== HR & EMPLOYEES ====================
export const hrListEmployees = () => request("/api/hr/employees");
export const hrCreateEmployee = (emp) => request("/api/hr/employees", {
  method: "POST",
  body: JSON.stringify(emp),
});
export const hrUpdateEmployee = (id, updates) => request(`/api/hr/employees/${id}`, {
  method: "PATCH",
  body: JSON.stringify(updates),
});
export const hrDeactivateEmployee = (id) => request(`/api/hr/employees/${id}`, {
  method: "DELETE",
});

// Attendance
export const hrCheckIn = (employeeId) => request("/api/hr/attendance/check-in", {
  method: "POST",
  body: JSON.stringify({ employee_id: employeeId }),
});
export const hrCheckOut = (employeeId) => request("/api/hr/attendance/check-out", {
  method: "POST",
  body: JSON.stringify({ employee_id: employeeId }),
});
export const hrListAttendance = (params = {}) => {
  const q = new URLSearchParams(params).toString();
  return request(`/api/hr/attendance${q ? `?${q}` : ""}`);
};
export const hrCorrectAttendance = (id, checkIn, checkOut, reason) => request(`/api/hr/attendance/${id}`, {
  method: "PATCH",
  body: JSON.stringify({ check_in: checkIn, check_out: checkOut, correction_reason: reason }),
});

// Leave
export const hrSubmitLeave = (leave) => request("/api/hr/leave", {
  method: "POST",
  body: JSON.stringify(leave),
});
export const hrCreateLeave = hrSubmitLeave;
export const hrListLeave = () => request("/api/hr/leave");
export const hrReviewLeave = (id, status, comment) => request(`/api/hr/leave/${id}`, {
  method: "PATCH",
  body: JSON.stringify({ status, review_comment: comment }),
});

// Payroll
export const hrListPayrollRuns = () => request("/api/hr/payroll/runs");
export const hrListMyPayslips = () => request("/api/hr/payroll/my-payslips");
export const hrCreatePayrollRun = (month) => request("/api/hr/payroll/runs", {
  method: "POST",
  body: JSON.stringify({ payroll_month: month }),
});
export const hrGetPayrollRun = (id) => request(`/api/hr/payroll/runs/${id}`);
export const hrUpdatePayslip = (payslipId, bonus, notes) => request(`/api/hr/payroll/payslips/${payslipId}`, {
  method: "PATCH",
  body: JSON.stringify({ bonus_overtime: bonus, notes }),
});
export const hrSubmitPayrollRun = (id) => request(`/api/hr/payroll/runs/${id}/submit`, {
  method: "POST",
});
export const hrApprovePayrollRun = (id) => request(`/api/hr/payroll/runs/${id}/approve`, {
  method: "POST",
});
export const hrDownloadPayslipBlob = (payslipId) => request(`/api/hr/payroll/payslips/${payslipId}/pdf`, {
  asBlob: true,
});

// Policies & Assistant
export const hrUploadPolicy = (docName, content) => request("/api/hr/policies", {
  method: "POST",
  body: JSON.stringify({ document_name: docName, content }),
});
export const hrListPolicies = () => request("/api/hr/policies");
export const hrDeletePolicy = (docName) => request(`/api/hr/policies/${encodeURIComponent(docName)}`, {
  method: "DELETE",
});
export const hrAskAssistant = (question) => request("/api/hr/assistant/ask", {
  method: "POST",
  body: JSON.stringify({ question }),
});

// ==================== FINANCE & ACCOUNTING ====================
export const financeListLedger = (params = {}) => {
  const q = new URLSearchParams(params).toString();
  return request(`/api/finance/ledger${q ? `?${q}` : ""}`);
};
export const financeCreateLedger = (entry) => request("/api/finance/ledger", {
  method: "POST",
  body: JSON.stringify(entry),
});
export const financeVoidLedger = (id, reason) => request(`/api/finance/ledger/${id}/void`, {
  method: "POST",
  body: JSON.stringify({ voided_reason: reason }),
});
export const financeImportCsv = (rows) => request("/api/finance/import", {
  method: "POST",
  body: JSON.stringify({ rows }),
});
export const financeGetMetrics = () => request("/api/finance/metrics");
export const financeGetAnomalies = () => request("/api/finance/anomalies");
export const financeTriggerAnomalies = () => request("/api/finance/anomalies/detect", {
  method: "POST",
});
export const financeGetRecommendations = () => request("/api/finance/recommendations");
export const financeDecideRecommendation = (id, action) => request(`/api/finance/recommendations/${id}?action=${action}`, {
  method: "PATCH",
});
export const financeGenerateReport = (startDate, endDate) => request("/api/finance/report", {
  method: "POST",
  body: JSON.stringify({ start_date: startDate, end_date: endDate }),
});

// ==================== ACCOUNT & BUSINESS SETUP ====================
export const accountGetProfile = () => request("/api/account/profile");
export const accountUpdateProfile = (updates) => request("/api/account/profile", {
  method: "PUT",
  body: JSON.stringify(updates),
});
export const accountChangePassword = (currentPassword, newPassword) => request("/api/account/password", {
  method: "POST",
  body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
});

export const accountListRoles = () => request("/api/account/roles");
export const accountInviteRole = (member) => request("/api/account/roles", {
  method: "POST",
  body: JSON.stringify(member),
});
export const accountToggleRoleStatus = (userId, status) => request(`/api/account/roles/${userId}/status`, {
  method: "PATCH",
  body: JSON.stringify({ status }),
});
export const accountUpdateUserRole = (userId, role) => request(`/api/account/roles/${userId}/role`, {
  method: "PATCH",
  body: JSON.stringify({ role }),
});

export const accountGetBusinessSetup = () => request("/api/account/business-setup");
export const accountUpdateBusinessSetup = (setup) => request("/api/account/business-setup", {
  method: "PUT",
  body: JSON.stringify(setup),
});

export const accountGetBilling = () => request("/api/account/billing");
export const accountUpgradePlan = (targetPlan) => request(`/api/account/billing/upgrade?target_plan=${targetPlan}`, {
  method: "POST",
});

export const accountGetConnections = () => request("/api/account/connections");
export const accountUpdateConnections = (connections) => request("/api/account/connections", {
  method: "PUT",
  body: JSON.stringify(connections),
});

// ==================== POS ATOMIC CHECKOUT ====================
export const posListSales = (limit = 100) => request(`/api/pos/sales?limit=${limit}`);
export const posAtomicCheckout = (salePayload) => request("/api/pos/checkout", {
  method: "POST",
  body: JSON.stringify(salePayload),
});

// Legacy aliases for backward compatibility
export const getTeamMembers = accountListRoles;
export const addTeamMember = accountInviteRole;
export const removeTeamMember = (id) => accountToggleRoleStatus(id, "suspended");
