# Deployment & Run Guide — Samanvaya

This document provides instructions for running and deploying the Samanvaya Emergency Flood Response System in a single-origin production setup with an optional public tunnel.

---

## 1. Prerequisites

- **Python**: 3.10+ (tested on Python 3.11)
- **Node.js**: 18+ (tested on Node.js 20+)
- **Cloudflare Tunnel CLI** (`cloudflared`): Optional, for public access/demoing to remote judges.

---

## 2. Production Build & Setup

### A. Frontend Production Build
Build the production static assets for the React/Vite frontend. The frontend is configured with relative API paths (`BASE = ''`) and dynamic WebSocket protocol derivation (`window.location` -> `wss:` on HTTPS / `ws:` on HTTP).

```bash
cd frontend
npm install
npm run build
```
This outputs the bundle into `frontend/dist/`.

### B. Backend Dependencies
Install backend dependencies:

```bash
cd backend
pip install -r requirements.txt
```

---

## 3. Starting the Production Server (Single Origin)

FastAPI serves both the REST API, the WebSocket channels, and the frontend static assets + SPA fallback directly on port `8000`.

### PowerShell / Windows:
```powershell
cd backend
$env:ENGINE_MODE="real"
$env:LLM_MODE="scripted"
$env:DEV_MODE="true"
.venv\Scripts\uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Bash / Linux / macOS:
```bash
cd backend
export ENGINE_MODE="real"
export LLM_MODE="scripted"
export DEV_MODE="true"
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

---

## 4. Public Deployment via Cloudflare Tunnel

To expose the application instantly over HTTPS with automatic WSS (WebSocket Secure) support for judges and reviewers:

### Single Command:
```bash
cloudflared tunnel --url http://localhost:8000
```

When started, `cloudflared` prints a public `https://*.trycloudflare.com` URL.
- Visiting `https://<tunnel-subdomain>.trycloudflare.com` loads the SPA.
- All API requests use relative paths (`/auth/login`, `/incidents`, etc.).
- WebSockets automatically upgrade to `wss://<tunnel-subdomain>.trycloudflare.com/ws/operator`.
- No CORS configuration or domain mapping is needed.

---

## 5. Verification Runbook

1. **Root & SPA Fallback**:
   - `http://localhost:8000/` -> Loads Command Center / Login.
   - `http://localhost:8000/sos` -> Loads Citizen SOS Portal.
   - `http://localhost:8000/login` -> Loads Staff Login.

2. **Operator Login & Live Sync**:
   - Credentials: Username `operator`, Password `demo1234`.
   - On login, map and queue load from real GET endpoints (`/incidents`, `/units`, `/facilities`, `/roads`, `/zones`, `/status`).
   - Operator WebSocket `/ws/operator` connects and receives real-time events.

3. **Replay Demonstration**:
   - Trigger seed replay via curl or UI:
     ```bash
     curl -X POST http://localhost:8000/dev/replay
     ```
   - Check UI updates:
     - Incidents appear on the map and queue (`INC-01`, `INC-02`, `INC-03`).
     - Plans published (`PLAN-001`, `PLAN-002`) and visible in the **Plan Diff** view with data-driven reasons.
     - Rain surge status reflected.
     - Approvals (`APR-001`, `APR-002`) in the **Approvals Inbox**.
     - Comms outage in Zone B with SMS fallback entries in `/comms/log`.
     - After-action metrics & timeline visible on `/after-action`.

4. **Run Automated Test Suite**:
   ```powershell
   cd backend
   $env:ENGINE_MODE="stub"; .venv\Scripts\pytest -q
   $env:ENGINE_MODE="real"; .venv\Scripts\pytest -q
   ```
   Both suites must pass 100% (269 tests each).
