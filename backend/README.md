# Samanvaya Backend — Stub

FastAPI stub that serves seed data on all GET endpoints so the frontend can generate TypeScript types immediately.

## Run

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Swagger UI: http://localhost:8000/docs  
OpenAPI JSON: http://localhost:8000/openapi.json

## Auth (stub)

All endpoints that need a token accept **any non-empty Bearer token** in the stub.  
`POST /auth/login` → `{ username: "operator", password: "demo1234" }` → returns a token.

## Structure

```
backend/
├── app/
│   ├── main.py          ← FastAPI app, routers mounted here
│   ├── seed.py          ← loads contracts/seed/*.json
│   ├── models.py        ← Pydantic models mirroring contracts/types.ts
│   └── routers/
│       ├── auth.py
│       ├── state.py     ← /incidents /units /facilities /roads /zones /status
│       ├── plan.py
│       ├── approvals.py
│       ├── scenario.py
│       ├── reporter.py
│       ├── crew.py
│       └── reports.py
└── requirements.txt
```
