from datetime import UTC, date, datetime, timedelta
import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from openai import AsyncOpenAI

from ..config import Settings, get_settings
from ..database import get_database
from ..finance_engine import (
    calculate_financial_health,
    detect_financial_anomalies,
    validate_csv_import_row,
)
from ..schemas import (
    CSVImportRequest,
    CSVImportResponse,
    ExecutiveReportRequest,
    ExecutiveReportResponse,
    FinancialAnomalyResponse,
    FinancialRecommendationResponse,
    LedgerEntryCreate,
    LedgerEntryResponse,
    LedgerVoidRequest,
)
from ..security import get_current_token_payload, require_role

logger = logging.getLogger("vantage.finance")
router = APIRouter(prefix="/api/finance", tags=["Finance & Accounting"])


async def get_effective_business_id(payload: dict[str, Any]) -> str:
    biz_id = payload.get("business_id") or payload.get("sub")
    if not biz_id:
        raise HTTPException(status_code=401, detail="Authentication invalid: missing business_id")
    return str(biz_id)


# ==================== LEDGER & TRANSACTIONS (FR-2.1) ====================

@router.get("/ledger", response_model=list[LedgerEntryResponse])
async def list_ledger_entries(
    from_date: str | None = None,
    to_date: str | None = None,
    entry_type: str | None = None,
    limit: int = 200,
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager"])),
    db=Depends(get_database),
) -> list[LedgerEntryResponse]:
    business_id = await get_effective_business_id(token_payload)
    entries = await db.get_ledger_entries(
        business_id,
        from_date=from_date,
        to_date=to_date,
        entry_type=entry_type,
        limit=limit,
    )
    return [
        LedgerEntryResponse(
            id=str(e["id"]),
            business_id=business_id,
            entry_date=str(e["entry_date"]),
            entry_type=e["entry_type"],
            category=e["category"],
            amount=float(e["amount"]),
            contact_id=e.get("contact_id"),
            contact_name=e.get("contact_name"),
            description=e.get("description"),
            source=e.get("source", "manual"),
            is_voided=bool(e.get("is_voided")),
            voided_reason=e.get("voided_reason"),
            created_at=str(e.get("created_at", "")),
        )
        for e in entries
    ]


@router.post("/ledger", response_model=LedgerEntryResponse, status_code=status.HTTP_201_CREATED)
async def create_ledger_entry(
    payload: LedgerEntryCreate,
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager"])),
    db=Depends(get_database),
) -> LedgerEntryResponse:
    business_id = await get_effective_business_id(token_payload)
    doc = {
        "id": str(uuid.uuid4()),
        "business_id": business_id,
        "entry_date": str(payload.entry_date),
        "entry_type": payload.entry_type,
        "category": payload.category.strip(),
        "amount": payload.amount,
        "contact_id": payload.contact_id,
        "description": payload.description,
        "source": payload.source,
    }
    created = await db.create_ledger_entry(doc)

    await db.record_audit_log(
        business_id=business_id,
        user_id=token_payload.get("sub"),
        action="ledger_entry_created",
        entity_type="ledger_entry",
        entity_id=created["id"],
        details={"type": payload.entry_type, "amount": payload.amount, "category": payload.category},
    )

    return LedgerEntryResponse(
        id=str(created["id"]),
        business_id=business_id,
        entry_date=created["entry_date"],
        entry_type=created["entry_type"],
        category=created["category"],
        amount=float(created["amount"]),
        contact_id=created.get("contact_id"),
        description=created.get("description"),
        source=created.get("source", "manual"),
        is_voided=False,
        created_at=str(created.get("created_at", "")),
    )


@router.post("/ledger/{entry_id}/void", response_model=LedgerEntryResponse)
async def void_ledger_entry(
    entry_id: str,
    payload: LedgerVoidRequest,
    token_payload: dict[str, Any] = Depends(require_role(["owner"])),
    db=Depends(get_database),
) -> LedgerEntryResponse:
    """Only Owner can void a ledger entry. Reversing audit trail is written."""
    business_id = await get_effective_business_id(token_payload)
    updated = await db.void_ledger_entry(entry_id, business_id, payload.voided_reason)
    if not updated:
        raise HTTPException(status_code=404, detail="Ledger entry not found")

    await db.record_audit_log(
        business_id=business_id,
        user_id=token_payload.get("sub"),
        action="ledger_entry_voided",
        entity_type="ledger_entry",
        entity_id=entry_id,
        details={"reason": payload.voided_reason},
    )

    return LedgerEntryResponse(
        id=str(updated["id"]),
        business_id=business_id,
        entry_date=str(updated["entry_date"]),
        entry_type=updated["entry_type"],
        category=updated["category"],
        amount=float(updated["amount"]),
        description=updated.get("description"),
        source=updated.get("source", "manual"),
        is_voided=True,
        voided_reason=payload.voided_reason,
        created_at=str(updated.get("created_at", "")),
    )


@router.post("/import", response_model=CSVImportResponse)
async def import_csv_ledger(
    payload: CSVImportRequest,
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager"])),
    db=Depends(get_database),
) -> CSVImportResponse:
    business_id = await get_effective_business_id(token_payload)
    valid_entries = []
    errors = []

    for idx, row in enumerate(payload.rows, start=1):
        ok, valid_row, err_msg = validate_csv_import_row(row, idx)
        if ok and valid_row:
            valid_row["business_id"] = business_id
            valid_row["id"] = str(uuid.uuid4())
            valid_entries.append(valid_row)
        else:
            errors.append(err_msg or f"Row {idx} invalid")

    # Insert valid rows
    imported_count = 0
    for entry in valid_entries:
        await db.create_ledger_entry(entry)
        imported_count += 1

    await db.record_audit_log(
        business_id=business_id,
        user_id=token_payload.get("sub"),
        action="csv_import_ledger",
        entity_type="ledger",
        entity_id="batch_import",
        details={"imported": imported_count, "failed": len(errors)},
    )

    return CSVImportResponse(
        total_rows=len(payload.rows),
        imported_count=imported_count,
        failed_count=len(errors),
        errors=errors[:50],
    )


# ==================== METRICS & ANOMALIES (FR-2.2 - 2.5) ====================

@router.get("/metrics")
async def get_financial_metrics(
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager"])),
    db=Depends(get_database),
) -> dict[str, Any]:
    business_id = await get_effective_business_id(token_payload)
    entries = await db.get_ledger_entries(business_id, limit=500)

    # Calculate MTD revenue & expense
    today_month = date.today().strftime("%Y-%m")
    mtd_rev = 0.0
    mtd_exp = 0.0

    for e in entries:
        if not e.get("is_voided"):
            d_str = str(e.get("entry_date", ""))
            amt = float(e.get("amount", 0.0))
            if d_str.startswith(today_month):
                if e.get("entry_type") == "revenue":
                    mtd_rev += amt
                elif e.get("entry_type") == "expense":
                    mtd_exp += amt

    # Baseline cash balance (from business setup or fallback 500,000)
    cash_balance = 500000.0 + (mtd_rev - mtd_exp)
    health = calculate_financial_health(mtd_rev, mtd_exp, cash_balance)

    return {
        "revenue_mtd": round(mtd_rev, 2),
        "expenses_mtd": round(mtd_exp, 2),
        "net_profit_mtd": round(mtd_rev - mtd_exp, 2),
        "gross_margin_pct": health["gross_margin_pct"],
        "burn_rate": health["burn_rate"],
        "cash_runway_months": health["runway_months"],
        "financial_health_score": health["health_score"],
    }


@router.get("/anomalies", response_model=list[FinancialAnomalyResponse])
async def list_anomalies(
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager"])),
    db=Depends(get_database),
) -> list[FinancialAnomalyResponse]:
    business_id = await get_effective_business_id(token_payload)
    items = await db.get_anomalies(business_id)
    return [
        FinancialAnomalyResponse(
            id=str(a["id"]),
            type=a["type"],
            category=a.get("category"),
            description=a["description"],
            amount=float(a["amount"]) if a.get("amount") is not None else None,
            baseline_amount=float(a["baseline_amount"]) if a.get("baseline_amount") is not None else None,
            status=a.get("status", "open"),
            detected_at=str(a.get("detected_at", "")),
        )
        for a in items
    ]


@router.post("/anomalies/detect")
async def trigger_anomaly_detection(
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager"])),
    db=Depends(get_database),
) -> dict[str, Any]:
    """Runs automated anomaly detection over current vs previous month ledger entries."""
    business_id = await get_effective_business_id(token_payload)
    entries = await db.get_ledger_entries(business_id, limit=1000)

    # Partition by month
    today = date.today()
    curr_prefix = today.strftime("%Y-%m")
    # Previous month prefix
    prev_month_date = (today.replace(day=1) - timedelta(days=1))
    prev_prefix = prev_month_date.strftime("%Y-%m")

    curr_entries = [e for e in entries if str(e.get("entry_date", "")).startswith(curr_prefix)]
    prev_entries = [e for e in entries if str(e.get("entry_date", "")).startswith(prev_prefix)]

    detected = detect_financial_anomalies(curr_entries, prev_entries)
    created_anomalies = []

    for anom in detected:
        doc = {
            "business_id": business_id,
            "type": anom["type"],
            "category": anom.get("category"),
            "description": anom["description"],
            "amount": anom.get("amount"),
            "baseline_amount": anom.get("baseline_amount"),
            "status": "open",
        }
        saved = await db.create_anomaly(doc)
        created_anomalies.append(saved)

        # Generate recommendation
        rec_doc = {
            "business_id": business_id,
            "title": f"Review {anom['type'].replace('_', ' ').title()} in {anom.get('category', 'expenses')}",
            "detail": anom["description"],
            "estimated_saving_pkr": anom.get("estimated_saving_pkr", 0.0),
            "runway_boost_months": 0.2,
            "status": "pending",
        }
        await db.create_financial_recommendation(rec_doc)

    return {"detected_count": len(detected), "anomalies": created_anomalies}


@router.get("/recommendations", response_model=list[FinancialRecommendationResponse])
async def list_financial_recommendations(
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager"])),
    db=Depends(get_database),
) -> list[FinancialRecommendationResponse]:
    business_id = await get_effective_business_id(token_payload)
    recs = await db.get_financial_recommendations(business_id)
    return [
        FinancialRecommendationResponse(
            id=str(r["id"]),
            title=r["title"],
            detail=r["detail"],
            estimated_saving_pkr=float(r.get("estimated_saving_pkr", 0.0)),
            runway_boost_months=float(r.get("runway_boost_months", 0.0)),
            status=r.get("status", "pending"),
        )
        for r in recs
    ]


@router.patch("/recommendations/{rec_id}")
async def decide_recommendation(
    rec_id: str,
    action: str,  # "approved" or "rejected"
    token_payload: dict[str, Any] = Depends(require_role(["owner"])),
    db=Depends(get_database),
) -> dict[str, Any]:
    business_id = await get_effective_business_id(token_payload)
    if action not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="Action must be 'approved' or 'rejected'")

    updated = await db.update_financial_recommendation(rec_id, business_id, {"status": action})
    if not updated:
        raise HTTPException(status_code=404, detail="Recommendation not found")

    await db.record_audit_log(
        business_id=business_id,
        user_id=token_payload.get("sub"),
        action=f"financial_recommendation_{action}",
        entity_type="financial_recommendation",
        entity_id=rec_id,
        details={"status": action},
    )

    return {"ok": True, "status": action}


# ==================== EXECUTIVE SUMMARY REPORT (FR-2.5) ====================

@router.post("/report", response_model=ExecutiveReportResponse)
async def generate_executive_report(
    payload: ExecutiveReportRequest,
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager"])),
    db=Depends(get_database),
    config: Settings = Depends(get_settings),
) -> ExecutiveReportResponse:
    business_id = await get_effective_business_id(token_payload)

    # 1. Consolidate Ledger
    entries = await db.get_ledger_entries(
        business_id,
        from_date=str(payload.start_date),
        to_date=str(payload.end_date),
        limit=1000,
    )
    rev = sum(float(e["amount"]) for e in entries if e.get("entry_type") == "revenue" and not e.get("is_voided"))
    exp = sum(float(e["amount"]) for e in entries if e.get("entry_type") == "expense" and not e.get("is_voided"))
    net = rev - exp

    # 2. Consolidate Employees & Payroll
    employees = await db.get_employees(business_id)
    active_count = len([e for e in employees if e.get("employment_status") == "active"])
    runs = await db.get_payroll_runs(business_id)
    total_payroll = sum(float(r.get("total_net_salary", 0.0)) for r in runs if r.get("status") == "finalised")

    health = calculate_financial_health(rev, exp, 500000.0 + net)

    # 3. LLM Natural Language Summary
    period_label = f"{payload.start_date} to {payload.end_date}"
    narrative = (
        f"During the period {period_label}, total recorded revenue was PKR {rev:,.2f} against expenses of PKR {exp:,.2f}, "
        f"yielding a net surplus of PKR {net:,.2f} with a gross profit margin of {health['gross_margin_pct']}%. "
        f"Operational payroll covered {active_count} active employees with PKR {total_payroll:,.2f} in finalised distributions. "
        f"The composite financial health score is {health['health_score']}/100."
    )

    if config.openai_api_key:
        try:
            async with AsyncOpenAI(api_key=config.openai_api_key) as client:
                prompt = (
                    f"You are the AI COO. Write an executive summary paragraph for the business owner.\n"
                    f"Financials: Revenue PKR {rev:,.2f}, Expenses PKR {exp:,.2f}, Net PKR {net:,.2f}, "
                    f"Gross margin {health['gross_margin_pct']}%, Health score {health['health_score']}/100.\n"
                    f"HR: {active_count} active employees, total payroll PKR {total_payroll:,.2f}.\n"
                    f"Provide actionable business guidance in 3 concise sentences."
                )
                resp = await client.chat.completions.create(
                    model=config.openai_model,
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=300,
                    temperature=0.3,
                )
                narrative = resp.choices[0].message.content.strip()
        except Exception as exc:
            logger.warning("LLM executive summary skipped: %s", exc)

    return ExecutiveReportResponse(
        period=period_label,
        total_revenue=round(rev, 2),
        total_expenses=round(exp, 2),
        net_profit=round(net, 2),
        gross_margin_pct=health["gross_margin_pct"],
        burn_rate=health["burn_rate"],
        cash_runway_months=health["runway_months"],
        health_score=health["health_score"],
        active_employees=active_count,
        total_payroll=round(total_payroll, 2),
        low_stock_count=2,
        narrative_summary=narrative,
    )
