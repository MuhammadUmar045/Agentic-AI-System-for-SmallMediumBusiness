import asyncio
from datetime import UTC, date, datetime, timedelta
import json
import os
import sys
import uuid

# Ensure backend directory is in path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app.database import SQLiteAdapter
from app.security import hash_password

BIZ_ID = "b0000000-0000-0000-0000-000000000001"
BUSINESS_NAME = "Al-Madina Cash & Carry"

SEED_USERS = [
    {
        "id": "u0000000-0000-0000-0000-000000000001",
        "full_name": "Haji Tariq Mehmood",
        "email": "owner@almadina.com",
        "password": "OwnerPass123!",
        "role": "owner",
        "phone_number": "+923001234567",
    },
    {
        "id": "u0000000-0000-0000-0000-000000000002",
        "full_name": "Bilal Ahmed",
        "email": "manager@almadina.com",
        "password": "ManagerPass123!",
        "role": "manager",
        "phone_number": "+923001234568",
    },
    {
        "id": "u0000000-0000-0000-0000-000000000003",
        "full_name": "Sana Rasheed",
        "email": "hr@almadina.com",
        "password": "HrPass123!",
        "role": "hr_officer",
        "phone_number": "+923001234569",
    },
    {
        "id": "u0000000-0000-0000-0000-000000000004",
        "full_name": "Hamza Ali",
        "email": "cashier@almadina.com",
        "password": "CashierPass123!",
        "role": "cashier",
        "phone_number": "+923001234570",
    },
    {
        "id": "u0000000-0000-0000-0000-000000000005",
        "full_name": "Usman Ghani",
        "email": "staff1@almadina.com",
        "password": "StaffPass123!",
        "role": "staff",
        "phone_number": "+923001234571",
    },
    {
        "id": "u0000000-0000-0000-0000-000000000006",
        "full_name": "Zeeshan Khan",
        "email": "staff2@almadina.com",
        "password": "StaffPass123!",
        "role": "staff",
        "phone_number": "+923001234572",
    },
]

SEED_EMPLOYEES = [
    {
        "id": "e0000000-0000-0000-0000-000000000001",
        "user_id": "u0000000-0000-0000-0000-000000000001",
        "full_name": "Haji Tariq Mehmood",
        "email": "owner@almadina.com",
        "phone": "+923001234567",
        "role": "owner",
        "base_salary": 120000.0,
        "department": "Executive",
        "join_date": "2024-01-01",
    },
    {
        "id": "e0000000-0000-0000-0000-000000000002",
        "user_id": "u0000000-0000-0000-0000-000000000002",
        "full_name": "Bilal Ahmed",
        "email": "manager@almadina.com",
        "phone": "+923001234568",
        "role": "manager",
        "base_salary": 85000.0,
        "department": "Store Operations",
        "join_date": "2024-03-01",
    },
    {
        "id": "e0000000-0000-0000-0000-000000000003",
        "user_id": "u0000000-0000-0000-0000-000000000003",
        "full_name": "Sana Rasheed",
        "email": "hr@almadina.com",
        "phone": "+923001234569",
        "role": "hr_officer",
        "base_salary": 75000.0,
        "department": "Human Resources",
        "join_date": "2024-04-15",
    },
    {
        "id": "e0000000-0000-0000-0000-000000000004",
        "user_id": "u0000000-0000-0000-0000-000000000004",
        "full_name": "Hamza Ali",
        "email": "cashier@almadina.com",
        "phone": "+923001234570",
        "role": "cashier",
        "base_salary": 45000.0,
        "department": "Sales Counter",
        "join_date": "2024-06-01",
    },
    {
        "id": "e0000000-0000-0000-0000-000000000005",
        "user_id": "u0000000-0000-0000-0000-000000000005",
        "full_name": "Usman Ghani",
        "email": "staff1@almadina.com",
        "phone": "+923001234571",
        "role": "staff",
        "base_salary": 38000.0,
        "department": "Inventory & Stocking",
        "join_date": "2024-07-10",
    },
    {
        "id": "e0000000-0000-0000-0000-000000000006",
        "user_id": "u0000000-0000-0000-0000-000000000006",
        "full_name": "Zeeshan Khan",
        "email": "staff2@almadina.com",
        "phone": "+923001234572",
        "role": "staff",
        "base_salary": 38000.0,
        "department": "Floor Logistics",
        "join_date": "2024-08-01",
    },
    {
        "id": "e0000000-0000-0000-0000-000000000007",
        "user_id": None,
        "full_name": "Maryam Bibi",
        "email": "maryam@almadina.com",
        "phone": "+923001234573",
        "role": "staff",
        "base_salary": 40000.0,
        "department": "Customer Relations",
        "join_date": "2024-08-15",
    },
    {
        "id": "e0000000-0000-0000-0000-000000000008",
        "user_id": None,
        "full_name": "Farhan Siddiqui",
        "email": "farhan@almadina.com",
        "phone": "+923001234574",
        "role": "staff",
        "base_salary": 36000.0,
        "department": "Security & Gatekeeper",
        "join_date": "2024-09-01",
    },
]

SEED_PRODUCTS = [
    {"sku": "RIC-001", "barcode": "896400011001", "name": "Super Basmati Rice 5kg", "category": "Grains & Staples", "price": 1850.0, "cost": 1550.0, "stock": 45, "threshold": 20},
    {"sku": "OIL-002", "barcode": "896400011002", "name": "Pure Sunflower Oil 1L", "category": "Oils & Ghee", "price": 580.0, "cost": 490.0, "stock": 18, "threshold": 25},
    {"sku": "TEA-003", "barcode": "896400011003", "name": "Premium Danedar Tea 950g", "category": "Beverages", "price": 1450.0, "cost": 1200.0, "stock": 32, "threshold": 15},
    {"sku": "DET-004", "barcode": "896400011004", "name": "Max Clean Washing Powder 1kg", "category": "Household", "price": 420.0, "cost": 330.0, "stock": 85, "threshold": 30},
    {"sku": "MLK-005", "barcode": "896400011005", "name": "Whole Milk Tetra Pack 1L", "category": "Dairy", "price": 280.0, "cost": 240.0, "stock": 60, "threshold": 30},
    {"sku": "SUG-006", "barcode": "896400011006", "name": "Refined White Sugar 5kg", "category": "Grains & Staples", "price": 750.0, "cost": 650.0, "stock": 50, "threshold": 25},
    {"sku": "FLR-007", "barcode": "896400011007", "name": "Whole Wheat Chakki Atta 10kg", "category": "Grains & Staples", "price": 1380.0, "cost": 1200.0, "stock": 28, "threshold": 20},
    {"sku": "GHE-008", "barcode": "896400011008", "name": "Banaspati Ghee 1kg Pouch", "category": "Oils & Ghee", "price": 540.0, "cost": 460.0, "stock": 22, "threshold": 20},
    {"sku": "PUL-009", "barcode": "896400011009", "name": "Daal Masoor Special 1kg", "category": "Grains & Staples", "price": 340.0, "cost": 280.0, "stock": 40, "threshold": 15},
    {"sku": "PUL-010", "barcode": "896400011010", "name": "Daal Chana Premium 1kg", "category": "Grains & Staples", "price": 290.0, "cost": 240.0, "stock": 35, "threshold": 15},
    {"sku": "SPY-011", "barcode": "896400011011", "name": "Red Chilli Powder 400g", "category": "Spices", "price": 390.0, "cost": 310.0, "stock": 48, "threshold": 15},
    {"sku": "SPY-012", "barcode": "896400011012", "name": "Turmeric Powder 400g", "category": "Spices", "price": 320.0, "cost": 250.0, "stock": 52, "threshold": 15},
    {"sku": "SPY-013", "barcode": "896400011013", "name": "Iodized Table Salt 800g", "category": "Spices", "price": 60.0, "cost": 42.0, "stock": 120, "threshold": 40},
    {"sku": "BEV-014", "barcode": "896400011014", "name": "Instant Coffee Jar 100g", "category": "Beverages", "price": 950.0, "cost": 780.0, "stock": 25, "threshold": 10},
    {"sku": "BEV-015", "barcode": "896400011015", "name": "Green Tea Bags 30s", "category": "Beverages", "price": 380.0, "cost": 290.0, "stock": 30, "threshold": 12},
    {"sku": "SNK-016", "barcode": "896400011016", "name": "Digestive Wheat Biscuits 150g", "category": "Snacks & Bakery", "price": 120.0, "cost": 92.0, "stock": 90, "threshold": 30},
    {"sku": "SNK-017", "barcode": "896400011017", "name": "Wavy Potato Chips Masala 65g", "category": "Snacks & Bakery", "price": 80.0, "cost": 62.0, "stock": 110, "threshold": 40},
    {"sku": "SNK-018", "barcode": "896400011018", "name": "Plain Plain Rusk 300g", "category": "Snacks & Bakery", "price": 160.0, "cost": 120.0, "stock": 45, "threshold": 15},
    {"sku": "DAI-019", "barcode": "896400011019", "name": "Salted Butter 200g", "category": "Dairy", "price": 380.0, "cost": 310.0, "stock": 24, "threshold": 12},
    {"sku": "DAI-020", "barcode": "896400011020", "name": "Cheddar Cheese Block 200g", "category": "Dairy", "price": 620.0, "cost": 510.0, "stock": 16, "threshold": 10},
    {"sku": "HSH-021", "barcode": "896400011021", "name": "Dishwashing Liquid Gel 500ml", "category": "Household", "price": 290.0, "cost": 220.0, "stock": 40, "threshold": 15},
    {"sku": "HSH-022", "barcode": "896400011022", "name": "Surface Cleaner Pine 1L", "category": "Household", "price": 460.0, "cost": 360.0, "stock": 30, "threshold": 12},
    {"sku": "HSH-023", "barcode": "896400011023", "name": "Kitchen Towel Roll 2s", "category": "Household", "price": 280.0, "cost": 210.0, "stock": 50, "threshold": 15},
    {"sku": "PER-024", "barcode": "896400011024", "name": "Antibacterial Bath Soap 135g", "category": "Personal Care", "price": 140.0, "cost": 105.0, "stock": 140, "threshold": 40},
    {"sku": "PER-025", "barcode": "896400011025", "name": "Herbal Toothpaste 140g", "category": "Personal Care", "price": 260.0, "cost": 195.0, "stock": 70, "threshold": 20},
    {"sku": "PER-026", "barcode": "896400011026", "name": "Anti-Dandruff Shampoo 375ml", "category": "Personal Care", "price": 680.0, "cost": 540.0, "stock": 35, "threshold": 15},
    {"sku": "PER-027", "barcode": "896400011027", "name": "Hand Sanitizer Gel 250ml", "category": "Personal Care", "price": 220.0, "cost": 160.0, "stock": 60, "threshold": 15},
    {"sku": "CON-028", "barcode": "896400011028", "name": "Tomato Ketchup Pouch 800g", "category": "Condiments", "price": 380.0, "cost": 290.0, "stock": 42, "threshold": 15},
]

SEED_CONTACTS = [
    {"name": "Al-Baraka Grain Mills", "type": "supplier", "email": "orders@albarakagrains.com", "phone": "+923015550192", "debit": 0.0},
    {"name": "Punjab Oil Corp", "type": "supplier", "email": "supply@punjaboilcorp.com", "phone": "+923124440819", "debit": 0.0},
    {"name": "Zainab Bakers & Cafe", "type": "customer", "email": "zainabbakers@gmail.com", "phone": "+923004445566", "debit": 48500.0},
    {"name": "Chaudhry General Store", "type": "customer", "email": "chaudhrystore@yahoo.com", "phone": "+923218889900", "debit": 23000.0},
]


async def seed():
    print(f"[*] Starting Idempotent Demo Seeding for '{BUSINESS_NAME}'...")
    db = SQLiteAdapter()

    now_iso = datetime.now(UTC).isoformat()
    today = date.today()

    conn = db._get_conn()
    with conn:
        # 1. Upsert Business
        conn.execute(
            """
            INSERT INTO businesses (id, name, industry, currency, tax_rate, annual_leave_allowance, annual_leave_days, working_days_per_month, low_stock_threshold_default, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                industry = excluded.industry,
                currency = excluded.currency,
                annual_leave_allowance = excluded.annual_leave_allowance,
                working_days_per_month = excluded.working_days_per_month,
                low_stock_threshold_default = excluded.low_stock_threshold_default,
                updated_at = excluded.updated_at
            """,
            (BIZ_ID, BUSINESS_NAME, "Retail Cash & Carry", "PKR", 0.0, 14, 14, 26, 10, now_iso, now_iso),
        )

        # 2. Upsert Subscription
        sub_id = f"sub-{BIZ_ID[:8]}"
        conn.execute(
            """
            INSERT INTO subscriptions (id, business_id, plan, status, ai_query_allowance, ai_queries_used, current_period_end, created_at)
            VALUES (?, ?, 'standard', 'active', 500, 12, ?, ?)
            ON CONFLICT(business_id) DO UPDATE SET
                plan = excluded.plan,
                ai_query_allowance = excluded.ai_query_allowance,
                ai_queries_used = 12
            """,
            (sub_id, BIZ_ID, (today + timedelta(days=30)).isoformat(), now_iso),
        )

        # 3. Upsert Users
        for u in SEED_USERS:
            pw_hash = hash_password(u["password"])
            conn.execute(
                """
                INSERT INTO users (id, business_id, email, password_hash, full_name, role, phone_number, status, failed_login_count, created_at, updated_at, business, owner)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 0, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    business_id = excluded.business_id,
                    email = excluded.email,
                    password_hash = excluded.password_hash,
                    full_name = excluded.full_name,
                    role = excluded.role,
                    phone_number = excluded.phone_number,
                    status = 'active',
                    updated_at = excluded.updated_at
                """,
                (u["id"], BIZ_ID, u["email"], pw_hash, u["full_name"], u["role"], u["phone_number"], now_iso, now_iso, BUSINESS_NAME, u["full_name"]),
            )

        # 4. Upsert Employees
        for emp in SEED_EMPLOYEES:
            conn.execute(
                """
                INSERT INTO employees (id, business_id, user_id, full_name, email, phone, role, base_salary, employment_status, join_date, department, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    user_id = excluded.user_id,
                    full_name = excluded.full_name,
                    email = excluded.email,
                    phone = excluded.phone,
                    role = excluded.role,
                    base_salary = excluded.base_salary,
                    department = excluded.department
                """,
                (emp["id"], BIZ_ID, emp["user_id"], emp["full_name"], emp["email"], emp["phone"], emp["role"], emp["base_salary"], emp["join_date"], emp["department"], now_iso),
            )

        # 5. Seed 30 Days of Attendance
        print("[*] Seeding 30 days of attendance records...")
        for day_offset in range(30):
            cur_date = today - timedelta(days=day_offset)
            date_str = cur_date.isoformat()
            if cur_date.weekday() == 6:  # Skip Sunday
                continue

            for emp in SEED_EMPLOYEES:
                att_id = f"att-{emp['id'][-4:]}-{date_str}"
                is_incomplete = (day_offset == 2 and emp["role"] in ("cashier", "staff"))
                check_in = f"{date_str}T09:00:00Z"
                check_out = None if is_incomplete else f"{date_str}T17:00:00Z"
                net_hours = 0.0 if is_incomplete else 8.0
                status = "incomplete" if is_incomplete else "present"

                conn.execute(
                    """
                    INSERT INTO attendance_records (id, business_id, employee_id, work_date, check_in, check_out, net_hours, status, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        check_in = excluded.check_in,
                        check_out = excluded.check_out,
                        net_hours = excluded.net_hours,
                        status = excluded.status
                    """,
                    (att_id, BIZ_ID, emp["id"], date_str, check_in, check_out, net_hours, status, now_iso),
                )

        # 6. Seed 3 Leave Requests
        print("[*] Seeding leave requests...")
        leaves_data = [
            {
                "id": "l0000000-0000-0000-0000-000000000001",
                "employee_id": SEED_EMPLOYEES[3]["id"],  # Hamza Ali
                "start_date": (today - timedelta(days=12)).isoformat(),
                "end_date": (today - timedelta(days=10)).isoformat(),
                "leave_type": "annual",
                "reason": "Family wedding in Faisalabad",
                "status": "approved",
                "is_flagged": 0,
            },
            {
                "id": "l0000000-0000-0000-0000-000000000002",
                "employee_id": SEED_EMPLOYEES[4]["id"],  # Usman Ghani
                "start_date": (today - timedelta(days=6)).isoformat(),
                "end_date": (today - timedelta(days=5)).isoformat(),
                "leave_type": "unpaid",
                "reason": "Personal urgent family travel",
                "status": "approved",
                "is_flagged": 0,
            },
            {
                "id": "l0000000-0000-0000-0000-000000000003",
                "employee_id": SEED_EMPLOYEES[5]["id"],  # Zeeshan Khan
                "start_date": (today + timedelta(days=3)).isoformat(),
                "end_date": (today + timedelta(days=5)).isoformat(),
                "leave_type": "casual",
                "reason": "Home renovation work",
                "status": "pending",
                "is_flagged": 0,
            },
        ]
        for lv in leaves_data:
            conn.execute(
                """
                INSERT INTO leave_requests (id, business_id, employee_id, start_date, end_date, leave_type, reason, status, is_flagged, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET status = excluded.status
                """,
                (lv["id"], BIZ_ID, lv["employee_id"], lv["start_date"], lv["end_date"], lv["leave_type"], lv["reason"], lv["status"], lv["is_flagged"], now_iso),
            )

        # 7. Seed Draft Payroll Run with Payslips
        print("[*] Seeding payroll run and employee payslips...")
        payroll_month = today.strftime("%Y-%m")
        run_id = f"pr-{payroll_month}-{BIZ_ID[:8]}"
        total_payout = 0.0

        conn.execute(
            """
            INSERT INTO payroll_runs (id, business_id, payroll_month, status, total_net_salary, created_at)
            VALUES (?, ?, ?, 'draft', 0.0, ?)
            ON CONFLICT(id) DO UPDATE SET status = 'draft'
            """,
            (run_id, BIZ_ID, payroll_month, now_iso),
        )

        for emp in SEED_EMPLOYEES:
            slip_id = f"ps-{run_id}-{emp['id'][-4:]}"
            base = emp["base_salary"]
            unpaid_days = 2 if emp["id"] == SEED_EMPLOYEES[4]["id"] else 0
            daily_rate = base / 26.0
            leave_ded = round(daily_rate * unpaid_days, 2)
            bonus = 2500.0 if emp["role"] == "cashier" else 0.0
            net = base - leave_ded + bonus
            total_payout += net

            conn.execute(
                """
                INSERT INTO payslips (id, payroll_run_id, employee_id, base_salary, unpaid_leave_days, leave_deduction, bonus_overtime, net_salary, status, notes, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    base_salary = excluded.base_salary,
                    unpaid_leave_days = excluded.unpaid_leave_days,
                    leave_deduction = excluded.leave_deduction,
                    net_salary = excluded.net_salary
                """,
                (slip_id, run_id, emp["id"], base, unpaid_days, leave_ded, bonus, net, "Monthly standard calculation", now_iso),
            )

        conn.execute("UPDATE payroll_runs SET total_net_salary = ? WHERE id = ?", (total_payout, run_id))

        # 8. Seed HR Policy Documents (pgvector ready)
        print("[*] Seeding HR Policy Documents...")
        policy_docs = [
            {
                "name": "Annual & Sick Leave Policy 2026",
                "content": (
                    "Al-Madina Cash & Carry provides 14 paid annual leave days and 8 sick leave days per calendar year. "
                    "Leave requests must be submitted at least 48 hours in advance through the AI COO HR portal. "
                    "Unpaid leave requires prior managerial approval and will result in payroll deduction calculated as "
                    "(Base Salary / 26 working days) multiplied by unpaid days taken. Overlapping leave requests will be flagged for conflict."
                ),
            },
            {
                "name": "Retail Cash Counter & Code of Conduct",
                "content": (
                    "All cashiers must perform clock-in at the beginning of their counter shift and clock-out when their till is balanced. "
                    "Cashiers are responsible for barcode scanning, receipt printing, and daily cash reconciliation. "
                    "Incomplete check-outs must be submitted with an audit reason for HR correction. "
                    "Customer Khata credits require manager approval."
                ),
            },
        ]

        conn.execute("DELETE FROM hr_policy_chunks WHERE business_id = ?", (BIZ_ID,))
        for p in policy_docs:
            chunk_id = str(uuid.uuid4())
            conn.execute(
                """
                INSERT INTO hr_policy_chunks (id, business_id, document_name, chunk_index, content, embedding_json, created_at)
                VALUES (?, ?, ?, 0, ?, '[]', ?)
                """,
                (chunk_id, BIZ_ID, p["name"], p["content"], now_iso),
            )

        # 9. Seed 28 Products & Catalog
        print("[*] Seeding 28 products...")
        for p in SEED_PRODUCTS:
            prod_id = f"p-{p['sku'].lower()}"
            conn.execute(
                """
                INSERT INTO products (id, business_id, sku, barcode, name, category, cost_price, selling_price, stock_units, reorder_threshold, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    selling_price = excluded.selling_price,
                    cost_price = excluded.cost_price,
                    stock_units = excluded.stock_units,
                    reorder_threshold = excluded.reorder_threshold
                """,
                (prod_id, BIZ_ID, p["sku"], p["barcode"], p["name"], p["category"], p["cost"], p["price"], p["stock"], p["threshold"], now_iso),
            )

        # 10. Seed Contacts
        for c in SEED_CONTACTS:
            c_id = f"c-{c['phone'][-6:]}"
            conn.execute(
                """
                INSERT INTO contacts (id, business_id, name, type, email, phone, debit, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    debit = excluded.debit
                """,
                (c_id, BIZ_ID, c["name"], c["type"], c["email"], c["phone"], c["debit"], now_iso),
            )

        # 11. Seed 6 Months of Ledger Entries with Spikes and Duplicate Bill
        print("[*] Seeding 6 months of ledger entries and audit anomalies...")
        conn.execute("DELETE FROM ledger_entries WHERE business_id = ?", (BIZ_ID,))
        conn.execute("DELETE FROM anomalies WHERE business_id = ?", (BIZ_ID,))

        ledger_samples = [
            ("2026-05-10", "income", "sales", 650000.0, "Walk-in retail sales", "POS Counter"),
            ("2026-05-15", "expense", "inventory", 310000.0, "Monthly grain & oil restocking", "Al-Baraka Grain Mills"),
            ("2026-05-28", "expense", "utilities", 45000.0, "Electricity & Generator Fuel", "LESCO"),
            
            ("2026-06-10", "income", "sales", 710000.0, "Walk-in retail sales", "POS Counter"),
            ("2026-06-15", "expense", "inventory", 330000.0, "Monthly stock replenishment", "Al-Baraka Grain Mills"),
            ("2026-06-28", "expense", "utilities", 48000.0, "Commercial electricity bill", "LESCO"),

            ("2026-07-10", "income", "sales", 680000.0, "Walk-in retail sales", "POS Counter"),
            ("2026-07-15", "expense", "inventory", 320000.0, "Staples and spices procurement", "Punjab Oil Corp"),
            ("2026-07-28", "expense", "utilities", 51000.0, "Peak summer utility tariff", "LESCO"),

            ("2026-08-10", "income", "sales", 780000.0, "Walk-in retail sales", "POS Counter"),
            ("2026-08-15", "expense", "inventory", 340000.0, "Bulk grain replenishment", "Al-Baraka Grain Mills"),
            ("2026-08-28", "expense", "utilities", 53000.0, "Utility bill", "LESCO"),

            ("2026-09-10", "income", "sales", 820000.0, "Walk-in retail sales", "POS Counter"),
            ("2026-09-15", "expense", "inventory", 360000.0, "Beverages and dairy stock", "National Foods"),
            ("2026-09-28", "expense", "utilities", 54000.0, "Store power charges", "LESCO"),

            ("2026-10-05", "income", "sales", 860000.0, "October retail turnover", "POS Counter"),
            ("2026-10-12", "expense", "marketing", 145000.0, "Irregular promotional banner campaign", "Media Hub"),
            
            ("2026-10-18", "expense", "inventory", 85000.0, "Emergency ghee restocking", "Punjab Oil Corp"),
            ("2026-10-21", "expense", "inventory", 85000.0, "Emergency ghee restocking (Duplicate Invoice #902)", "Punjab Oil Corp"),
        ]

        for dt, etype, cat, amt, desc, party in ledger_samples:
            entry_id = str(uuid.uuid4())
            conn.execute(
                """
                INSERT INTO ledger_entries (id, business_id, entry_type, category, amount, description, source, is_voided, entry_date, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 'manual', 0, ?, ?)
                """,
                (entry_id, BIZ_ID, etype, cat, amt, f"{desc} ({party})", dt, now_iso),
            )

        # Record Anomalies
        anom1_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO anomalies (id, business_id, type, description, amount, status, detected_at)
            VALUES (?, ?, 'expense_spike', 'Marketing expenses surged by >40% compared to previous month average.', 145000.0, 'open', ?)
            """,
            (anom1_id, BIZ_ID, now_iso),
        )

        anom2_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO anomalies (id, business_id, type, description, amount, status, detected_at)
            VALUES (?, ?, 'duplicate_bill', 'Detected duplicate bill of ₨85,000 to Punjab Oil Corp within 3 days.', 85000.0, 'open', ?)
            """,
            (anom2_id, BIZ_ID, now_iso),
        )

        conn.commit()
    conn.close()

    print("\n==================================================================")
    print(">>> SEEDING COMPLETE FOR 'Al-Madina Cash & Carry'! <<<")
    print("==================================================================")
    print("5-Role Test Accounts:")
    print("  1. OWNER     : owner@almadina.com   | Pass: OwnerPass123!   | Full Executive Access")
    print("  2. MANAGER   : manager@almadina.com | Pass: ManagerPass123! | Operations & Inventory")
    print("  3. HR OFFICER: hr@almadina.com      | Pass: HrPass123!      | HR & Attendance")
    print("  4. CASHIER   : cashier@almadina.com | Pass: CashierPass123! | POS Counter & Self-Service")
    print("  5. STAFF     : staff1@almadina.com  | Pass: StaffPass123!   | Floor Ops & Self-Service")
    print("  6. STAFF     : staff2@almadina.com  | Pass: StaffPass123!   | Floor Ops & Self-Service")
    print("==================================================================\n")


if __name__ == "__main__":
    asyncio.run(seed())
