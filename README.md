# Vantage — AI COO for Small Business

A React prototype for a COMSATS University Islamabad final-year project (2026).

## Overview

Vantage is an AI-powered operations platform for small businesses. It features four specialist agents:

- **Finance Intelligence** — Profit/loss tracking, 30/60/90-day forecasts, budget recommendations
- **Inventory Optimization** — Stock level monitoring, reorder alerts, demand forecasting
- **Customer Communication** — AI-drafted follow-ups and promotions from order history
- **Analytics & Reporting** — Consolidated cross-agent performance reports

## Tech Stack

- React 18 + Vite
- Recharts (data visualization)
- Lucide React (icons)
- FastAPI + Supabase backend (PostgreSQL REST API) with JWT authentication and an OpenAI-powered planner
- Role-Based Access Control (RBAC): Owner, Store Manager, and Cashier (POS-only)

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### Backend & Supabase Setup

1. Create a Supabase project at [supabase.com](https://supabase.com).
2. Run the SQL script from [`backend/supabase_schema.sql`](file:///D:/projects/vantage-app/vantage-app/backend/supabase_schema.sql) in your Supabase SQL Editor to create the `users`, `workspaces`, and `conversations` tables.
3. Copy `backend/.env.example` to `backend/.env` and fill in `SUPABASE_URL`, `SUPABASE_KEY` (service role key or anon key), a long `JWT_SECRET`, and `OPENAI_API_KEY`.
4. Start the API in a second terminal:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The frontend connects to `http://localhost:8000/api/v1` by default. For a deployed API, set Netlify's `VITE_API_URL` to the Render service URL (the service origin or its `/api/v1` URL is accepted). On Render, ensure `CORS_ORIGINS` includes `https://aicoo-smeo.netlify.app` (and any development origin you need). Supabase credentials and the JWT secret belong only in the backend environment. Interactive API documentation is at `http://localhost:8000/docs`.

## Project Structure

```
vantage-app/
├── index.html
├── package.json
├── vite.config.js
├── backend/
│   ├── .env.example          # MongoDB, JWT, OpenAI, and CORS configuration
│   ├── requirements.txt
│   └── app/
│       ├── main.py           # Auth, workspace, and planner API endpoints
│       ├── security.py       # Password hashing and JWT authentication
│       └── database.py       # MongoDB connection lifecycle
└── src/
    ├── main.jsx
    ├── App.jsx
    ├── data/
    │   └── constants.js       # Design tokens, seed data, navigation config
    ├── utils/
    │   ├── helpers.js         # Utility functions (CSV parsing, file downloads, etc.)
    │   └── api.js             # Frontend API client
    ├── context/
    │   └── AppStateContext.jsx # Global state management with useReducer + localStorage
    └── components/
        ├── GlobalStyles.jsx   # CSS animations + Google Fonts loader
        ├── Primitives.jsx     # Reusable UI components (Btn, Card, Badge, etc.)
        ├── ViewWrap.jsx       # Consistent page wrapper for all views
        ├── Landing.jsx        # Marketing landing page
        ├── AuthScreen.jsx     # Sign in / Sign up screen
        ├── Sidebar.jsx        # Navigation sidebar
        ├── TopBar.jsx         # Header with alerts dropdown
        ├── CommandPalette.jsx # Cmd+K quick actions
        ├── ChatPlanner.jsx    # Main AI planner chat interface
        ├── FinanceView.jsx    # Finance dashboard
        ├── InventoryView.jsx  # Inventory management
        ├── CommunicationView.jsx # Customer message drafts
        ├── AnalyticsView.jsx  # Reports & analytics
        ├── ConnectPOSView.jsx # POS integration
        ├── SubscriptionBillingView.jsx # Plan selection
        ├── ProfileView.jsx    # Business profile & team management
        └── AdminView.jsx      # Admin monitoring dashboard
```

## Features

- **Role-based navigation** (Owner, Staff, Admin)
- **Live state persistence** via localStorage
- **CSV import/export** for finance and inventory data
- **Command palette** (Cmd/Ctrl + K)
- **Responsive design** with mobile sidebar
- **Real-time POS sync simulation**
- **Approval-based workflow** — nothing executes without user sign-off

## Notes

Authenticated workspaces are synchronized with MongoDB. The browser retains a local cache for responsive interaction and gracefully falls back to the existing local planner if the API is temporarily unavailable.
