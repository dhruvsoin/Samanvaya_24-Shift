# Samanvaya · Complete Setup & Installation Guide

This document provides a clean, step-by-step guide for setting up, installing dependencies, configuring environments, and running the Samanvaya Flood Emergency Response system from scratch.

---

## System Requirements

| Component | Minimum Version | Recommended | Notes |
|---|---|---|---|
| **Operating System** | Windows 10/11, Ubuntu 20.04+, macOS 12+ | Windows 11 / Linux | Works cross-platform |
| **Python** | 3.10 | 3.11 | Required for backend |
| **Node.js** | 18.0.0 | 20.x+ | Required for frontend build |
| **npm** | 9.x+ | 10.x+ | Bundled with Node.js |
| **Cloudflared** | Any recent release | Latest | Optional, for public HTTPS sharing |

---

## 1. Cloning the Repository

```bash
git clone https://github.com/dhruvsoin/Samanvaya_24-Shift.git
cd Samanvaya_24-Shift
```

---

## 2. Frontend Setup & Build

The frontend is built using **React 18**, **TypeScript**, **Tailwind CSS**, and **Vite**.

```bash
cd frontend
# 1. Install Node dependencies
npm install

# 2. Build production assets (outputs to frontend/dist)
npm run build
```

Verify that `frontend/dist/index.html` and `frontend/dist/assets/` have been generated.

---

## 3. Backend Setup

The backend is built with **FastAPI**, **Pydantic v2**, and an **in-memory reactive event bus**.

```bash
cd ../backend

# 1. Create a virtual environment
# Windows:
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Linux / macOS:
python3 -m venv .venv
source .venv/bin/activate

# 2. Install Python dependencies
pip install --upgrade pip
pip install -r requirements.txt
```

---

## 4. Running the Application (Single-Origin Port 8000)

Samanvaya runs in a **single-origin architecture**: FastAPI serves both the REST API, the WebSocket event bus channels, and the compiled frontend single-page application (SPA) on port `8000`.

### Environment Variables

| Variable | Values | Default | Purpose |
|---|---|---|---|
| `ENGINE_MODE` | `real`, `stub` | `real` | Real multi-agent optimization solver vs stub responses |
| `LLM_MODE` | `scripted`, `ollama` | `scripted` | Deterministic scripted intake vs local Ollama model |
| `DEV_MODE` | `true`, `false` | `true` | Enables scenario control panel and dev endpoints |

### Launch Server

#### Windows (PowerShell):
```powershell
$env:ENGINE_MODE="real"
$env:LLM_MODE="scripted"
$env:DEV_MODE="true"
.\.venv\Scripts\uvicorn app.main:app --host 0.0.0.0 --port 8000
```

#### Linux / macOS (Bash):
```bash
export ENGINE_MODE="real"
export LLM_MODE="scripted"
export DEV_MODE="true"
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

---

## 5. Running the Test Suite

Samanvaya includes an exhaustive test suite covering all 6 scenario flows, role-based authentication, and WebSocket contract compliance.

```bash
cd backend

# Run the full test suite
pytest -v

# Run with coverage report
pytest --cov=app -v
```

Expected result:
```
======================== 269 passed, 1 warning in 34.81s ========================
```

---

## 6. Accessing the System

Once the server is running, navigate to:

- **EOC Command Center**: `http://localhost:8000/command`  
  *Login credentials*: Username `operator`, Password `demo1234`
- **Citizen SOS Portal**: `http://localhost:8000/sos`  
  *No login required; accessible on mobile browsers and 2G connections*
- **Rescue Crew Interface**: `http://localhost:8000/crew`  
  *Login credentials*: Unit Code `AMB-01`, PIN `1111`
- **After-Action Performance Review**: `http://localhost:8000/after-action`
- **Swagger / OpenAPI Documentation**: `http://localhost:8000/docs`

---

## 7. Public Deployment via Cloudflare Tunnel

To share a live, working URL with remote judges or mobile devices:

```bash
# Install Cloudflare CLI if not installed:
# Windows: winget install Cloudflare.cloudflared
# macOS: brew install cloudflared
# Linux: sudo apt-get install cloudflared

# Start tunnel (no account or login required):
cloudflared tunnel --url http://localhost:8000
```

Copy the generated `https://*.trycloudflare.com` URL and open it on any device.
