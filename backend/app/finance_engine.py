"""
Finance & Accounting Subsystem Calculation Engine
Reference: Final Year Project Report (FR-2.1, FR-2.2, FR-2.5, UC-3, UC-10)
"""

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any


def detect_financial_anomalies(
    current_month_entries: list[dict[str, Any]],
    previous_month_entries: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Detects financial anomalies according to Brief Section 5.2:
    1. Category expense up > 40% over previous baseline
    2. Duplicate bill: same contact + amount within 7 days
    """
    anomalies = []

    # 1. 40% Category Expense Spike
    prev_by_cat: dict[str, float] = {}
    for e in previous_month_entries:
        if e.get("entry_type") == "expense" and not e.get("is_voided"):
            cat = e.get("category", "General")
            prev_by_cat[cat] = prev_by_cat.get(cat, 0.0) + float(e.get("amount", 0.0))

    curr_by_cat: dict[str, float] = {}
    for e in current_month_entries:
        if e.get("entry_type") == "expense" and not e.get("is_voided"):
            cat = e.get("category", "General")
            curr_by_cat[cat] = curr_by_cat.get(cat, 0.0) + float(e.get("amount", 0.0))

    for cat, curr_amt in curr_by_cat.items():
        prev_amt = prev_by_cat.get(cat, 0.0)
        if prev_amt > 0:
            percentage_increase = ((curr_amt - prev_amt) / prev_amt) * 100.0
            if percentage_increase > 40.0:
                spike_diff = curr_amt - prev_amt
                anomalies.append({
                    "type": "expense_spike_40",
                    "category": cat,
                    "description": (
                        f"Expense in '{cat}' jumped by {percentage_increase:.1f}% "
                        f"(PKR {curr_amt:,.2f} vs baseline PKR {prev_amt:,.2f})."
                    ),
                    "amount": round(curr_amt, 2),
                    "baseline_amount": round(prev_amt, 2),
                    "estimated_saving_pkr": round(spike_diff * 0.5, 2),
                })

    # 2. Duplicate Bill Detection
    # Look for identical (contact_id / contact_name, amount) within a 7-day window
    expense_entries = [
        e for e in current_month_entries
        if e.get("entry_type") == "expense" and not e.get("is_voided") and e.get("contact_id")
    ]
    expense_entries.sort(key=lambda x: str(x.get("entry_date", "")))

    seen_bills: list[dict[str, Any]] = []
    for item in expense_entries:
        c_id = item.get("contact_id")
        amt = float(item.get("amount", 0.0))
        d_str = str(item.get("entry_date", ""))
        try:
            curr_d = date.fromisoformat(d_str[:10])
        except Exception:
            curr_d = date.today()

        for prev in seen_bills:
            if prev["contact_id"] == c_id and abs(prev["amount"] - amt) < 0.01:
                day_diff = abs((curr_d - prev["date"]).days)
                if day_diff <= 7:
                    anomalies.append({
                        "type": "duplicate_bill",
                        "category": item.get("category", "General"),
                        "description": (
                            f"Possible duplicate payment of PKR {amt:,.2f} to contact '{c_id}' "
                            f"within {day_diff} days (dates: {prev['date']} and {curr_d})."
                        ),
                        "amount": amt,
                        "baseline_amount": amt,
                        "estimated_saving_pkr": amt,
                    })
                    break
        seen_bills.append({"contact_id": c_id, "amount": amt, "date": curr_d})

    return anomalies


def validate_csv_import_row(row: dict[str, Any], row_num: int) -> tuple[bool, dict[str, Any] | None, str | None]:
    """
    Validates a single row for CSV import: date, type, category, amount, description.
    """
    date_val = str(row.get("date", "")).strip()
    type_val = str(row.get("type", "")).strip().lower()
    cat_val = str(row.get("category", "")).strip()
    amt_val = str(row.get("amount", "")).strip().replace(",", "")
    desc_val = str(row.get("description", "")).strip()

    if not date_val:
        return False, None, f"Row {row_num}: missing date"
    try:
        parsed_date = date.fromisoformat(date_val[:10])
    except Exception:
        return False, None, f"Row {row_num}: invalid date format '{date_val}', expected YYYY-MM-DD"

    if type_val not in ("revenue", "expense"):
        return False, None, f"Row {row_num}: type must be 'revenue' or 'expense', got '{type_val}'"

    if not cat_val:
        cat_val = "General"

    try:
        amt = float(amt_val)
        if amt <= 0:
            return False, None, f"Row {row_num}: amount must be positive, got {amt}"
    except ValueError:
        return False, None, f"Row {row_num}: invalid amount '{amt_val}'"

    valid_record = {
        "entry_date": parsed_date.isoformat(),
        "entry_type": type_val,
        "category": cat_val,
        "amount": amt,
        "description": desc_val,
        "source": "csv_import",
    }
    return True, valid_record, None


def calculate_financial_health(
    monthly_revenue: float,
    monthly_expense: float,
    cash_balance: float,
) -> dict[str, Any]:
    """
    Consolidated financial health metrics.
    """
    burn_rate = max(0.0, monthly_expense - monthly_revenue)
    net_surplus = monthly_revenue - monthly_expense
    gross_margin = ((monthly_revenue - monthly_expense) / monthly_revenue * 100.0) if monthly_revenue > 0 else 0.0

    if burn_rate > 0:
        runway_months = cash_balance / burn_rate
    else:
        runway_months = 99.0 if cash_balance > 0 else 0.0

    # Score out of 100
    score = 50
    if net_surplus > 0:
        score += 25
    if runway_months >= 6.0:
        score += 25
    elif runway_months >= 3.0:
        score += 15
    elif runway_months < 1.0:
        score -= 20

    score = max(0, min(100, score))

    return {
        "gross_margin_pct": round(gross_margin, 1),
        "burn_rate": round(burn_rate, 2),
        "net_surplus": round(net_surplus, 2),
        "runway_months": round(runway_months, 1) if runway_months < 90 else None,
        "health_score": score,
    }
