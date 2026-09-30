"""
routers/plan.py — Plan endpoints (Op + Rev, read only for Rev).

GET /plan/current         → Plan | null
GET /plan/history         → Plan[]  (oldest first)
GET /plan/diff?from=&to=  → PlanChange[]
"""
from fastapi import APIRouter, Depends, HTTPException, status

from ..auth import require_operator_or_reviewer

from ..state import state

router = APIRouter(prefix="/plan", tags=["Plan"])


@router.get("/current")
def get_current_plan(_=Depends(require_operator_or_reviewer)):
    """Returns the latest published plan, or null."""
    return state.get_current_plan()


@router.get("/history")
def get_plan_history(_=Depends(require_operator_or_reviewer)) -> list[dict]:
    """All plans, oldest first."""
    return state.get_plan_history()


@router.get("/diff")
def get_plan_diff(
    from_plan: str,
    to_plan: str,
    _=Depends(require_operator_or_reviewer),
) -> list[dict]:
    """
    Returns PlanChange[] from the 'to' plan that describes what changed
    since the 'from' plan.  (The diff is stored inside the plan itself.)
    Query params: from=PLAN-001&to=PLAN-002
    """
    # FastAPI maps ?from= → from_plan because 'from' is a reserved keyword.
    # The endpoint path uses ?from=...&to=... per contracts/endpoints.md.
    plan = state.get_plan_by_id(to_plan)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Plan {to_plan} not found")
    source = state.get_plan_by_id(from_plan)
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Plan {from_plan} not found")
    return plan.get("changes", [])
