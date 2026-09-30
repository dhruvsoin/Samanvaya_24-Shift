# Samanvaya · 24-Hour Shift

AI-assisted flood-response coordination for a 24-hour hackathon.

## Folders

| Folder | Owner | What lives here |
|---|---|---|
| `contracts/` | Everyone | Shared types, events, endpoints, seed data. **Source of truth. Don't edit without team agreement.** |
| `backend/` | P1-Brain | FastAPI gateway, auth, event bus, agents, WebSocket hub |
| `frontend/` | P3-Face | React/Next.js operator dashboard, reporter portal, crew page |
| `docs/` | Shared | Architecture decisions, demo runbook, retrospective notes |

## Branches

| Branch | Owner |
|---|---|
| `p1-brain` | Person 1 (Gateway / Brain) |
| `p2-engine` | Person 2 (Road engine / Allocator) |
| `p3-face` | Person 3 (Frontend / Face) |
| `p4-comms` | Person 4 (Comms / Reporter) |
| `main` | Protected — merge via PR every ~2 hours |

## Quick start

```bash
# Backend
cd backend
cp ../.env.example .env   # fill in values
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

## Rules

1. Read `contracts/README.md` before writing any code.
2. Small PRs — one logical change, merge to `main` roughly every 2 hours.
3. Don't touch another person's folder without asking first.
4. To change a contract shape: post in chat → everyone says OK → one person edits `types.ts` → commit as `contract: <what changed>`.
5. Use `Authorization: Bearer <token>` on REST; WebSockets take `?token=<token>`.

## Five added events (agreed in kickoff)

| Event | Owner | Purpose |
|---|---|---|
| `agent.activity` | P1-Brain | One-line agent action for the agent stream |
| `road.status_changed` | P2-Engine | Map road overlay + ETA recalc trigger |
| `status.updated` | P1-Brain | Top-bar update (severity, rain, comms, clock) |
| `reporter.status_updated` | P4-Comms | Reporter card stages + ETA range |
| `assignment.cancelled` | P1-Brain | Plan change takes an assignment away from a crew |
