"""
routers/approvals.py — Approval endpoints.

GET  /approvals?status=pending   → Approval[]   (Op only)
POST /approvals/{id}/decision    → Approval      (Op only)

Per contracts/endpoints.md:
  - Approving executes the option, then emits approval.resolved then plan.published.
  - In the stub, "executing" just updates the approval status.
    P1-Brain will wire up the real plan mutation here.
"""
import asyncio
from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import List

from ..auth import require_operator
from ..clock import clock
from ..models import ApprovalDecisionRequest, Approval
from ..state import state

router = APIRouter(prefix="/approvals", tags=["Approvals"])


@router.get("", response_model=list[Approval], response_model_by_alias=True)
def get_approvals(
    approval_status: str | None = Query(None, alias="status"),
    status_param: str | None = Query(None, alias="approval_status"),
    _=Depends(require_operator),
):
    """
    Returns approvals, optionally filtered by status.
    Query param: ?status=pending (or ?approval_status=pending)
    """
    st = approval_status or status_param
    return state.get_approvals(st)


@router.post("/{approval_id}/decision", response_model=Approval, response_model_by_alias=True)
@router.post("/{approval_id}/decide", response_model=Approval, response_model_by_alias=True, include_in_schema=False)
async def post_decision(
    approval_id: str,
    body: ApprovalDecisionRequest,
    claims=Depends(require_operator),
):
    """
    Operator decides on an approval (approve, reject, or choose_other with optionId).
    Records decidedBy from token and decidedAt from scenario clock.
    Publishes approval.resolved, allowing CommandAgent to continue (publishing plan.published).
    Returns 409 if the approval is already resolved.
    """
    approval = state.get_approval(approval_id)
    if approval is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Approval {approval_id} not found",
        )
    if approval["status"] != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Approval {approval_id} is already {approval['status']}",
        )

    if body.decision == "approve":
        chosen_option_id = body.option_id or approval.get("recommendedOptionId")
    elif body.decision == "choose_other":
        if not body.option_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="optionId is required when decision is choose_other",
            )
        options = [opt.get("optionId") or opt.get("option_id") for opt in approval.get("options", [])]
        if options and body.option_id not in options:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid optionId '{body.option_id}'. Available options: {options}",
            )
        chosen_option_id = body.option_id
    elif body.decision == "reject":
        chosen_option_id = None
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid decision '{body.decision}'",
        )

    decided_by = claims.get("sub") or claims.get("displayName") or "operator"
    resolved_approval = state.resolve_approval(
        approval_id=approval_id,
        decision=body.decision,
        chosen_option_id=chosen_option_id,
        decided_by=decided_by,
        note=body.note,
        publish=True,
    )

    # Allow asyncio tasks (e.g. CommandAgent reacting to approval.resolved) to execute
    await asyncio.sleep(0.02)

    return resolved_approval or approval
