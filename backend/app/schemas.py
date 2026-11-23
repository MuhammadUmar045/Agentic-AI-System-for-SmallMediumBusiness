from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal
from pydantic import BaseModel, EmailStr, Field, model_validator


# ==================== AUTH & USERS ====================

FiveRole = Literal["owner", "manager", "hr_officer", "cashier", "staff"]
UserStatus = Literal["pending_verification", "active", "locked", "suspended"]


class RegisterRequest(BaseModel):
    # Accepts both "business" and "business_name" (alias)
    business: str = Field(default="", min_length=0, max_length=120)
    business_name: str | None = Field(default=None, max_length=120)
    # Accepts both "owner" and "full_name" (alias)
    owner: str = Field(default="", min_length=0, max_length=120)
    full_name: str | None = Field(default=None, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: FiveRole = "owner"
    phone_number: str | None = None

    @model_validator(mode="after")
    def normalise_aliases(self) -> "RegisterRequest":
        # Resolve business: prefer "business", fall back to "business_name"
        if not self.business and self.business_name:
            self.business = self.business_name
        if not self.business:
            raise ValueError("'business' or 'business_name' is required and must not be empty")
        # Resolve owner: prefer "owner", fall back to "full_name"
        if not self.owner and self.full_name:
            self.owner = self.full_name
        if not self.owner:
            raise ValueError("'owner' or 'full_name' is required and must not be empty")
        return self


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)


class ResendCodeRequest(BaseModel):
    email: EmailStr


class UserResponse(BaseModel):
    id: str
    business_id: str | None = None
    business: str
    owner: str
    email: EmailStr
    phone_number: str | None = None
    role: FiveRole
    status: UserStatus = "active"
    plan: str = "standard"
    owner_id: str | None = None
    email_verified: bool = True
    trial_ends_at: str | None = None


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class AddTeamMemberRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    role: FiveRole
    phone_number: str | None = None


class TeamMemberResponse(BaseModel):
    id: str
    business_id: str | None = None
    business: str | None = None
    owner: str
    email: EmailStr
    phone_number: str | None = None
    role: FiveRole
    status: UserStatus = "active"
    plan: str = "standard"
    created_at: str | None = None


class ProfileUpdateRequest(BaseModel):
    owner: str | None = None
    phone_number: str | None = None


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=128)


class UserStatusUpdateRequest(BaseModel):
    status: UserStatus


class UserRoleUpdateRequest(BaseModel):
    role: FiveRole


# ==================== WORKSPACE & CHAT ====================

class WorkspaceState(BaseModel):
    state: dict[str, Any]
    updated_at: str | datetime | None = None


class WorkspaceStateUpdate(BaseModel):
    state: dict[str, Any]


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: str | None = None
    workspace_state: dict[str, Any] | None = None


class ChatResponse(BaseModel):
    conversation_id: str
    message: str
    agents: list[str]
    actions: list[dict[str, Any]] = []
    created_at: datetime | str
    ai_queries_remaining: int | None = None


# ==================== HR SUBSYSTEM ====================

class EmployeeCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    phone: str | None = None
    role: FiveRole = "staff"
    base_salary: float = Field(ge=0.0)
    join_date: date = Field(default_factory=date.today)
    department: str = "Operations"
    create_login: bool = False
    login_password: str | None = None


class EmployeeUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    role: FiveRole | None = None
    base_salary: float | None = Field(default=None, ge=0.0)
    employment_status: Literal["active", "inactive"] | None = None
    department: str | None = None


class EmployeeResponse(BaseModel):
    id: str
    business_id: str
    user_id: str | None = None
    full_name: str
    email: str
    phone: str | None = None
    role: FiveRole
    base_salary: float | None = None  # Masked for cashier/staff
    employment_status: Literal["active", "inactive"] = "active"
    join_date: str | date
    department: str = "Operations"
    created_at: str | None = None


class AttendanceCheckInRequest(BaseModel):
    employee_id: str | None = None  # None for self check-in


class AttendanceCheckOutRequest(BaseModel):
    employee_id: str | None = None  # None for self check-out


class AttendanceCorrectionRequest(BaseModel):
    check_in: str
    check_out: str
    correction_reason: str = Field(min_length=3)


class AttendanceRecordResponse(BaseModel):
    id: str
    business_id: str
    employee_id: str
    employee_name: str | None = None
    work_date: str | date
    check_in: str | None = None
    check_out: str | None = None
    net_hours: float = 0.0
    status: Literal["present", "incomplete", "corrected", "absent"]
    correction_reason: str | None = None


class LeaveSubmitRequest(BaseModel):
    employee_id: str | None = None  # None for self leave submit
    start_date: date
    end_date: date
    leave_type: Literal["annual", "sick", "unpaid", "casual"] = "annual"
    reason: str = Field(min_length=1)


class LeaveReviewRequest(BaseModel):
    status: Literal["approved", "rejected"]
    review_comment: str | None = None


class LeaveRequestResponse(BaseModel):
    id: str
    business_id: str
    employee_id: str
    employee_name: str | None = None
    start_date: str | date
    end_date: str | date
    leave_type: str
    reason: str | None = None
    status: Literal["pending", "approved", "rejected"]
    is_flagged: bool = False
    flag_reason: str | None = None
    reviewed_by: str | None = None
    review_comment: str | None = None
    created_at: str | None = None


class PayrollRunCreateRequest(BaseModel):
    payroll_month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")  # e.g. "2026-03"


class PayslipUpdateRequest(BaseModel):
    bonus_overtime: float = Field(ge=0.0)
    notes: str | None = None


class PayslipResponse(BaseModel):
    id: str
    payroll_run_id: str
    employee_id: str
    employee_name: str | None = None
    base_salary: float
    unpaid_leave_days: int = 0
    leave_deduction: float = 0.0
    bonus_overtime: float = 0.0
    net_salary: float
    status: Literal["complete", "incomplete", "finalised"]
    notes: str | None = None


class PayrollRunResponse(BaseModel):
    id: str
    business_id: str
    payroll_month: str
    status: Literal["draft", "pending_approval", "finalised", "incomplete"]
    total_net_salary: float = 0.0
    approved_by: str | None = None
    approved_at: str | None = None
    payslips: list[PayslipResponse] = []
    created_at: str | None = None


class HRPolicyUploadRequest(BaseModel):
    document_name: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=10)


class HRAssistantAskRequest(BaseModel):
    question: str = Field(min_length=2)


class HRAssistantResponse(BaseModel):
    answer: str
    sources: list[str] = []
    ai_queries_remaining: int | None = None


# ==================== FINANCE & ACCOUNTING ====================

class LedgerEntryCreate(BaseModel):
    entry_date: date = Field(default_factory=date.today)
    entry_type: Literal["revenue", "expense"]
    category: str = Field(min_length=1)
    amount: float = Field(gt=0.0)
    contact_id: str | None = None
    description: str | None = None
    source: Literal["manual", "csv_import", "pos"] = "manual"


class LedgerEntryResponse(BaseModel):
    id: str
    business_id: str
    entry_date: str | date
    entry_type: Literal["revenue", "expense"]
    category: str
    amount: float
    contact_id: str | None = None
    contact_name: str | None = None
    description: str | None = None
    source: str
    is_voided: bool = False
    voided_reason: str | None = None
    created_at: str | None = None


class LedgerVoidRequest(BaseModel):
    voided_reason: str = Field(min_length=3)


class CSVImportRow(BaseModel):
    date: str
    type: str
    category: str
    amount: str | float
    description: str | None = ""


class CSVImportRequest(BaseModel):
    rows: list[dict[str, Any]]


class CSVImportResponse(BaseModel):
    total_rows: int
    imported_count: int
    failed_count: int
    errors: list[str] = []


class FinancialAnomalyResponse(BaseModel):
    id: str
    type: str
    category: str | None = None
    description: str
    amount: float | None = None
    baseline_amount: float | None = None
    status: str = "open"
    detected_at: str | None = None


class FinancialRecommendationResponse(BaseModel):
    id: str
    title: str
    detail: str
    estimated_saving_pkr: float = 0.0
    runway_boost_months: float = 0.0
    status: Literal["pending", "approved", "rejected"]


class ExecutiveReportRequest(BaseModel):
    start_date: date
    end_date: date


class ExecutiveReportResponse(BaseModel):
    period: str
    total_revenue: float
    total_expenses: float
    net_profit: float
    gross_margin_pct: float
    burn_rate: float
    cash_runway_months: float | None = None
    health_score: int
    active_employees: int
    total_payroll: float
    low_stock_count: int
    narrative_summary: str


# ==================== ACCOUNT & BUSINESS SETUP ====================

class BusinessSetupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    industry: str = "Retail"
    currency: str = "PKR"
    tax_rate: float = Field(ge=0.0, le=100.0)
    annual_leave_days: int = Field(ge=1, le=60)
    working_days_per_month: int = Field(ge=15, le=31)
    low_stock_threshold_default: int = Field(ge=1, le=1000)


class BusinessSetupResponse(BaseModel):
    id: str
    name: str
    industry: str
    currency: str
    tax_rate: float
    annual_leave_days: int
    working_days_per_month: int
    low_stock_threshold_default: int


class BillingUsageResponse(BaseModel):
    plan: str
    ai_query_allowance: int
    ai_queries_used: int
    ai_queries_remaining: int
    status: str
    current_period_end: str | None = None


class ConnectionsUpdateRequest(BaseModel):
    whatsapp_phone_number_id: str | None = None
    whatsapp_access_token: str | None = None
    whatsapp_app_secret: str | None = None
    smtp_host: str | None = None
    smtp_port: int | None = None
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str | None = None


class ConnectionsResponse(BaseModel):
    whatsapp_connected: bool
    whatsapp_phone_number_id: str | None = None
    smtp_connected: bool
    smtp_host: str | None = None
    smtp_user: str | None = None


# ==================== POS ATOMIC CHECKOUT ====================

class POSSaleItemInput(BaseModel):
    product_id: str | None = None
    item_name: str = Field(min_length=1)
    quantity: int = Field(gt=0)
    unit_price: float = Field(ge=0.0)


class POSSaleCheckoutRequest(BaseModel):
    customer_id: str | None = None
    customer_name: str = "Walk-in Customer"
    items: list[POSSaleItemInput] = Field(min_length=1)
    subtotal: float = Field(ge=0.0)
    discount: float = Field(default=0.0, ge=0.0)
    tax: float = Field(default=0.0, ge=0.0)
    total: float = Field(ge=0.0)
    payment_method: Literal["cash", "card", "raast", "credit", "split"] = "cash"
    invoice_number: str | None = None


class POSSaleResponse(BaseModel):
    sale_id: str
    invoice_number: str
    total: float
    items_count: int
    created_at: str


# ==================== KNOWLEDGE BASE ====================

class KnowledgeIngestRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1)
    category: Literal["inventory", "finance", "policy", "customer", "supplier", "sales", "general"] = "general"
    metadata: dict[str, Any] = {}


class KnowledgeSearchRequest(BaseModel):
    query: str = Field(min_length=1)
    category: str | None = None
    threshold: float = 0.50
    limit: int = 5
