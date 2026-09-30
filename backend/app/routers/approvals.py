"""
routers/approvals.py — Approval endpoints.

GET  /approvals?status=pending   → Approval[]   (Op only)
POST /approvals/{id}/decision    → Approval      (Op only)

Per contracts/endpoints.md:
  - Approving executes the option, then emits approval.resolved then plan.published.
  - In the stub, "executing" just updates the approval status.
    P1-Brain will wire up the real plan mutation here.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..auth import require_operator
from ..bus import bus
from ..clock import clock
from ..models import ApprovalDecisionRequest
from ..state import state

router = APIRouter(prefix="/approvals", tags=["Approvals"])


@router.get("")
def get_approvals(
    approval_status: str | None = Query(None, alias="status"),
    status_param: str | None = Query(None, alias="approval_status"),
    _=Depends(require_operator),
) -> list[dict]:
    """
    Returns approvals, optionally filtered by status.
    Query param: ?status=pending (or ?approval_status=pending)
    """
    st = approval_status or status_param
    return state.get_approvals(st)


@router.post("/{approval_id}/decision")
def post_decision(
    approval_id: str,
    body: ApprovalDecisionRequest,
    claims=Depends(require_operator),
) -> dict:
    """
    Operator decides on an approval.
    Emits: approval.resolved
    If decision == approve: also emits plan.published (stub: no plan mutation yet).
    """
    approval = state.get_approval(approval_id)
    if approval is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Approval {approval_id} not found")
    if approval["status"] != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"Approval {approval_id} is already {approval['status']}")

    ts = clock.now()
    approval["status"] = "approved" if body.decision == "approve" else "rejected"
    approval["chosenOptionId"] = body.option_id
    approval["decidedBy"] = claims["sub"]
    approval["decidedAt"] = ts
    state.upsert_approval(approval)

    bus.publish("approval.resolved", {
        "approvalId": approval_id,
        "decision": body.decision,
        "chosenOptionId": body.option_id,
        "decidedBy": claims["sub"],
        "decidedAt": ts,
        "note": body.note,
    })

    return approval
