from datetime import UTC, datetime
from uuid import uuid4
import json
import logging
import re
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from openai import AsyncOpenAI, AuthenticationError, BadRequestError, RateLimitError

from .config import Settings, get_settings
from .database import get_database, lifespan
from .routers.account import router as account_router
from .routers.finance import router as finance_router
from .routers.hr import router as hr_router
from .routers.pos import router as pos_router
from .routers.whatsapp import router as whatsapp_router
from .schemas import (
    AddTeamMemberRequest,
    AuthResponse,
    ChatRequest,
    ChatResponse,
    KnowledgeIngestRequest,
    KnowledgeSearchRequest,
    LoginRequest,
    RegisterRequest,
    TeamMemberResponse,
    UserResponse,
    WorkspaceState,
    WorkspaceStateUpdate,
)
from .security import (
    create_access_token,
    get_current_user_id,
    hash_password,
    verify_password,
)

logger = logging.getLogger("vantage")
app = FastAPI(
    title="AI COO — Automated SMEO Platform API",
    version="2.0.0",
    lifespan=lifespan,
)
settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Subsystem Routers
app.include_router(hr_router)
app.include_router(finance_router)
app.include_router(account_router)
app.include_router(pos_router)
app.include_router(whatsapp_router)


def public_user(document: dict) -> UserResponse:
    biz_id = str(document.get("business_id") or document.get("business") or document["id"])
    return UserResponse(
        id=str(document["id"]),
        business_id=biz_id,
        business=document.get("business") or document.get("business_id", ""),
        owner=document.get("full_name") or document.get("owner", ""),
        email=document["email"],
        phone_number=document.get("phone_number"),
        role=document.get("role", "owner"),
        status=document.get("status", "active"),
        plan=document.get("plan", "standard"),
        owner_id=document.get("owner_id"),
        email_verified=True,
    )


async def get_current_user(
    user_id: str = Depends(get_current_user_id),
    db=Depends(get_database),
) -> dict:
    user = await db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User no longer exists")
    if user.get("status") == "locked":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is locked due to failed attempts.")
    if user.get("status") == "suspended":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is suspended. Contact business owner.")
    return user


@app.get("/api/v1/health")
@app.get("/api/health")
async def health(config: Settings = Depends(get_settings)) -> dict[str, Any]:
    return {
        "status": "ok",
        "platform": "AI COO (SMEO)",
        "database": "supabase" if config.supabase_configured else "local-sqlite",
        "vector_store": "pgvector (1536-dim)",
        "version": "2.0.0",
    }


# ==================== AUTHENTICATION (FR-P.1, FR-P.2) ====================

@app.post("/api/v1/auth/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
@app.post("/api/auth/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, db=Depends(get_database)) -> AuthResponse:
    email = str(payload.email).lower()
    if await db.get_user_by_email(email):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists.")

    now = datetime.now(UTC)
    user_id = str(uuid4())
    biz_id = str(uuid4())

    document = {
        "id": user_id,
        "business_id": biz_id,
        "business": payload.business.strip(),
        "owner": payload.owner.strip(),
        "full_name": payload.owner.strip(),
        "email": email,
        "phone_number": payload.phone_number,
        "password_hash": hash_password(payload.password),
        "role": payload.role,
        "status": "active",
        "failed_login_count": 0,
        "plan": "standard",
        "owner_id": None,
        "created_at": now.isoformat(),
    }
    # The users table references businesses(id) in Supabase. Create the tenant
    # row first so registration works against the production schema as well as SQLite.
    await db.create_business({"id": biz_id, "name": payload.business.strip()})
    created = await db.create_user(document)
    token = create_access_token(
        str(created["id"]),
        settings,
        business_id=biz_id,
        role=created.get("role", "owner"),
    )
    return AuthResponse(access_token=token, user=public_user(created))


@app.post("/api/v1/auth/login", response_model=AuthResponse)
@app.post("/api/auth/login", response_model=AuthResponse)
async def login(payload: LoginRequest, db=Depends(get_database)) -> AuthResponse:
    email = str(payload.email).lower()
    user = await db.get_user_by_email(email)

    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email or password is incorrect")

    # Lockout check (FR-P.2, 5 failed attempts lock account)
    if user.get("status") == "locked":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is locked after 5 failed login attempts. Contact your store owner to unlock.",
        )

    if not verify_password(payload.password, user["password_hash"]):
        failed_count = int(user.get("failed_login_count", 0)) + 1
        updates: dict[str, Any] = {"failed_login_count": failed_count}
        if failed_count >= 5:
            updates["status"] = "locked"
        await db.update_user(str(user["id"]), updates)

        if failed_count >= 5:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account has been locked due to 5 consecutive failed login attempts.",
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Email or password is incorrect. (Attempt {failed_count} of 5 before lockout)",
        )

    # Reset failed attempts on success
    if user.get("failed_login_count", 0) > 0:
        await db.update_user(str(user["id"]), {"failed_login_count": 0})

    biz_id = str(user.get("business_id") or user.get("business") or user["id"])
    token = create_access_token(
        str(user["id"]),
        settings,
        business_id=biz_id,
        role=user.get("role", "staff"),
    )
    return AuthResponse(access_token=token, user=public_user(user))


@app.get("/api/v1/auth/me", response_model=UserResponse)
@app.get("/api/auth/me", response_model=UserResponse)
async def me(current_user: dict = Depends(get_current_user)) -> UserResponse:
    return public_user(current_user)


# ==================== TEAM & ROLES (COMPATIBILITY) ====================

@app.get("/api/v1/team/users", response_model=list[TeamMemberResponse])
async def list_team_members(
    current_user: dict = Depends(get_current_user),
    db=Depends(get_database),
) -> list[TeamMemberResponse]:
    if current_user.get("role") not in ("owner", "manager", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only business owners and managers can view team members")

    biz_id = str(current_user.get("business_id") or current_user.get("owner_id") or current_user["id"])
    members = await db.get_team_members(biz_id)
    return [
        TeamMemberResponse(
            id=str(m["id"]),
            business_id=biz_id,
            business=m.get("business", current_user.get("business", "")),
            owner=m.get("full_name") or m.get("owner", ""),
            email=m["email"],
            phone_number=m.get("phone_number"),
            role=m.get("role", "staff"),
            status=m.get("status", "active"),
            plan=m.get("plan", "standard"),
            created_at=str(m.get("created_at", "")),
        )
        for m in members
    ]


@app.post("/api/v1/team/users", response_model=TeamMemberResponse, status_code=status.HTTP_201_CREATED)
async def add_team_member(
    payload: AddTeamMemberRequest,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_database),
) -> TeamMemberResponse:
    if current_user.get("role") not in ("owner", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only business owners can add staff members")

    biz_id = str(current_user.get("business_id") or current_user["id"])
    now = datetime.now(UTC)
    member_id = str(uuid4())
    document = {
        "id": member_id,
        "business_id": biz_id,
        "business": current_user.get("business", ""),
        "full_name": payload.name.strip(),
        "owner": payload.name.strip(),
        "email": str(payload.email).lower(),
        "phone_number": payload.phone_number,
        "password_hash": hash_password(payload.password),
        "role": payload.role,
        "status": "active",
        "plan": current_user.get("plan", "standard"),
        "owner_id": current_user["id"],
        "created_at": now.isoformat(),
    }
    created = await db.create_user(document)
    return TeamMemberResponse(
        id=str(created["id"]),
        business_id=biz_id,
        business=created.get("business"),
        owner=created.get("full_name") or created.get("owner"),
        email=created["email"],
        phone_number=created.get("phone_number"),
        role=created["role"],
        status="active",
        plan=created.get("plan", "standard"),
        created_at=str(created.get("created_at", "")),
    )


@app.delete("/api/v1/team/users/{member_id}")
async def remove_team_member(
    member_id: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_database),
) -> dict[str, Any]:
    if current_user.get("role") not in ("owner", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only business owners can remove staff members")

    biz_id = str(current_user.get("business_id") or current_user["id"])
    target = await db.get_user_by_id(member_id)
    if not target:
        raise HTTPException(status_code=404, detail="Team member not found")

    # Demote/suspend or soft remove
    await db.update_user(member_id, {"status": "suspended"})
    return {"ok": True, "message": "Staff member account deactivated successfully"}


# ==================== WORKSPACE (SHARED STATE) ====================

@app.get("/api/v1/workspace", response_model=WorkspaceState)
@app.get("/api/workspace", response_model=WorkspaceState)
async def get_workspace(
    current_user: dict = Depends(get_current_user),
    db=Depends(get_database),
) -> WorkspaceState:
    business_id = str(current_user.get("business_id") or current_user.get("owner_id") or current_user["id"])
    workspace = await db.get_workspace(business_id)
    return WorkspaceState(
        state=workspace["state"] if workspace else {},
        updated_at=workspace.get("updated_at") if workspace else None,
    )


@app.put("/api/v1/workspace", response_model=WorkspaceState)
@app.put("/api/workspace", response_model=WorkspaceState)
async def save_workspace(
    payload: WorkspaceStateUpdate,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_database),
) -> WorkspaceState:
    business_id = str(current_user.get("business_id") or current_user.get("owner_id") or current_user["id"])
    saved = await db.save_workspace(business_id, payload.state)
    return WorkspaceState(state=payload.state, updated_at=saved.get("updated_at"))


# ==================== AI PLANNER AGENT (FR-1.1 - 1.3) ====================

def build_agent_instructions(workspace_state: dict | None, rag_context: str = "") -> str:
    try:
        snapshot = json.dumps(workspace_state or {}, default=str)[:12000]
    except (TypeError, ValueError):
        snapshot = "{}"

    rag_block = ""
    if rag_context:
        rag_block = f"\nRelevant Business Knowledge Base (Retrieved via pgvector RAG):\n{rag_context}\n"

    return (
        "You are Vantage Planner, an AI COO for a small-to-medium enterprise (SMEO). "
        "Route each request mentally to finance, inventory, communication, HR, or analytics expertise. "
        "Give concise, practical answers based on the supplied dashboard snapshot and store knowledge base.\n\n"
        f"{rag_block}\n"
        "ACTION RULES:\n"
        "When the user explicitly asks to perform an operational task (approve, reject, reorder, add, update, delete, send, draft), "
        "you MUST include an action block at the very end of your response in this exact format:\n"
        '<!-- ACTIONS: [{"type": "ACTION_TYPE", ...fields}] -->\n\n'
        "Valid action formats:\n"
        '  {"type": "APPROVE_REC", "id": <number>}\n'
        '  {"type": "REJECT_REC", "id": <number>}\n'
        '  {"type": "PLACE_REORDER", "id": <number>}\n'
        '  {"type": "SEND_DRAFT", "id": <number>}\n'
        '  {"type": "ADD_INVENTORY_ITEM", "name": "<string>", "stock": <number>, "threshold": <number>}\n'
        '  {"type": "UPDATE_INVENTORY_STOCK", "id": <number>, "stock": <number>}\n'
        '  {"type": "DELETE_INVENTORY_ITEM", "id": <number>}\n'
        '  {"type": "ADD_DRAFT", "customer": "<string>", "draftType": "<string>", "text": "<string>"}\n'
        '  {"type": "DELETE_DRAFT", "id": <number>}\n\n'
        "Human-in-the-Loop Rule (SEC-8): Never claim an external payment or bank transfer was executed.\n"
        f"Dashboard Snapshot:\n{snapshot}"
    )


def choose_agents(text: str) -> list[str]:
    lower = text.lower()
    agents = []
    if any(word in lower for word in ("profit", "revenue", "expense", "budget", "cash", "finance", "debit", "khata", "receivable")):
        agents.append("finance")
    if any(word in lower for word in ("stock", "inventory", "reorder", "supply", "warehouse", "supplier", "restock")):
        agents.append("inventory")
    if any(word in lower for word in ("customer", "message", "email", "follow", "promo", "draft", "whatsapp")):
        agents.append("communication")
    if any(word in lower for word in ("employee", "salary", "payroll", "attendance", "leave", "hr", "staff")):
        agents.append("hr")
    if any(word in lower for word in ("report", "analytics", "performance", "kpi", "summary")):
        agents.append("analytics")
    return agents or ["finance", "inventory", "communication"]


def parse_actions(text: str) -> tuple[str, list[dict]]:
    pattern = r'<!--\s*ACTIONS:\s*(\[.*?\])\s*-->'
    match = re.search(pattern, text, re.DOTALL)
    if not match:
        return text.strip(), []
    try:
        actions = json.loads(match.group(1))
        clean_message = text[:match.start()].strip()
        valid_types = {
            "APPROVE_REC", "REJECT_REC", "PLACE_REORDER", "SEND_DRAFT",
            "ADD_INVENTORY_ITEM", "UPDATE_INVENTORY_STOCK", "DELETE_INVENTORY_ITEM",
            "ADD_DRAFT", "DELETE_DRAFT", "SEND_SUPPLIER_REORDER",
            "SEND_CUSTOMER_DEBIT_REMINDER", "RECORD_CUSTOMER_PAYMENT",
        }
        validated = []
        for a in actions:
            if not isinstance(a, dict) or a.get("type") not in valid_types:
                continue
            cleaned = {"type": a["type"]}
            for f in ("id", "name", "stock", "threshold", "customer", "draftType", "text"):
                if f in a:
                    cleaned[f] = a[f]
            validated.append(cleaned)
        return clean_message, validated
    except Exception as exc:
        logger.warning("Failed to parse actions: %s", exc)
        return text.strip(), []


_openai_client: AsyncOpenAI | None = None


def _get_openai_client(config: Settings) -> AsyncOpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = AsyncOpenAI(api_key=config.openai_api_key)
    return _openai_client


@app.post("/api/v1/agent/chat", response_model=ChatResponse)
@app.post("/api/agent/chat", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_database),
    config: Settings = Depends(get_settings),
) -> ChatResponse:
    # Cashier cannot access general AI Planner chat
    if current_user.get("role") == "cashier":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cashiers only have access to Point of Sale (POS) counter.",
        )

    business_id = str(current_user.get("business_id") or current_user.get("owner_id") or current_user["id"])

    # Enforce AI usage meter limit (FR-P.5)
    sub = await db.get_subscription(business_id)
    if sub and int(sub.get("ai_queries_used", 0)) >= int(sub.get("ai_query_allowance", 500)):
        raise HTTPException(
            status_code=402,
            detail="Monthly AI query allowance limit reached. Please upgrade your subscription plan in Billing.",
        )

    if not config.openai_api_key:
        raise HTTPException(status_code=503, detail="AI service is not configured. Add OPENAI_API_KEY to backend/.env.")

    conversation_id = payload.conversation_id or str(uuid4())
    user_id = str(current_user["id"])
    conv = await db.get_conversation(conversation_id, user_id)
    history = conv.get("messages", [])[-12:] if conv else []

    input_messages = [{"role": item["role"], "content": item["content"]} for item in history]
    input_messages.append({"role": "user", "content": payload.message})

    # Retrieve RAG context via pgvector
    rag_context = ""
    client = _get_openai_client(config)
    try:
        embed_resp = await client.embeddings.create(
            model="text-embedding-3-small",
            input=payload.message,
        )
        query_vector = embed_resp.data[0].embedding
        matches = await db.search_knowledge(query_vector, business_id=business_id, count=4)
        if matches:
            rag_context = "\n---\n".join([
                f"[{m.get('category', 'general').upper()}] {m.get('title')}: {m.get('content')}"
                for m in matches
            ])
    except Exception as exc:
        logger.debug("RAG semantic retrieval skipped: %s", exc)

    try:
        response = await client.chat.completions.create(
            model=config.openai_model,
            messages=[
                {"role": "system", "content": build_agent_instructions(payload.workspace_state, rag_context=rag_context)},
                *input_messages,
            ],
            max_tokens=800,
            temperature=0.3,
        )
        raw_answer = response.choices[0].message.content.strip()
        tokens_used = response.usage.total_tokens if response.usage else 120
    except AuthenticationError as error:
        raise HTTPException(status_code=401, detail="OpenAI API key is invalid or expired.") from error
    except RateLimitError as error:
        raise HTTPException(status_code=429, detail="AI rate limit reached. Please try again shortly.") from error
    except BadRequestError as error:
        raise HTTPException(status_code=400, detail=f"AI request error: {error.message}") from error
    except Exception as error:
        logger.exception("Unexpected AI error")
        raise HTTPException(status_code=502, detail="The AI service could not complete this request.") from error

    # Record AI query usage against meter
    await db.record_ai_usage({
        "business_id": business_id,
        "user_id": user_id,
        "agent_type": "planner",
        "model": config.openai_model,
        "total_tokens": tokens_used,
        "endpoint": "/api/v1/agent/chat",
    })

    clean_message, actions = parse_actions(raw_answer)

    # Managers cannot perform owner-only finance actions
    if current_user.get("role") != "owner":
        actions = [a for a in actions if a.get("type") not in ("APPROVE_REC", "REJECT_REC")]

    now = datetime.now(UTC)
    now_iso = now.isoformat()
    messages = (
        history
        + [
            {"role": "user", "content": payload.message, "created_at": now_iso},
            {"role": "assistant", "content": clean_message, "created_at": now_iso},
        ]
    )[-24:]

    await db.save_conversation(conversation_id, user_id, messages)
    agents = choose_agents(payload.message)

    remaining_queries = max(0, int(sub.get("ai_query_allowance", 500)) - int(sub.get("ai_queries_used", 0)) - 1) if sub else 499

    return ChatResponse(
        conversation_id=conversation_id,
        message=clean_message,
        agents=agents,
        actions=actions,
        created_at=now,
        ai_queries_remaining=remaining_queries,
    )


# ==================== KNOWLEDGE BASE (PGVECTOR) ====================

@app.post("/api/v1/rag/documents", status_code=status.HTTP_201_CREATED)
async def ingest_knowledge_document(
    payload: KnowledgeIngestRequest,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_database),
    config: Settings = Depends(get_settings),
) -> dict[str, Any]:
    if current_user.get("role") not in ("owner", "manager", "admin"):
        raise HTTPException(status_code=403, detail="Only owners and managers can add knowledge documents")

    client = _get_openai_client(config)
    try:
        embed_resp = await client.embeddings.create(
            model="text-embedding-3-small",
            input=payload.content,
        )
        embedding = embed_resp.data[0].embedding
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to generate embedding: {exc}") from exc

    business_id = str(current_user.get("business_id") or current_user.get("owner_id") or current_user["id"])
    doc = {
        "id": str(uuid4()),
        "business_id": business_id,
        "category": payload.category,
        "title": payload.title,
        "content": payload.content,
        "metadata": payload.metadata,
        "embedding": embedding,
        "created_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
    }
    created = await db.insert_knowledge(doc)
    return {
        "ok": True,
        "id": created.get("id"),
        "title": payload.title,
        "category": payload.category,
        "message": "Document embedded and stored in pgvector knowledge base successfully",
    }


@app.post("/api/v1/rag/search")
async def search_knowledge_base(
    payload: KnowledgeSearchRequest,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_database),
    config: Settings = Depends(get_settings),
) -> list[dict[str, Any]]:
    client = _get_openai_client(config)
    try:
        embed_resp = await client.embeddings.create(
            model="text-embedding-3-small",
            input=payload.query,
        )
        query_vector = embed_resp.data[0].embedding
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Embedding error: {exc}") from exc

    business_id = str(current_user.get("business_id") or current_user.get("owner_id") or current_user["id"])
    return await db.search_knowledge(
        query_vector,
        business_id=business_id,
        threshold=payload.threshold,
        count=payload.limit,
        category=payload.category,
    )
