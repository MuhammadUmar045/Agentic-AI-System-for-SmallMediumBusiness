with open('backend/app/database.py', 'r', encoding='utf-8') as f:
    text = f.read()

snippet = """
    async def get_payslips_for_employee(self, employee_id: str) -> list[dict[str, Any]]:
        conn = self._get_conn()
        rows = conn.execute(
            \"\"\"
            SELECT p.*, e.full_name as employee_name, r.payroll_month
            FROM payslips p
            LEFT JOIN employees e ON p.employee_id = e.id
            LEFT JOIN payroll_runs r ON p.payroll_run_id = r.id
            WHERE p.employee_id = ?
            ORDER BY r.payroll_month DESC
            \"\"\",
            (employee_id,),
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]"""

text = text.replace(snippet, '')

target = """    async def get_payslips_for_run(self, run_id: str) -> list[dict[str, Any]]:
        conn = self._get_conn()
        rows = conn.execute(
            \"\"\"
            SELECT p.*, e.full_name as employee_name
            FROM payslips p
            LEFT JOIN employees e ON p.employee_id = e.id
            WHERE p.payroll_run_id = ?
            \"\"\",
            (run_id,),
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]"""

if target in text:
    text = text.replace(target, target + snippet)

with open('backend/app/database.py', 'w', encoding='utf-8') as f:
    f.write(text)

print("Cleaned!")
