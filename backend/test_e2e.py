import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import httpx
from app.main import app


async def run():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Health check
        r = await client.get("/api/v1/health")
        print("Health check:", r.status_code, r.json())
        assert r.status_code == 200

        # 2. Register Owner
        reg = await client.post("/api/v1/auth/register", json={
            "business": "Apex Retail Superstore",
            "owner": "Mr. Owner Ali",
            "email": "apex.owner@test.com",
            "password": "password123",
        })
        print("Register status:", reg.status_code)
        assert reg.status_code == 201
        owner_data = reg.json()
        owner_token = owner_data["access_token"]
        owner_headers = {"Authorization": f"Bearer {owner_token}"}
        print("Owner registered with role:", owner_data["user"]["role"])

        # 3. Owner adds Cashier
        add_c = await client.post("/api/v1/team/users", json={
            "name": "Zahid Cashier",
            "email": "zahid@apex.com",
            "password": "cashierpassword",
            "role": "cashier",
        }, headers=owner_headers)
        print("Add Cashier status:", add_c.status_code, add_c.json()["role"])
        assert add_c.status_code == 201

        # 4. Owner adds Manager
        add_m = await client.post("/api/v1/team/users", json={
            "name": "Fatima Manager",
            "email": "fatima@apex.com",
            "password": "managerpassword",
            "role": "manager",
        }, headers=owner_headers)
        print("Add Manager status:", add_m.status_code, add_m.json()["role"])
        assert add_m.status_code == 201

        # 5. List team members
        team = await client.get("/api/v1/team/users", headers=owner_headers)
        print("Team members listed:", len(team.json()))
        assert len(team.json()) == 2

        # 6. Cashier login
        c_login = await client.post("/api/v1/auth/login", json={
            "email": "zahid@apex.com",
            "password": "cashierpassword",
        })
        print("Cashier login status:", c_login.status_code)
        assert c_login.status_code == 200
        c_token = c_login.json()["access_token"]
        c_headers = {"Authorization": f"Bearer {c_token}"}
        assert c_login.json()["user"]["role"] == "cashier"

        # 7. Check Cashier CANNOT add team members (RBAC protection)
        c_forbidden = await client.post("/api/v1/team/users", json={
            "name": "Hacker",
            "email": "hack@test.com",
            "password": "password",
            "role": "manager",
        }, headers=c_headers)
        print("Cashier access to team creation forbidden (403):", c_forbidden.status_code)
        assert c_forbidden.status_code == 403

        # 8. Check Cashier CANNOT access AI chat
        c_chat_forbidden = await client.post("/api/v1/agent/chat", json={
            "message": "Tell me finances",
        }, headers=c_headers)
        print("Cashier access to chat forbidden (403):", c_chat_forbidden.status_code)
        assert c_chat_forbidden.status_code == 403

        # 9. Verify Cashier shares the Owner business workspace
        c_ws = await client.get("/api/v1/workspace", headers=c_headers)
        print("Cashier accessed shared store workspace:", c_ws.status_code)
        assert c_ws.status_code == 200

        # Save inventory from Cashier checkout
        await client.put("/api/v1/workspace", json={"state": {"pos_sale": 1000, "items_sold": 3}}, headers=c_headers)
        owner_ws = await client.get("/api/v1/workspace", headers=owner_headers)
        assert owner_ws.json()["state"]["pos_sale"] == 1000
        print("Owner sees updated POS workspace state from Cashier checkout!")

        print("\n>>> ALL END-TO-END RBAC & API TESTS PASSED! <<<")


if __name__ == "__main__":
    asyncio.run(run())
