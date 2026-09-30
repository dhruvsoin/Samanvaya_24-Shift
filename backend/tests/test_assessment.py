"""
tests/test_assessment.py — Tests for AssessmentAgent and severity scoring.

Verifies:
  1. The three seed incidents score about 72 (INC-01), 65 (INC-02), and 91 (INC-03).
  2. Map to severity: <40 low, 40-59 medium, 60-79 high, >=80 critical.
  3. timeWindowMinutes: critical 10, high 20-25, medium 40, low 60.
  4. On incident.reported:
       - Computes severityScore, severity, timeWindowMinutes.
       - Publishes incident.assessed.
       - Publishes an agent.activity line explaining the score in one sentence.
       - Recomputes overall severity for status.updated.
  5. Rain bonus (light 0, moderate 5, heavy 10, extreme 15) and vulnerable-group bonus (10).
  6. Weights loaded from config/assessment.json.
"""
from __future__ import annotations

import asyncio
from typing import Any
import pytest

from app.agents.assessment import (
    AssessmentAgent,
    compute_assessment,
    load_assessment_config,
)
from app.bus import bus
from app.clock import clock
from app.seed import events as seed_events
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


def get_seed_incident(inc_id: str) -> dict[str, Any]:
    """Extracts raw incident from seed events.json."""
    for evt in seed_events():
        if evt.get("type") == "incident.reported":
            inc = evt.get("payload", {}).get("incident", {})
            if inc.get("incidentId") == inc_id:
                return inc
    raise ValueError(f"Seed incident {inc_id} not found in events.json")


# ── 1. Unit Test: Three Seed Incidents Scoring ───────────────────────

def test_seed_incident_1_scoring():
    """
    INC-01: flooded_home, 6 people, children present.
    Expected: score about 72 (high), timeWindow 20 min.
    """
    inc = get_seed_incident("INC-01")
    score, severity, time_window, explanation = compute_assessment(inc, rain_intensity="light")

    assert score == 72
    assert severity == "high"
    assert time_window == 20
    assert "INC-01 scored 72 (high)" in explanation
    assert "6 people" in explanation
    assert "children present" in explanation
    assert "within 20 min" in explanation


def test_seed_incident_2_scoring():
    """
    INC-02: stranded_vehicle, 3 people, rising water.
    Expected: score about 65 (high), timeWindow 25 min.
    """
    inc = get_seed_incident("INC-02")
    score, severity, time_window, explanation = compute_assessment(inc, rain_intensity="light")

    assert score == 65
    assert severity == "high"
    assert time_window == 25
    assert "INC-02 scored 65 (high)" in explanation
    assert "3 people" in explanation
    assert "water rising" in explanation
    assert "within 25 min" in explanation


def test_seed_incident_3_scoring():
    """
    INC-03: medical, 2 people, elderly patient with breathing difficulty.
    Expected: score about 91 (critical), timeWindow 10 min.
    """
    inc = get_seed_incident("INC-03")
    score, severity, time_window, explanation = compute_assessment(inc, rain_intensity="light")

    assert score == 91
    assert severity == "critical"
    assert time_window == 10
    assert "INC-03 scored 91 (critical)" in explanation
    assert "elderly present" in explanation
    assert "breathing difficulty" in explanation
    assert "within 10 min" in explanation


# ── 2. Rain & Vulnerable Bonuses ─────────────────────────────────────

def test_rain_intensity_bonuses():
    base_inc = {
        "incidentId": "INC-TEST-RAIN",
        "type": "other",
        "peopleAffected": 1,
        "summary": "Water in backyard",
    }
    # other (20) + 1*3 (3) = 23 base
    cfg = load_assessment_config()

    s_light, _, _, _ = compute_assessment(base_inc, rain_intensity="light", config=cfg)
    s_mod, _, _, _ = compute_assessment(base_inc, rain_intensity="moderate", config=cfg)
    s_heavy, _, _, _ = compute_assessment(base_inc, rain_intensity="heavy", config=cfg)
    s_ext, _, _, _ = compute_assessment(base_inc, rain_intensity="extreme", config=cfg)

    assert s_light == 23 + 0
    assert s_mod == 23 + 5
    assert s_heavy == 23 + 10
    assert s_ext == 23 + 15


def test_vulnerable_keywords():
    for kw in ["elderly", "child", "children", "pregnant", "disabled"]:
        inc = {
            "incidentId": "INC-VULN",
            "type": "flooded_home",
            "peopleAffected": 1,
            "summary": f"Help needed, {kw} is in the house",
        }
        score, _, _, explanation = compute_assessment(inc, rain_intensity="light")
        # 44 (base) + 3 (people) + 10 (vuln) = 57
        assert score == 57


# ── 3. Severity & Time Window Mapping ────────────────────────────────

def test_severity_thresholds_and_windows():
    # Low (<40): other (20) + 1 person (3) = 23 -> low, 60 min
    low_inc = {"incidentId": "INC-LOW", "type": "other", "peopleAffected": 1, "summary": "Minor leak"}
    score_l, sev_l, tw_l, _ = compute_assessment(low_inc, rain_intensity="light")
    assert sev_l == "low"
    assert tw_l == 60

    # Medium (40-59): road_blocked (25) + 5 people (15) + rain moderate (5) = 45 -> medium, 40 min
    med_inc = {"incidentId": "INC-MED", "type": "road_blocked", "peopleAffected": 5, "summary": "Road impassable"}
    score_m, sev_m, tw_m, _ = compute_assessment(med_inc, rain_intensity="moderate")
    assert 40 <= score_m < 60
    assert sev_m == "medium"
    assert tw_m == 40

    # High (60-79): flooded_home (44) + 6 people (18) + children (10) = 72 -> high, 20 min
    high_inc = {"incidentId": "INC-HIGH", "type": "flooded_home", "peopleAffected": 6, "summary": "Children trapped in home"}
    score_h, sev_h, tw_h, _ = compute_assessment(high_inc, rain_intensity="light")
    assert 60 <= score_h < 80
    assert sev_h == "high"
    assert tw_h == 20

    # Critical (>=80): medical (55) + 2 people (6) + elderly (10) + breathing (20) = 91 -> critical, 10 min
    crit_inc = {"incidentId": "INC-CRIT", "type": "medical", "peopleAffected": 2, "summary": "Elderly patient cannot breathe"}
    score_c, sev_c, tw_c, _ = compute_assessment(crit_inc, rain_intensity="light")
    assert score_c >= 80
    assert sev_c == "critical"
    assert tw_c == 10


# ── 4. End-to-End Agent Event Handling ───────────────────────────────

@pytest.mark.asyncio
async def test_agent_handles_incident_reported_and_publishes_assessed():
    """
    When incident.reported is published:
      - AssessmentAgent handles it
      - Updates incident in state
      - Publishes incident.assessed with severity, severityScore, timeWindowMinutes
      - Publishes agent.activity line with explanation
      - Recomputes overallSeverity and publishes status.updated
    """
    agent = AssessmentAgent()

    assessed_events: list[dict] = []
    activity_events: list[dict] = []
    status_events: list[dict] = []

    bus.subscribe("incident.assessed", lambda e: assessed_events.append(e))
    bus.subscribe("agent.activity", lambda e: activity_events.append(e))
    bus.subscribe("status.updated", lambda e: status_events.append(e))

    # Initial system status is "low"
    assert state.get_system_status()["overallSeverity"] == "low"

    # Step 1: Report INC-01
    inc1 = get_seed_incident("INC-01")
    state.add_incident(inc1, publish=False)

    await agent.handle({
        "id": "evt_test_inc1",
        "type": "incident.reported",
        "ts": clock.now(),
        "payload": {"incident": inc1},
    })
    await asyncio.sleep(0.05)

    # 1. incident.assessed published
    assert len(assessed_events) == 1
    assessed_payload = assessed_events[0]["payload"]["incident"]
    assert assessed_payload["incidentId"] == "INC-01"
    assert assessed_payload["status"] == "assessed"
    assert assessed_payload["severity"] == "high"
    assert assessed_payload["severityScore"] == 72
    assert assessed_payload["timeWindowMinutes"] == 20

    # 2. State updated
    stored_inc1 = state.get_incident("INC-01")
    assert stored_inc1["severityScore"] == 72
    assert stored_inc1["severity"] == "high"

    # 3. agent.activity published
    assessment_activities = [
        a for a in activity_events if a["payload"]["agent"] == "assessment"
    ]
    assert len(assessment_activities) == 1
    act_msg = assessment_activities[0]["payload"]["message"]
    assert "INC-01 scored 72 (high)" in act_msg
    assert "within 20 min" in act_msg

    # 4. overallSeverity updated to high and status.updated published
    assert state.get_system_status()["overallSeverity"] == "high"
    assert len(status_events) >= 1
    assert status_events[-1]["payload"]["status"]["overallSeverity"] == "high"

    # Step 2: Report INC-03 (critical)
    inc3 = get_seed_incident("INC-03")
    state.add_incident(inc3, publish=False)

    await agent.handle({
        "id": "evt_test_inc3",
        "type": "incident.reported",
        "ts": clock.now(),
        "payload": {"incident": inc3},
    })
    await asyncio.sleep(0.05)

    # Assessed event for INC-03
    assert len(assessed_events) == 2
    assessed_inc3 = assessed_events[1]["payload"]["incident"]
    assert assessed_inc3["incidentId"] == "INC-03"
    assert assessed_inc3["severity"] == "critical"
    assert assessed_inc3["severityScore"] == 91
    assert assessed_inc3["timeWindowMinutes"] == 10

    # Overall system severity escalated to critical
    assert state.get_system_status()["overallSeverity"] == "critical"
    assert status_events[-1]["payload"]["status"]["overallSeverity"] == "critical"
