from datetime import UTC, datetime
import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from ..config import Settings, get_settings
from ..database import get_database
from ..schemas import (
    AddTeamMemberRequest,
    BillingUsageResponse,
    BusinessSetupRequest,
    BusinessSetupResponse,
    ConnectionsResponse,
    ConnectionsUpdateRequest,
    PasswordChangeRequest,
    ProfileUpdateRequest,
    TeamMemberResponse,
    UserResponse,
    UserRoleUpdateRequest,
    UserStatusUpdateRequest,
)
from ..security import (
    hash_password,
    require_role,
    verify_password,
)

logger = logging.getLogger("vantage.account")
router = APIRouter(prefix="/api/account", tags=["Account & Administration"])


async def get_effective_business_id(payload: dict[str, Any]) -> str:
    biz_id = payload.get("business_id") or payload.get("sub")
    if not biz_id:
        raise HTTPException(status_code=401, detail="Authentication invalid: missing business_id")
    return str(biz_id)


# ==================== PROFILE (5.1) ====================

@router.get("/profile", response_model=UserResponse)
async def get_profile(
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager", "hr_officer", "cashier", "staff"])),
    db=Depends(get_database),
) -> UserResponse:
    user_id = token_payload.get("sub")
    user = await db.get_user_by_id(str(user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return UserResponse(
        id=str(user["id"]),
        business_id=str(user.get("business_id", "")),
        business=user.get("business", ""),
        owner=user.get("full_name") or user.get("owner", ""),
        email=user["email"],
        phone_number=user.get("phone_number"),
        role=user.get("role", "staff"),
        status=user.get("status", "active"),
        plan=user.get("plan", "standard"),
        owner_id=user.get("owner_id"),
    )


@router.put("/profile", response_model=UserResponse)
async def update_profile(
    payload: ProfileUpdateRequest,
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager", "hr_officer", "cashier", "staff"])),
    db=Depends(get_database),
) -> UserResponse:
    user_id = token_payload.get("sub")
    updates = {}
    if payload.owner:
        updates["full_name"] = payload.owner.strip()
    if payload.phone_number:
        # Check phone uniqueness
        existing = await db.get_user_by_phone(payload.phone_number.strip())
        if existing and str(existing["id"]) != str(user_id):
            raise HTTPException(status_code=409, detail="This phone number is already registered to another account.")
        updates["phone_number"] = payload.phone_number.strip()

    updated = await db.update_user(str(user_id), updates)
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")

    return UserResponse(
        id=str(updated["id"]),
        business_id=str(updated.get("business_id", "")),
        business=updated.get("business", ""),
        owner=updated.get("full_name") or updated.get("owner", ""),
        email=updated["email"],
        phone_number=updated.get("phone_number"),
        role=updated.get("role", "staff"),
        status=updated.get("status", "active"),
        plan=updated.get("plan", "standard"),
    )


@router.post("/password")
async def change_password(
    payload: PasswordChangeRequest,
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager", "hr_officer", "cashier", "staff"])),
    db=Depends(get_database),
) -> dict[str, Any]:
    user_id = token_payload.get("sub")
    user = await db.get_user_by_id(str(user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not verify_password(payload.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")

    await db.update_user(str(user_id), {"password_hash": hash_password(payload.new_password)})
    return {"ok": True, "message": "Password updated successfully."}


# ==================== MANAGE ROLES (OWNER ONLY) ====================

@router.get("/roles", response_model=list[TeamMemberResponse])
async def list_tenant_users(
    token_payload: dict[str, Any] = Depends(require_role(["owner"])),
    db=Depends(get_database),
) -> list[TeamMemberResponse]:
    business_id = await get_effective_business_id(token_payload)
    members = await db.get_team_members(business_id)
    return [
        TeamMemberResponse(
            id=str(m["id"]),
            business_id=business_id,
            business=m.get("business"),
            owner=m.get("full_name") or m.get("owner", ""),
            email=m["email"],
            phone_number=m.get("phone_number"),
            role=m["role"],
            status=m.get("status", "active"),
            plan=m.get("plan", "standard"),
            created_at=str(m.get("created_at", "")),
        )
        for m in members
    ]


@router.post("/roles", response_model=TeamMemberResponse, status_code=status.HTTP_201_CREATED)
async def invite_tenant_user(
    payload: AddTeamMemberRequest,
    token_payload: dict[str, Any] = Depends(require_role(["owner"])),
    db=Depends(get_database),
) -> TeamMemberResponse:
    business_id = await get_effective_business_id(token_payload)
    user_id = str(uuid.uuid4())
    now = datetime.now(UTC).isoformat()

    doc = {
        "id": user_id,
        "business_id": business_id,
        "business": business_id,
        "full_name": payload.name.strip(),
        "email": str(payload.email).lower(),
        "phone_number": payload.phone_number,
        "password_hash": hash_password(payload.password),
        "role": payload.role,
        "status": "active",
        "plan": "standard",
        "owner_id": token_payload.get("sub"),
        "created_at": now,
    }
    created = await db.create_user(doc, auth_password=payload.password)

    await db.record_audit_log(
        business_id=business_id,
        user_id=token_payload.get("sub"),
        action="user_invited",
        entity_type="user",
        entity_id=user_id,
        details={"name": payload.name, "role": payload.role, "email": payload.email},
    )

    return TeamMemberResponse(
        id=user_id,
        business_id=business_id,
        business=business_id,
        owner=payload.name,
        email=payload.email,
        phone_number=payload.phone_number,
        role=payload.role,
        status="active",
        plan="standard",
        created_at=now,
    )


@router.patch("/roles/{member_id}/status")
async def toggle_user_status(
    member_id: str,
    payload: UserStatusUpdateRequest,
    token_payload: dict[str, Any] = Depends(require_role(["owner"])),
    db=Depends(get_database),
) -> dict[str, Any]:
    business_id = await get_effective_business_id(token_payload)
    target = await db.get_user_by_id(member_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Protection: Cannot suspend/lock last owner
    if target.get("role") == "owner" and payload.status in ("suspended", "locked"):
        members = await db.get_team_members(business_id)
        owners = [m for m in members if m.get("role") == "owner" and m.get("status") == "active"]
        if len(owners) <= 1:
            raise HTTPException(status_code=400, detail="Cannot suspend the last active business owner.")

    await db.update_user(member_id, {"status": payload.status})
    await db.record_audit_log(
        business_id=business_id,
        user_id=token_payload.get("sub"),
        action=f"user_status_{payload.status}",
        entity_type="user",
        entity_id=member_id,
    )
    return {"ok": True, "message": f"User status updated to {payload.status}."}


@router.patch("/roles/{member_id}/role")
async def update_user_role(
    member_id: str,
    payload: UserRoleUpdateRequest,
    token_payload: dict[str, Any] = Depends(require_role(["owner"])),
    db=Depends(get_database),
) -> dict[str, Any]:
    business_id = await get_effective_business_id(token_payload)
    target = await db.get_user_by_id(member_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Protection: Cannot demote the last owner
    if target.get("role") == "owner" and payload.role != "owner":
        members = await db.get_team_members(business_id)
        owners = [m for m in members if m.get("role") == "owner" and m.get("status") == "active"]
        if len(owners) <= 1:
            raise HTTPException(status_code=400, detail="Cannot demote the last active business owner.")

    await db.update_user(member_id, {"role": payload.role})
    await db.record_audit_log(
        business_id=business_id,
        user_id=token_payload.get("sub"),
        action="user_role_changed",
        entity_type="user",
        entity_id=member_id,
        details={"new_role": payload.role},
    )
    return {"ok": True, "role": payload.role}


# ==================== BUSINESS SETUP (5.1) ====================

@router.get("/business-setup", response_model=BusinessSetupResponse)
async def get_business_setup(
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager"])),
    db=Depends(get_database),
) -> BusinessSetupResponse:
    business_id = await get_effective_business_id(token_payload)
    biz = await db.get_business(business_id)
    if not biz:
        biz = await db.create_business({
            "id": business_id,
            "name": "My Business Store",
            "industry": "Retail & Superstore",
            "currency": "PKR",
            "tax_rate": 0.0,
            "annual_leave_days": 14,
            "working_days_per_month": 26,
            "low_stock_threshold_default": 20,
        })
    return BusinessSetupResponse(
        id=str(biz["id"]),
        name=biz.get("name", "Store"),
        industry=biz.get("industry", "Retail"),
        currency=biz.get("currency", "PKR"),
        tax_rate=float(biz.get("tax_rate", 0.0)),
        annual_leave_days=int(biz.get("annual_leave_days", 14)),
        working_days_per_month=int(biz.get("working_days_per_month", 26)),
        low_stock_threshold_default=int(biz.get("low_stock_threshold_default", 20)),
    )


@router.put("/business-setup", response_model=BusinessSetupResponse)
async def update_business_setup(
    payload: BusinessSetupRequest,
    token_payload: dict[str, Any] = Depends(require_role(["owner"])),
    db=Depends(get_database),
) -> BusinessSetupResponse:
    business_id = await get_effective_business_id(token_payload)
    updates = payload.model_dump()
    updated = await db.update_business(business_id, updates)
    if not updated:
        updated = await db.create_business({"id": business_id, **updates})

    await db.record_audit_log(
        business_id=business_id,
        user_id=token_payload.get("sub"),
        action="business_setup_updated",
        entity_type="business_setup",
        entity_id=business_id,
        details=updates,
    )

    return BusinessSetupResponse(
        id=str(updated["id"]),
        name=updated["name"],
        industry=updated["industry"],
        currency=updated["currency"],
        tax_rate=float(updated["tax_rate"]),
        annual_leave_days=int(updated["annual_leave_days"]),
        working_days_per_month=int(updated["working_days_per_month"]),
        low_stock_threshold_default=int(updated["low_stock_threshold_default"]),
    )


# ==================== BILLING & USAGE METER (FR-P.5) ====================

@router.get("/billing", response_model=BillingUsageResponse)
async def get_billing_usage(
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager"])),
    db=Depends(get_database),
) -> BillingUsageResponse:
    business_id = await get_effective_business_id(token_payload)
    sub = await db.get_subscription(business_id)
    if not sub:
        sub = await db.create_subscription({
            "business_id": business_id,
            "plan": "standard",
            "ai_query_allowance": 500,
            "ai_queries_used": 0,
            "status": "active",
        })

    allowance = int(sub.get("ai_query_allowance", 500))
    used = int(sub.get("ai_queries_used", 0))
    remaining = max(0, allowance - used)

    return BillingUsageResponse(
        plan=sub.get("plan", "standard"),
        ai_query_allowance=allowance,
        ai_queries_used=used,
        ai_queries_remaining=remaining,
        status=sub.get("status", "active"),
        current_period_end=str(sub.get("current_period_end", "")),
    )


@router.post("/billing/upgrade")
async def upgrade_plan(
    target_plan: str,
    token_payload: dict[str, Any] = Depends(require_role(["owner"])),
    db=Depends(get_database),
) -> dict[str, Any]:
    business_id = await get_effective_business_id(token_payload)
    allowance_map = {"basic": 200, "standard": 500, "premium": 2000}
    new_allowance = allowance_map.get(target_plan.lower(), 500)

    # In production, this generates a Stripe/Polar checkout URL
    sub = await db.get_subscription(business_id)
    if sub:
        await db.update_subscription(
            business_id,
            {"plan": target_plan.lower(), "ai_query_allowance": new_allowance},
        )

    await db.record_audit_log(
        business_id=business_id,
        user_id=token_payload.get("sub"),
        action="plan_upgrade_requested",
        entity_type="billing",
        entity_id=target_plan,
    )

    return {
        "ok": True,
        "plan": target_plan,
        "ai_query_allowance": new_allowance,
        "checkout_url": f"https://buy.stripe.com/test_ai_coo_{target_plan}",
        "message": f"Upgraded to {target_plan.title()} plan ({new_allowance} AI queries/month).",
    }


# ==================== CONNECTIONS (WHATSAPP & SMTP) ====================

@router.get("/connections", response_model=ConnectionsResponse)
async def get_connections(
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager"])),
    config: Settings = Depends(get_settings),
) -> ConnectionsResponse:
    return ConnectionsResponse(
        whatsapp_connected=bool(config.whatsapp_phone_number_id and config.whatsapp_access_token),
        whatsapp_phone_number_id=config.whatsapp_phone_number_id or None,
        smtp_connected=config.smtp_configured,
        smtp_host=config.smtp_host,
        smtp_user=config.smtp_user,
    )


@router.put("/connections", response_model=ConnectionsResponse)
async def update_connections(
    payload: ConnectionsUpdateRequest,
    token_payload: dict[str, Any] = Depends(require_role(["owner"])),
    config: Settings = Depends(get_settings),
    db=Depends(get_database),
) -> ConnectionsResponse:
    business_id = await get_effective_business_id(token_payload)

    # Persist in config / business records
    if payload.whatsapp_phone_number_id is not None:
        config.whatsapp_phone_number_id = payload.whatsapp_phone_number_id
    if payload.whatsapp_access_token is not None:
        config.whatsapp_access_token = payload.whatsapp_access_token
    if payload.whatsapp_app_secret is not None:
        config.whatsapp_app_secret = payload.whatsapp_app_secret

    if payload.smtp_host is not None:
        config.smtp_host = payload.smtp_host
    if payload.smtp_user is not None:
        config.smtp_user = payload.smtp_user
    if payload.smtp_password is not None:
        config.smtp_password = payload.smtp_password
    if payload.smtp_port is not None:
        config.smtp_port = payload.smtp_port

    await db.record_audit_log(
        business_id=business_id,
        user_id=token_payload.get("sub"),
        action="connections_settings_updated",
        entity_type="connections",
        entity_id=business_id,
    )

    return ConnectionsResponse(
        whatsapp_connected=bool(config.whatsapp_phone_number_id and config.whatsapp_access_token),
        whatsapp_phone_number_id=config.whatsapp_phone_number_id or None,
        smtp_connected=config.smtp_configured,
        smtp_host=config.smtp_host,
        smtp_user=config.smtp_user,
    )
