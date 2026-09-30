"""
routers/plan.py — Plan endpoints (Op + Rev, read only for Rev).

GET /plan/current         → Plan | null
GET /plan/history         → Plan[]  (oldest first)
GET /plan/diff?from=&to=  → PlanChange[]
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Optional, List

from ..auth import require_operator_or_reviewer
from ..models import Plan, PlanChange
from ..state import state

router = APIRouter(prefix="/plan", tags=["Plan"])


@router.get("/current", response_model=Optional[Plan], response_model_by_alias=True)
def get_current_plan(_=Depends(require_operator_or_reviewer)):
    """Returns the latest published plan, or null."""
    return state.get_current_plan()


@router.get("/history", response_model=list[Plan], response_model_by_alias=True)
def get_plan_history(_=Depends(require_operator_or_reviewer)):
    """All plans, oldest first."""
    return state.get_plan_history()


@router.get("/diff", response_model=list[PlanChange], response_model_by_alias=True)
def get_plan_diff(
    from_plan: str | None = Query(None),
    to_plan: str | None = Query(None),
    from_alias: str | None = Query(None, alias="from"),
    to_alias: str | None = Query(None, alias="to"),
    _=Depends(require_operator_or_reviewer),
):
    """
    Returns PlanChange[] from the 'to' plan that describes what changed
    since the 'from' plan.  (The diff is stored inside the plan itself.)
    Query params: from=PLAN-001&to=PLAN-002
    """
    f_id = from_alias or from_plan
    t_id = to_alias or to_plan
    if not f_id or not t_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Query parameters 'from' and 'to' are required",
        )

    plan = state.get_plan_by_id(t_id)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Plan {t_id} not found")
    source = state.get_plan_by_id(f_id)
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Plan {f_id} not found")
    return plan.get("changes", [])
