# Frontend — P3-Face

React/Next.js operator dashboard, reporter portal, and crew page.

> **Blocked until backend stub is up.** Once `GET /openapi.json` is available, run:
> ```bash
> npx openapi-typescript http://localhost:8000/openapi.json -o src/types/api.d.ts
> ```

## Setup (TBD by P3)

```bash
npm install
npm run dev
```

## Key pages

| Route | Description |
|---|---|
| `/` | Operator dashboard (map + incident list + plan panel) |
| `/approvals` | Approval queue |
| `/crew` | Crew assignment page |
| `/reporter` | Public reporter portal |
| `/reviewer` | Read-only reviewer view |
| `/after-action` | Post-scenario report |
