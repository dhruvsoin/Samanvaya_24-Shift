"""
comms.py — Person 4 comms layer interface.

Extracts text, detected language, and English translated text from reporter messages.
Provides channel dispatching, degraded-zone failover (chat -> SMS), and comms logging.
"""
from __future__ import annotations

from typing import Any, Literal

from .bus import bus
from .clock import clock
from .state import state

Channel = Literal["chat", "sms", "phone"]
RecipientKind = Literal["reporter", "crew", "operator"]


def resolve_zone(recipient_id: str, kind: RecipientKind | str) -> str | None:
    """
    Resolve the zone from the recipient:
      - For crew units: unit's location zoneId
      - For reporters: zoneId of an open incident associated with the reporter session
      - For operators: None
    """
    if kind == "crew":
        unit = state.get_unit(recipient_id)
        if unit:
            return unit.get("zoneId") or (unit.get("location") or {}).get("zoneId")
    elif kind == "reporter":
        for inc in state.get_incidents():
            if inc.get("status") not in ("closed", "resolved") and inc.get("reporterSessionId") == recipient_id:
                loc = inc.get("location") or {}
                if loc.get("zoneId"):
                    return loc["zoneId"]
    return None


def get_channel_for_recipient(
    recipient_id: str,
    kind: RecipientKind | str,
    zone_id: str | None = None,
) -> Channel:
    """
    Determines whether a recipient should use 'chat' or 'sms' fallback based on zone comms status.
    """
    if zone_id is None:
        zone_id = resolve_zone(recipient_id, kind)
    if zone_id:
        zone = state.get_zone(zone_id)
        if zone and zone.get("commsStatus") == "degraded":
            return "sms"
    return "chat"


def dispatch(
    recipient: str | dict[str, Any],
    text: str,
    kind: RecipientKind | str | None = None,
    zone_id: str | None = None,
) -> dict[str, Any]:
    """
    Dispatches a message to a reporter session, crew unit, or operator.

    If the zone comms status is 'ok':
      - Delivers on normal channel ('chat')
      - Appends a log entry to comms log through state
      - If reporter, publishes reporter.message_sent (from: 'system')

    If the zone comms status is 'degraded':
      1. Publishes comms.delivery_failed for the normal channel ('chat')
      2. Publishes comms.channel_switched to 'sms'
      3. Delivers as simulated SMS:
         - Appends an entry (channel 'sms') to the comms log through state
         - If reporter, publishes reporter.message_sent (channel: 'sms', from: 'system')
    """
    # 1. Normalize recipient and kind
    if isinstance(recipient, dict):
        r_kind = recipient.get("kind") or kind
        r_id = recipient.get("id") or recipient.get("unitId") or recipient.get("sessionId")
    else:
        r_id = str(recipient)
        r_kind = kind

    if not r_kind:
        if r_id == "operator":
            r_kind = "operator"
        elif r_id.startswith("SES-"):
            r_kind = "reporter"
        elif r_id.startswith(("AMB-", "BOAT-", "RES-", "PUMP-")):
            r_kind = "crew"
        else:
            r_kind = "crew"

    recipient_ref = {"kind": r_kind, "id": r_id}

    # 2. Resolve zone if not provided
    if zone_id is None:
        zone_id = resolve_zone(r_id, r_kind)

    # 3. Check zone comms status
    is_degraded = False
    if zone_id:
        zone = state.get_zone(zone_id)
        if zone and zone.get("commsStatus") == "degraded":
            is_degraded = True

    ts = clock.now()

    if not is_degraded:
        # Deliver on normal channel ('chat')
        msg_id = state.next_id("MSG")
        if r_kind == "reporter":
            bus.publish("reporter.message_sent", {
                "sessionId": r_id,
                "messageId": msg_id,
                "from": "system",
                "text": text,
                "translatedText": None,
                "language": "en",
                "channel": "chat",
            })

        log_id = state.next_id("LOG")
        log_entry = {
            "entryId": log_id,
            "ts": ts,
            "direction": "out",
            "channel": "chat",
            "recipient": recipient_ref,
            "text": text,
            "delivery": "sent",
            "zoneId": zone_id,
        }
        state.append_comms_log(log_entry)
        return {
            "channel": "chat",
            "delivery": "sent",
            "messageId": msg_id,
            "logId": log_id,
            "zoneId": zone_id,
        }

    else:
        # Zone degraded:
        # Step A: publish comms.delivery_failed for normal channel
        failed_msg_id = state.next_id("MSG")
        bus.publish("comms.delivery_failed", {
            "messageId": failed_msg_id,
            "recipient": recipient_ref,
            "channel": "chat",
            "zoneId": zone_id,
        })

        # Step B: publish comms.channel_switched to sms
        bus.publish("comms.channel_switched", {
            "recipient": recipient_ref,
            "from": "chat",
            "to": "sms",
            "reason": f"{zone_id} comms degraded",
        })

        # Step C: deliver as simulated SMS
        sms_msg_id = state.next_id("MSG")
        if r_kind == "reporter":
            bus.publish("reporter.message_sent", {
                "sessionId": r_id,
                "messageId": sms_msg_id,
                "from": "system",
                "text": text,
                "translatedText": None,
                "language": "en",
                "channel": "sms",
            })

        log_id = state.next_id("LOG")
        sms_entry = {
            "entryId": log_id,
            "ts": ts,
            "direction": "out",
            "channel": "sms",
            "recipient": recipient_ref,
            "text": text,
            "delivery": "sent",
            "zoneId": zone_id,
        }
        state.append_comms_log(sms_entry)
        return {
            "channel": "sms",
            "delivery": "sent",
            "messageId": sms_msg_id,
            "logId": log_id,
            "zoneId": zone_id,
        }


def extract_text(session_id: str, message: dict | str) -> dict[str, str | None]:
    """
    Extracts text, language, and translatedText from a reporter message.
    Returns:
      {
        "text": <original text>,
        "language": <language code e.g. 'en', 'kn'>,
        "translatedText": <English translation, or original text if English>
      }
    """
    if isinstance(message, str):
        return {
            "text": message,
            "language": "en",
            "translatedText": message,
        }

    text = message.get("text", "")
    language = message.get("language") or "en"
    translated = message.get("translatedText")

    if translated:
        return {
            "text": text,
            "language": language,
            "translatedText": translated,
        }

    if language == "en" or not language:
        return {
            "text": text,
            "language": "en",
            "translatedText": text,
        }

    # Demo translations for Kannada phrases in seed/events.json
    translations = {
        "ನಮ್ಮ ಮನೆಗೆ ನೀರು ನುಗ್ಗುತ್ತಿದೆ, ಸಹಾಯ ಮಾಡಿ": "Water is entering our house, please help",
        "ನೀರು ಹೆಚ್ಚಾಗುತ್ತಿದೆ": "Water is rising",
        "ಹೊಸೂರು ರಸ್ತೆ ಅಂಡರ್‌ಪಾಸ್ ಮುಳುಗಿದೆ": "Hosur road underpass is submerged",
    }
    return {
        "text": text,
        "language": language,
        "translatedText": translations.get(text.strip(), text),
    }
