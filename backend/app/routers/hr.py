from datetime import UTC, date, datetime
import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from openai import AsyncOpenAI

from ..config import Settings, get_settings
from ..database import get_database
from ..hr_engine import (
    calculate_leave_days,
    calculate_net_hours,
    calculate_payroll_for_employee,
    check_leave_overlap,
)
from ..schemas import (
    AttendanceCheckInRequest,
    AttendanceCheckOutRequest,
    AttendanceCorrectionRequest,
    AttendanceRecordResponse,
    EmployeeCreate,
    EmployeeResponse,
    EmployeeUpdate,
    HRAssistantAskRequest,
    HRAssistantResponse,
    HRPolicyUploadRequest,
    LeaveRequestResponse,
    LeaveReviewRequest,
    LeaveSubmitRequest,
    PayrollRunCreateRequest,
    PayrollRunResponse,
    PayslipResponse,
    PayslipUpdateRequest,
)
from ..security import get_current_token_payload, hash_password, require_role

logger = logging.getLogger("vantage.hr")
router = APIRouter(prefix="/api/hr", tags=["HR & Employees"])


async def get_effective_business_id(payload: dict[str, Any]) -> str:
    biz_id = payload.get("business_id") or payload.get("sub")
    if not biz_id:
        raise HTTPException(status_code=401, detail="Authentication invalid: missing business_id")
    return str(biz_id)


# ==================== EMPLOYEES (FR-5.1) ====================

@router.get("/employees", response_model=list[EmployeeResponse])
async def list_employees(
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager", "hr_officer", "cashier", "staff"])),
    db=Depends(get_database),
) -> list[EmployeeResponse]:
    business_id = await get_effective_business_id(token_payload)
    role = token_payload.get("role", "staff")
    user_id = token_payload.get("sub")

    all_emps = await db.get_employees(business_id)

    # Cashier and Staff only get self-service view
    if role in ("cashier", "staff"):
        all_emps = [e for e in all_emps if e.get("user_id") == user_id]

    results = []
    for e in all_emps:
        # Base salary is only visible to owner, manager, and the employee themselves
        can_see_salary = role in ("owner", "manager") or (e.get("user_id") == user_id)
        results.append(
            EmployeeResponse(
                id=str(e["id"]),
                business_id=str(e["business_id"]),
                user_id=e.get("user_id"),
                full_name=e["full_name"],
                email=e["email"],
                phone=e.get("phone"),
                role=e["role"],
                base_salary=float(e["base_salary"]) if can_see_salary else None,
                employment_status=e.get("employment_status", "active"),
                join_date=str(e["join_date"]),
                department=e.get("department", "Operations"),
                created_at=str(e.get("created_at", "")),
            )
        )
    return results


@router.post("/employees", response_model=EmployeeResponse, status_code=status.HTTP_201_CREATED)
async def create_employee(
    payload: EmployeeCreate,
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager"])),
    db=Depends(get_database),
) -> EmployeeResponse:
    business_id = await get_effective_business_id(token_payload)
    user_id_created = None

    if payload.create_login:
        existing_user = await db.get_user_by_email(payload.email.lower())
        if existing_user:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A user login with this email already exists.")
        login_pwd = payload.login_password or "Welcome123!"
        new_user = {
            "business_id": business_id,
            "full_name": payload.full_name,
            "email": payload.email.lower(),
            "phone_number": payload.phone,
            "password_hash": hash_password(login_pwd),
            "role": payload.role,
            "status": "active",
            "owner_id": token_payload.get("sub"),
        }
        created_user = await db.create_user(new_user, auth_password=login_pwd)
        user_id_created = created_user["id"]

    emp_doc = {
        "id": str(uuid.uuid4()),
        "business_id": business_id,
        "user_id": user_id_created,
        "full_name": payload.full_name,
        "email": payload.email.lower(),
        "phone": payload.phone,
        "role": payload.role,
        "base_salary": payload.base_salary,
        "employment_status": "active",
        "join_date": str(payload.join_date),
        "department": payload.department,
    }
    created = await db.create_employee(emp_doc)

    await db.record_audit_log(
        business_id=business_id,
        user_id=token_payload.get("sub"),
        action="employee_created",
        entity_type="employee",
        entity_id=created["id"],
        details={"name": payload.full_name, "role": payload.role},
    )

    return EmployeeResponse(
        id=str(created["id"]),
        business_id=business_id,
        user_id=user_id_created,
        full_name=created["full_name"],
        email=created["email"],
        phone=created.get("phone"),
        role=created["role"],
        base_salary=float(created.get("base_salary") or 0.0),
        employment_status=created.get("employment_status", "active"),
        join_date=str(created.get("join_date") or payload.join_date),
        department=created.get("department") or payload.department or "Operations",
        created_at=str(created.get("created_at", "")),
    )


@router.patch("/employees/{employee_id}", response_model=EmployeeResponse)
async def update_employee(
    employee_id: str,
    payload: EmployeeUpdate,
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager", "hr_officer"])),
    db=Depends(get_database),
) -> EmployeeResponse:
    business_id = await get_effective_business_id(token_payload)
    role = token_payload.get("role", "staff")

    # HR officer cannot change salary (only owner/manager can)
    if role == "hr_officer" and payload.base_salary is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only business owners and managers can update base salary.",
        )

    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided for update")

    updated = await db.update_employee(employee_id, business_id, updates)
    if not updated:
        raise HTTPException(status_code=404, detail="Employee not found")

    await db.record_audit_log(
        business_id=business_id,
        user_id=token_payload.get("sub"),
        action="employee_updated",
        entity_type="employee",
        entity_id=employee_id,
        details=updates,
    )

    return EmployeeResponse(
        id=str(updated["id"]),
        business_id=business_id,
        user_id=updated.get("user_id"),
        full_name=updated["full_name"],
        email=updated["email"],
        phone=updated.get("phone"),
        role=updated["role"],
        base_salary=float(updated["base_salary"]),
        employment_status=updated["employment_status"],
        join_date=str(updated["join_date"]),
        department=updated["department"],
        created_at=str(updated.get("created_at", "")),
    )


@router.delete("/employees/{employee_id}")
async def deactivate_employee(
    employee_id: str,
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager"])),
    db=Depends(get_database),
) -> dict[str, Any]:
    business_id = await get_effective_business_id(token_payload)
    # Soft deactivate - never hard delete
    updated = await db.update_employee(employee_id, business_id, {"employment_status": "inactive"})
    if not updated:
        raise HTTPException(status_code=404, detail="Employee not found")

    await db.record_audit_log(
        business_id=business_id,
        user_id=token_payload.get("sub"),
        action="employee_deactivated",
        entity_type="employee",
        entity_id=employee_id,
    )
    return {"ok": True, "message": "Employee successfully deactivated."}


# ==================== ATTENDANCE (FR-5.2) ====================

@router.post("/attendance/check-in", response_model=AttendanceRecordResponse)
async def attendance_check_in(
    payload: AttendanceCheckInRequest,
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager", "hr_officer", "cashier", "staff"])),
    db=Depends(get_database),
) -> AttendanceRecordResponse:
    business_id = await get_effective_business_id(token_payload)
    user_id = token_payload.get("sub")

    emp_id = payload.employee_id
    if not emp_id:
        # resolve from user_id
        emp = await db.get_employee_by_user_id(str(user_id), business_id)
        if not emp:
            raise HTTPException(status_code=400, detail="No employee profile linked to your user account.")
        emp_id = str(emp["id"])

    work_date = date.today().isoformat()
    now_iso = datetime.now(UTC).isoformat()

    existing = await db.get_today_attendance(emp_id, work_date)
    if existing:
        if existing.get("check_in"):
            raise HTTPException(status_code=400, detail="Already checked in for today.")
        updated = await db.update_attendance(str(existing["id"]), business_id, {"check_in": now_iso, "status": "incomplete"})
        return AttendanceRecordResponse(
            id=str(updated["id"]),
            business_id=business_id,
            employee_id=emp_id,
            work_date=work_date,
            check_in=updated["check_in"],
            check_out=updated.get("check_out"),
            net_hours=float(updated.get("net_hours", 0.0)),
            status=updated["status"],
        )

    record = {
        "business_id": business_id,
        "employee_id": emp_id,
        "work_date": work_date,
        "check_in": now_iso,
        "check_out": None,
        "net_hours": 0.0,
        "status": "incomplete",
    }
    created = await db.create_attendance(record)
    return AttendanceRecordResponse(
        id=str(created["id"]),
        business_id=business_id,
        employee_id=emp_id,
        work_date=work_date,
        check_in=created["check_in"],
        status=created["status"],
    )


@router.post("/attendance/check-out", response_model=AttendanceRecordResponse)
async def attendance_check_out(
    payload: AttendanceCheckOutRequest,
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager", "hr_officer", "cashier", "staff"])),
    db=Depends(get_database),
) -> AttendanceRecordResponse:
    business_id = await get_effective_business_id(token_payload)
    user_id = token_payload.get("sub")

    emp_id = payload.employee_id
    if not emp_id:
        emp = await db.get_employee_by_user_id(str(user_id), business_id)
        if not emp:
            raise HTTPException(status_code=400, detail="No employee profile linked to your user account.")
        emp_id = str(emp["id"])

    work_date = date.today().isoformat()
    now_iso = datetime.now(UTC).isoformat()

    existing = await db.get_today_attendance(emp_id, work_date)
    if not existing or not existing.get("check_in"):
        raise HTTPException(status_code=400, detail="Cannot check out without an active check-in today.")

    check_in_dt = existing["check_in"]
    net_hours = calculate_net_hours(check_in_dt, now_iso, break_minutes=30)

    updated = await db.update_attendance(
        str(existing["id"]),
        business_id,
        {"check_out": now_iso, "net_hours": net_hours, "status": "present"},
    )
    return AttendanceRecordResponse(
        id=str(updated["id"]),
        business_id=business_id,
        employee_id=emp_id,
        work_date=work_date,
        check_in=updated["check_in"],
        check_out=updated["check_out"],
        net_hours=net_hours,
        status=updated["status"],
    )


@router.get("/attendance", response_model=list[AttendanceRecordResponse])
async def list_attendance(
    from_date: str | None = None,
    to_date: str | None = None,
    employee_id: str | None = None,
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager", "hr_officer", "cashier", "staff"])),
    db=Depends(get_database),
) -> list[AttendanceRecordResponse]:
    business_id = await get_effective_business_id(token_payload)
    role = token_payload.get("role", "staff")
    user_id = token_payload.get("sub")

    if role in ("cashier", "staff"):
        emp = await db.get_employee_by_user_id(str(user_id), business_id)
        employee_id = str(emp["id"]) if emp else "none"

    records = await db.get_attendance(business_id, from_date=from_date, to_date=to_date, employee_id=employee_id)
    return [
        AttendanceRecordResponse(
            id=str(r["id"]),
            business_id=business_id,
            employee_id=str(r["employee_id"]),
            employee_name=r.get("employee_name"),
            work_date=str(r["work_date"]),
            check_in=r.get("check_in"),
            check_out=r.get("check_out"),
            net_hours=float(r.get("net_hours", 0.0)),
            status=r["status"],
            correction_reason=r.get("correction_reason"),
        )
        for r in records
    ]


@router.patch("/attendance/{record_id}", response_model=AttendanceRecordResponse)
async def correct_attendance(
    record_id: str,
    payload: AttendanceCorrectionRequest,
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager", "hr_officer"])),
    db=Depends(get_database),
) -> AttendanceRecordResponse:
    business_id = await get_effective_business_id(token_payload)
    net_hours = calculate_net_hours(payload.check_in, payload.check_out, break_minutes=30)

    updates = {
        "check_in": payload.check_in,
        "check_out": payload.check_out,
        "net_hours": net_hours,
        "status": "corrected",
        "correction_reason": payload.correction_reason,
    }
    updated = await db.update_attendance(record_id, business_id, updates)
    if not updated:
        raise HTTPException(status_code=404, detail="Attendance record not found")

    await db.record_audit_log(
        business_id=business_id,
        user_id=token_payload.get("sub"),
        action="attendance_corrected",
        entity_type="attendance",
        entity_id=record_id,
        details={"reason": payload.correction_reason, "net_hours": net_hours},
    )

    return AttendanceRecordResponse(
        id=str(updated["id"]),
        business_id=business_id,
        employee_id=str(updated["employee_id"]),
        work_date=str(updated["work_date"]),
        check_in=updated["check_in"],
        check_out=updated["check_out"],
        net_hours=net_hours,
        status="corrected",
        correction_reason=payload.correction_reason,
    )


# ==================== LEAVE WORKFLOW (FR-5.3) ====================

@router.post("/leave", response_model=LeaveRequestResponse, status_code=status.HTTP_201_CREATED)
async def submit_leave(
    payload: LeaveSubmitRequest,
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager", "hr_officer", "cashier", "staff"])),
    db=Depends(get_database),
) -> LeaveRequestResponse:
    business_id = await get_effective_business_id(token_payload)
    user_id = token_payload.get("sub")

    emp_id = payload.employee_id
    if not emp_id:
        emp = await db.get_employee_by_user_id(str(user_id), business_id)
        if not emp:
            raise HTTPException(status_code=400, detail="No employee profile linked to user account.")
        emp_id = str(emp["id"])

    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=400, detail="Leave end date cannot be earlier than start date.")

    # Check for overlaps against approved leaves
    existing_leaves = await db.get_leave_requests(business_id, employee_id=emp_id)
    is_overlapping, overlap_msg = check_leave_overlap(payload.start_date, payload.end_date, existing_leaves)

    is_flagged = is_overlapping
    flag_reason = overlap_msg

    leave_doc = {
        "id": str(uuid.uuid4()),
        "business_id": business_id,
        "employee_id": emp_id,
        "start_date": str(payload.start_date),
        "end_date": str(payload.end_date),
        "leave_type": payload.leave_type,
        "reason": payload.reason,
        "status": "pending",
        "is_flagged": is_flagged,
        "flag_reason": flag_reason,
    }
    created = await db.create_leave_request(leave_doc)
    return LeaveRequestResponse(
        id=str(created["id"]),
        business_id=business_id,
        employee_id=emp_id,
        start_date=created["start_date"],
        end_date=created["end_date"],
        leave_type=created["leave_type"],
        reason=created["reason"],
        status=created["status"],
        is_flagged=created["is_flagged"],
        flag_reason=created.get("flag_reason"),
        created_at=str(created.get("created_at", "")),
    )


@router.get("/leave", response_model=list[LeaveRequestResponse])
async def list_leave(
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager", "hr_officer", "cashier", "staff"])),
    db=Depends(get_database),
) -> list[LeaveRequestResponse]:
    business_id = await get_effective_business_id(token_payload)
    role = token_payload.get("role", "staff")
    user_id = token_payload.get("sub")

    emp_id = None
    if role in ("cashier", "staff"):
        emp = await db.get_employee_by_user_id(str(user_id), business_id)
        emp_id = str(emp["id"]) if emp else "none"

    leaves = await db.get_leave_requests(business_id, employee_id=emp_id)
    return [
        LeaveRequestResponse(
            id=str(l["id"]),
            business_id=business_id,
            employee_id=str(l["employee_id"]),
            employee_name=l.get("employee_name"),
            start_date=str(l["start_date"]),
            end_date=str(l["end_date"]),
            leave_type=l["leave_type"],
            reason=l.get("reason"),
            status=l["status"],
            is_flagged=bool(l.get("is_flagged")),
            flag_reason=l.get("flag_reason"),
            reviewed_by=l.get("reviewed_by"),
            review_comment=l.get("review_comment"),
            created_at=str(l.get("created_at", "")),
        )
        for l in leaves
    ]


@router.patch("/leave/{leave_id}", response_model=LeaveRequestResponse)
async def review_leave(
    leave_id: str,
    payload: LeaveReviewRequest,
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager", "hr_officer"])),
    db=Depends(get_database),
) -> LeaveRequestResponse:
    business_id = await get_effective_business_id(token_payload)
    reviewer_id = token_payload.get("sub")

    updates = {
        "status": payload.status,
        "reviewed_by": reviewer_id,
        "review_comment": payload.review_comment,
    }
    updated = await db.update_leave_request(leave_id, business_id, updates)
    if not updated:
        raise HTTPException(status_code=404, detail="Leave request not found")

    await db.record_audit_log(
        business_id=business_id,
        user_id=reviewer_id,
        action=f"leave_{payload.status}",
        entity_type="leave",
        entity_id=leave_id,
        details={"status": payload.status, "comment": payload.review_comment},
    )

    return LeaveRequestResponse(
        id=str(updated["id"]),
        business_id=business_id,
        employee_id=str(updated["employee_id"]),
        start_date=str(updated["start_date"]),
        end_date=str(updated["end_date"]),
        leave_type=updated["leave_type"],
        reason=updated.get("reason"),
        status=updated["status"],
        is_flagged=bool(updated.get("is_flagged")),
        reviewed_by=reviewer_id,
        review_comment=payload.review_comment,
    )


# ==================== PAYROLL (FR-5.4, UC-7) ====================

@router.post("/payroll/runs", response_model=PayrollRunResponse, status_code=status.HTTP_201_CREATED)
async def generate_payroll_run(
    payload: PayrollRunCreateRequest,
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager", "hr_officer"])),
    db=Depends(get_database),
) -> PayrollRunResponse:
    """Drafts payroll for all active employees for the selected month."""
    business_id = await get_effective_business_id(token_payload)
    month = payload.payroll_month

    # Retrieve business setup for working days
    biz = await db.get_business(business_id)
    working_days = int(biz.get("working_days_per_month", 26)) if biz else 26

    employees = await db.get_employees(business_id)
    active_emps = [e for e in employees if e.get("employment_status") == "active"]

    run_doc = {
        "id": str(uuid.uuid4()),
        "business_id": business_id,
        "payroll_month": month,
        "status": "draft",
        "total_net_salary": 0.0,
    }
    run = await db.create_payroll_run(run_doc)
    run_id = str(run["id"])

    # Calculate payslip per employee
    payslips_created = []
    total_net = 0.0
    any_incomplete = False

    # Fetch approved unpaid leaves for the month
    leaves = await db.get_leave_requests(business_id)

    for emp in active_emps:
        emp_id = str(emp["id"])
        base_salary = float(emp.get("base_salary", 0.0))

        # Sum approved unpaid leave days
        unpaid_days = 0
        for lv in leaves:
            if lv.get("employee_id") == emp_id and lv.get("status") == "approved" and lv.get("leave_type") == "unpaid":
                s_date = date.fromisoformat(str(lv["start_date"])[:10])
                e_date = date.fromisoformat(str(lv["end_date"])[:10])
                unpaid_days += calculate_leave_days(s_date, e_date)

        # Check attendance completeness
        # If any attendance row has status 'incomplete', mark payslip incomplete
        att_rows = await db.get_attendance(business_id, from_date=f"{month}-01", to_date=f"{month}-31", employee_id=emp_id)
        has_incomplete_day = any(r.get("status") == "incomplete" for r in att_rows)

        calc = calculate_payroll_for_employee(
            base_salary=base_salary,
            working_days_in_month=working_days,
            unpaid_leave_days=unpaid_days,
            bonus_overtime=0.0,
            attendance_is_complete=not has_incomplete_day,
        )

        if calc["status"] == "incomplete":
            any_incomplete = True

        slip_doc = {
            "payroll_run_id": run_id,
            "employee_id": emp_id,
            "base_salary": calc["base_salary"],
            "unpaid_leave_days": calc["unpaid_leave_days"],
            "leave_deduction": calc["leave_deduction"],
            "bonus_overtime": 0.0,
            "net_salary": calc["net_salary"],
            "status": calc["status"],
            "notes": "Attendance incomplete for month" if has_incomplete_day else None,
        }
        slip = await db.create_payslip(slip_doc)
        total_net += calc["net_salary"]
        payslips_created.append(
            PayslipResponse(
                id=str(slip["id"]),
                payroll_run_id=run_id,
                employee_id=emp_id,
                employee_name=emp.get("full_name"),
                base_salary=calc["base_salary"],
                unpaid_leave_days=calc["unpaid_leave_days"],
                leave_deduction=calc["leave_deduction"],
                bonus_overtime=0.0,
                net_salary=calc["net_salary"],
                status=calc["status"],
                notes=slip_doc["notes"],
            )
        )

    run_status = "incomplete" if any_incomplete else "draft"
    await db.update_payroll_run(run_id, business_id, {"status": run_status, "total_net_salary": total_net})

    return PayrollRunResponse(
        id=run_id,
        business_id=business_id,
        payroll_month=month,
        status=run_status,
        total_net_salary=total_net,
        payslips=payslips_created,
        created_at=str(run.get("created_at", "")),
    )


@router.get("/payroll/runs")
async def list_payroll_runs(
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager", "hr_officer"])),
    db=Depends(get_database),
) -> list[dict[str, Any]]:
    business_id = await get_effective_business_id(token_payload)
    return await db.get_payroll_runs(business_id)


@router.get("/payroll/my-payslips")
async def list_my_payslips(
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager", "hr_officer", "cashier", "staff"])),
    db=Depends(get_database),
) -> list[dict[str, Any]]:
    business_id = await get_effective_business_id(token_payload)
    user_id = token_payload.get("sub")
    emp = await db.get_employee_by_user_id(str(user_id), business_id)
    if not emp:
        return []
    emp_id = str(emp["id"])
    return await db.get_payslips_for_employee(emp_id)


@router.get("/payroll/runs/{run_id}", response_model=PayrollRunResponse)
async def get_payroll_run(
    run_id: str,
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager", "hr_officer"])),
    db=Depends(get_database),
) -> PayrollRunResponse:
    business_id = await get_effective_business_id(token_payload)
    run = await db.get_payroll_run_by_id(run_id, business_id)
    if not run:
        raise HTTPException(status_code=404, detail="Payroll run not found")

    slips = await db.get_payslips_for_run(run_id)
    return PayrollRunResponse(
        id=str(run["id"]),
        business_id=business_id,
        payroll_month=run["payroll_month"],
        status=run["status"],
        total_net_salary=float(run.get("total_net_salary", 0.0)),
        approved_by=run.get("approved_by"),
        approved_at=run.get("approved_at"),
        payslips=[
            PayslipResponse(
                id=str(s["id"]),
                payroll_run_id=str(s["payroll_run_id"]),
                employee_id=str(s["employee_id"]),
                employee_name=s.get("employee_name"),
                base_salary=float(s["base_salary"]),
                unpaid_leave_days=int(s.get("unpaid_leave_days", 0)),
                leave_deduction=float(s.get("leave_deduction", 0.0)),
                bonus_overtime=float(s.get("bonus_overtime", 0.0)),
                net_salary=float(s["net_salary"]),
                status=s["status"],
                notes=s.get("notes"),
            )
            for s in slips
        ],
        created_at=str(run.get("created_at", "")),
    )


@router.patch("/payroll/payslips/{payslip_id}", response_model=PayslipResponse)
async def update_payslip_bonus(
    payslip_id: str,
    payload: PayslipUpdateRequest,
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager", "hr_officer"])),
    db=Depends(get_database),
) -> PayslipResponse:
    slip = await db.get_payslip_by_id(payslip_id)
    if not slip:
        raise HTTPException(status_code=404, detail="Payslip not found")

    base = float(slip["base_salary"])
    ded = float(slip.get("leave_deduction", 0.0))
    bonus = payload.bonus_overtime
    net = max(0.0, base - ded + bonus)

    updates = {
        "bonus_overtime": bonus,
        "net_salary": net,
        "notes": payload.notes,
    }
    updated = await db.update_payslip(payslip_id, updates)
    return PayslipResponse(
        id=str(updated["id"]),
        payroll_run_id=str(updated["payroll_run_id"]),
        employee_id=str(updated["employee_id"]),
        employee_name=updated.get("employee_name"),
        base_salary=float(updated["base_salary"]),
        unpaid_leave_days=int(updated.get("unpaid_leave_days", 0)),
        leave_deduction=float(updated.get("leave_deduction", 0.0)),
        bonus_overtime=float(updated["bonus_overtime"]),
        net_salary=float(updated["net_salary"]),
        status=updated["status"],
        notes=updated.get("notes"),
    )


@router.post("/payroll/runs/{run_id}/submit")
async def submit_payroll_run(
    run_id: str,
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager", "hr_officer"])),
    db=Depends(get_database),
) -> dict[str, Any]:
    business_id = await get_effective_business_id(token_payload)
    run = await db.get_payroll_run_by_id(run_id, business_id)
    if not run:
        raise HTTPException(status_code=404, detail="Payroll run not found")

    slips = await db.get_payslips_for_run(run_id)
    if any(s.get("status") == "incomplete" for s in slips):
        raise HTTPException(
            status_code=400,
            detail="Cannot submit payroll run: one or more payslips have incomplete attendance.",
        )

    await db.update_payroll_run(run_id, business_id, {"status": "pending_approval"})
    return {"ok": True, "message": "Payroll submitted for Owner/Manager approval."}


@router.post("/payroll/runs/{run_id}/approve")
async def approve_payroll_run(
    run_id: str,
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager"])),
    db=Depends(get_database),
) -> dict[str, Any]:
    """Strictly restricted to Owner and Manager. HR officer cannot finalise."""
    business_id = await get_effective_business_id(token_payload)
    user_id = token_payload.get("sub")

    run = await db.get_payroll_run_by_id(run_id, business_id)
    if not run:
        raise HTTPException(status_code=404, detail="Payroll run not found")

    slips = await db.get_payslips_for_run(run_id)
    if any(s.get("status") == "incomplete" for s in slips):
        raise HTTPException(
            status_code=400,
            detail="Cannot finalise payroll: incomplete payslips present.",
        )

    now_iso = datetime.now(UTC).isoformat()
    await db.update_payroll_run(run_id, business_id, {
        "status": "finalised",
        "approved_by": user_id,
        "approved_at": now_iso,
    })

    # Mark all payslips finalised
    for s in slips:
        await db.update_payslip(str(s["id"]), {"status": "finalised"})

    await db.record_audit_log(
        business_id=business_id,
        user_id=user_id,
        action="payroll_finalised",
        entity_type="payroll",
        entity_id=run_id,
        details={"payroll_month": run["payroll_month"], "total_net_salary": run.get("total_net_salary")},
    )

    return {"ok": True, "message": "Payroll finalised successfully. Payslips available for download."}


@router.get("/payroll/payslips/{payslip_id}/pdf")
async def download_payslip_pdf(
    payslip_id: str,
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager", "hr_officer", "cashier", "staff"])),
    db=Depends(get_database),
) -> Response:
    business_id = await get_effective_business_id(token_payload)
    role = token_payload.get("role", "staff")
    user_id = token_payload.get("sub")

    slip = await db.get_payslip_by_id(payslip_id)
    if not slip:
        raise HTTPException(status_code=404, detail="Payslip not found")

    emp = await db.get_employee_by_id(str(slip["employee_id"]), business_id)
    # Staff / Cashier can only view their own finalised payslip
    if role in ("cashier", "staff"):
        if not emp or emp.get("user_id") != user_id:
            raise HTTPException(status_code=403, detail="You can only download your own payslip.")
        if slip.get("status") != "finalised":
            raise HTTPException(status_code=403, detail="Payslip is not yet finalised by management.")

    biz = await db.get_business(business_id)
    biz_name = biz.get("name", "Vantage Retail") if biz else "Vantage Retail"

    # Generate structured printable payslip HTML / document
    html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Payslip - {emp.get('full_name') if emp else 'Employee'}</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #1F2A44; }}
        .header {{ border-bottom: 2px solid #131A2C; padding-bottom: 20px; margin-bottom: 30px; }}
        .biz-title {{ font-size: 24px; font-weight: 700; color: #131A2C; }}
        .sub {{ font-size: 13px; color: #5B6172; margin-top: 4px; }}
        .grid {{ display: flex; justify-content: space-between; margin-bottom: 24px; }}
        table {{ width: 100%; border-collapse: collapse; margin-top: 20px; }}
        th, td {{ padding: 12px 14px; text-align: left; border-bottom: 1px solid #E5E8F0; }}
        th {{ background: #F6F7FB; font-size: 12px; text-transform: uppercase; color: #5B6172; }}
        .total-row td {{ font-size: 16px; font-weight: 700; color: #131A2C; border-top: 2px solid #131A2C; }}
        .badge {{ display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; background: #DCF5F3; color: #0A7873; }}
        .disclaimer {{ margin-top: 40px; font-size: 11px; color: #8A90A2; text-align: center; border-top: 1px dashed #E5E8F0; padding-top: 15px; }}
    </style>
</head>
<body>
    <div class="header">
        <div class="biz-title">{biz_name}</div>
        <div class="sub">Official Employee Payslip &bull; Status: <span class="badge">{slip.get('status', 'draft').upper()}</span></div>
    </div>
    <div class="grid">
        <div>
            <strong>Employee Name:</strong> {emp.get('full_name') if emp else 'N/A'}<br>
            <strong>Role:</strong> {emp.get('role', 'N/A').title() if emp else 'N/A'}<br>
            <strong>Department:</strong> {emp.get('department', 'Operations') if emp else 'N/A'}
        </div>
        <div>
            <strong>Payslip ID:</strong> {slip['id'][:8]}<br>
            <strong>Generated Date:</strong> {date.today().isoformat()}<br>
            <strong>Currency:</strong> PKR (₨)
        </div>
    </div>
    <table>
        <thead>
            <tr>
                <th>Earnings / Deductions Description</th>
                <th style="text-align: right;">Amount (PKR)</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>Base Salary</td>
                <td style="text-align: right;">₨{float(slip['base_salary']):,.2f}</td>
            </tr>
            <tr>
                <td>Unpaid Leave Deductions ({slip.get('unpaid_leave_days', 0)} days)</td>
                <td style="text-align: right; color: #DC4C3E;">-₨{float(slip.get('leave_deduction', 0.0)):,.2f}</td>
            </tr>
            <tr>
                <td>Bonus &amp; Overtime Additions</td>
                <td style="text-align: right; color: #0EA5A0;">+₨{float(slip.get('bonus_overtime', 0.0)):,.2f}</td>
            </tr>
            <tr class="total-row">
                <td>Net Payable Salary</td>
                <td style="text-align: right;">₨{float(slip['net_salary']):,.2f}</td>
            </tr>
        </tbody>
    </table>
    <div class="disclaimer">
        This is a computer-generated salary slip approved by store operations. No physical signature required.
    </div>
</body>
</html>"""
    return Response(content=html, media_type="text/html", headers={"Content-Disposition": f"attachment; filename=payslip_{emp.get('full_name', 'staff').replace(' ', '_')}_{payslip_id[:6]}.html"})


# ==================== HR POLICY ASSISTANT & RAG (FR-5.5) ====================

def chunk_text(text: str, chunk_size: int = 650, overlap: int = 80) -> list[str]:
    """Chunks policy document into ~500-800 character windows with overlap."""
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end].strip())
        start += (chunk_size - overlap)
    return [c for c in chunks if len(c) > 20]


@router.post("/policies")
async def upload_hr_policy(
    payload: HRPolicyUploadRequest,
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager", "hr_officer"])),
    db=Depends(get_database),
    config: Settings = Depends(get_settings),
) -> dict[str, Any]:
    business_id = await get_effective_business_id(token_payload)

    chunks = chunk_text(payload.content)
    if not chunks:
        raise HTTPException(status_code=400, detail="Document content too short or empty")

    inserted_count = 0
    if config.openai_api_key:
        async with AsyncOpenAI(api_key=config.openai_api_key) as client:
            for idx, c_text in enumerate(chunks):
                embedding = None
                try:
                    emb_res = await client.embeddings.create(
                        model="text-embedding-3-small",
                        input=c_text,
                    )
                    embedding = emb_res.data[0].embedding
                except Exception as exc:
                    logger.warning("Policy embedding skipped: %s", exc)

                chunk_doc = {
                    "business_id": business_id,
                    "document_name": payload.document_name.strip(),
                    "content": c_text,
                    "chunk_index": idx,
                    "embedding": embedding,
                }
                await db.insert_hr_policy_chunk(chunk_doc)
                inserted_count += 1
    else:
        for idx, c_text in enumerate(chunks):
            chunk_doc = {
                "business_id": business_id,
                "document_name": payload.document_name.strip(),
                "content": c_text,
                "chunk_index": idx,
                "embedding": None,
            }
            await db.insert_hr_policy_chunk(chunk_doc)
            inserted_count += 1

    await db.record_audit_log(
        business_id=business_id,
        user_id=token_payload.get("sub"),
        action="policy_uploaded",
        entity_type="policy",
        entity_id=payload.document_name,
        details={"chunks": inserted_count},
    )

    return {
        "ok": True,
        "document_name": payload.document_name,
        "chunks_indexed": inserted_count,
        "message": f"Successfully indexed {inserted_count} policy chunks into pgvector.",
    }


@router.get("/policies")
async def list_hr_policies(
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager", "hr_officer", "cashier", "staff"])),
    db=Depends(get_database),
) -> list[dict[str, Any]]:
    business_id = await get_effective_business_id(token_payload)
    return await db.get_hr_policy_documents(business_id)


@router.delete("/policies/{document_name}")
async def delete_hr_policy(
    document_name: str,
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager"])),
    db=Depends(get_database),
) -> dict[str, Any]:
    business_id = await get_effective_business_id(token_payload)
    deleted = await db.delete_hr_policy_document(document_name, business_id)
    return {"ok": deleted, "message": f"Policy '{document_name}' deleted."}


@router.post("/assistant/ask", response_model=HRAssistantResponse)
async def ask_hr_assistant(
    payload: HRAssistantAskRequest,
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager", "hr_officer", "cashier", "staff"])),
    db=Depends(get_database),
    config: Settings = Depends(get_settings),
) -> HRAssistantResponse:
    business_id = await get_effective_business_id(token_payload)
    user_id = token_payload.get("sub")

    # Check subscription query allowance
    sub = await db.get_subscription(business_id)
    if sub and sub.get("ai_queries_used", 0) >= sub.get("ai_query_allowance", 500):
        raise HTTPException(
            status_code=402,
            detail="AI query allowance limit reached. Please upgrade your subscription plan.",
        )

    # Check if question is about user's own leave balance
    q_lower = payload.question.lower()
    if any(w in q_lower for w in ("leave", "balance", "vacation", "annual", "sick", "days off")):
        emp = await db.get_employee_by_user_id(str(user_id), business_id)
        if emp:
            biz = await db.get_business(business_id)
            annual_allowance = int(biz.get("annual_leave_days", 14)) if biz else 14
            user_leaves = await db.get_leave_requests(business_id, employee_id=str(emp["id"]))
            approved_used = sum(
                calculate_leave_days(
                    date.fromisoformat(str(l["start_date"])[:10]),
                    date.fromisoformat(str(l["end_date"])[:10]),
                )
                for l in user_leaves
                if l.get("status") == "approved" and l.get("leave_type") != "unpaid"
            )
            remaining = max(0, annual_allowance - approved_used)
            return HRAssistantResponse(
                answer=(
                    f"Hello {emp['full_name']}! You have used {approved_used} days out of your "
                    f"{annual_allowance} annual leave allowance. Your remaining balance is **{remaining} days**."
                ),
                sources=["Business Leave Balance Database"],
                ai_queries_remaining=max(0, sub.get("ai_query_allowance", 500) - sub.get("ai_queries_used", 0) - 1) if sub else 499,
            )

    # Retrieval from pgvector
    retrieved_chunks = []
    if config.openai_api_key:
        client = AsyncOpenAI(api_key=config.openai_api_key)
        try:
            emb_res = await client.embeddings.create(
                model="text-embedding-3-small",
                input=payload.question,
            )
            q_vector = emb_res.data[0].embedding
            retrieved_chunks = await db.search_hr_policies(q_vector, business_id=business_id, count=4)
        except Exception as exc:
            logger.warning("RAG embedding retrieval skipped: %s", exc)

    if not retrieved_chunks:
        return HRAssistantResponse(
            answer="I am sorry, but the company HR policies uploaded do not cover this topic. Please consult your HR Officer or Store Manager.",
            sources=[],
            ai_queries_remaining=sub.get("ai_query_allowance", 500) - sub.get("ai_queries_used", 0) if sub else 500,
        )

    context_text = "\n\n---\n\n".join([c["content"] for c in retrieved_chunks])
    doc_sources = list({c.get("document_name", "Policy Document") for c in retrieved_chunks})

    # Pass strictly to GPT-4o
    system_prompt = (
        "You are the AI COO HR Intelligence Assistant. Answer the employee's question strictly and factually "
        "using ONLY the policy context below. If the policy context does not explicitly contain the answer, "
        "reply that the company policy does not cover this question. Do NOT invent policies or rules."
    )
    user_prompt = f"Policy Context:\n{context_text}\n\nEmployee Question: {payload.question}"

    try:
        client = AsyncOpenAI(api_key=config.openai_api_key)
        response = await client.chat.completions.create(
            model=config.openai_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=500,
            temperature=0.2,
        )
        answer = response.choices[0].message.content.strip()
        tokens_used = response.usage.total_tokens if response.usage else 100
    except Exception as exc:
        logger.exception("AI Q&A failed")
        raise HTTPException(status_code=502, detail="Failed to generate AI answer from HR policies.") from exc

    # Log AI usage
    await db.record_ai_usage({
        "business_id": business_id,
        "user_id": user_id,
        "agent_type": "hr_assistant",
        "model": config.openai_model,
        "total_tokens": tokens_used,
        "endpoint": "/api/hr/assistant/ask",
    })

    remaining = max(0, (sub.get("ai_query_allowance", 500) - sub.get("ai_queries_used", 0) - 1)) if sub else 499

    return HRAssistantResponse(
        answer=answer,
        sources=doc_sources,
        ai_queries_remaining=remaining,
    )
