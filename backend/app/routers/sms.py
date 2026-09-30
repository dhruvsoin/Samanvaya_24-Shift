"""
routers/sms.py — SMS API endpoints for Samanvaya.

Endpoints
─────────
POST /sms/send              Generic single SMS send
POST /sms/bulk-alert        Broadcast a message to many numbers
POST /sms/assignment-alert  Notify a crew unit of a new assignment via SMS
POST /sms/incident-alert    Confirm receipt to a reporter / affected party
POST /sms/status-update     Push a status-change notification
GET  /sms/outbox            Inspect every message sent this session (in-memory)
"""
from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..sms_service import (
    send_sms,
    send_bulk_alert,
    send_assignment_sms,
    send_incident_alert_sms,
    send_status_update_sms,
    get_outbox,
)

# Shared auth dependency (avoids circular import with main)
from ..deps import _require_token

router = APIRouter(prefix="/sms", tags=["SMS"])


# ── Request models ────────────────────────────────────────────────────────────
class SmsSendRequest(BaseModel):
    to: str = Field(..., examples=["+919876543210"],
                    description="Recipient phone number in E.164 format")
    body: str = Field(..., min_length=1, max_length=1600,
                      description="SMS message body (max 1600 chars / 10 segments)")


class SmsBulkAlertRequest(BaseModel):
    recipients: list[str] = Field(..., min_length=1,
                                  description="List of E.164 phone numbers")
    message: str = Field(..., min_length=1, max_length=1600)


class SmsAssignmentAlertRequest(BaseModel):
    to: str = Field(..., description="Crew unit phone number (E.164)")
    unit_name: str
    incident_summary: str
    location_label: str
    eta_minutes: int = Field(..., ge=0)


class SmsIncidentAlertRequest(BaseModel):
    to: str = Field(..., description="Reporter / victim phone number (E.164)")
    incident_type: str
    location_label: str
    severity: Optional[str] = None


class SmsStatusUpdateRequest(BaseModel):
    to: str = Field(..., description="Recipient phone number (E.164)")
    incident_id: str
    new_status: str


# ── Endpoints ─────────────────────────────────────────────────────────────────
@router.post(
    "/send",
    summary="Send a single SMS",
    description="Send an arbitrary SMS message to one recipient.",
)
def sms_send(body: SmsSendRequest, _token=Depends(_require_token)):
    return send_sms(body.to, body.body)


@router.post(
    "/bulk-alert",
    summary="Broadcast SMS to multiple recipients",
    description="Send the same message to every phone number in `recipients`.",
)
def sms_bulk_alert(body: SmsBulkAlertRequest, _token=Depends(_require_token)):
    if len(body.recipients) > 500:
        raise HTTPException(status_code=422, detail="Max 500 recipients per bulk call")
    results = send_bulk_alert(body.recipients, body.message)
    failed = [r for r in results if r["status"] == "failed"]
    return {"sent": len(results), "failed": len(failed), "results": results}


@router.post(
    "/assignment-alert",
    summary="Notify a crew unit of a new assignment",
    description=(
        "Sends a pre-formatted assignment SMS to a field crew member. "
        "Called automatically when a new assignment is dispatched."
    ),
)
def sms_assignment_alert(body: SmsAssignmentAlertRequest, _token=Depends(_require_token)):
    return send_assignment_sms(
        unit_name=body.unit_name,
        to=body.to,
        incident_summary=body.incident_summary,
        location_label=body.location_label,
        eta_minutes=body.eta_minutes,
    )


@router.post(
    "/incident-alert",
    summary="Confirm incident receipt to a reporter",
    description=(
        "Sends an acknowledgement SMS to the person who reported an incident, "
        "including severity if available."
    ),
)
def sms_incident_alert(body: SmsIncidentAlertRequest, _token=Depends(_require_token)):
    return send_incident_alert_sms(
        to=body.to,
        incident_type=body.incident_type,
        location_label=body.location_label,
        severity=body.severity,
    )


@router.post(
    "/status-update",
    summary="Push a status-change notification",
    description="Informs a reporter that their incident status has changed (e.g. resolved).",
)
def sms_status_update(body: SmsStatusUpdateRequest, _token=Depends(_require_token)):
    return send_status_update_sms(
        to=body.to,
        incident_id=body.incident_id,
        new_status=body.new_status,
    )


@router.get(
    "/outbox",
    summary="Inspect sent SMS messages",
    description=(
        "Returns all SMS messages sent during this server session (in-memory). "
        "Useful for hackathon demos and testing without a real Twilio account."
    ),
)
def sms_outbox(_token=Depends(_require_token)):
    messages = get_outbox()
    return {"count": len(messages), "messages": messages}
