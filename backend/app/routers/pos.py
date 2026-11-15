from datetime import UTC, datetime
import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from ..database import get_database
from ..schemas import POSSaleCheckoutRequest, POSSaleResponse
from ..security import get_current_token_payload, require_role

logger = logging.getLogger("vantage.pos")
router = APIRouter(prefix="/api/pos", tags=["Point of Sale (POS)"])


async def get_effective_business_id(payload: dict[str, Any]) -> str:
    biz_id = payload.get("business_id") or payload.get("sub")
    if not biz_id:
        raise HTTPException(status_code=401, detail="Authentication invalid: missing business_id")
    return str(biz_id)


@router.post("/checkout", response_model=POSSaleResponse, status_code=status.HTTP_201_CREATED)
async def atomic_pos_checkout(
    payload: POSSaleCheckoutRequest,
    token_payload: dict[str, Any] = Depends(require_role(["owner", "manager", "cashier", "staff"])),
    db=Depends(get_database),
) -> POSSaleResponse:
    """
    Executes atomic POS sale checkout:
    1. Inserts into pos_sales
    2. Inserts line items into pos_sale_items
    3. Decrements stock and appends to stock_history
    4. Appends revenue to ledger_entries
    Any failure rolls back all operations.
    """
    business_id = await get_effective_business_id(token_payload)
    user_id = token_payload.get("sub")
    now_iso = datetime.now(UTC).isoformat()
    invoice_num = payload.invoice_number or f"INV-{int(datetime.now().timestamp())}"

    sale_data = {
        "id": str(uuid.uuid4()),
        "business_id": business_id,
        "invoice_number": invoice_num,
        "cashier_id": user_id,
        "customer_id": payload.customer_id,
        "customer_name": payload.customer_name,
        "subtotal": payload.subtotal,
        "discount": payload.discount,
        "tax": payload.tax,
        "total": payload.total,
        "payment_method": payload.payment_method,
        "status": "completed",
    }

    items_data = [
        {
            "product_id": item.product_id,
            "item_name": item.item_name,
            "quantity": item.quantity,
            "unit_price": item.unit_price,
            "subtotal": round(item.quantity * item.unit_price, 2),
        }
        for item in payload.items
    ]

    try:
        created_sale = await db.record_pos_sale(business_id, sale_data, items_data)
    except Exception as exc:
        logger.exception("Atomic POS checkout transaction failed")
        raise HTTPException(status_code=500, detail=f"Checkout transaction failed: {exc}") from exc

    await db.record_audit_log(
        business_id=business_id,
        user_id=user_id,
        action="pos_sale_completed",
        entity_type="pos_sale",
        entity_id=created_sale["id"],
        details={"invoice": invoice_num, "total": payload.total, "items": len(payload.items)},
    )

    return POSSaleResponse(
        sale_id=str(created_sale["id"]),
        invoice_number=invoice_num,
        total=payload.total,
        items_count=len(payload.items),
        created_at=now_iso,
    )
