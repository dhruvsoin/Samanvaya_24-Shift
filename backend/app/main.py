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
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .auth import _decode
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
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Middleware: Reviewer POST Guard ───────────────────────────────────
# Reviewers are read-only and get 403 on every POST except /auth/demo
@app.middleware("http")
async def reviewer_post_guard(request: Request, call_next):
    if request.method == "POST" and not request.url.path.startswith("/auth/demo"):
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
            try:
                claims = _decode(token)
                if claims.get("role") == "reviewer":
                    return JSONResponse(
                        status_code=403,
                        content={
                            "error": {
                                "code": "forbidden",
                                "message": "Reviewers are read-only and cannot perform POST operations",
                            }
                        },
                    )
            except Exception:
                pass
    return await call_next(request)


# ── Error Formatting ──────────────────────────────────────────────────
# Shape per contracts/README.md §6 and types.ts: { "error": { "code": "...", "message": "..." } }
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    code_map = {
        400: "bad_request",
        401: "unauthorized",
        403: "forbidden",
        404: "not_found",
        409: "conflict",
        422: "validation_error",
        500: "internal_error",
    }
    code = code_map.get(exc.status_code, "error")
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        content = exc.detail
    elif isinstance(exc.detail, dict) and "code" in exc.detail:
        content = {"error": exc.detail}
    else:
        content = {"error": {"code": code, "message": str(exc.detail)}}
    return JSONResponse(status_code=exc.status_code, content=content, headers=exc.headers)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"error": {"code": "validation_error", "message": str(exc.errors())}},
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
