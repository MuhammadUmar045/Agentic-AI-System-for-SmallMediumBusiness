"""
Inventory Algorithm Implementation
Reference: Final Year Project Report Section 5.3.1 (Inventory Optimization Agent)

Formulas:
  v: Daily sales velocity
     - If >= 3 sales rows in stock_history:
         v = sum(|change| of sales rows) / max(1, days_between(first_sale_date, latest_sale_date))
     - Fallback if < 3 sales:
         v = capacity / 30.0

  DIR: Days Inventory Remaining
     - DIR = stock / v  (999 if v <= 0)

  T: Reorder threshold
     - T = v * (lead_time_days + safety_days) = 5v  (lead_time=3, safety=2)

  status:
     - "Out of Stock" if S <= 0
     - "Critical Low" if S < 0.5 * T or DIR < 2.5
     - "Low Stock" if 0.5 * T <= S < T
     - "Overstock" if S > 0.9 * C
     - "Optimal" otherwise

  Q: Reorder Quantity (calculated only when S < T)
     - Q = min(C - S, round_to_10(max(0, 33 * v - S)))
     - (C default = 200, static fallback threshold = 50)

  runout_days:
     - today + DIR days
"""

from datetime import date, datetime, timedelta
from typing import Any


def round_to_10(val: float | int) -> int:
    """Round to nearest multiple of 10."""
    return int(round(val / 10.0) * 10)


def calculate_inventory_metrics(
    stock: int,
    sales_history: list[dict[str, Any]] | None = None,
    capacity: int = 200,
    lead_time_days: int = 3,
    safety_days: int = 2,
    as_of_date: date | None = None,
) -> dict[str, Any]:
    """
    Computes inventory KPIs strictly according to Section 5.3.1.

    :param stock: Current stock units (S)
    :param sales_history: List of sales stock_history records:
                          [{"change_qty": -5, "created_at": "2026-03-01T..."}, ...]
    :param capacity: Maximum shelf capacity (C), default 200
    :param lead_time_days: Supplier lead time days, default 3
    :param safety_days: Safety stock days, default 2
    :param as_of_date: Current anchor date (defaults to date.today())
    """
    if as_of_date is None:
        as_of_date = date.today()

    S = max(0, int(stock))
    C = max(1, int(capacity))
    LT = int(lead_time_days)
    SD = int(safety_days)

    # Filter out only sale rows (negative change_qty or reason == 'sale')
    sales_rows = []
    for row in (sales_history or []):
        qty = row.get("change_qty", 0)
        reason = row.get("reason", "sale")
        if qty < 0 or reason == "sale":
            ts_raw = row.get("created_at")
            if isinstance(ts_raw, str):
                try:
                    dt = datetime.fromisoformat(ts_raw.replace("Z", "+00:00")).date()
                except Exception:
                    dt = as_of_date
            elif isinstance(ts_raw, (datetime, date)):
                dt = ts_raw.date() if isinstance(ts_raw, datetime) else ts_raw
            else:
                dt = as_of_date
            sales_rows.append({"qty": abs(qty), "date": dt})

    # Sort sales rows chronologically
    sales_rows.sort(key=lambda r: r["date"])

    # 1. Daily sales velocity (v)
    if len(sales_rows) >= 3:
        total_units_sold = sum(r["qty"] for r in sales_rows)
        first_date = sales_rows[0]["date"]
        latest_date = sales_rows[-1]["date"]
        days_between = max(1, (latest_date - first_date).days)
        v = float(total_units_sold) / float(days_between)
    else:
        # Fallback if < 3 sales
        v = float(C) / 30.0

    # Ensure non-negative v
    v = max(0.001, v)

    # 2. Days Inventory Remaining (DIR)
    if v <= 0:
        DIR = 999.0
    else:
        DIR = float(S) / v

    # 3. Reorder Threshold (T)
    T = v * float(LT + SD)  # 5 * v

    # 4. Status determination
    if S <= 0:
        status = "Out of Stock"
    elif S < (0.5 * T) or DIR < 2.5:
        status = "Critical Low"
    elif (0.5 * T) <= S < T:
        status = "Low Stock"
    elif S > (0.9 * C):
        status = "Overstock"
    else:
        status = "Optimal"

    # 5. Recommended Reorder Quantity (Q)
    # Calculated only when S < T
    if S < T:
        raw_target = max(0.0, 33.0 * v - float(S))
        rounded_target = round_to_10(raw_target)
        max_possible = max(0, C - S)
        Q = min(max_possible, rounded_target)
    else:
        Q = 0

    # 6. Runout date
    if DIR >= 999:
        runout_date = None
    else:
        runout_date = as_of_date + timedelta(days=int(round(DIR)))

    return {
        "stock": S,
        "capacity": C,
        "velocity_v": round(v, 2),
        "dir": round(DIR, 1),
        "threshold_T": round(T, 1),
        "status": status,
        "reorder_qty_Q": Q,
        "runout_date": runout_date.isoformat() if runout_date else None,
    }
