"""
HR Subsystem Calculation Engine
Reference: Final Year Project Report (FR-5.2, FR-5.3, FR-5.4, UC-7)
"""

from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any


def calculate_net_hours(
    check_in: datetime | str | None,
    check_out: datetime | str | None,
    break_minutes: int = 0,
) -> float:
    """
    Calculates net worked hours: check_out - check_in minus break.
    """
    if not check_in or not check_out:
        return 0.0

    if isinstance(check_in, str):
        check_in = datetime.fromisoformat(check_in.replace("Z", "+00:00"))
    if isinstance(check_out, str):
        check_out = datetime.fromisoformat(check_out.replace("Z", "+00:00"))

    diff = (check_out - check_in).total_seconds()
    net_seconds = max(0.0, diff - (break_minutes * 60))
    hours = round(net_seconds / 3600.0, 2)
    return hours


def check_leave_overlap(
    new_start: date,
    new_end: date,
    existing_approved_leaves: list[dict[str, Any]],
) -> tuple[bool, str | None]:
    """
    Verifies if [new_start, new_end] overlaps any existing approved leave for this employee.
    """
    if new_end < new_start:
        return True, "End date cannot be earlier than start date"

    for leave in existing_approved_leaves:
        if leave.get("status") != "approved":
            continue
        l_start = leave["start_date"]
        l_end = leave["end_date"]
        if isinstance(l_start, str):
            l_start = date.fromisoformat(l_start)
        if isinstance(l_end, str):
            l_end = date.fromisoformat(l_end)

        # Overlap occurs if start <= l_end and end >= l_start
        if new_start <= l_end and new_end >= l_start:
            return True, f"Overlaps with approved leave from {l_start} to {l_end}"

    return False, None


def calculate_leave_days(start_date: date, end_date: date) -> int:
    """Inclusive calendar days of leave."""
    if end_date < start_date:
        return 0
    return (end_date - start_date).days + 1


def calculate_payroll_for_employee(
    base_salary: float | Decimal,
    working_days_in_month: int = 26,
    unpaid_leave_days: int = 0,
    bonus_overtime: float | Decimal = 0.0,
    attendance_is_complete: bool = True,
) -> dict[str, Any]:
    """
    Strict calculation according to Brief Section 3.4 & Report UC-7:

    daily_rate      = base_salary / working_days_in_month
    leave_deduction = daily_rate * unpaid_leave_days  (approved UNPAID leave only)
    net_salary      = base_salary - leave_deduction + bonus_overtime
    """
    base = Decimal(str(base_salary))
    working_days = max(1, int(working_days_in_month))
    unpaid_days = max(0, int(unpaid_leave_days))
    bonus = Decimal(str(bonus_overtime))

    daily_rate = (base / Decimal(str(working_days))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    leave_deduction = (daily_rate * Decimal(str(unpaid_days))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    net_salary = max(Decimal("0.00"), base - leave_deduction + bonus)

    status = "complete" if attendance_is_complete else "incomplete"

    return {
        "base_salary": float(base),
        "working_days": working_days,
        "daily_rate": float(daily_rate),
        "unpaid_leave_days": unpaid_days,
        "leave_deduction": float(leave_deduction),
        "bonus_overtime": float(bonus),
        "net_salary": float(net_salary),
        "status": status,
    }
