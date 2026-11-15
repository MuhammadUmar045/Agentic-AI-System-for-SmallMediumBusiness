import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app.database import SQLiteAdapter
from app.security import hash_password, verify_password


async def test():
    test_db = "test_vantage.sqlite3"
    if os.path.exists(test_db):
        os.remove(test_db)

    db = SQLiteAdapter(test_db)
    await db.connect()

    # 1. Create Owner
    owner = await db.create_user({
        "business": "SuperMart",
        "owner": "Owner Ali",
        "email": "owner@supermart.com",
        "password_hash": hash_password("owner1234"),
        "role": "owner",
    })
    print("Created owner:", owner["email"], owner["role"], owner["id"])
    assert owner["role"] == "owner"

    # 2. Add Cashier
    cashier = await db.create_user({
        "business": "SuperMart",
        "owner": "Cashier Sana",
        "email": "cashier@supermart.com",
        "password_hash": hash_password("cash1234"),
        "role": "cashier",
        "owner_id": owner["id"],
    })
    print("Created cashier:", cashier["email"], cashier["role"], "owner_id:", cashier["owner_id"])
    assert cashier["role"] == "cashier"
    assert cashier["owner_id"] == owner["id"]

    # 3. Add Manager
    manager = await db.create_user({
        "business": "SuperMart",
        "owner": "Manager Bilal",
        "email": "manager@supermart.com",
        "password_hash": hash_password("manager1234"),
        "role": "manager",
        "owner_id": owner["id"],
    })
    print("Created manager:", manager["email"], manager["role"])
    assert manager["role"] == "manager"

    # 4. Check team members for owner
    members = await db.get_team_members(owner["id"])
    print("Owner team count:", len(members))
    assert len(members) == 2
    roles = {m["role"] for m in members}
    assert roles == {"cashier", "manager"}

    # 5. Shared workspace test
    await db.save_workspace(owner["id"], {"inventory": [{"name": "Basmati Rice 5kg", "stock": 40}]})
    ws = await db.get_workspace(owner["id"])
    assert ws["state"]["inventory"][0]["stock"] == 40
    print("Workspace verified for business_id:", owner["id"])

    # 6. Delete team member
    deleted = await db.delete_team_member(cashier["id"], owner["id"])
    assert deleted is True
    remaining = await db.get_team_members(owner["id"])
    assert len(remaining) == 1
    assert remaining[0]["role"] == "manager"
    print("Deleted cashier, remaining team count:", len(remaining))

    # Clean up
    await db.close()
    if os.path.exists(test_db):
        os.remove(test_db)

    print("\n>>> ALL RBAC AND DATABASE TESTS PASSED SUCCESSFULLY! <<<")


if __name__ == "__main__":
    asyncio.run(test())
