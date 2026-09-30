"""
sms_service.py — Twilio SMS gateway for Samanvaya.

In production set these env vars:
  TWILIO_ACCOUNT_SID   your Twilio account SID
  TWILIO_AUTH_TOKEN    your Twilio auth token
  TWILIO_FROM_NUMBER   +1XXXXXXXXXX  (Twilio number or messaging service SID)

Without those vars the service runs in STUB MODE:
  - All sends are logged to stdout and return a fake SID.
  - No network calls are made — safe for hackathon dev / CI.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("samanvaya.sms")


# ── In-memory outbox (replaces a DB for the hackathon) ──────────────────────
_outbox: list[dict] = []


def _record(to: str, body: str, sid: str, status: str, error: Optional[str] = None) -> dict:
    entry = {
        "sid": sid,
        "to": to,
        "body": body,
        "status": status,
        "error": error,
        "sentAt": datetime.now(timezone.utc).isoformat(),
    }
    _outbox.append(entry)
    return entry


def get_outbox() -> list[dict]:
    """Return a copy of all sent messages (newest last)."""
    return list(_outbox)


# ── Twilio client (lazy-loaded so import never crashes) ──────────────────────
def _twilio_client():
    """Return a live Twilio client or None if credentials are missing."""
    sid = os.getenv("TWILIO_ACCOUNT_SID", "")
    token = os.getenv("TWILIO_AUTH_TOKEN", "")
    if not sid or not token:
        return None
    try:
        from twilio.rest import Client  # type: ignore
        return Client(sid, token)
    except ImportError:
        logger.warning("twilio package not installed — running in stub mode")
        return None


def _from_number() -> str:
    return os.getenv("TWILIO_FROM_NUMBER", "+10000000000")


# ── Core send ────────────────────────────────────────────────────────────────
def send_sms(to: str, body: str) -> dict:
    """
    Send an SMS to `to` (E.164 format, e.g. '+919876543210').
    Returns a dict with keys: sid, to, body, status, sentAt, error.
    """
    client = _twilio_client()

    if client is None:
        # ── STUB mode ────────────────────────────────────────────────────────
        fake_sid = f"SM{uuid.uuid4().hex[:28].upper()}"
        logger.info("[SMS STUB] to=%s | %s", to, body[:80])
        return _record(to, body, fake_sid, "stub_sent")

    # ── Live Twilio send ─────────────────────────────────────────────────────
    try:
        msg = client.messages.create(from_=_from_number(), to=to, body=body)
        logger.info("[SMS LIVE] sid=%s to=%s", msg.sid, to)
        return _record(to, body, msg.sid, msg.status)
    except Exception as exc:  # noqa: BLE001
        logger.error("[SMS ERROR] to=%s err=%s", to, exc)
        return _record(to, body, f"ERR-{uuid.uuid4().hex[:8]}", "failed", str(exc))


# ── High-level helpers ───────────────────────────────────────────────────────
def send_assignment_sms(unit_name: str, to: str, incident_summary: str,
                        location_label: str, eta_minutes: int) -> dict:
    """Notify a field crew of a new assignment."""
    body = (
        f"[Samanvaya] NEW ASSIGNMENT\n"
        f"Unit: {unit_name}\n"
        f"Incident: {incident_summary}\n"
        f"Location: {location_label}\n"
        f"ETA: {eta_minutes} min\n"
        f"Reply ACCEPT or DECLINE"
    )
    return send_sms(to, body)


def send_incident_alert_sms(to: str, incident_type: str, location_label: str,
                             severity: Optional[str] = None) -> dict:
    """Alert a reporter / affected party that their incident was received."""
    severity_txt = f" [{severity.upper()}]" if severity else ""
    body = (
        f"[Samanvaya] Your report has been received{severity_txt}.\n"
        f"Type: {incident_type.replace('_', ' ').title()}\n"
        f"Location: {location_label}\n"
        f"Help is being coordinated. Stay safe."
    )
    return send_sms(to, body)


def send_status_update_sms(to: str, incident_id: str, new_status: str) -> dict:
    """Notify a reporter that their incident status has changed."""
    body = (
        f"[Samanvaya] Incident {incident_id} update:\n"
        f"Status: {new_status.replace('_', ' ').upper()}\n"
        f"For emergencies call 112."
    )
    return send_sms(to, body)


def send_bulk_alert(recipients: list[str], message: str) -> list[dict]:
    """Broadcast a message to multiple numbers."""
    return [send_sms(r, message) for r in recipients]
