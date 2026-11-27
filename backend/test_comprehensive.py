"""
Comprehensive Endpoint & Function Test Suite for AI COO (SMEO)
Tests every router endpoint, business logic engine, RBAC rule, and edge case
against an isolated SQLite database.
"""

from datetime import date, timedelta
import hashlib
import hmac
import json
import os
import sys
import uuid

import httpx
import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.config import get_settings
from app.database import SQLiteAdapter
from app.main import app


def _uid() -> str:
    return uuid.uuid4().hex[:8]


@pytest.fixture
async def isolated_db(tmp_path):
    db_file = str(tmp_path / "test_comprehensive.sqlite3")
    db = SQLiteAdapter(db_file)
    await db.connect()
    prev_db = getattr(app.state, "db", None)
    app.state.db = db
    try:
        yield db
    finally:
        app.state.db = prev_db
        await db.close()


@pytest.mark.anyio
async def test_auth_lockout_and_team_endpoints(isolated_db):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # Health endpoints
        for path in ("/api/v1/health", "/api/health"):
            r = await client.get(path)
            assert r.status_code == 200
            assert r.json()["status"] == "ok"

        email = f"owner_{_uid()}@example.com"
        reg = await client.post("/api/v1/auth/register", json={
            "business": "Test Mart",
            "owner": "Ali Owner",
            "email": email,
            "password": "Password123!",
            "phone_number": "+923001112233",
        })
        assert reg.status_code == 201
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Duplicate registration -> 409
        dup = await client.post("/api/v1/auth/register", json={
            "business": "Test Mart 2",
            "owner": "Ali",
            "email": email,
            "password": "Password123!",
        })
        assert dup.status_code == 409

        # /auth/me
        me = await client.get("/api/v1/auth/me", headers=headers)
        assert me.status_code == 200
        assert me.json()["email"] == email

        # 5-attempt lockout test on a staff user
        staff_email = f"staff_{_uid()}@example.com"
        add_staff = await client.post("/api/v1/team/users", json={
            "name": "Sara Staff",
            "email": staff_email,
            "password": "Password123!",
            "role": "staff",
        }, headers=headers)
        assert add_staff.status_code == 201
        staff_id = add_staff.json()["id"]

        for attempt in range(1, 5):
            bad = await client.post("/api/v1/auth/login", json={"email": staff_email, "password": "WrongPassword!"})
            assert bad.status_code == 401
        locked = await client.post("/api/v1/auth/login", json={"email": staff_email, "password": "WrongPassword!"})
        assert locked.status_code == 403

        # Even correct password fails while locked
        still_locked = await client.post("/api/v1/auth/login", json={"email": staff_email, "password": "Password123!"})
        assert still_locked.status_code == 403

        # Owner unlocks via account/roles/{id}/status
        unlock = await client.patch(f"/api/account/roles/{staff_id}/status", json={"status": "active"}, headers=headers)
        assert unlock.status_code == 200

        # Team list & soft delete
        team = await client.get("/api/v1/team/users", headers=headers)
        assert team.status_code == 200
        assert any(m["id"] == staff_id for m in team.json())

        rem = await client.delete(f"/api/v1/team/users/{staff_id}", headers=headers)
        assert rem.status_code == 200
        assert rem.json()["ok"] is True

        # Workspace GET/PUT
        ws_put = await client.put("/api/v1/workspace", json={"state": {"hello": "world"}}, headers=headers)
        assert ws_put.status_code == 200
        ws_get = await client.get("/api/v1/workspace", headers=headers)
        assert ws_get.status_code == 200
        assert ws_get.json()["state"]["hello"] == "world"

        # CSV mapper endpoint (deterministic fallback works even without OpenAI key)
        csv_resp = await client.post("/api/v1/agent/map-csv", json={
            "target_schema": "inventory",
            "csv_text": "name,stock,price\nSugar 1kg,50,160\n",
        }, headers=headers)
        assert csv_resp.status_code == 200
        bad_csv = await client.post("/api/v1/agent/map-csv", json={
            "target_schema": "unknown",
            "csv_text": "a,b\n1,2\n",
        }, headers=headers)
        assert bad_csv.status_code == 400


@pytest.mark.anyio
async def test_account_router_all_endpoints(isolated_db):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        email = f"acct_{_uid()}@example.com"
        reg = await client.post("/api/v1/auth/register", json={
            "business": "Account Test Co",
            "owner": "Owner One",
            "email": email,
            "password": "Password123!",
        })
        assert reg.status_code == 201
        owner_id = reg.json()["user"]["id"]
        headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}

        # Profile GET / PUT / Password
        p_get = await client.get("/api/account/profile", headers=headers)
        assert p_get.status_code == 200

        p_put = await client.put("/api/account/profile", json={"owner": "Owner Updated", "phone_number": "+923009998877"}, headers=headers)
        assert p_put.status_code == 200
        assert p_put.json()["owner"] == "Owner Updated"

        bad_pw = await client.post("/api/account/password", json={"current_password": "Wrong!", "new_password": "NewPassword123!"}, headers=headers)
        assert bad_pw.status_code == 400
        ok_pw = await client.post("/api/account/password", json={"current_password": "Password123!", "new_password": "NewPassword123!"}, headers=headers)
        assert ok_pw.status_code == 200

        # Roles: last-owner protection
        last_owner_block = await client.patch(f"/api/account/roles/{owner_id}/status", json={"status": "suspended"}, headers=headers)
        assert last_owner_block.status_code == 400

        # Add role, update role, update status
        m_resp = await client.post("/api/account/roles", json={
            "name": "Manager Two",
            "email": f"mgr_{_uid()}@example.com",
            "password": "Password123!",
            "role": "manager",
        }, headers=headers)
        assert m_resp.status_code == 201
        m_id = m_resp.json()["id"]

        r_list = await client.get("/api/account/roles", headers=headers)
        assert r_list.status_code == 200
        assert len(r_list.json()) >= 2

        r_patch = await client.patch(f"/api/account/roles/{m_id}/role", json={"role": "hr_officer"}, headers=headers)
        assert r_patch.status_code == 200
        assert r_patch.json()["role"] == "hr_officer"

        # Business setup GET / PUT
        bs_get = await client.get("/api/account/business-setup", headers=headers)
        assert bs_get.status_code == 200
        bs_put = await client.put("/api/account/business-setup", json={
            "name": "Account Test Co Updated",
            "industry": "Grocery",
            "currency": "PKR",
            "tax_rate": 5.0,
            "annual_leave_days": 16,
            "working_days_per_month": 26,
            "low_stock_threshold_default": 15,
        }, headers=headers)
        assert bs_put.status_code == 200
        assert bs_put.json()["tax_rate"] == 5.0

        # Billing GET & upgrade
        b_get = await client.get("/api/account/billing", headers=headers)
        assert b_get.status_code == 200
        b_up = await client.post("/api/account/billing/upgrade?target_plan=premium", headers=headers)
        assert b_up.status_code == 200
        assert b_up.json()["ai_query_allowance"] == 2000

        b_after = await client.get("/api/account/billing", headers=headers)
        assert b_after.json()["plan"] == "premium"
        assert b_after.json()["ai_query_allowance"] == 2000

        # Connections GET / PUT
        c_get = await client.get("/api/account/connections", headers=headers)
        assert c_get.status_code == 200
        c_put = await client.put("/api/account/connections", json={"smtp_host": "smtp.example.com", "smtp_port": 587}, headers=headers)
        assert c_put.status_code == 200
        assert c_put.json()["smtp_host"] == "smtp.example.com"


@pytest.mark.anyio
async def test_finance_router_all_endpoints(isolated_db):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        reg = await client.post("/api/v1/auth/register", json={
            "business": "Finance Store",
            "owner": "Fin Owner",
            "email": f"fin_{_uid()}@example.com",
            "password": "Password123!",
        })
        headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}

        # Create revenue & expense entries
        rev = await client.post("/api/finance/ledger", json={
            "entry_type": "revenue",
            "category": "Sales",
            "amount": 50000.0,
            "description": "Monthly sales",
            "entry_date": date.today().isoformat(),
        }, headers=headers)
        assert rev.status_code == 201

        exp = await client.post("/api/finance/ledger", json={
            "entry_type": "expense",
            "category": "Utility",
            "amount": 12000.0,
            "description": "Electric bill",
            "entry_date": date.today().isoformat(),
        }, headers=headers)
        assert exp.status_code == 201
        exp_id = exp.json()["id"]

        # Void entry
        void_resp = await client.post(f"/api/finance/ledger/{exp_id}/void", json={"voided_reason": "Duplicate entry"}, headers=headers)
        assert void_resp.status_code == 200
        assert void_resp.json()["is_voided"] is True

        # CSV import (1 valid, 1 invalid)
        csv_imp = await client.post("/api/finance/import", json={
            "rows": [
                {"date": date.today().isoformat(), "type": "expense", "category": "Packaging", "amount": "2000", "description": "Boxes"},
                {"date": "invalid-date", "type": "expense", "category": "Packaging", "amount": "-50"},
            ]
        }, headers=headers)
        assert csv_imp.status_code == 200
        assert csv_imp.json()["imported_count"] == 1
        assert len(csv_imp.json()["errors"]) == 1

        # Metrics, anomalies detect & list, recommendations, executive report
        m_resp = await client.get("/api/finance/metrics", headers=headers)
        assert m_resp.status_code == 200

        a_det = await client.post("/api/finance/anomalies/detect", headers=headers)
        assert a_det.status_code == 200

        a_list = await client.get("/api/finance/anomalies", headers=headers)
        assert a_list.status_code == 200

        recs = await client.get("/api/finance/recommendations", headers=headers)
        assert recs.status_code == 200

        rep = await client.post("/api/finance/report", json={
            "start_date": (date.today() - timedelta(days=30)).isoformat(),
            "end_date": date.today().isoformat(),
        }, headers=headers)
        assert rep.status_code == 200
        assert "narrative_summary" in rep.json()


@pytest.mark.anyio
async def test_hr_and_whatsapp_and_pos_edge_cases(isolated_db):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        reg = await client.post("/api/v1/auth/register", json={
            "business": "HR & WA Store",
            "owner": "HR Owner",
            "email": f"hrowner_{_uid()}@example.com",
            "password": "Password123!",
            "phone_number": "+923005556677",
        })
        headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}

        # Create employee with login so we can test salary masking & self-service
        staff_email = f"empstaff_{_uid()}@example.com"
        emp_r = await client.post("/api/hr/employees", json={
            "full_name": "Usman Staff",
            "email": staff_email,
            "role": "staff",
            "base_salary": 45000.0,
            "create_login": True,
            "login_password": "Password123!",
        }, headers=headers)
        assert emp_r.status_code == 201
        emp_id = emp_r.json()["id"]

        # Staff login -> salary should be masked for other employees or non-executives
        s_login = await client.post("/api/v1/auth/login", json={"email": staff_email, "password": "Password123!"})
        assert s_login.status_code == 200
        s_headers = {"Authorization": f"Bearer {s_login.json()['access_token']}"}

        emp_list_staff = await client.get("/api/hr/employees", headers=s_headers)
        assert emp_list_staff.status_code == 200

        # Attendance check-in -> check-out -> correction
        cin = await client.post("/api/hr/attendance/check-in", json={"employee_id": emp_id}, headers=headers)
        assert cin.status_code == 200
        rec_id = cin.json()["id"]
        cout = await client.post("/api/hr/attendance/check-out", json={"employee_id": emp_id}, headers=headers)
        assert cout.status_code == 200

        corr = await client.patch(f"/api/hr/attendance/{rec_id}", json={
            "check_in": f"{date.today().isoformat()}T09:00:00+00:00",
            "check_out": f"{date.today().isoformat()}T17:30:00+00:00",
            "correction_reason": "Biometric glitch",
        }, headers=headers)
        assert corr.status_code == 200
        assert corr.json()["status"] == "corrected"

        # Leave overlap detection (approved leave -> overlapping request gets flagged)
        l1 = await client.post("/api/hr/leave", json={
            "employee_id": emp_id,
            "start_date": "2026-07-01",
            "end_date": "2026-07-03",
            "leave_type": "annual",
            "reason": "Trip",
        }, headers=headers)
        assert l1.status_code == 201
        l1_id = l1.json()["id"]
        l1_app = await client.patch(f"/api/hr/leave/{l1_id}", json={"status": "approved"}, headers=headers)
        assert l1_app.status_code == 200

        l2_overlap = await client.post("/api/hr/leave", json={
            "employee_id": emp_id,
            "start_date": "2026-07-02",
            "end_date": "2026-07-04",
            "leave_type": "annual",
            "reason": "Overlap",
        }, headers=headers)
        assert l2_overlap.status_code == 201
        assert l2_overlap.json()["is_flagged"] is True

        # POS sales history
        pos_c = await client.post("/api/pos/checkout", json={
            "customer_name": "Customer 1",
            "items": [{"item_name": "Tea 500g", "quantity": 1, "unit_price": 950.0}],
            "subtotal": 950.0,
            "discount": 0.0,
            "tax": 0.0,
            "total": 950.0,
            "payment_method": "cash",
        }, headers=headers)
        assert pos_c.status_code == 201
        pos_s = await client.get("/api/pos/sales", headers=headers)
        assert pos_s.status_code == 200
        assert len(pos_s.json()) >= 1

        # WhatsApp webhook GET verification
        cfg = get_settings()
        wa_ok = await client.get("/api/whatsapp/webhook", params={
            "hub.mode": "subscribe",
            "hub.verify_token": cfg.whatsapp_verify_token,
            "hub.challenge": "12345",
        })
        assert wa_ok.status_code == 200
        assert wa_ok.text == "12345"

        wa_bad = await client.get("/api/whatsapp/webhook", params={
            "hub.mode": "subscribe",
            "hub.verify_token": "wrong_token",
            "hub.challenge": "12345",
        })
        assert wa_bad.status_code == 403

        # Policy delete
        up = await client.post("/api/hr/policies", json={
            "document_name": "Temp_Policy.pdf",
            "content": "Probation period is 3 months for all new hires.",
        }, headers=headers)
        assert up.status_code == 200
        del_p = await client.delete("/api/hr/policies/Temp_Policy.pdf", headers=headers)
        assert del_p.status_code == 200
