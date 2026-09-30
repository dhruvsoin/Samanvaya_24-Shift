"""
routers/reports.py — Report endpoints (Op + Rev).

GET /reports/after-action  → AfterActionReport
GET /comms/log             → CommsLogEntry[]
GET /decisions             → DecisionLogEntry[]
"""
from fastapi import APIRouter, Depends

from ..auth import require_operator_or_reviewer
from ..clock import clock
from ..state import state

router = APIRouter(tags=["Reports"])


@router.get("/reports/after-action")
def after_action_report(_=Depends(require_operator_or_reviewer)) -> dict:
    """
    After-action report.  Shape: AfterActionReport from contracts/types.ts.
    Populated incrementally as P1-Brain implements agents.
    """
    incidents = state.get_incidents()
    approvals = state.get_approvals()
    decision_log = state.get_decision_log()

    timeline = [
        {
            "ts": e["ts"],
            "text": e["decision"],
            "incidentId": e.get("incidentId"),
        }
        for e in decision_log
    ]

    return {
        "generatedAt": clock.now(),
        "timeline": timeline,
        "planChanges": [
            {"planId": p["planId"], "trigger": p["trigger"], "changes": p.get("changes", [])}
            for p in state.get_plan_history()
        ],
        "approvals": approvals,
        "responseTimes": [],        # P1-Brain to fill when arrivals are tracked
        "baseline": [],             # P1-Brain stretch goal
        "unresolved": [i for i in incidents if i["status"] not in ("resolved", "closed")],
    }


@router.get("/comms/log")
def comms_log(_=Depends(require_operator_or_reviewer)) -> list[dict]:
    """Comms log.  P4-Comms populates via state.append_comms_log()."""
    return state.get_comms_log()


@router.get("/decisions")
def decisions(_=Depends(require_operator_or_reviewer)) -> list[dict]:
    """Decision log.  P1-Brain populates via state.append_decision_log()."""
    return state.get_decision_log()
