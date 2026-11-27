import csv
import io
import json
import logging
import re
from datetime import datetime
from typing import Any

from openai import AsyncOpenAI

from .config import Settings

logger = logging.getLogger("vantage.csv_agent")

SCHEMA_SPECS: dict[str, dict[str, Any]] = {
    "inventory": {
        "required": ["name", "stock"],
        "fields": {
            "name": ["name", "product", "product_name", "item", "item_name", "title", "goods", "merchandise", "description"],
            "sku": ["sku", "code", "item_code", "product_code", "barcode", "ref"],
            "category": ["category", "cat", "group", "type", "department", "section"],
            "stock": ["stock", "qty", "quantity", "on_hand", "qty_on_hand", "available", "units", "count", "balance", "stock_quantity"],
            "threshold": ["threshold", "reorder", "reorder_level", "min_stock", "minimum", "min", "alert_level", "safety_stock"],
            "price": ["price", "unit_price", "selling_price", "rate", "cost", "unit_cost", "mrp", "amount", "value"],
            "supplierName": ["supplier", "supplier_name", "vendor", "vendor_name", "brand", "manufacturer", "source"],
        },
    },
    "ledger": {
        "required": ["date", "amount"],
        "fields": {
            "date": ["date", "entry_date", "transaction_date", "txn_date", "posted_at", "created_at", "day"],
            "type": ["type", "entry_type", "kind", "direction", "txn_type", "dr_cr"],
            "category": ["category", "account_type", "account", "head", "group", "tag"],
            "amount": ["amount", "total", "value", "sum", "net", "price", "pkr"],
            "description": ["description", "particulars", "memo", "narration", "details", "note", "notes", "title", "item"],
            "debit": ["debit", "withdrawal", "outflow", "expense", "dr", "paid"],
            "credit": ["credit", "deposit", "inflow", "revenue", "cr", "received"],
        },
    },
    "employees": {
        "required": ["full_name", "email"],
        "fields": {
            "full_name": ["full_name", "name", "employee_name", "staff_name", "worker"],
            "email": ["email", "email_address", "mail"],
            "phone": ["phone", "phone_number", "mobile", "contact", "cell"],
            "role": ["role", "position", "job_title", "designation"],
            "base_salary": ["base_salary", "salary", "pay", "monthly_salary", "wage", "compensation"],
            "department": ["department", "dept", "team", "division"],
            "join_date": ["join_date", "hired_at", "start_date", "joining_date"],
        },
    },
}


def _clean_header(header: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", header.strip().lower()).strip("_")


def _parse_number(raw: Any) -> float | None:
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    s = re.sub(r"[₨$,\s]|PKR|USD|Rs\.?", "", s, flags=re.IGNORECASE)
    try:
        return float(s)
    except ValueError:
        return None


def _parse_date(raw: Any) -> str:
    s = str(raw or "").strip()
    if not s:
        return datetime.now().date().isoformat()
    if re.match(r"^\d{4}-\d{2}-\d{2}", s):
        return s[:10]
    for fmt in ("%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%Y/%m/%d", "%d %b %Y", "%d %B %Y"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return s[:10]


def _heuristic_map(headers: list[str], spec: dict[str, Any]) -> dict[str, str]:
    cleaned = [_clean_header(h) for h in headers]
    mapping: dict[str, str] = {}
    used_indices: set[int] = set()

    # Exact alias match first
    for field, aliases in spec["fields"].items():
        for idx, ch in enumerate(cleaned):
            if idx in used_indices:
                continue
            if ch in aliases:
                mapping[field] = headers[idx]
                used_indices.add(idx)
                break

    # Substring match second
    for field, aliases in spec["fields"].items():
        if field in mapping:
            continue
        for idx, ch in enumerate(cleaned):
            if idx in used_indices:
                continue
            if any(alias in ch or ch in alias for alias in aliases if len(alias) >= 3):
                mapping[field] = headers[idx]
                used_indices.add(idx)
                break

    return mapping


async def _ai_map_headers(
    target_schema: str,
    headers: list[str],
    sample_rows: list[list[str]],
    settings: Settings,
) -> dict[str, str] | None:
    if not settings.openai_configured:
        return None
    spec = SCHEMA_SPECS[target_schema]
    fields_desc = list(spec["fields"].keys())
    sample_dicts = [
        {headers[i]: (row[i] if i < len(row) else "") for i in range(len(headers))}
        for row in sample_rows[:3]
    ]
    prompt = (
        f"Map the CSV columns to the target '{target_schema}' schema fields.\n"
        f"Target fields: {json.dumps(fields_desc)}\n"
        f"CSV Headers: {json.dumps(headers)}\n"
        f"Sample rows: {json.dumps(sample_dicts)}\n\n"
        "Return a JSON object with a single key 'mapping' whose value is an object mapping each matched "
        "target field name to the EXACT original CSV header string. Omit target fields that have no matching column."
    )
    try:
        client = AsyncOpenAI(api_key=settings.openai_api_key)
        completion = await client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": "You are a precise data schema mapping agent. Return valid JSON only."},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.0,
        )
        content = completion.choices[0].message.content or "{}"
        parsed = json.loads(content)
        raw_map = parsed.get("mapping", {})
        if isinstance(raw_map, dict):
            return {
                k: v for k, v in raw_map.items()
                if k in spec["fields"] and isinstance(v, str) and v in headers
            }
    except Exception as exc:
        logger.warning("AI CSV mapping fallback to heuristics: %s", exc)
    return None


async def map_and_normalize_csv(
    target_schema: str,
    csv_text: str,
    settings: Settings,
) -> dict[str, Any]:
    if target_schema not in SCHEMA_SPECS:
        raise ValueError(f"Unsupported target schema: {target_schema}")

    cleaned_text = csv_text.lstrip("\ufeff").strip()
    if not cleaned_text:
        return {
            "target_schema": target_schema,
            "mapping": {},
            "normalized_rows": [],
            "skipped_rows": 0,
            "used_ai": False,
            "notes": "CSV content is empty.",
        }

    reader = csv.reader(io.StringIO(cleaned_text))
    all_rows = [row for row in reader if any(str(cell).strip() for cell in row)]
    if len(all_rows) < 2:
        return {
            "target_schema": target_schema,
            "mapping": {},
            "normalized_rows": [],
            "skipped_rows": 0,
            "used_ai": False,
            "notes": "CSV needs a header row and at least one data row.",
        }

    headers = [str(h).strip() for h in all_rows[0]]
    data_rows = all_rows[1:]
    spec = SCHEMA_SPECS[target_schema]

    mapping = _heuristic_map(headers, spec)
    required = spec["required"]
    missing_req = [f for f in required if f not in mapping]
    if target_schema == "ledger" and "amount" not in mapping and ("debit" in mapping or "credit" in mapping):
        missing_req = [f for f in missing_req if f != "amount"]

    used_ai = False
    if (missing_req or len(mapping) < min(3, len(headers))) and settings.openai_configured:
        ai_map = await _ai_map_headers(target_schema, headers, data_rows, settings)
        if ai_map:
            mapping = {**mapping, **ai_map}
            used_ai = True

    header_idx = {h: idx for idx, h in enumerate(headers)}
    normalized_rows: list[dict[str, Any]] = []
    skipped = 0

    def get_val(row: list[str], field: str) -> str:
        col = mapping.get(field)
        if not col or col not in header_idx:
            return ""
        idx = header_idx[col]
        return str(row[idx]).strip() if idx < len(row) else ""

    for idx, row in enumerate(data_rows, start=1):
        if target_schema == "inventory":
            name = get_val(row, "name")
            if not name:
                skipped += 1
                continue
            stock_val = _parse_number(get_val(row, "stock"))
            stock = int(round(stock_val)) if stock_val is not None else 0
            thresh_val = _parse_number(get_val(row, "threshold"))
            threshold = int(round(thresh_val)) if thresh_val is not None else max(5, round(stock * 0.3))
            price_val = _parse_number(get_val(row, "price"))
            normalized_rows.append({
                "id": idx,
                "name": name,
                "sku": get_val(row, "sku") or f"SKU-{idx:03d}",
                "category": get_val(row, "category") or "General",
                "stock": max(0, stock),
                "threshold": max(0, threshold),
                "price": max(0.0, price_val if price_val is not None else 0.0),
                "supplierName": get_val(row, "supplierName") or "Local Supplier",
                "trend": "flat",
                "reordered": False,
            })

        elif target_schema == "ledger":
            date_str = _parse_date(get_val(row, "date"))
            debit_val = _parse_number(get_val(row, "debit")) or 0.0
            credit_val = _parse_number(get_val(row, "credit")) or 0.0
            raw_amt = _parse_number(get_val(row, "amount"))
            raw_type = get_val(row, "type").lower()

            if raw_amt is not None and raw_amt != 0:
                amt = abs(raw_amt)
                if raw_type in ("revenue", "income", "credit", "cr", "inflow", "sale", "sales"):
                    entry_type = "revenue"
                elif raw_type in ("expense", "debit", "dr", "outflow", "cost", "purchase"):
                    entry_type = "expense"
                else:
                    entry_type = "expense" if raw_amt < 0 else "revenue"
            elif credit_val > 0 or debit_val > 0:
                if credit_val >= debit_val:
                    amt = credit_val
                    entry_type = "revenue"
                else:
                    amt = debit_val
                    entry_type = "expense"
            else:
                skipped += 1
                continue

            normalized_rows.append({
                "date": date_str,
                "type": entry_type,
                "category": get_val(row, "category") or ("Sales" if entry_type == "revenue" else "General"),
                "amount": round(amt, 2),
                "description": get_val(row, "description") or "CSV Import",
            })

        elif target_schema == "employees":
            full_name = get_val(row, "full_name")
            email = get_val(row, "email")
            if not full_name or not email:
                skipped += 1
                continue
            salary = _parse_number(get_val(row, "base_salary")) or 0.0
            normalized_rows.append({
                "full_name": full_name,
                "email": email.lower(),
                "phone": get_val(row, "phone") or None,
                "role": get_val(row, "role").lower() or "staff",
                "base_salary": max(0.0, salary),
                "department": get_val(row, "department") or "Operations",
                "join_date": _parse_date(get_val(row, "join_date")),
            })

    mapped_summary = ", ".join(f"{k} <- {v}" for k, v in mapping.items())
    return {
        "target_schema": target_schema,
        "mapping": mapping,
        "normalized_rows": normalized_rows,
        "skipped_rows": skipped,
        "used_ai": used_ai,
        "notes": (
            f"{'AI Schema Agent' if used_ai else 'Schema Mapper'} matched {len(mapping)} field(s): {mapped_summary}"
            if mapping else "Could not automatically match CSV columns to schema."
        ),
    }
