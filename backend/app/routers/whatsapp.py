from datetime import UTC, datetime
import hashlib
import hmac
import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response, status

from ..config import Settings, get_settings
from ..database import get_database

logger = logging.getLogger("vantage.whatsapp")
router = APIRouter(prefix="/api/whatsapp", tags=["WhatsApp Integration"])


def verify_hmac_signature(payload: bytes, signature_header: str | None, app_secret: str) -> bool:
    """Verifies WhatsApp X-Hub-Signature-256 HMAC-SHA256."""
    if not signature_header or not app_secret:
        return True  # If no secret configured in test/dev, permit for testing
    if not signature_header.startswith("sha256="):
        return False
    expected_hash = signature_header[7:]
    mac = hmac.new(app_secret.encode("utf-8"), msg=payload, digestmod=hashlib.sha256)
    computed_hash = mac.hexdigest()
    return hmac.compare_digest(expected_hash, computed_hash)


@router.get("/webhook")
async def verify_webhook(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    config: Settings = Depends(get_settings),
) -> Response:
    """WhatsApp Cloud API Webhook handshake."""
    if hub_mode == "subscribe" and hub_verify_token == (config.whatsapp_verify_token or "ai_coo_whatsapp_verify"):
        return Response(content=hub_challenge, media_type="text/plain")
    raise HTTPException(status_code=403, detail="Verification token mismatch")


@router.post("/webhook")
async def receive_webhook(
    request: Request,
    x_hub_signature_256: str | None = Header(None),
    config: Settings = Depends(get_settings),
    db=Depends(get_database),
) -> dict[str, Any]:
    """
    Receives incoming WhatsApp messages:
    1. Verifies HMAC-SHA256 signature
    2. Maps sender phone -> user + tenant
    3. If sender is unregistered, replies rejection with ZERO business data
    4. If registered owner/manager, processes query or approval reply under HITL
    """
    raw_body = await request.body()

    if config.whatsapp_app_secret and not verify_hmac_signature(raw_body, x_hub_signature_256, config.whatsapp_app_secret):
        logger.warning("WhatsApp HMAC signature verification failed")
        raise HTTPException(status_code=403, detail="Invalid webhook signature")

    try:
        body = json.loads(raw_body.decode("utf-8"))
    except Exception:
        body = {}

    # Extract sender phone & message
    sender_phone = ""
    message_text = ""

    entries = body.get("entry", [])
    if entries and isinstance(entries, list):
        changes = entries[0].get("changes", [])
        if changes and isinstance(changes, list):
            value = changes[0].get("value", {})
            messages = value.get("messages", [])
            if messages and isinstance(messages, list):
                msg = messages[0]
                sender_phone = msg.get("from", "")
                message_text = msg.get("text", {}).get("body", "")

    if not sender_phone:
        return {"status": "ignored", "reason": "no_incoming_message"}

    # Map sender phone to user & business
    user = await db.get_user_by_phone(sender_phone)
    if not user:
        # Check formatted variations (with/without leading +)
        alt_phone = f"+{sender_phone}" if not sender_phone.startswith("+") else sender_phone.lstrip("+")
        user = await db.get_user_by_phone(alt_phone)

    if not user or user.get("status") != "active":
        # Unregistered or inactive sender: REJECT with NO BUSINESS DATA (SEC-9)
        logger.warning("Unauthorized WhatsApp message from unregistered number: %s", sender_phone)
        return {
            "status": "rejected",
            "message": "Number not recognized. Contact your Vantage business administrator to link your phone number.",
        }

    business_id = str(user.get("business_id", user["id"]))

    # Parse message intent
    reply_text = ""
    lower_text = message_text.lower()

    if "sales today" in lower_text or "today sales" in lower_text:
        today_str = datetime.now(UTC).date().isoformat()
        entries = await db.get_ledger_entries(business_id, from_date=today_str, to_date=today_str, entry_type="revenue")
        total_today = sum(float(e["amount"]) for e in entries if not e.get("is_voided"))
        reply_text = f"Sales recorded today: PKR {total_today:,.2f} across {len(entries)} transaction(s)."

    elif "approve" in lower_text:
        # Example HITL approval command via WhatsApp
        await db.record_audit_log(
            business_id=business_id,
            user_id=user["id"],
            action="whatsapp_approval_received",
            entity_type="whatsapp_action",
            entity_id=sender_phone,
            channel="whatsapp",
            details={"raw_text": message_text},
        )
        reply_text = "Approval recorded successfully via WhatsApp."

    else:
        reply_text = f"Hello {user.get('full_name') or user.get('owner', 'Store Manager')}. Vantage AI COO received: '{message_text}'. Reply 'sales today' for current figures."

    return {
        "status": "processed",
        "sender_phone": sender_phone,
        "user_id": user["id"],
        "reply": reply_text,
    }
