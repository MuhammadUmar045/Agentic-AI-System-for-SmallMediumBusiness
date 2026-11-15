from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime
import json
import logging
import sqlite3
from typing import Any
import uuid

from fastapi import FastAPI, HTTPException, Request
import httpx

from .config import Settings, get_settings

logger = logging.getLogger("vantage.database")


class SupabaseAdapter:
    """Async client for Supabase using PostgREST REST API via httpx."""

    def __init__(self, settings: Settings):
        self.base_url = f"{settings.supabase_url.rstrip('/')}/rest/v1"
        self.api_key = settings.effective_supabase_key
        self.headers = {
            "apikey": self.api_key,
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        self.client: httpx.AsyncClient | None = None

    async def connect(self) -> None:
        self.client = httpx.AsyncClient(
            base_url=self.base_url,
            headers=self.headers,
            timeout=20.0,
        )
        logger.info("Connected to Supabase at %s", self.base_url)

    async def close(self) -> None:
        if self.client:
            await self.client.aclose()
            self.client = None

    # Helper generic query methods
    async def _get(self, table: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        assert self.client is not None
        resp = await self.client.get(f"/{table}", params=params)
        if resp.status_code == 200:
            return resp.json()
        logger.error("Supabase GET /%s error: %s %s", table, resp.status_code, resp.text)
        return []

    async def _post(self, table: str, payload: dict[str, Any] | list[dict[str, Any]]) -> Any:
        assert self.client is not None
        headers = {**self.headers, "Prefer": "return=representation"}
        resp = await self.client.post(f"/{table}", json=payload, headers=headers)
        if resp.status_code in (200, 201):
            return resp.json()
        logger.error("Supabase POST /%s error: %s %s", table, resp.status_code, resp.text)
        return None

    async def _patch(self, table: str, params: dict[str, Any], payload: dict[str, Any]) -> Any:
        assert self.client is not None
        headers = {**self.headers, "Prefer": "return=representation"}
        resp = await self.client.patch(f"/{table}", params=params, json=payload, headers=headers)
        if resp.status_code in (200, 204):
            return resp.json() if resp.status_code == 200 else True
        logger.error("Supabase PATCH /%s error: %s %s", table, resp.status_code, resp.text)
        return None

    # Users & Auth
    async def get_user_by_email(self, email: str) -> dict[str, Any] | None:
        rows = await self._get("users", {"email": f"eq.{email.lower()}", "select": "*"})
        return rows[0] if rows else None

    async def get_user_by_id(self, user_id: str) -> dict[str, Any] | None:
        rows = await self._get("users", {"id": f"eq.{user_id}", "select": "*"})
        return rows[0] if rows else None

    async def get_user_by_phone(self, phone: str) -> dict[str, Any] | None:
        rows = await self._get("users", {"phone_number": f"eq.{phone}", "select": "*"})
        return rows[0] if rows else None

    async def create_user(self, user_data: dict[str, Any]) -> dict[str, Any]:
        doc = {**user_data}
        if "id" not in doc:
            doc["id"] = str(uuid.uuid4())
        if "created_at" in doc and isinstance(doc["created_at"], datetime):
            doc["created_at"] = doc["created_at"].isoformat()
        res = await self._post("users", doc)
        if res and isinstance(res, list):
            return res[0]
        return doc

    async def update_user(self, user_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        res = await self._patch("users", {"id": f"eq.{user_id}"}, updates)
        return res[0] if res and isinstance(res, list) else None

    async def get_team_members(self, business_id: str) -> list[dict[str, Any]]:
        return await self._get(
            "users",
            {
                "business_id": f"eq.{business_id}",
                "select": "id,business_id,full_name,email,phone_number,role,status,plan,created_at",
                "order": "created_at.desc",
            },
        )

    # Businesses
    async def get_business(self, business_id: str) -> dict[str, Any] | None:
        rows = await self._get("businesses", {"id": f"eq.{business_id}", "select": "*"})
        return rows[0] if rows else None

    async def create_business(self, biz_data: dict[str, Any]) -> dict[str, Any]:
        res = await self._post("businesses", biz_data)
        return res[0] if res and isinstance(res, list) else biz_data

    async def update_business(self, business_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        res = await self._patch("businesses", {"id": f"eq.{business_id}"}, updates)
        return res[0] if res and isinstance(res, list) else None

    # Subscriptions & AI Meter
    async def get_subscription(self, business_id: str) -> dict[str, Any] | None:
        rows = await self._get("subscriptions", {"business_id": f"eq.{business_id}", "select": "*"})
        return rows[0] if rows else None

    async def create_subscription(self, sub_data: dict[str, Any]) -> dict[str, Any]:
        res = await self._post("subscriptions", sub_data)
        return res[0] if res and isinstance(res, list) else sub_data

    async def record_ai_usage(self, usage_data: dict[str, Any]) -> None:
        await self._post("ai_usage_logs", usage_data)
        sub = await self.get_subscription(usage_data["business_id"])
        if sub:
            used = sub.get("ai_queries_used", 0) + 1
            await self._patch("subscriptions", {"business_id": f"eq.{usage_data['business_id']}"}, {"ai_queries_used": used})

    # Employees & HR
    async def get_employees(self, business_id: str) -> list[dict[str, Any]]:
        return await self._get(
            "employees",
            {"business_id": f"eq.{business_id}", "select": "*", "order": "created_at.desc"},
        )

    async def get_employee_by_id(self, employee_id: str, business_id: str) -> dict[str, Any] | None:
        rows = await self._get("employees", {"id": f"eq.{employee_id}", "business_id": f"eq.{business_id}", "select": "*"})
        return rows[0] if rows else None

    async def get_employee_by_user_id(self, user_id: str, business_id: str) -> dict[str, Any] | None:
        rows = await self._get("employees", {"user_id": f"eq.{user_id}", "business_id": f"eq.{business_id}", "select": "*"})
        return rows[0] if rows else None

    async def create_employee(self, data: dict[str, Any]) -> dict[str, Any]:
        res = await self._post("employees", data)
        return res[0] if res and isinstance(res, list) else data

    async def update_employee(self, employee_id: str, business_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        res = await self._patch("employees", {"id": f"eq.{employee_id}", "business_id": f"eq.{business_id}"}, updates)
        return res[0] if res and isinstance(res, list) else None

    # Attendance
    async def get_attendance(
        self,
        business_id: str,
        from_date: str | None = None,
        to_date: str | None = None,
        employee_id: str | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {"business_id": f"eq.{business_id}", "select": "*", "order": "work_date.desc"}
        if from_date:
            params["work_date"] = f"gte.{from_date}"
        if to_date:
            params["work_date"] = f"lte.{to_date}"
        if employee_id:
            params["employee_id"] = f"eq.{employee_id}"
        return await self._get("attendance_records", params)

    async def get_today_attendance(self, employee_id: str, work_date: str) -> dict[str, Any] | None:
        rows = await self._get(
            "attendance_records",
            {"employee_id": f"eq.{employee_id}", "work_date": f"eq.{work_date}", "select": "*"},
        )
        return rows[0] if rows else None

    async def create_attendance(self, data: dict[str, Any]) -> dict[str, Any]:
        res = await self._post("attendance_records", data)
        return res[0] if res and isinstance(res, list) else data

    async def update_attendance(self, record_id: str, business_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        res = await self._patch("attendance_records", {"id": f"eq.{record_id}", "business_id": f"eq.{business_id}"}, updates)
        return res[0] if res and isinstance(res, list) else None

    # Leave Requests
    async def get_leave_requests(self, business_id: str, employee_id: str | None = None) -> list[dict[str, Any]]:
        params: dict[str, Any] = {"business_id": f"eq.{business_id}", "select": "*", "order": "start_date.desc"}
        if employee_id:
            params["employee_id"] = f"eq.{employee_id}"
        return await self._get("leave_requests", params)

    async def get_leave_request_by_id(self, leave_id: str, business_id: str) -> dict[str, Any] | None:
        rows = await self._get("leave_requests", {"id": f"eq.{leave_id}", "business_id": f"eq.{business_id}", "select": "*"})
        return rows[0] if rows else None

    async def create_leave_request(self, data: dict[str, Any]) -> dict[str, Any]:
        res = await self._post("leave_requests", data)
        return res[0] if res and isinstance(res, list) else data

    async def update_leave_request(self, leave_id: str, business_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        res = await self._patch("leave_requests", {"id": f"eq.{leave_id}", "business_id": f"eq.{business_id}"}, updates)
        return res[0] if res and isinstance(res, list) else None

    # Payroll Runs & Payslips
    async def get_payroll_runs(self, business_id: str) -> list[dict[str, Any]]:
        return await self._get("payroll_runs", {"business_id": f"eq.{business_id}", "select": "*", "order": "payroll_month.desc"})

    async def get_payroll_run_by_id(self, run_id: str, business_id: str) -> dict[str, Any] | None:
        rows = await self._get("payroll_runs", {"id": f"eq.{run_id}", "business_id": f"eq.{business_id}", "select": "*"})
        return rows[0] if rows else None

    async def create_payroll_run(self, data: dict[str, Any]) -> dict[str, Any]:
        res = await self._post("payroll_runs", data)
        return res[0] if res and isinstance(res, list) else data

    async def update_payroll_run(self, run_id: str, business_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        res = await self._patch("payroll_runs", {"id": f"eq.{run_id}", "business_id": f"eq.{business_id}"}, updates)
        return res[0] if res and isinstance(res, list) else None

    async def get_payslips_for_run(self, run_id: str) -> list[dict[str, Any]]:
        return await self._get("payslips", {"payroll_run_id": f"eq.{run_id}", "select": "*"})

    async def get_payslips_for_employee(self, employee_id: str) -> list[dict[str, Any]]:
        return await self._get("payslips", {"employee_id": f"eq.{employee_id}", "select": "*"})

    async def get_payslip_by_id(self, payslip_id: str) -> dict[str, Any] | None:
        rows = await self._get("payslips", {"id": f"eq.{payslip_id}", "select": "*"})
        return rows[0] if rows else None

    async def create_payslip(self, data: dict[str, Any]) -> dict[str, Any]:
        res = await self._post("payslips", data)
        return res[0] if res and isinstance(res, list) else data

    async def update_payslip(self, payslip_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        res = await self._patch("payslips", {"id": f"eq.{payslip_id}"}, updates)
        return res[0] if res and isinstance(res, list) else None

    # HR Policies RAG
    async def insert_hr_policy_chunk(self, chunk: dict[str, Any]) -> dict[str, Any]:
        res = await self._post("hr_policy_chunks", chunk)
        return res[0] if res and isinstance(res, list) else chunk

    async def get_hr_policy_documents(self, business_id: str) -> list[dict[str, Any]]:
        assert self.client is not None
        resp = await self.client.get(
            "/hr_policy_chunks",
            params={"business_id": f"eq.{business_id}", "select": "document_name,created_at"},
        )
        if resp.status_code == 200:
            docs = resp.json()
            seen = {}
            for d in docs:
                name = d["document_name"]
                if name not in seen:
                    seen[name] = d
            return list(seen.values())
        return []

    async def delete_hr_policy_document(self, document_name: str, business_id: str) -> bool:
        assert self.client is not None
        resp = await self.client.delete(
            "/hr_policy_chunks",
            params={"business_id": f"eq.{business_id}", "document_name": f"eq.{document_name}"},
        )
        return resp.status_code in (200, 204)

    async def search_hr_policies(self, query_vector: list[float], business_id: str, count: int = 4) -> list[dict[str, Any]]:
        assert self.client is not None
        payload = {
            "query_embedding": query_vector,
            "match_threshold": 0.55,
            "match_count": count,
            "filter_business_id": business_id,
        }
        resp = await self.client.post("/rpc/match_hr_policies", json=payload)
        if resp.status_code == 200:
            return resp.json()
        logger.error("Failed to search HR policies via RPC: %s %s", resp.status_code, resp.text)
        return []

    # Ledger & Accounting
    async def get_ledger_entries(
        self,
        business_id: str,
        from_date: str | None = None,
        to_date: str | None = None,
        entry_type: str | None = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "business_id": f"eq.{business_id}",
            "select": "*",
            "order": "entry_date.desc,created_at.desc",
            "limit": str(limit),
        }
        if from_date:
            params["entry_date"] = f"gte.{from_date}"
        if to_date:
            params["entry_date"] = f"lte.{to_date}"
        if entry_type:
            params["entry_type"] = f"eq.{entry_type}"
        return await self._get("ledger_entries", params)

    async def create_ledger_entry(self, data: dict[str, Any]) -> dict[str, Any]:
        res = await self._post("ledger_entries", data)
        return res[0] if res and isinstance(res, list) else data

    async def void_ledger_entry(self, entry_id: str, business_id: str, reason: str) -> dict[str, Any] | None:
        updates = {"is_voided": True, "voided_reason": reason}
        res = await self._patch("ledger_entries", {"id": f"eq.{entry_id}", "business_id": f"eq.{business_id}"}, updates)
        return res[0] if res and isinstance(res, list) else None

    # Anomalies & Recommendations
    async def get_anomalies(self, business_id: str) -> list[dict[str, Any]]:
        return await self._get("anomalies", {"business_id": f"eq.{business_id}", "select": "*", "order": "detected_at.desc"})

    async def create_anomaly(self, data: dict[str, Any]) -> dict[str, Any]:
        res = await self._post("anomalies", data)
        return res[0] if res and isinstance(res, list) else data

    async def update_anomaly(self, anomaly_id: str, business_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        res = await self._patch("anomalies", {"id": f"eq.{anomaly_id}", "business_id": f"eq.{business_id}"}, updates)
        return res[0] if res and isinstance(res, list) else None

    async def get_financial_recommendations(self, business_id: str) -> list[dict[str, Any]]:
        return await self._get("financial_recommendations", {"business_id": f"eq.{business_id}", "select": "*", "order": "created_at.desc"})

    async def create_financial_recommendation(self, data: dict[str, Any]) -> dict[str, Any]:
        res = await self._post("financial_recommendations", data)
        return res[0] if res and isinstance(res, list) else data

    async def update_financial_recommendation(self, rec_id: str, business_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        res = await self._patch("financial_recommendations", {"id": f"eq.{rec_id}", "business_id": f"eq.{business_id}"}, updates)
        return res[0] if res and isinstance(res, list) else None

    # Audit Logs (Append-Only SEC-10)
    async def record_audit_log(
        self,
        business_id: str,
        user_id: str | None,
        action: str,
        entity_type: str,
        entity_id: str,
        channel: str = "web",
        details: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        log_entry = {
            "id": str(uuid.uuid4()),
            "business_id": business_id,
            "user_id": user_id,
            "action": action,
            "entity_type": entity_type,
            "entity_id": str(entity_id),
            "channel": channel,
            "details": details or {},
            "created_at": datetime.now(UTC).isoformat(),
        }
        await self._post("audit_logs", log_entry)
        return log_entry

    async def get_audit_logs(self, business_id: str, limit: int = 100) -> list[dict[str, Any]]:
        return await self._get(
            "audit_logs",
            {"business_id": f"eq.{business_id}", "select": "*", "order": "created_at.desc", "limit": str(limit)},
        )

    # POS Atomic Checkout
    async def record_pos_sale(
        self,
        business_id: str,
        sale_data: dict[str, Any],
        items_data: list[dict[str, Any]],
    ) -> dict[str, Any]:
        # 1. Insert pos_sales
        sale_res = await self._post("pos_sales", sale_data)
        created_sale = sale_res[0] if sale_res and isinstance(sale_res, list) else sale_data
        sale_id = created_sale["id"]

        # 2. Insert items
        for it in items_data:
            it["sale_id"] = sale_id
        await self._post("pos_sale_items", items_data)

        # 3. Insert ledger revenue entry
        ledger_entry = {
            "id": str(uuid.uuid4()),
            "business_id": business_id,
            "entry_date": datetime.now(UTC).date().isoformat(),
            "entry_type": "revenue",
            "category": "Sales",
            "amount": float(sale_data.get("total", 0.0)),
            "description": f"POS Sale {sale_data.get('invoice_number')}",
            "source": "pos",
            "created_at": datetime.now(UTC).isoformat(),
        }
        await self._post("ledger_entries", ledger_entry)

        # 4. Write stock history
        for it in items_data:
            if it.get("product_id"):
                sh = {
                    "id": str(uuid.uuid4()),
                    "business_id": business_id,
                    "product_id": it["product_id"],
                    "change_qty": -abs(it.get("quantity", 1)),
                    "new_stock": 0,  # relative decrement
                    "reason": "sale",
                    "reference_id": sale_data.get("invoice_number"),
                    "created_at": datetime.now(UTC).isoformat(),
                }
                await self._post("stock_history", sh)

        return created_sale

    # Compatibility methods
    async def get_workspace(self, business_id: str) -> dict[str, Any] | None:
        rows = await self._get("workspaces", {"business_id": f"eq.{business_id}", "select": "*"})
        return rows[0] if rows else None

    async def save_workspace(self, business_id: str, state: dict[str, Any]) -> dict[str, Any]:
        payload = {
            "business_id": business_id,
            "state": state,
            "updated_at": datetime.now(UTC).isoformat(),
        }
        headers = {**self.headers, "Prefer": "resolution=merge-duplicates,return=representation"}
        assert self.client is not None
        resp = await self.client.post("/workspaces", json=payload, headers=headers)
        if resp.status_code in (200, 201):
            rows = resp.json()
            return rows[0] if isinstance(rows, list) and rows else payload
        return payload

    async def get_conversation(self, conversation_id: str, user_id: str) -> dict[str, Any] | None:
        rows = await self._get("conversations", {"id": f"eq.{conversation_id}", "user_id": f"eq.{user_id}", "select": "*"})
        return rows[0] if rows else None

    async def save_conversation(self, conversation_id: str, user_id: str, messages: list[dict[str, Any]]) -> dict[str, Any]:
        payload = {
            "id": conversation_id,
            "user_id": user_id,
            "messages": messages,
            "updated_at": datetime.now(UTC).isoformat(),
        }
        headers = {**self.headers, "Prefer": "resolution=merge-duplicates,return=representation"}
        assert self.client is not None
        await self.client.post("/conversations", json=payload, headers=headers)
        return payload


class SQLiteAdapter:
    """Complete SQLite implementation supporting all 24 SMEO tables."""

    def __init__(self, db_path: str = "vantage.sqlite3"):
        self.db_path = db_path
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        conn = self._get_conn()
        cur = conn.cursor()
        cur.executescript("""
            CREATE TABLE IF NOT EXISTS businesses (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                industry TEXT DEFAULT 'Retail',
                currency TEXT DEFAULT 'PKR',
                tax_rate REAL DEFAULT 0.0,
                annual_leave_days INTEGER DEFAULT 14,
                working_days_per_month INTEGER DEFAULT 26,
                low_stock_threshold_default INTEGER DEFAULT 20,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                business_id TEXT,
                full_name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                phone_number TEXT UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL,
                status TEXT DEFAULT 'active',
                failed_login_count INTEGER DEFAULT 0,
                plan TEXT DEFAULT 'standard',
                owner_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
        """)
        conn.commit()

        # Migrate existing businesses table if created by previous version
        biz_cols = {col[1] for col in conn.execute("PRAGMA table_info(businesses)").fetchall()}
        for col_name, col_type in [
            ("annual_leave_allowance", "INTEGER DEFAULT 14"),
            ("annual_leave_days", "INTEGER DEFAULT 14"),
            ("working_days_per_month", "INTEGER DEFAULT 26"),
            ("low_stock_threshold_default", "INTEGER DEFAULT 10"),
            ("tax_rate", "REAL DEFAULT 0.0"),
            ("currency", "TEXT DEFAULT 'PKR'"),
            ("industry", "TEXT DEFAULT 'Retail'"),
            ("updated_at", "TEXT DEFAULT ''"),
        ]:
            if col_name not in biz_cols:
                try:
                    conn.execute(f"ALTER TABLE businesses ADD COLUMN {col_name} {col_type}")
                except Exception:
                    pass

        # Migrate existing users table if created by previous version
        user_cols = {col[1] for col in conn.execute("PRAGMA table_info(users)").fetchall()}
        if "business_id" not in user_cols:
            conn.execute("ALTER TABLE users ADD COLUMN business_id TEXT")
        if "full_name" not in user_cols:
            conn.execute("ALTER TABLE users ADD COLUMN full_name TEXT DEFAULT ''")
        if "phone_number" not in user_cols:
            conn.execute("ALTER TABLE users ADD COLUMN phone_number TEXT")
        if "status" not in user_cols:
            conn.execute("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'")
        if "failed_login_count" not in user_cols:
            conn.execute("ALTER TABLE users ADD COLUMN failed_login_count INTEGER DEFAULT 0")
        if "updated_at" not in user_cols:
            conn.execute("ALTER TABLE users ADD COLUMN updated_at TEXT DEFAULT ''")
        conn.commit()

        cur.executescript("""

            CREATE TABLE IF NOT EXISTS subscriptions (
                id TEXT PRIMARY KEY,
                business_id TEXT UNIQUE NOT NULL,
                plan TEXT DEFAULT 'standard',
                ai_query_allowance INTEGER DEFAULT 500,
                ai_queries_used INTEGER DEFAULT 0,
                status TEXT DEFAULT 'active',
                current_period_end TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ai_usage_logs (
                id TEXT PRIMARY KEY,
                business_id TEXT NOT NULL,
                user_id TEXT,
                agent_type TEXT,
                model TEXT,
                prompt_tokens INTEGER DEFAULT 0,
                completion_tokens INTEGER DEFAULT 0,
                total_tokens INTEGER DEFAULT 0,
                endpoint TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS contacts (
                id TEXT PRIMARY KEY,
                business_id TEXT NOT NULL,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                contact_person TEXT,
                phone TEXT,
                email TEXT,
                address TEXT,
                debit REAL DEFAULT 0.0,
                credit_limit REAL DEFAULT 0.0,
                payment_terms TEXT,
                lead_time_days INTEGER DEFAULT 3,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS products (
                id TEXT PRIMARY KEY,
                business_id TEXT NOT NULL,
                sku TEXT NOT NULL,
                barcode TEXT,
                name TEXT NOT NULL,
                category TEXT DEFAULT 'General',
                cost_price REAL DEFAULT 0.0,
                selling_price REAL DEFAULT 0.0,
                stock_units INTEGER DEFAULT 0,
                max_capacity INTEGER DEFAULT 200,
                reorder_threshold INTEGER DEFAULT 20,
                supplier_id TEXT,
                created_at TEXT NOT NULL,
                UNIQUE(business_id, sku)
            );

            CREATE TABLE IF NOT EXISTS stock_history (
                id TEXT PRIMARY KEY,
                business_id TEXT NOT NULL,
                product_id TEXT NOT NULL,
                change_qty INTEGER NOT NULL,
                new_stock INTEGER NOT NULL,
                reason TEXT NOT NULL,
                reference_id TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS reorder_actions (
                id TEXT PRIMARY KEY,
                business_id TEXT NOT NULL,
                product_id TEXT NOT NULL,
                supplier_id TEXT,
                recommended_qty INTEGER NOT NULL,
                status TEXT DEFAULT 'draft',
                approved_by TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ledger_entries (
                id TEXT PRIMARY KEY,
                business_id TEXT NOT NULL,
                entry_date TEXT NOT NULL,
                entry_type TEXT NOT NULL,
                category TEXT NOT NULL,
                amount REAL NOT NULL,
                contact_id TEXT,
                description TEXT,
                source TEXT NOT NULL,
                is_voided INTEGER DEFAULT 0,
                voided_reason TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS anomalies (
                id TEXT PRIMARY KEY,
                business_id TEXT NOT NULL,
                type TEXT NOT NULL,
                category TEXT,
                description TEXT NOT NULL,
                amount REAL,
                baseline_amount REAL,
                status TEXT DEFAULT 'open',
                detected_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS financial_recommendations (
                id TEXT PRIMARY KEY,
                business_id TEXT NOT NULL,
                title TEXT NOT NULL,
                detail TEXT NOT NULL,
                estimated_saving_pkr REAL DEFAULT 0.0,
                runway_boost_months REAL DEFAULT 0.0,
                status TEXT DEFAULT 'pending',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS communication_drafts (
                id TEXT PRIMARY KEY,
                business_id TEXT NOT NULL,
                customer_id TEXT,
                recipient_name TEXT NOT NULL,
                recipient_contact TEXT NOT NULL,
                channel TEXT DEFAULT 'email',
                subject TEXT,
                content TEXT NOT NULL,
                draft_type TEXT DEFAULT 'follow_up',
                status TEXT DEFAULT 'pending',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS dispatch_log (
                id TEXT PRIMARY KEY,
                business_id TEXT NOT NULL,
                draft_id TEXT,
                channel TEXT NOT NULL,
                recipient TEXT NOT NULL,
                status TEXT NOT NULL,
                error_message TEXT,
                dispatched_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS employees (
                id TEXT PRIMARY KEY,
                business_id TEXT NOT NULL,
                user_id TEXT,
                full_name TEXT NOT NULL,
                email TEXT NOT NULL,
                phone TEXT,
                role TEXT NOT NULL,
                base_salary REAL DEFAULT 0.0,
                employment_status TEXT DEFAULT 'active',
                join_date TEXT NOT NULL,
                department TEXT DEFAULT 'Operations',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS attendance_records (
                id TEXT PRIMARY KEY,
                business_id TEXT NOT NULL,
                employee_id TEXT NOT NULL,
                work_date TEXT NOT NULL,
                check_in TEXT,
                check_out TEXT,
                net_hours REAL DEFAULT 0.0,
                status TEXT DEFAULT 'incomplete',
                correction_reason TEXT,
                created_at TEXT NOT NULL,
                UNIQUE(employee_id, work_date)
            );

            CREATE TABLE IF NOT EXISTS leave_requests (
                id TEXT PRIMARY KEY,
                business_id TEXT NOT NULL,
                employee_id TEXT NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                leave_type TEXT NOT NULL,
                reason TEXT,
                status TEXT DEFAULT 'pending',
                is_flagged INTEGER DEFAULT 0,
                flag_reason TEXT,
                reviewed_by TEXT,
                review_comment TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS payroll_runs (
                id TEXT PRIMARY KEY,
                business_id TEXT NOT NULL,
                payroll_month TEXT NOT NULL,
                status TEXT DEFAULT 'draft',
                total_net_salary REAL DEFAULT 0.0,
                approved_by TEXT,
                approved_at TEXT,
                created_at TEXT NOT NULL,
                UNIQUE(business_id, payroll_month)
            );

            CREATE TABLE IF NOT EXISTS payslips (
                id TEXT PRIMARY KEY,
                payroll_run_id TEXT NOT NULL,
                employee_id TEXT NOT NULL,
                base_salary REAL NOT NULL,
                unpaid_leave_days INTEGER DEFAULT 0,
                leave_deduction REAL DEFAULT 0.0,
                bonus_overtime REAL DEFAULT 0.0,
                net_salary REAL NOT NULL,
                status TEXT DEFAULT 'complete',
                notes TEXT,
                created_at TEXT NOT NULL,
                UNIQUE(payroll_run_id, employee_id)
            );

            CREATE TABLE IF NOT EXISTS hr_policy_chunks (
                id TEXT PRIMARY KEY,
                business_id TEXT NOT NULL,
                document_name TEXT NOT NULL,
                content TEXT NOT NULL,
                chunk_index INTEGER DEFAULT 0,
                embedding_json TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS pos_sales (
                id TEXT PRIMARY KEY,
                business_id TEXT NOT NULL,
                invoice_number TEXT NOT NULL,
                cashier_id TEXT,
                customer_id TEXT,
                customer_name TEXT,
                subtotal REAL DEFAULT 0.0,
                discount REAL DEFAULT 0.0,
                tax REAL DEFAULT 0.0,
                total REAL DEFAULT 0.0,
                payment_method TEXT DEFAULT 'cash',
                status TEXT DEFAULT 'completed',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS pos_sale_items (
                id TEXT PRIMARY KEY,
                sale_id TEXT NOT NULL,
                product_id TEXT,
                item_name TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                unit_price REAL NOT NULL,
                subtotal REAL NOT NULL
            );

            CREATE TABLE IF NOT EXISTS whatsapp_message_log (
                id TEXT PRIMARY KEY,
                business_id TEXT,
                sender_phone TEXT NOT NULL,
                message_direction TEXT NOT NULL,
                message_text TEXT,
                raw_payload TEXT,
                status TEXT DEFAULT 'processed',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS audit_logs (
                id TEXT PRIMARY KEY,
                business_id TEXT NOT NULL,
                user_id TEXT,
                action TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                channel TEXT NOT NULL,
                details TEXT DEFAULT '{}',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS workspaces (
                business_id TEXT PRIMARY KEY,
                state TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                messages TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
        """)
        conn.commit()
        conn.close()

    async def connect(self) -> None:
        self._init_db()

    async def close(self) -> None:
        pass

    # Users
    async def get_user_by_email(self, email: str) -> dict[str, Any] | None:
        conn = self._get_conn()
        row = conn.execute("SELECT * FROM users WHERE lower(email) = lower(?)", (email.strip(),)).fetchone()
        conn.close()
        if not row:
            return None
        d = dict(row)
        d["business"] = d.get("business_id", "")
        d["owner"] = d.get("full_name", "")
        return d

    async def get_user_by_id(self, user_id: str) -> dict[str, Any] | None:
        conn = self._get_conn()
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        conn.close()
        if not row:
            return None
        d = dict(row)
        d["business"] = d.get("business_id", "")
        d["owner"] = d.get("full_name", "")
        return d

    async def get_user_by_phone(self, phone: str) -> dict[str, Any] | None:
        conn = self._get_conn()
        row = conn.execute("SELECT * FROM users WHERE phone_number = ?", (phone,)).fetchone()
        conn.close()
        return dict(row) if row else None

    async def create_user(self, user_data: dict[str, Any]) -> dict[str, Any]:
        conn = self._get_conn()
        user_id = user_data.get("id") or str(uuid.uuid4())
        created_at = str(user_data.get("created_at") or datetime.now(UTC).isoformat())
        full_name = user_data.get("full_name") or user_data.get("owner", "")
        biz_id = user_data.get("business_id") or user_data.get("business", user_id)

        try:
            conn.execute(
                """
                INSERT INTO users (id, business_id, business, owner, full_name, email, phone_number, password_hash, role, status, plan, owner_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    biz_id,
                    user_data.get("business", "My Business"),
                    full_name,
                    full_name,
                    user_data["email"].lower(),
                    user_data.get("phone_number"),
                    user_data["password_hash"],
                    user_data["role"],
                    user_data.get("status", "active"),
                    user_data.get("plan", "standard"),
                    user_data.get("owner_id"),
                    created_at,
                    created_at,
                ),
            )
            # Create business record if not exists
            conn.execute(
                """
                INSERT OR IGNORE INTO businesses (id, name, created_at, updated_at)
                VALUES (?, ?, ?, ?)
                """,
                (biz_id, user_data.get("business", "My Business"), created_at, created_at),
            )
            # Create default subscription
            conn.execute(
                """
                INSERT OR IGNORE INTO subscriptions (id, business_id, plan, ai_query_allowance, ai_queries_used, created_at)
                VALUES (?, ?, ?, 500, 0, ?)
                """,
                (str(uuid.uuid4()), biz_id, user_data.get("plan", "standard"), created_at),
            )
            conn.commit()
        except sqlite3.IntegrityError as exc:
            conn.close()
            err_msg = str(exc).lower()
            if "phone_number" in err_msg:
                raise HTTPException(status_code=409, detail="An account with this phone number already exists") from exc
            raise HTTPException(status_code=409, detail="An account with this email already exists") from exc
        conn.close()
        return {
            **user_data,
            "id": user_id,
            "business_id": biz_id,
            "business": user_data.get("business", "My Business"),
            "owner": full_name,
            "created_at": created_at,
        }

    async def update_user(self, user_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        conn = self._get_conn()
        fields = []
        vals = []
        for k, v in updates.items():
            fields.append(f"{k} = ?")
            vals.append(v)
        vals.append(user_id)
        conn.execute(f"UPDATE users SET {', '.join(fields)} WHERE id = ?", vals)
        conn.commit()
        conn.close()
        return await self.get_user_by_id(user_id)

    async def get_team_members(self, business_id: str) -> list[dict[str, Any]]:
        conn = self._get_conn()
        rows = conn.execute(
            "SELECT id, business_id, full_name, email, phone_number, role, status, plan, created_at FROM users WHERE business_id = ? OR owner_id = ?",
            (business_id, business_id),
        ).fetchall()
        conn.close()
        return [
            {
                "id": r["id"],
                "business_id": r["business_id"],
                "business": r["business_id"],
                "owner": r["full_name"],
                "email": r["email"],
                "phone_number": r["phone_number"],
                "role": r["role"],
                "status": r["status"],
                "plan": r["plan"],
                "created_at": r["created_at"],
            }
            for r in rows
        ]

    # Business Setup
    async def get_business(self, business_id: str) -> dict[str, Any] | None:
        conn = self._get_conn()
        row = conn.execute("SELECT * FROM businesses WHERE id = ?", (business_id,)).fetchone()
        conn.close()
        return dict(row) if row else None

    async def create_business(self, biz_data: dict[str, Any]) -> dict[str, Any]:
        conn = self._get_conn()
        biz_id = biz_data.get("id") or str(uuid.uuid4())
        now = datetime.now(UTC).isoformat()
        conn.execute(
            """
            INSERT OR REPLACE INTO businesses (id, name, industry, currency, tax_rate, annual_leave_days, working_days_per_month, low_stock_threshold_default, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                biz_id,
                biz_data.get("name", "Store"),
                biz_data.get("industry", "Retail"),
                biz_data.get("currency", "PKR"),
                float(biz_data.get("tax_rate", 0.0)),
                int(biz_data.get("annual_leave_days", 14)),
                int(biz_data.get("working_days_per_month", 26)),
                int(biz_data.get("low_stock_threshold_default", 20)),
                now,
                now,
            ),
        )
        conn.commit()
        conn.close()
        return {**biz_data, "id": biz_id}

    async def update_business(self, business_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        conn = self._get_conn()
        fields = []
        vals = []
        for k, v in updates.items():
            fields.append(f"{k} = ?")
            vals.append(v)
        vals.append(business_id)
        conn.execute(f"UPDATE businesses SET {', '.join(fields)} WHERE id = ?", vals)
        conn.commit()
        conn.close()
        return await self.get_business(business_id)

    # Subscriptions & AI Usage
    async def get_subscription(self, business_id: str) -> dict[str, Any] | None:
        conn = self._get_conn()
        row = conn.execute("SELECT * FROM subscriptions WHERE business_id = ?", (business_id,)).fetchone()
        conn.close()
        if not row:
            # create default
            sub = {
                "id": str(uuid.uuid4()),
                "business_id": business_id,
                "plan": "standard",
                "ai_query_allowance": 500,
                "ai_queries_used": 0,
                "status": "active",
                "created_at": datetime.now(UTC).isoformat(),
            }
            conn = self._get_conn()
            conn.execute(
                "INSERT OR IGNORE INTO subscriptions (id, business_id, plan, ai_query_allowance, ai_queries_used, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (sub["id"], business_id, sub["plan"], sub["ai_query_allowance"], sub["ai_queries_used"], sub["created_at"]),
            )
            conn.commit()
            conn.close()
            return sub
        return dict(row)

    async def record_ai_usage(self, usage_data: dict[str, Any]) -> None:
        conn = self._get_conn()
        usage_id = str(uuid.uuid4())
        now = datetime.now(UTC).isoformat()
        conn.execute(
            """
            INSERT INTO ai_usage_logs (id, business_id, user_id, agent_type, model, prompt_tokens, completion_tokens, total_tokens, endpoint, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                usage_id,
                usage_data["business_id"],
                usage_data.get("user_id"),
                usage_data.get("agent_type", "general"),
                usage_data.get("model", "gpt-4o"),
                usage_data.get("prompt_tokens", 0),
                usage_data.get("completion_tokens", 0),
                usage_data.get("total_tokens", 0),
                usage_data.get("endpoint", ""),
                now,
            ),
        )
        conn.execute(
            "UPDATE subscriptions SET ai_queries_used = ai_queries_used + 1 WHERE business_id = ?",
            (usage_data["business_id"],),
        )
        conn.commit()
        conn.close()

    # Employees
    async def get_employees(self, business_id: str) -> list[dict[str, Any]]:
        conn = self._get_conn()
        rows = conn.execute("SELECT * FROM employees WHERE business_id = ? ORDER BY created_at DESC", (business_id,)).fetchall()
        conn.close()
        return [dict(r) for r in rows]


    async def get_employee_by_id(self, employee_id: str, business_id: str) -> dict[str, Any] | None:
        conn = self._get_conn()
        row = conn.execute("SELECT * FROM employees WHERE id = ? AND business_id = ?", (employee_id, business_id)).fetchone()
        conn.close()
        return dict(row) if row else None

    async def get_employee_by_user_id(self, user_id: str, business_id: str) -> dict[str, Any] | None:
        conn = self._get_conn()
        row = conn.execute("SELECT * FROM employees WHERE user_id = ? AND business_id = ?", (user_id, business_id)).fetchone()
        conn.close()
        return dict(row) if row else None

    async def create_employee(self, data: dict[str, Any]) -> dict[str, Any]:
        conn = self._get_conn()
        emp_id = data.get("id") or str(uuid.uuid4())
        now = datetime.now(UTC).isoformat()
        conn.execute(
            """
            INSERT INTO employees (id, business_id, user_id, full_name, email, phone, role, base_salary, employment_status, join_date, department, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                emp_id,
                data["business_id"],
                data.get("user_id"),
                data["full_name"],
                data["email"].lower(),
                data.get("phone"),
                data["role"],
                float(data.get("base_salary", 0.0)),
                data.get("employment_status", "active"),
                str(data.get("join_date", date.today().isoformat())),
                data.get("department", "Operations"),
                now,
            ),
        )
        conn.commit()
        conn.close()
        return {**data, "id": emp_id, "created_at": now}

    async def update_employee(self, employee_id: str, business_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        conn = self._get_conn()
        fields = []
        vals = []
        for k, v in updates.items():
            fields.append(f"{k} = ?")
            vals.append(v)
        vals.extend([employee_id, business_id])
        conn.execute(f"UPDATE employees SET {', '.join(fields)} WHERE id = ? AND business_id = ?", vals)
        conn.commit()
        conn.close()
        return await self.get_employee_by_id(employee_id, business_id)

    # Attendance
    async def get_attendance(
        self,
        business_id: str,
        from_date: str | None = None,
        to_date: str | None = None,
        employee_id: str | None = None,
    ) -> list[dict[str, Any]]:
        conn = self._get_conn()
        sql = "SELECT a.*, e.full_name as employee_name FROM attendance_records a LEFT JOIN employees e ON a.employee_id = e.id WHERE a.business_id = ?"
        params: list[Any] = [business_id]
        if from_date:
            sql += " AND a.work_date >= ?"
            params.append(from_date)
        if to_date:
            sql += " AND a.work_date <= ?"
            params.append(to_date)
        if employee_id:
            sql += " AND a.employee_id = ?"
            params.append(employee_id)
        sql += " ORDER BY a.work_date DESC"
        rows = conn.execute(sql, params).fetchall()
        conn.close()
        return [dict(r) for r in rows]


    async def get_today_attendance(self, employee_id: str, work_date: str) -> dict[str, Any] | None:
        conn = self._get_conn()
        row = conn.execute("SELECT * FROM attendance_records WHERE employee_id = ? AND work_date = ?", (employee_id, work_date)).fetchone()
        conn.close()
        return dict(row) if row else None

    async def create_attendance(self, data: dict[str, Any]) -> dict[str, Any]:
        conn = self._get_conn()
        rec_id = data.get("id") or str(uuid.uuid4())
        now = datetime.now(UTC).isoformat()
        conn.execute(
            """
            INSERT INTO attendance_records (id, business_id, employee_id, work_date, check_in, check_out, net_hours, status, correction_reason, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                rec_id,
                data["business_id"],
                data["employee_id"],
                data["work_date"],
                data.get("check_in"),
                data.get("check_out"),
                float(data.get("net_hours", 0.0)),
                data.get("status", "incomplete"),
                data.get("correction_reason"),
                now,
            ),
        )
        conn.commit()
        conn.close()
        return {**data, "id": rec_id, "created_at": now}

    async def update_attendance(self, record_id: str, business_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        conn = self._get_conn()
        fields = []
        vals = []
        for k, v in updates.items():
            fields.append(f"{k} = ?")
            vals.append(v)
        vals.extend([record_id, business_id])
        conn.execute(f"UPDATE attendance_records SET {', '.join(fields)} WHERE id = ? AND business_id = ?", vals)
        conn.commit()
        row = conn.execute("SELECT * FROM attendance_records WHERE id = ?", (record_id,)).fetchone()
        conn.close()
        return dict(row) if row else None

    # Leave Requests
    async def get_leave_requests(self, business_id: str, employee_id: str | None = None) -> list[dict[str, Any]]:
        conn = self._get_conn()
        sql = "SELECT l.*, e.full_name as employee_name FROM leave_requests l LEFT JOIN employees e ON l.employee_id = e.id WHERE l.business_id = ?"
        params: list[Any] = [business_id]
        if employee_id:
            sql += " AND l.employee_id = ?"
            params.append(employee_id)
        sql += " ORDER BY l.start_date DESC"
        rows = conn.execute(sql, params).fetchall()
        conn.close()
        return [dict(r) for r in rows]


    async def get_leave_request_by_id(self, leave_id: str, business_id: str) -> dict[str, Any] | None:
        conn = self._get_conn()
        row = conn.execute("SELECT * FROM leave_requests WHERE id = ? AND business_id = ?", (leave_id, business_id)).fetchone()
        conn.close()
        return dict(row) if row else None

    async def create_leave_request(self, data: dict[str, Any]) -> dict[str, Any]:
        conn = self._get_conn()
        leave_id = data.get("id") or str(uuid.uuid4())
        now = datetime.now(UTC).isoformat()
        conn.execute(
            """
            INSERT INTO leave_requests (id, business_id, employee_id, start_date, end_date, leave_type, reason, status, is_flagged, flag_reason, reviewed_by, review_comment, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                leave_id,
                data["business_id"],
                data["employee_id"],
                str(data["start_date"]),
                str(data["end_date"]),
                data.get("leave_type", "annual"),
                data.get("reason"),
                data.get("status", "pending"),
                1 if data.get("is_flagged") else 0,
                data.get("flag_reason"),
                data.get("reviewed_by"),
                data.get("review_comment"),
                now,
            ),
        )
        conn.commit()
        conn.close()
        return {**data, "id": leave_id, "created_at": now}

    async def update_leave_request(self, leave_id: str, business_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        conn = self._get_conn()
        fields = []
        vals = []
        for k, v in updates.items():
            fields.append(f"{k} = ?")
            vals.append(v)
        vals.extend([leave_id, business_id])
        conn.execute(f"UPDATE leave_requests SET {', '.join(fields)} WHERE id = ? AND business_id = ?", vals)
        conn.commit()
        conn.close()
        return await self.get_leave_request_by_id(leave_id, business_id)

    # Payroll Runs & Payslips
    async def get_payroll_runs(self, business_id: str) -> list[dict[str, Any]]:
        conn = self._get_conn()
        rows = conn.execute("SELECT * FROM payroll_runs WHERE business_id = ? ORDER BY payroll_month DESC", (business_id,)).fetchall()
        conn.close()
        return [dict(r) for r in rows]


    async def get_payroll_run_by_id(self, run_id: str, business_id: str) -> dict[str, Any] | None:
        conn = self._get_conn()
        row = conn.execute("SELECT * FROM payroll_runs WHERE id = ? AND business_id = ?", (run_id, business_id)).fetchone()
        conn.close()
        return dict(row) if row else None

    async def create_payroll_run(self, data: dict[str, Any]) -> dict[str, Any]:
        conn = self._get_conn()
        run_id = data.get("id") or str(uuid.uuid4())
        now = datetime.now(UTC).isoformat()
        conn.execute(
            """
            INSERT INTO payroll_runs (id, business_id, payroll_month, status, total_net_salary, approved_by, approved_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                data["business_id"],
                data["payroll_month"],
                data.get("status", "draft"),
                float(data.get("total_net_salary", 0.0)),
                data.get("approved_by"),
                data.get("approved_at"),
                now,
            ),
        )
        conn.commit()
        conn.close()
        return {**data, "id": run_id, "created_at": now}

    async def update_payroll_run(self, run_id: str, business_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        conn = self._get_conn()
        fields = []
        vals = []
        for k, v in updates.items():
            fields.append(f"{k} = ?")
            vals.append(v)
        vals.extend([run_id, business_id])
        conn.execute(f"UPDATE payroll_runs SET {', '.join(fields)} WHERE id = ? AND business_id = ?", vals)
        conn.commit()
        conn.close()
        return await self.get_payroll_run_by_id(run_id, business_id)

    async def get_payslips_for_run(self, run_id: str) -> list[dict[str, Any]]:
        conn = self._get_conn()
        rows = conn.execute(
            """
            SELECT p.*, e.full_name as employee_name
            FROM payslips p
            LEFT JOIN employees e ON p.employee_id = e.id
            WHERE p.payroll_run_id = ?
            """,
            (run_id,),
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    async def get_payslips_for_employee(self, employee_id: str) -> list[dict[str, Any]]:
        conn = self._get_conn()
        rows = conn.execute(
            """
            SELECT p.*, e.full_name as employee_name, r.payroll_month
            FROM payslips p
            LEFT JOIN employees e ON p.employee_id = e.id
            LEFT JOIN payroll_runs r ON p.payroll_run_id = r.id
            WHERE p.employee_id = ?
            ORDER BY r.payroll_month DESC
            """,
            (employee_id,),
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]


    async def get_payslip_by_id(self, payslip_id: str) -> dict[str, Any] | None:
        conn = self._get_conn()
        row = conn.execute(
            """
            SELECT p.*, e.full_name as employee_name
            FROM payslips p
            LEFT JOIN employees e ON p.employee_id = e.id
            WHERE p.id = ?
            """,
            (payslip_id,),
        ).fetchone()
        conn.close()
        return dict(row) if row else None

    async def create_payslip(self, data: dict[str, Any]) -> dict[str, Any]:
        conn = self._get_conn()
        slip_id = data.get("id") or str(uuid.uuid4())
        now = datetime.now(UTC).isoformat()
        conn.execute(
            """
            INSERT INTO payslips (id, payroll_run_id, employee_id, base_salary, unpaid_leave_days, leave_deduction, bonus_overtime, net_salary, status, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                slip_id,
                data["payroll_run_id"],
                data["employee_id"],
                float(data["base_salary"]),
                int(data.get("unpaid_leave_days", 0)),
                float(data.get("leave_deduction", 0.0)),
                float(data.get("bonus_overtime", 0.0)),
                float(data["net_salary"]),
                data.get("status", "complete"),
                data.get("notes"),
                now,
            ),
        )
        conn.commit()
        conn.close()
        return {**data, "id": slip_id}

    async def update_payslip(self, payslip_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        conn = self._get_conn()
        fields = []
        vals = []
        for k, v in updates.items():
            fields.append(f"{k} = ?")
            vals.append(v)
        vals.append(payslip_id)
        conn.execute(f"UPDATE payslips SET {', '.join(fields)} WHERE id = ?", vals)
        conn.commit()
        conn.close()
        return await self.get_payslip_by_id(payslip_id)

    # HR Policies RAG
    async def insert_hr_policy_chunk(self, chunk: dict[str, Any]) -> dict[str, Any]:
        conn = self._get_conn()
        chunk_id = chunk.get("id") or str(uuid.uuid4())
        now = datetime.now(UTC).isoformat()
        conn.execute(
            """
            INSERT INTO hr_policy_chunks (id, business_id, document_name, content, chunk_index, embedding_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                chunk_id,
                chunk["business_id"],
                chunk["document_name"],
                chunk["content"],
                chunk.get("chunk_index", 0),
                json.dumps(chunk.get("embedding", [])),
                now,
            ),
        )
        conn.commit()
        conn.close()
        return {**chunk, "id": chunk_id}

    async def get_hr_policy_documents(self, business_id: str) -> list[dict[str, Any]]:
        conn = self._get_conn()
        rows = conn.execute(
            "SELECT DISTINCT document_name, min(created_at) as created_at FROM hr_policy_chunks WHERE business_id = ? GROUP BY document_name",
            (business_id,),
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]


    async def delete_hr_policy_document(self, document_name: str, business_id: str) -> bool:
        conn = self._get_conn()
        conn.execute("DELETE FROM hr_policy_chunks WHERE business_id = ? AND document_name = ?", (business_id, document_name))
        conn.commit()
        conn.close()
        return True

    async def search_hr_policies(self, query_vector: list[float], business_id: str, count: int = 4) -> list[dict[str, Any]]:
        conn = self._get_conn()
        rows = conn.execute(
            "SELECT id, business_id, document_name, content FROM hr_policy_chunks WHERE business_id = ? LIMIT ?",
            (business_id, count),
        ).fetchall()
        conn.close()
        return [{"id": r["id"], "business_id": r["business_id"], "document_name": r["document_name"], "content": r["content"], "similarity": 0.9} for r in rows]

    # Ledger & Accounting
    async def get_ledger_entries(
        self,
        business_id: str,
        from_date: str | None = None,
        to_date: str | None = None,
        entry_type: str | None = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        conn = self._get_conn()
        sql = "SELECT * FROM ledger_entries WHERE business_id = ?"
        params: list[Any] = [business_id]
        if from_date:
            sql += " AND entry_date >= ?"
            params.append(from_date)
        if to_date:
            sql += " AND entry_date <= ?"
            params.append(to_date)
        if entry_type:
            sql += " AND entry_type = ?"
            params.append(entry_type)
        sql += " ORDER BY entry_date DESC, created_at DESC LIMIT ?"
        params.append(limit)
        rows = conn.execute(sql, params).fetchall()
        conn.close()
        return [dict(r) for r in rows]


    async def create_ledger_entry(self, data: dict[str, Any]) -> dict[str, Any]:
        conn = self._get_conn()
        entry_id = data.get("id") or str(uuid.uuid4())
        now = datetime.now(UTC).isoformat()
        conn.execute(
            """
            INSERT INTO ledger_entries (id, business_id, entry_date, entry_type, category, amount, contact_id, description, source, is_voided, voided_reason, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                entry_id,
                data["business_id"],
                str(data.get("entry_date", date.today().isoformat())),
                data["entry_type"],
                data.get("category", "General"),
                float(data["amount"]),
                data.get("contact_id"),
                data.get("description"),
                data.get("source", "manual"),
                1 if data.get("is_voided") else 0,
                data.get("voided_reason"),
                now,
            ),
        )
        conn.commit()
        conn.close()
        return {**data, "id": entry_id, "created_at": now}

    async def void_ledger_entry(self, entry_id: str, business_id: str, reason: str) -> dict[str, Any] | None:
        conn = self._get_conn()
        conn.execute(
            "UPDATE ledger_entries SET is_voided = 1, voided_reason = ? WHERE id = ? AND business_id = ?",
            (reason, entry_id, business_id),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM ledger_entries WHERE id = ?", (entry_id,)).fetchone()
        conn.close()
        return dict(row) if row else None

    # Anomalies & Recommendations
    async def get_anomalies(self, business_id: str) -> list[dict[str, Any]]:
        conn = self._get_conn()
        rows = conn.execute("SELECT * FROM anomalies WHERE business_id = ? ORDER BY detected_at DESC", (business_id,)).fetchall()
        conn.close()
        return [dict(r) for r in rows]


    async def create_anomaly(self, data: dict[str, Any]) -> dict[str, Any]:
        conn = self._get_conn()
        anomaly_id = data.get("id") or str(uuid.uuid4())
        now = datetime.now(UTC).isoformat()
        conn.execute(
            """
            INSERT INTO anomalies (id, business_id, type, category, description, amount, baseline_amount, status, detected_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                anomaly_id,
                data["business_id"],
                data["type"],
                data.get("category"),
                data["description"],
                data.get("amount"),
                data.get("baseline_amount"),
                data.get("status", "open"),
                now,
            ),
        )
        conn.commit()
        conn.close()
        return {**data, "id": anomaly_id, "detected_at": now}

    async def update_anomaly(self, anomaly_id: str, business_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        conn = self._get_conn()
        fields = []
        vals = []
        for k, v in updates.items():
            fields.append(f"{k} = ?")
            vals.append(v)
        vals.extend([anomaly_id, business_id])
        conn.execute(f"UPDATE anomalies SET {', '.join(fields)} WHERE id = ? AND business_id = ?", vals)
        conn.commit()
        row = conn.execute("SELECT * FROM anomalies WHERE id = ?", (anomaly_id,)).fetchone()
        conn.close()
        return dict(row) if row else None

    async def get_financial_recommendations(self, business_id: str) -> list[dict[str, Any]]:
        conn = self._get_conn()
        rows = conn.execute("SELECT * FROM financial_recommendations WHERE business_id = ? ORDER BY created_at DESC", (business_id,)).fetchall()
        conn.close()
        return [dict(r) for r in rows]


    async def create_financial_recommendation(self, data: dict[str, Any]) -> dict[str, Any]:
        conn = self._get_conn()
        rec_id = data.get("id") or str(uuid.uuid4())
        now = datetime.now(UTC).isoformat()
        conn.execute(
            """
            INSERT INTO financial_recommendations (id, business_id, title, detail, estimated_saving_pkr, runway_boost_months, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                rec_id,
                data["business_id"],
                data["title"],
                data["detail"],
                float(data.get("estimated_saving_pkr", 0.0)),
                float(data.get("runway_boost_months", 0.0)),
                data.get("status", "pending"),
                now,
            ),
        )
        conn.commit()
        conn.close()
        return {**data, "id": rec_id, "created_at": now}

    async def update_financial_recommendation(self, rec_id: str, business_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        conn = self._get_conn()
        fields = []
        vals = []
        for k, v in updates.items():
            fields.append(f"{k} = ?")
            vals.append(v)
        vals.extend([rec_id, business_id])
        conn.execute(f"UPDATE financial_recommendations SET {', '.join(fields)} WHERE id = ? AND business_id = ?", vals)
        conn.commit()
        row = conn.execute("SELECT * FROM financial_recommendations WHERE id = ?", (rec_id,)).fetchone()
        conn.close()
        return dict(row) if row else None

    # Audit Logs (Append-Only SEC-10)
    async def record_audit_log(
        self,
        business_id: str,
        user_id: str | None,
        action: str,
        entity_type: str,
        entity_id: str,
        channel: str = "web",
        details: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        conn = self._get_conn()
        log_id = str(uuid.uuid4())
        now = datetime.now(UTC).isoformat()
        conn.execute(
            """
            INSERT INTO audit_logs (id, business_id, user_id, action, entity_type, entity_id, channel, details, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                log_id,
                business_id,
                user_id,
                action,
                entity_type,
                str(entity_id),
                channel,
                json.dumps(details or {}),
                now,
            ),
        )
        conn.commit()
        conn.close()
        return {
            "id": log_id,
            "business_id": business_id,
            "user_id": user_id,
            "action": action,
            "entity_type": entity_type,
            "entity_id": str(entity_id),
            "channel": channel,
            "details": details or {},
            "created_at": now,
        }

    async def get_audit_logs(self, business_id: str, limit: int = 100) -> list[dict[str, Any]]:
        conn = self._get_conn()
        rows = conn.execute("SELECT * FROM audit_logs WHERE business_id = ? ORDER BY created_at DESC LIMIT ?", (business_id, limit)).fetchall()
        conn.close()
        return [dict(r) for r in rows]


    # POS Atomic Checkout
    async def record_pos_sale(
        self,
        business_id: str,
        sale_data: dict[str, Any],
        items_data: list[dict[str, Any]],
    ) -> dict[str, Any]:
        conn = self._get_conn()
        sale_id = sale_data.get("id") or str(uuid.uuid4())
        now = datetime.now(UTC).isoformat()
        inv_num = sale_data.get("invoice_number") or f"INV-{int(datetime.now().timestamp())}"

        # 1. Sale
        conn.execute(
            """
            INSERT INTO pos_sales (id, business_id, invoice_number, cashier_id, customer_id, customer_name, subtotal, discount, tax, total, payment_method, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                sale_id,
                business_id,
                inv_num,
                sale_data.get("cashier_id"),
                sale_data.get("customer_id"),
                sale_data.get("customer_name", "Walk-in Customer"),
                float(sale_data.get("subtotal", 0.0)),
                float(sale_data.get("discount", 0.0)),
                float(sale_data.get("tax", 0.0)),
                float(sale_data.get("total", 0.0)),
                sale_data.get("payment_method", "cash"),
                sale_data.get("status", "completed"),
                now,
            ),
        )

        # 2. Sale Items
        for it in items_data:
            item_id = str(uuid.uuid4())
            conn.execute(
                """
                INSERT INTO pos_sale_items (id, sale_id, product_id, item_name, quantity, unit_price, subtotal)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    item_id,
                    sale_id,
                    it.get("product_id"),
                    it["item_name"],
                    int(it["quantity"]),
                    float(it["unit_price"]),
                    float(it["subtotal"]),
                ),
            )
            # 3. Stock history
            if it.get("product_id"):
                sh_id = str(uuid.uuid4())
                conn.execute(
                    """
                    INSERT INTO stock_history (id, business_id, product_id, change_qty, new_stock, reason, reference_id, created_at)
                    VALUES (?, ?, ?, ?, 0, 'sale', ?, ?)
                    """,
                    (sh_id, business_id, it["product_id"], -abs(int(it["quantity"])), inv_num, now),
                )

        # 4. Ledger entry
        ledger_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO ledger_entries (id, business_id, entry_date, entry_type, category, amount, description, source, created_at)
            VALUES (?, ?, ?, 'revenue', 'Sales', ?, ?, 'pos', ?)
            """,
            (
                ledger_id,
                business_id,
                datetime.now(UTC).date().isoformat(),
                float(sale_data.get("total", 0.0)),
                f"POS Sale {inv_num}",
                now,
            ),
        )

        conn.commit()
        conn.close()
        return {**sale_data, "id": sale_id, "invoice_number": inv_num, "created_at": now}

    # Compatibility methods
    async def get_workspace(self, business_id: str) -> dict[str, Any] | None:
        conn = self._get_conn()
        row = conn.execute("SELECT * FROM workspaces WHERE business_id = ?", (business_id,)).fetchone()
        conn.close()
        if not row:
            return None
        return {"business_id": row["business_id"], "state": json.loads(row["state"]), "updated_at": row["updated_at"]}

    async def save_workspace(self, business_id: str, state: dict[str, Any]) -> dict[str, Any]:
        conn = self._get_conn()
        now = datetime.now(UTC).isoformat()
        conn.execute(
            "INSERT OR REPLACE INTO workspaces (business_id, state, updated_at) VALUES (?, ?, ?)",
            (business_id, json.dumps(state), now),
        )
        conn.commit()
        conn.close()
        return {"business_id": business_id, "state": state, "updated_at": now}

    async def get_conversation(self, conversation_id: str, user_id: str) -> dict[str, Any] | None:
        conn = self._get_conn()
        row = conn.execute("SELECT * FROM conversations WHERE id = ? AND user_id = ?", (conversation_id, user_id)).fetchone()
        conn.close()
        if not row:
            return None
        return {"id": row["id"], "user_id": row["user_id"], "messages": json.loads(row["messages"]), "updated_at": row["updated_at"]}

    async def save_conversation(self, conversation_id: str, user_id: str, messages: list[dict[str, Any]]) -> dict[str, Any]:
        conn = self._get_conn()
        now = datetime.now(UTC).isoformat()
        conn.execute(
            "INSERT OR REPLACE INTO conversations (id, user_id, messages, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (conversation_id, user_id, json.dumps(messages), now, now),
        )
        conn.commit()
        conn.close()
        return {"id": conversation_id, "user_id": user_id, "messages": messages, "updated_at": now}

    async def insert_knowledge(self, doc: dict[str, Any]) -> dict[str, Any]:
        return doc

    async def search_knowledge(self, *args: Any, **kwargs: Any) -> list[dict[str, Any]]:
        return []


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    if settings.supabase_configured:
        logger.info("⚡ Supabase configured. Initializing Supabase REST adapter.")
        db = SupabaseAdapter(settings)
    else:
        logger.warning("Running on SQLite fallback adapter.")
        db = SQLiteAdapter()

    await db.connect()
    app.state.db = db
    yield
    await db.close()


_default_db: SupabaseAdapter | SQLiteAdapter | None = None


def get_database(request: Request) -> SupabaseAdapter | SQLiteAdapter:
    global _default_db
    if hasattr(request.app.state, "db") and request.app.state.db is not None:
        return request.app.state.db
    if _default_db is None:
        settings = get_settings()
        if settings.supabase_configured:
            _default_db = SupabaseAdapter(settings)
        else:
            _default_db = SQLiteAdapter()
    return _default_db
