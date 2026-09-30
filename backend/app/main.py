"""
main.py — FastAPI application entry point.

Assembles all routers. All shapes match contracts/types.ts and
contracts/endpoints.md exactly.

Run:
    uvicorn app.main:app --reload --port 8000

Endpoints for Person 3:
    Swagger UI   → http://localhost:8000/docs
    OpenAPI JSON → http://localhost:8000/openapi.json
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import approvals, auth, crew, incidents, plan, reporter, reports, scenario, state, ws

app = FastAPI(
    title=settings.app_title,
    version=settings.app_version,
    description=(
        "Flood-response coordination backend. "
        "All shapes match contracts/types.ts exactly. "
        "Fetch /openapi.json to generate TypeScript types."
    ),
)

# ── CORS ──────────────────────────────────────────────────────────────
# Explicitly lists localhost:5173 (Vite) so P3 can hit the API in dev.
# Controlled via CORS_ORIGINS env var in production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(incidents.router)   # GET /incidents, POST /incidents/phone-in
app.include_router(state.router)       # GET /units /facilities /roads /zones /status
app.include_router(plan.router)        # GET /plan/*
app.include_router(approvals.router)   # GET+POST /approvals
app.include_router(scenario.router)    # POST /scenario/*
app.include_router(reporter.router)    # POST /reporter/*
app.include_router(crew.router)        # GET+POST /crew/*
app.include_router(reports.router)     # GET /reports/* /comms/log /decisions
app.include_router(ws.router)          # WS /ws/*


# ── Health ────────────────────────────────────────────────────────────
@app.get("/health", tags=["Health"])
def health() -> dict:
    """Liveness probe.  Returns 200 + service info when the server is up."""
    from .clock import clock
    return {
        "status": "ok",
        "service": settings.app_title,
        "version": settings.app_version,
        "scenarioTime": clock.now(),
    }


@app.get("/", include_in_schema=False)
def root() -> dict:
    return {
        "service": settings.app_title,
        "docs": "/docs",
        "openapi": "/openapi.json",
        "health": "/health",
    }
