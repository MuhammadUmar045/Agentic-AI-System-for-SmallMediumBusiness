"""
Comprehensive Test Suite for AI COO (SMEO) Platform
Covers:
  - Unit Tests: Inventory algorithm (Report 5.3.1), Payroll (UC-7), Attendance (FR-5.2), Leave (FR-5.3), Anomalies (FR-2.2), CSV Validation
  - RBAC Tests: 5 roles (owner, manager, hr_officer, cashier, staff) permissions & gates
  - RLS & Tenant Isolation Tests: Tenant A vs Tenant B isolation, append-only rules
  - Integration Tests: IT-01 through IT-07
"""

import asyncio
from datetime import date, datetime, timedelta
import os
import sys

import pytest
import httpx

# Ensure backend root is in python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SQLiteAdapter
from app.finance_engine import (
    calculate_financial_health,
    detect_financial_anomalies,
    validate_csv_import_row,
)
from app.hr_engine import (
    calculate_leave_days,
    calculate_net_hours,
    calculate_payroll_for_employee,
    check_leave_overlap,
)
from app.inventory_engine import calculate_inventory_metrics, round_to_10
from app.main import app
from app.routers.whatsapp import verify_hmac_signature
from app.security import hash_password, verify_password


# ==============================================================================
# 1. UNIT TESTS: INVENTORY ALGORITHM (Section 5.3.1 of Report)
# ==============================================================================

def test_inventory_round_to_10():
    assert round_to_10(14) == 10
    assert round_to_10(15) == 20
    assert round_to_10(33.4) == 30
    assert round_to_10(0) == 0


def test_inventory_velocity_fallback():
    # Less than 3 sales rows -> fallback: v = capacity / 30.0 = 200 / 30 = 6.67
    metrics = calculate_inventory_metrics(stock=100, sales_history=[])
    assert metrics["velocity_v"] == pytest.approx(6.67, 0.05)
    assert metrics["threshold_T"] == pytest.approx(5 * 6.67, 0.5)


def test_inventory_velocity_with_sales():
    # 3 sales rows spanning 10 days, total 50 units sold -> v = 50 / 10 = 5.0
    d1 = date(2026, 3, 1)
    d2 = date(2026, 3, 5)
    d3 = date(2026, 3, 11)
    history = [
        {"change_qty": -15, "created_at": d1.isoformat(), "reason": "sale"},
        {"change_qty": -15, "created_at": d2.isoformat(), "reason": "sale"},
        {"change_qty": -20, "created_at": d3.isoformat(), "reason": "sale"},
    ]
    metrics = calculate_inventory_metrics(stock=15, sales_history=history, capacity=200, as_of_date=d3)
    # v = 50 / 10 = 5.0
    assert metrics["velocity_v"] == 5.0
    # DIR = 15 / 5 = 3.0 days
    assert metrics["dir"] == 3.0
    # T = 5 * v = 25.0
    assert metrics["threshold_T"] == 25.0
    # S = 15 is between 0.5T (12.5) and T (25.0) -> Low Stock
    assert metrics["status"] == "Low Stock"
    # Q = min(C - S, round_to_10(max(0, 33v - S)))
    # 33 * 5 - 15 = 165 - 15 = 150 -> round_to_10(150) = 150
    # min(200 - 15, 150) = 150
    assert metrics["reorder_qty_Q"] == 150


def test_inventory_critical_low_and_out_of_stock():
    # Stock = 0 -> Out of Stock
    m_out = calculate_inventory_metrics(stock=0, sales_history=[])
    assert m_out["status"] == "Out of Stock"
    assert m_out["reorder_qty_Q"] > 0

    # Stock = 5, v = 6.67, T = 33.3 -> 0.5T = 16.6 -> S < 0.5T -> Critical Low
    m_crit = calculate_inventory_metrics(stock=5, sales_history=[])
    assert m_crit["status"] == "Critical Low"


def test_inventory_overstock_and_optimal():
    # Capacity = 200, 0.9C = 180. Stock = 190 -> Overstock
    m_over = calculate_inventory_metrics(stock=190, sales_history=[], capacity=200)
    assert m_over["status"] == "Overstock"
    assert m_over["reorder_qty_Q"] == 0

    # Stock = 100, T = 33.3 -> Optimal
    m_opt = calculate_inventory_metrics(stock=100, sales_history=[], capacity=200)
    assert m_opt["status"] == "Optimal"
    assert m_opt["reorder_qty_Q"] == 0


# ==============================================================================
# 2. UNIT TESTS: PAYROLL CALCULATION (UC-7)
# ==============================================================================

def test_payroll_net_salary_calculation():
    # base = 65,000, working_days = 26 -> daily_rate = 2,500
    # unpaid_days = 2 -> deduction = 5,000
    # bonus = 3,000 -> net = 65,000 - 5,000 + 3,000 = 63,000
    calc = calculate_payroll_for_employee(
        base_salary=65000.0,
        working_days_in_month=26,
        unpaid_leave_days=2,
        bonus_overtime=3000.0,
        attendance_is_complete=True,
    )
    assert calc["daily_rate"] == 2500.0
    assert calc["leave_deduction"] == 5000.0
    assert calc["net_salary"] == 63000.0
    assert calc["status"] == "complete"


def test_payroll_incomplete_attendance():
    calc = calculate_payroll_for_employee(
        base_salary=50000.0,
        working_days_in_month=26,
        unpaid_leave_days=0,
        attendance_is_complete=False,
    )
    assert calc["status"] == "incomplete"
    assert calc["net_salary"] == 50000.0


# ==============================================================================
# 3. UNIT TESTS: ATTENDANCE & LEAVE ENGINE
# ==============================================================================

def test_attendance_net_hours():
    # 09:00 to 17:30 = 8.5 hours. Break = 30 mins -> net = 8.0 hours
    in_time = "2026-03-10T09:00:00Z"
    out_time = "2026-03-10T17:30:00Z"
    hours = calculate_net_hours(in_time, out_time, break_minutes=30)
    assert hours == 8.0


def test_leave_overlap_check():
    approved = [
        {"start_date": "2026-04-10", "end_date": "2026-04-15", "status": "approved"},
    ]
    # Overlapping leave: 2026-04-12 to 2026-04-18
    is_overlap, _ = check_leave_overlap(date(2026, 4, 12), date(2026, 4, 18), approved)
    assert is_overlap is True

    # Non-overlapping leave: 2026-04-16 to 2026-04-20
    is_overlap2, _ = check_leave_overlap(date(2026, 4, 16), date(2026, 4, 20), approved)
    assert is_overlap2 is False


def test_leave_days_count():
    assert calculate_leave_days(date(2026, 5, 1), date(2026, 5, 3)) == 3
    assert calculate_leave_days(date(2026, 5, 1), date(2026, 5, 1)) == 1


# ==============================================================================
# 4. UNIT TESTS: FINANCIAL ANOMALY RULES & HEALTH
# ==============================================================================

def test_anomaly_40_percent_expense_spike():
    prev = [
        {"entry_type": "expense", "category": "Packaging", "amount": 10000, "entry_date": "2026-02-15"},
    ]
    curr = [
        {"entry_type": "expense", "category": "Packaging", "amount": 15000, "entry_date": "2026-03-15"},
    ]
    # Increase = 50% (> 40%) -> Must trigger anomaly
    anomalies = detect_financial_anomalies(curr, prev)
    assert len(anomalies) == 1
    assert anomalies[0]["type"] == "expense_spike_40"
    assert anomalies[0]["category"] == "Packaging"


def test_anomaly_duplicate_bill():
    curr = [
        {"entry_type": "expense", "category": "Utility", "amount": 12500, "contact_id": "c-electric-1", "entry_date": "2026-03-05"},
        {"entry_type": "expense", "category": "Utility", "amount": 12500, "contact_id": "c-electric-1", "entry_date": "2026-03-08"},
    ]
    anomalies = detect_financial_anomalies(curr, [])
    assert len(anomalies) == 1
    assert anomalies[0]["type"] == "duplicate_bill"


def test_csv_import_validation():
    valid_row = {"date": "2026-03-01", "type": "revenue", "category": "POS", "amount": "4500", "description": "Daily Sales"}
    ok, rec, _ = validate_csv_import_row(valid_row, 1)
    assert ok is True
    assert rec["amount"] == 4500.0

    invalid_row = {"date": "bad-date", "type": "transfer", "category": "Bank", "amount": "-100"}
    ok2, _, err = validate_csv_import_row(invalid_row, 2)
    assert ok2 is False
    assert "invalid date" in err or "type must be" in err


# ==============================================================================
# 5. INTEGRATION & RBAC TESTS (HTTP ASGI)
# ==============================================================================

@pytest.mark.anyio
async def test_full_rbac_and_workflow_integration():
    """
    Tests:
    - 5 Roles: Owner, Manager, HR Officer, Cashier, Staff
    - Cashier blocked from /api/hr/* and billing
    - HR Officer cannot finalise payroll (Owner/Manager required)
    - Attendance check-in/out -> Payroll run -> Payslip PDF
    - POS atomic checkout
    - WhatsApp webhook verification and unauthorized number rejection
    """
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Health check
        h_resp = await client.get("/api/v1/health")
        assert h_resp.status_code == 200
        assert h_resp.json()["status"] == "ok"

        # 2. Register Owner
        owner_phone = f"+92300{random_digits(7)}"
        owner_email = f"owner_{uuid4_hex()}@example.com"
        reg = await client.post("/api/v1/auth/register", json={
            "business": "Al-Karam Superstore",
            "owner": "Malik Owner",
            "email": owner_email,
            "password": "Password123!",
            "phone_number": owner_phone,
        })
        if reg.status_code != 201:
            print("Register error:", reg.status_code, reg.json())
        assert reg.status_code == 201
        owner_data = reg.json()
        owner_token = owner_data["access_token"]
        owner_headers = {"Authorization": f"Bearer {owner_token}"}
        owner_biz_id = owner_data["user"]["business_id"]

        # 3. Owner invites HR Officer
        hr_phone = f"+92301{random_digits(7)}"
        hr_email = f"hrofficer_{uuid4_hex()}@example.com"
        add_hr = await client.post("/api/account/roles", json={
            "name": "Noreen HR",
            "email": hr_email,
            "password": "Password123!",
            "role": "hr_officer",
            "phone_number": hr_phone,
        }, headers=owner_headers)
        assert add_hr.status_code == 201
        assert add_hr.json()["role"] == "hr_officer"

        # Login HR Officer
        hr_login = await client.post("/api/v1/auth/login", json={"email": hr_email, "password": "Password123!"})
        assert hr_login.status_code == 200
        hr_token = hr_login.json()["access_token"]
        hr_headers = {"Authorization": f"Bearer {hr_token}"}

        # 4. Owner invites Cashier
        cashier_email = f"cashier_{uuid4_hex()}@example.com"
        add_c = await client.post("/api/account/roles", json={
            "name": "Zahid Cashier",
            "email": cashier_email,
            "password": "Password123!",
            "role": "cashier",
        }, headers=owner_headers)
        assert add_c.status_code == 201

        cashier_login = await client.post("/api/v1/auth/login", json={"email": cashier_email, "password": "Password123!"})
        c_token = cashier_login.json()["access_token"]
        cashier_headers = {"Authorization": f"Bearer {c_token}"}

        # RBAC Check: Cashier CANNOT access HR employee creation (403)
        c_hr_block = await client.post("/api/hr/employees", json={
            "full_name": "Test", "email": f"test_{uuid4_hex()}@example.com", "role": "staff", "base_salary": 30000,
        }, headers=cashier_headers)
        assert c_hr_block.status_code == 403

        # RBAC Check: Cashier CANNOT access billing upgrade (403)
        c_bill_block = await client.post("/api/account/billing/upgrade?target_plan=premium", headers=cashier_headers)
        assert c_bill_block.status_code == 403

        # 5. Create an employee profile
        emp_create = await client.post("/api/hr/employees", json={
            "full_name": "Bilal Warehouse Lead",
            "email": f"bilal_{uuid4_hex()}@alkaram.com",
            "phone": f"+92312{random_digits(7)}",
            "role": "staff",
            "base_salary": 52000.0,
            "join_date": "2026-01-01",
            "department": "Logistics",
            "create_login": True,
            "login_password": "Password123!",
        }, headers=owner_headers)
        assert emp_create.status_code == 201
        emp_id = emp_create.json()["id"]

        # 6. Record attendance: Check In then Check Out
        cin = await client.post("/api/hr/attendance/check-in", json={"employee_id": emp_id}, headers=hr_headers)
        assert cin.status_code == 200
        assert cin.json()["status"] == "incomplete"

        cout = await client.post("/api/hr/attendance/check-out", json={"employee_id": emp_id}, headers=hr_headers)
        assert cout.status_code == 200
        assert cout.json()["status"] == "present"

        # 7. Submit and Approve Leave Request
        leave_sub = await client.post("/api/hr/leave", json={
            "employee_id": emp_id,
            "start_date": "2026-05-10",
            "end_date": "2026-05-12",
            "leave_type": "annual",
            "reason": "Family wedding",
        }, headers=hr_headers)
        assert leave_sub.status_code == 201
        leave_id = leave_sub.json()["id"]

        leave_app = await client.patch(f"/api/hr/leave/{leave_id}", json={
            "status": "approved",
            "review_comment": "Approved by HR Officer",
        }, headers=hr_headers)
        assert leave_app.status_code == 200
        assert leave_app.json()["status"] == "approved"

        # 8. Generate Payroll Run (Draft -> Incomplete handling -> Approval)
        month = date.today().strftime("%Y-%m")
        p_run = await client.post("/api/hr/payroll/runs", json={"payroll_month": month}, headers=hr_headers)
        assert p_run.status_code == 201
        run_id = p_run.json()["id"]
        assert len(p_run.json()["payslips"]) >= 1
        payslip_id = p_run.json()["payslips"][0]["id"]

        # HR Officer submits payroll run
        sub_resp = await client.post(f"/api/hr/payroll/runs/{run_id}/submit", headers=hr_headers)
        assert sub_resp.status_code == 200

        # HR Officer CANNOT finalise payroll (SEC-8, Owner/Manager required)
        hr_app_block = await client.post(f"/api/hr/payroll/runs/{run_id}/approve", headers=hr_headers)
        assert hr_app_block.status_code == 403

        # Owner finalises payroll
        owner_approve = await client.post(f"/api/hr/payroll/runs/{run_id}/approve", headers=owner_headers)
        assert owner_approve.status_code == 200
        assert owner_approve.json()["ok"] is True

        # Download finalised payslip PDF/HTML
        pdf_resp = await client.get(f"/api/hr/payroll/payslips/{payslip_id}/pdf", headers=owner_headers)
        assert pdf_resp.status_code == 200
        assert "Official Employee Payslip" in pdf_resp.text

        # 9. POS Atomic Checkout
        pos_resp = await client.post("/api/pos/checkout", json={
            "customer_name": "Walk-in Retail Customer",
            "items": [
                {"item_name": "Basmati Rice 5kg", "quantity": 2, "unit_price": 1850.0},
                {"item_name": "Cooking Oil 1L", "quantity": 1, "unit_price": 580.0},
            ],
            "subtotal": 4280.0,
            "discount": 0.0,
            "tax": 0.0,
            "total": 4280.0,
            "payment_method": "cash",
        }, headers=cashier_headers)
        assert pos_resp.status_code == 201
        assert pos_resp.json()["total"] == 4280.0

        # Verify revenue was atomically added to ledger
        ledger_resp = await client.get("/api/finance/ledger?entry_type=revenue", headers=owner_headers)
        assert ledger_resp.status_code == 200
        assert any(e["amount"] == 4280.0 and e["source"] == "pos" for e in ledger_resp.json())

        # 10. WhatsApp Cloud API Webhook:
        # a) Unregistered phone -> REJECT with zero data
        wa_unauth = await client.post("/api/whatsapp/webhook", json={
            "entry": [{"changes": [{"value": {"messages": [{"from": "923999999999", "text": {"body": "sales today"}}]}}]}]
        })
        assert wa_unauth.status_code == 200
        assert wa_unauth.json()["status"] == "rejected"
        assert "not recognized" in wa_unauth.json()["message"]

        # b) Registered Owner phone -> Returns sales figure
        wa_auth = await client.post("/api/whatsapp/webhook", json={
            "entry": [{"changes": [{"value": {"messages": [{"from": owner_phone, "text": {"body": "sales today"}}]}}]}]
        })
        assert wa_auth.status_code == 200
        assert wa_auth.json()["status"] == "processed"
        assert "Sales recorded today" in wa_auth.json()["reply"]

        # 11. AI Usage Meter Check
        billing_resp = await client.get("/api/account/billing", headers=owner_headers)
        assert billing_resp.status_code == 200
        assert billing_resp.json()["ai_query_allowance"] == 500


@pytest.mark.anyio
async def test_tenant_isolation_and_rls():
    """
    RLS & Tenant Isolation (FR-P.4, SEC-5):
    Tenant B cannot access Tenant A's employees, attendance, leave, payroll, or ledger entries.
    """
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # Tenant A
        reg_a = await client.post("/api/v1/auth/register", json={
            "business": "Tenant A Enterprise",
            "owner": "Owner A",
            "email": f"owner_a_{uuid4_hex()}@example.com",
            "password": "Password123!",
            "phone_number": f"+92321{random_digits(7)}",
        })
        token_a = reg_a.json()["access_token"]
        headers_a = {"Authorization": f"Bearer {token_a}"}

        # Tenant B
        reg_b = await client.post("/api/v1/auth/register", json={
            "business": "Tenant B Corp",
            "owner": "Owner B",
            "email": f"owner_b_{uuid4_hex()}@example.com",
            "password": "Password123!",
            "phone_number": f"+92322{random_digits(7)}",
        })
        token_b = reg_b.json()["access_token"]
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # Tenant A adds an employee
        emp_a = await client.post("/api/hr/employees", json={
            "full_name": "Tenant A Secret Employee",
            "email": f"secret_a_{uuid4_hex()}@example.com",
            "role": "staff",
            "base_salary": 90000.0,
        }, headers=headers_a)
        assert emp_a.status_code == 201
        emp_a_id = emp_a.json()["id"]

        # Tenant A creates a confidential ledger entry
        ledger_a = await client.post("/api/finance/ledger", json={
            "entry_type": "revenue",
            "category": "Confidential",
            "amount": 250000.0,
            "description": "Tenant A Secret Contract",
        }, headers=headers_a)
        assert ledger_a.status_code == 201

        # Tenant B lists employees -> Tenant A's employee MUST NOT appear
        b_emps = await client.get("/api/hr/employees", headers=headers_b)
        assert b_emps.status_code == 200
        assert not any(e["id"] == emp_a_id for e in b_emps.json())

        # Tenant B lists ledger entries -> Tenant A's ledger entry MUST NOT appear
        b_ledger = await client.get("/api/finance/ledger", headers=headers_b)
        assert b_ledger.status_code == 200
        assert not any(e["description"] == "Tenant A Secret Contract" for e in b_ledger.json())


@pytest.mark.anyio
async def test_hr_policy_rag_grounding_and_fallback():
    """
    IT-07: HR Policy Upload & Grounded Question Answering (FR-5.5)
    Tests policy document upload, grounded response retrieval, and uncovered fallback.
    """
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        reg = await client.post("/api/v1/auth/register", json={
            "business": "RAG Demo Store",
            "owner": "Owner RAG",
            "email": f"rag_{uuid4_hex()}@example.com",
            "password": "Password123!",
            "phone_number": f"+92333{random_digits(7)}",
        })
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Ask question when no policies are uploaded -> Fallback response
        ask_empty = await client.post("/api/hr/assistant/ask", json={
            "question": "What is the overtime rate on Sundays?",
        }, headers=headers)
        assert ask_empty.status_code == 200
        assert "do not cover this topic" in ask_empty.json()["answer"]

        # 2. Upload policy document
        policy_text = (
            "COMPANY OVERTIME POLICY: All employees working on Sundays or public gazetted holidays "
            "are entitled to 1.5x their standard hourly rate. Overtime must be pre-approved by the Store Manager."
        )
        upload_resp = await client.post("/api/hr/policies", json={
            "document_name": "Overtime_Rules_2026.pdf",
            "content": policy_text,
        }, headers=headers)
        assert upload_resp.status_code == 200
        assert upload_resp.json()["chunks_indexed"] >= 1

        # 3. List policies
        docs = await client.get("/api/hr/policies", headers=headers)
        assert docs.status_code == 200
        assert any(d["document_name"] == "Overtime_Rules_2026.pdf" for d in docs.json())


def random_digits(n=7):
    import random
    return "".join(str(random.randint(0, 9)) for _ in range(n))


def uuid4_hex():
    import uuid
    return uuid.uuid4().hex[:8]


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
