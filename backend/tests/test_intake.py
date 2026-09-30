"""
tests/test_intake.py — Tests for IntakeAgent and LLM extraction.

Requirements tested:
  1. English sample message:
     - Formats into Incident: type, location, peopleAffected, summary, confidence >= 0.5.
     - Emits incident.reported and agent.activity.
  2. Kannada translation message:
     - Calls extract_text(session_id, message) from comms layer.
     - Structures translatedText while preserving language="kn".
     - Emits incident.reported and agent.activity.
  3. Missing location message:
     - Sets confidence < 0.5.
     - Sends follow-up question to reporter (reporter.message_sent) instead of creating confident incident.
     - Follow-up message providing location completes the report and publishes incident.reported.
  4. Duplicate merging:
     - New report within 100 m and 10 scenario minutes of same type updates existing incident.
     - Preserves higher severity.
     - Emits incident.updated and agent.activity.
  5. LLM Interface:
     - RuleBasedLLM fallback and keyword extraction.
     - OllamaLLM fallback behavior when Ollama endpoint is unreachable.
"""
from __future__ import annotations

import asyncio
from typing import Any
import pytest

from app.agents.intake import (
    BaseLLM,
    ExtractedIncident,
    IntakeAgent,
    OllamaLLM,
    RuleBasedLLM,
    get_llm,
    haversine_distance_m,
)
from app.bus import bus
from app.clock import clock
from app.comms import extract_text
from app.state import state


@pytest.fixture(autouse=True)
def reset_environment():
    bus.reset()
    state.reset()
    clock.reset()
    yield
    bus.reset()
    state.reset()
    clock.reset()


# ── 1. Comms layer extract_text test ─────────────────────────────────

def test_comms_extract_text():
    # String input
    res_str = extract_text("SES-1", "Water rising fast")
    assert res_str["text"] == "Water rising fast"
    assert res_str["language"] == "en"
    assert res_str["translatedText"] == "Water rising fast"

    # Pre-translated payload
    res_payload = extract_text("SES-1", {
        "text": "ನಮ್ಮ ಮನೆಗೆ ನೀರು ನುಗ್ಗುತ್ತಿದೆ, ಸಹಾಯ ಮಾಡಿ",
        "language": "kn",
        "translatedText": "Water is entering our house, please help",
    })
    assert res_payload["language"] == "kn"
    assert res_payload["translatedText"] == "Water is entering our house, please help"

    # Auto-lookup Kannada phrase from demo dictionary
    res_auto = extract_text("SES-1", {
        "text": "ಹೊಸೂರು ರಸ್ತೆ ಅಂಡರ್‌ಪಾಸ್ ಮುಳುಗಿದೆ",
        "language": "kn",
    })
    assert res_auto["language"] == "kn"
    assert "underpass" in res_auto["translatedText"].lower()


# ── 2. Sample 1: English Message ─────────────────────────────────────

@pytest.mark.asyncio
async def test_intake_english_message():
    """
    On an English reporter message with type and location:
      - structures into Incident (type, location, peopleAffected, summary, confidence >= 0.5)
      - publishes incident.reported and agent.activity
    """
    intake = IntakeAgent(llm=RuleBasedLLM())

    reported_events: list[dict] = []
    activity_events: list[dict] = []
    bus.subscribe("incident.reported", lambda e: reported_events.append(e))
    bus.subscribe("agent.activity", lambda e: activity_events.append(e))

    message_payload = {
        "sessionId": "SES-EN-01",
        "messageId": "MSG-101",
        "from": "reporter",
        "text": "Three people trapped on roof at Lakeside colony, 2nd cross! Water is rising quickly!",
        "translatedText": None,
        "language": "en",
        "channel": "chat",
    }

    await intake.handle({
        "id": "evt_test_01",
        "type": "reporter.message_sent",
        "ts": clock.now(),
        "payload": message_payload,
    })
    await asyncio.sleep(0.05)

    # Assert incident was published
    assert len(reported_events) == 1, "Expected incident.reported to be published"
    inc = reported_events[0]["payload"]["incident"]

    assert inc["type"] == "trapped_person"
    assert inc["location"]["label"] == "Lakeside colony, 2nd cross"
    assert inc["peopleAffected"] == 3
    assert inc["confidence"] >= 0.5
    assert inc["reporterSessionId"] == "SES-EN-01"
    assert inc["language"] == "en"

    # Assert agent.activity was published
    intake_activities = [a for a in activity_events if a["payload"]["agent"] == "intake"]
    assert len(intake_activities) >= 1
    assert "INC-" in intake_activities[0]["payload"]["message"]
    assert intake_activities[0]["payload"]["incidentId"] == inc["incidentId"]

    # Assert stored in state
    state_inc = state.get_incident(inc["incidentId"])
    assert state_inc is not None
    assert state_inc["incidentId"] == inc["incidentId"]


# ── 3. Sample 2: Kannada Translation Message ─────────────────────────

@pytest.mark.asyncio
async def test_intake_kannada_translation_message():
    """
    On a Kannada reporter message:
      - extract_text parses Kannada text and provides English translatedText
      - structures into Incident using translatedText while preserving language="kn"
      - publishes incident.reported and agent.activity
    """
    intake = IntakeAgent(llm=RuleBasedLLM())

    reported_events: list[dict] = []
    activity_events: list[dict] = []
    bus.subscribe("incident.reported", lambda e: reported_events.append(e))
    bus.subscribe("agent.activity", lambda e: activity_events.append(e))

    message_payload = {
        "sessionId": "SES-KN-01",
        "messageId": "MSG-201",
        "from": "reporter",
        "text": "ನಮ್ಮ ಮನೆಗೆ ನೀರು ನುಗ್ಗುತ್ತಿದೆ, ಸಹಾಯ ಮಾಡಿ, 4 ಜನರು ಲ್ಯಾಂಕೆಸೈಡ್ ಕಾಲೋನಿ",
        "translatedText": "Water is entering our house at Lakeside colony, 2nd cross, please help, 4 family members",
        "language": "kn",
        "channel": "chat",
    }

    await intake.handle({
        "id": "evt_test_02",
        "type": "reporter.message_sent",
        "ts": clock.now(),
        "payload": message_payload,
    })
    await asyncio.sleep(0.05)

    assert len(reported_events) == 1
    inc = reported_events[0]["payload"]["incident"]

    assert inc["type"] == "flooded_home"
    assert "Lakeside" in inc["location"]["label"]
    assert inc["peopleAffected"] == 4
    assert inc["language"] == "kn"
    assert inc["confidence"] >= 0.5
    assert inc["reporterSessionId"] == "SES-KN-01"

    intake_activities = [a for a in activity_events if a["payload"]["agent"] == "intake"]
    assert len(intake_activities) >= 1
    assert inc["incidentId"] in intake_activities[0]["payload"]["message"]


# ── 4. Sample 3: Missing Location Message ────────────────────────────

@pytest.mark.asyncio
async def test_intake_missing_location_asks_followup():
    """
    If location is missing:
      - set confidence < 0.5
      - send follow-up question to reporter (reporter.message_sent) from "system"
      - do NOT create confident incident (no incident.reported)
      - when reporter replies with location, draft is completed and incident is reported
    """
    intake = IntakeAgent(llm=RuleBasedLLM())

    reported_events: list[dict] = []
    system_messages: list[dict] = []
    activity_events: list[dict] = []

    bus.subscribe("incident.reported", lambda e: reported_events.append(e))
    bus.subscribe("reporter.message_sent", lambda e: system_messages.append(e))
    bus.subscribe("agent.activity", lambda e: activity_events.append(e))

    # Message describing flooded home but giving NO location
    incomplete_message = {
        "sessionId": "SES-INCOMPLETE-01",
        "messageId": "MSG-301",
        "from": "reporter",
        "text": "Water is entering our living room and rising fast! 2 people stuck here!",
        "translatedText": None,
        "language": "en",
        "channel": "chat",
    }

    await intake.handle({
        "id": "evt_test_03a",
        "type": "reporter.message_sent",
        "ts": clock.now(),
        "payload": incomplete_message,
    })
    await asyncio.sleep(0.05)

    # 1. No incident should be reported yet
    assert len(reported_events) == 0, "Should not create incident when location is missing"

    # 2. System follow-up question sent to reporter
    system_replies = [
        m for m in system_messages
        if m["payload"].get("from") == "system" and m["payload"].get("sessionId") == "SES-INCOMPLETE-01"
    ]
    assert len(system_replies) == 1
    reply = system_replies[0]["payload"]
    assert "location" in reply["text"].lower()

    # 3. Agent logged activity about incomplete report
    intake_activities = [a for a in activity_events if a["payload"]["agent"] == "intake"]
    assert len(intake_activities) >= 1
    assert "missing location" in intake_activities[0]["payload"]["message"]

    # 4. Reporter responds with location
    location_reply = {
        "sessionId": "SES-INCOMPLETE-01",
        "messageId": "MSG-302",
        "from": "reporter",
        "text": "We are at Lakeside colony, 2nd cross",
        "translatedText": None,
        "language": "en",
        "channel": "chat",
    }

    await intake.handle({
        "id": "evt_test_03b",
        "type": "reporter.message_sent",
        "ts": clock.now(),
        "payload": location_reply,
    })
    await asyncio.sleep(0.05)

    # Now the incident should be reported!
    assert len(reported_events) == 1
    created_inc = reported_events[0]["payload"]["incident"]
    assert created_inc["type"] == "flooded_home"
    assert created_inc["location"]["label"] == "Lakeside colony, 2nd cross"
    assert created_inc["confidence"] >= 0.5


# ── 5. Duplicate Detection and Merging ────────────────────────────────

@pytest.mark.asyncio
async def test_intake_merges_duplicate_incidents():
    """
    A new report within 100 m and 10 scenario minutes of an open incident
    of the same type updates that incident and keeps the higher severity.
    """
    intake = IntakeAgent(llm=RuleBasedLLM())

    updated_events: list[dict] = []
    reported_events: list[dict] = []
    activity_events: list[dict] = []

    bus.subscribe("incident.reported", lambda e: reported_events.append(e))
    bus.subscribe("incident.updated", lambda e: updated_events.append(e))
    bus.subscribe("agent.activity", lambda e: activity_events.append(e))

    # Initial incident reported at 09:00:00 (medium severity)
    msg1 = {
        "sessionId": "SES-DUP-01",
        "messageId": "MSG-401",
        "from": "reporter",
        "text": "Car stranded in water at Silk Board Junction, 1 person inside.",
        "translatedText": None,
        "language": "en",
        "channel": "chat",
    }
    await intake.handle({
        "id": "evt_test_04a",
        "type": "reporter.message_sent",
        "ts": clock.now(),
        "payload": msg1,
    })
    await asyncio.sleep(0.05)

    assert len(reported_events) == 1
    first_inc_id = reported_events[0]["payload"]["incident"]["incidentId"]
    assert state.get_incident(first_inc_id)["peopleAffected"] == 1

    # Second report 3 scenario minutes later (within 10 mins) at Silk Board (same location <= 100m)
    # reporting critical condition and 3 people
    msg2 = {
        "sessionId": "SES-DUP-02",
        "messageId": "MSG-402",
        "from": "reporter",
        "text": "Critical danger! Submerged car at Silk Board Junction with 3 people trapped inside!",
        "translatedText": None,
        "language": "en",
        "channel": "chat",
    }

    await intake.handle({
        "id": "evt_test_04b",
        "type": "reporter.message_sent",
        "ts": clock.now(),
        "payload": msg2,
    })
    await asyncio.sleep(0.05)

    # Should NOT create a second incident
    assert len(reported_events) == 1, "Duplicate should not create new incident"

    # Should publish incident.updated
    assert len(updated_events) == 1
    upd = updated_events[0]["payload"]
    assert upd["incident"]["incidentId"] == first_inc_id
    assert upd["incident"]["peopleAffected"] == 3
    assert upd["incident"]["severity"] == "critical"
    assert "peopleAffected" in upd["changedFields"]
    assert "severity" in upd["changedFields"]

    # Activity logged about merge
    merge_activities = [
        a for a in activity_events
        if "Merged duplicate report" in a["payload"]["message"]
    ]
    assert len(merge_activities) == 1
    assert first_inc_id in merge_activities[0]["payload"]["message"]


# ── 6. OllamaLLM Fallback & RuleBasedLLM Extraction ──────────────────

@pytest.mark.asyncio
async def test_ollama_llm_fallback_when_offline():
    """
    OllamaLLM should gracefully fallback to RuleBasedLLM when the Ollama host is unreachable.
    """
    ollama = OllamaLLM(host="http://localhost:59999", fallback=RuleBasedLLM())
    res = await ollama.extract_incident("2 people trapped on terrace at Lakeside Market")

    assert res.incident_type == "trapped_person"
    assert "Lakeside" in (res.location_label or "")
    assert res.people_affected == 2
    assert res.confidence >= 0.5


def test_haversine_distance():
    # Same point -> 0 meters
    assert haversine_distance_m(12.929, 77.612, 12.929, 77.612) == 0.0
    # Two points ~50m apart in Bangalore
    dist = haversine_distance_m(12.9290, 77.6120, 12.9294, 77.6120)
    assert 40.0 < dist < 50.0
