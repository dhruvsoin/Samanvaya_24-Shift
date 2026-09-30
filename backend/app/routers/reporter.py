"""
routers/reporter.py — Reporter session/message/voice endpoints.

POST /reporter/session   → ReporterSession   (no auth)
POST /reporter/message   → ReporterMessageResponse  (reporter token)
POST /reporter/voice     → ReporterMessageResponse  (reporter token, multipart)

Per contracts/endpoints.md:
  Replies are NOT in the HTTP response.  POST /reporter/message returns a
  messageId. The reply arrives on /ws/reporter/{sessionId}.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Form, File, HTTPException, UploadFile, status

from ..auth import create_reporter_session, require_reporter
from ..bus import bus
from ..clock import clock
from ..models import ReporterMessageRequest, ReporterSessionRequest, ReporterSession, ReporterMessageResponse
from ..state import state

router = APIRouter(prefix="/reporter", tags=["Reporter"])


@router.post("/session", response_model=ReporterSession, response_model_by_alias=True)
def create_session(body: ReporterSessionRequest):
    """
    Creates an anonymous reporter session.
    Returns: ReporterSession { sessionId, token, language }
    """
    return create_reporter_session(body.language or "en")


@router.post("/message", response_model=ReporterMessageResponse, response_model_by_alias=True)
def send_message(body: ReporterMessageRequest,
                 claims=Depends(require_reporter)):
    """
    Reporter sends a text message.
    Returns: { messageId }  (reply arrives on WS channel).
    Emits: reporter.message_sent (from reporter direction).
    """
    session = state.get_reporter_session(body.session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Session {body.session_id} not found")

    message_id = state.next_id("MSG")
    ts = clock.now()

    from ..comms import dispatch, get_channel_for_recipient, resolve_zone
    zone_id = resolve_zone(body.session_id, "reporter")
    channel = get_channel_for_recipient(body.session_id, "reporter", zone_id=zone_id)

    bus.publish("reporter.message_sent", {
        "sessionId": body.session_id,
        "messageId": message_id,
        "from": "reporter",
        "text": body.text,
        "translatedText": None,   # P4-Comms will fill translation
        "language": body.language or session.get("language", "en"),
        "channel": channel,
    })

    # Log inbound
    log_id = state.next_id("LOG")
    state.append_comms_log({
        "entryId": log_id,
        "ts": ts,
        "direction": "in",
        "channel": channel,
        "recipient": {"kind": "operator", "id": "operator"},
        "text": body.text,
        "delivery": "sent",
        "zoneId": zone_id,
    })

    # Dispatch system acknowledgment reply to reporter
    lang = body.language or session.get("language", "en")
    ack_text = "ನಿಮ್ಮ ಸಂದೇಶ ತಲುಪಿದೆ. ಸಹಾಯ ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ." if lang == "kn" else "Your message has reached us. Help is being arranged."
    dispatch(
        recipient=body.session_id,
        text=ack_text,
        kind="reporter",
        zone_id=zone_id,
    )

    return {"messageId": message_id}


@router.post("/voice", response_model=ReporterMessageResponse, response_model_by_alias=True)
async def send_voice(
    sessionId: str = Form(...),
    audio: UploadFile = File(...),
    claims=Depends(require_reporter),
):
    """
    Reporter sends a voice note (multipart: sessionId + audio file).
    Returns: { messageId }  (transcribed reply arrives on WS channel).
    P4-Comms will wire up the transcription pipeline here.
    """
    session = state.get_reporter_session(sessionId)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Session {sessionId} not found")

    message_id = state.next_id("MSG")
    bus.publish("agent.activity", {
        "agent": "intake",
        "message": f"Voice note received for session {sessionId}. Pending transcription.",
        "incidentId": None,
        "planId": None,
    })
    return {"messageId": message_id}
