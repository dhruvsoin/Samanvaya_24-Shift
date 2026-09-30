"""
agents/assessment.py — Assessment Agent for Samanvaya.

Responsibilities:
  - Listens to `incident.reported`.
  - Rule-based, strictly NO LLM.
  - Computes `severityScore` (0–100):
      type base + min(peopleAffected * 3, 18) + vulnerable-group bonus (10)
      + rain bonus (0-15) + water-level bonus + critical condition bonus.
  - Maps score to `severity`:
      <40 low, 40–59 medium, 60–79 high, >=80 critical.
  - Maps to `timeWindowMinutes`:
      critical: 10, high: 20-25, medium: 40, low: 60.
  - Config weights loaded from `config/assessment.json`.
  - Publishes `incident.assessed`.
  - Publishes `agent.activity` explaining the score in one sentence.
  - Recomputes overall system severity and updates status (`status.updated`).
"""
from __future__ import annotations

import json
import logging
import os
import pathlib
import re
from typing import Any, Tuple

from .base import Agent
from ..models import Severity
from ..state import state

logger = logging.getLogger(__name__)

# Severity hierarchy for ranking and overall severity recomputation
SEVERITY_RANKS: dict[str, int] = {
    "low": 1,
    "medium": 2,
    "high": 3,
    "critical": 4,
}
RANK_TO_SEVERITY: dict[int, Severity] = {
    1: "low",
    2: "medium",
    3: "high",
    4: "critical",
}

# ── Configuration Loader ──────────────────────────────────────────────

DEFAULT_CONFIG: dict[str, Any] = {
    "type_base": {
        "medical": 55,
        "trapped_person": 55,
        "flooded_home": 44,
        "stranded_vehicle": 50,
        "road_blocked": 25,
        "other": 20,
    },
    "people_multiplier": 3,
    "people_max_bonus": 18,
    "vulnerable_bonus": 10,
    "vulnerable_keywords": [
        "elderly",
        "child",
        "children",
        "pregnant",
        "disabled",
        "senior",
        "infant",
        "baby",
    ],
    "rain_bonus": {
        "light": 0,
        "moderate": 5,
        "heavy": 10,
        "extreme": 15,
    },
    "water_level_bonus": 6,
    "water_level_keywords": [
        "rising water",
        "water rising",
        "submerged",
        "chest deep",
        "waist deep",
        "deep water",
        "rapidly rising",
    ],
    "critical_condition_bonus": 20,
    "critical_condition_keywords": [
        "breathing difficulty",
        "cannot breathe",
        "cardiac",
        "heart attack",
        "unconscious",
        "oxygen",
        "severe bleeding",
        "critical condition",
    ],
    "severity_thresholds": {
        "critical": 80,
        "high": 60,
        "medium": 40,
    },
    "time_window_minutes": {
        "critical": 10,
        "high_default": 20,
        "high_stranded_vehicle": 25,
        "medium": 40,
        "low": 60,
    },
}


def load_assessment_config() -> dict[str, Any]:
    """
    Loads assessment weights from config/assessment.json.
    Searches in multiple possible relative paths and falls back to DEFAULT_CONFIG.
    """
    candidates = [
        pathlib.Path("config/assessment.json"),
        pathlib.Path("backend/config/assessment.json"),
        pathlib.Path(__file__).parent.parent.parent / "config" / "assessment.json",
        pathlib.Path(__file__).parent.parent.parent.parent / "config" / "assessment.json",
    ]
    for path in candidates:
        if path.is_file():
            try:
                with open(path, encoding="utf-8") as f:
                    cfg = json.load(f)
                    # Merge with defaults
                    merged = dict(DEFAULT_CONFIG)
                    merged.update(cfg)
                    return merged
            except Exception as e:
                logger.warning("Failed to load assessment config from %s: %s", path, e)
    return dict(DEFAULT_CONFIG)


# ── Assessment Scoring Logic ──────────────────────────────────────────

def compute_assessment(
    incident: dict[str, Any],
    rain_intensity: str | None = None,
    config: dict[str, Any] | None = None,
) -> Tuple[int, Severity, int, str]:
    """
    Computes (severityScore, severity, timeWindowMinutes, explanation).
    Rule-based, NO LLM.
    """
    cfg = config or load_assessment_config()

    inc_type = incident.get("type", "other")
    summary = (incident.get("summary") or "").lower()
    people = incident.get("peopleAffected") or 1

    # 1. Base score by incident type
    type_base_map = cfg.get("type_base", DEFAULT_CONFIG["type_base"])
    base_score = type_base_map.get(inc_type, 20)
    score = base_score

    reasons: list[str] = []

    # 2. People affected bonus
    mult = cfg.get("people_multiplier", 3)
    max_people_bonus = cfg.get("people_max_bonus", 18)
    people_bonus = min(people * mult, max_people_bonus)
    score += people_bonus
    reasons.append(f"{people} {'people' if people != 1 else 'person'}")

    # 3. Vulnerable group bonus
    vuln_keywords = cfg.get("vulnerable_keywords", DEFAULT_CONFIG["vulnerable_keywords"])
    vuln_bonus = cfg.get("vulnerable_bonus", 10)
    has_vulnerable = any(re.search(rf"\b{kw}\b", summary) for kw in vuln_keywords)
    if has_vulnerable:
        score += vuln_bonus
        if "child" in summary or "children" in summary:
            reasons.append("children present")
        elif "elderly" in summary or "senior" in summary:
            reasons.append("elderly present")
        elif "pregnant" in summary:
            reasons.append("pregnant woman present")
        elif "disabled" in summary:
            reasons.append("disabled person present")
        else:
            reasons.append("vulnerable individuals present")

    # 4. Water-level bonus if stated
    water_keywords = cfg.get("water_level_keywords", DEFAULT_CONFIG["water_level_keywords"])
    water_bonus = cfg.get("water_level_bonus", 6)
    has_water_level = any(re.search(rf"\b{kw}\b", summary) for kw in water_keywords)
    if has_water_level:
        score += water_bonus
        reasons.append("water rising")

    # 5. Critical condition / acute medical bonus
    crit_keywords = cfg.get("critical_condition_keywords", DEFAULT_CONFIG["critical_condition_keywords"])
    crit_bonus = cfg.get("critical_condition_bonus", 20)
    has_critical_condition = any(re.search(rf"\b{kw}\b", summary) for kw in crit_keywords)
    if has_critical_condition:
        score += crit_bonus
        if "breathing" in summary:
            reasons.append("breathing difficulty")
        else:
            reasons.append("critical medical condition")

    # 6. Rain bonus
    if not rain_intensity:
        sys_status = state.get_system_status()
        rain_intensity = sys_status.get("rain", {}).get("intensity", "light")
    rain_map = cfg.get("rain_bonus", DEFAULT_CONFIG["rain_bonus"])
    rain_score = rain_map.get(rain_intensity.lower(), 0)
    if rain_score > 0:
        score += rain_score
        reasons.append(f"{rain_intensity} rain")

    # Clamp severityScore to [0, 100]
    severity_score = max(0, min(100, score))

    # 7. Map to Severity (<40 low, 40-59 medium, 60-79 high, >=80 critical)
    thresholds = cfg.get("severity_thresholds", DEFAULT_CONFIG["severity_thresholds"])
    if severity_score >= thresholds.get("critical", 80):
        severity: Severity = "critical"
    elif severity_score >= thresholds.get("high", 60):
        severity = "high"
    elif severity_score >= thresholds.get("medium", 40):
        severity = "medium"
    else:
        severity = "low"

    # 8. Determine timeWindowMinutes (critical 10, high 20-25, medium 40, low 60)
    tw_cfg = cfg.get("time_window_minutes", DEFAULT_CONFIG["time_window_minutes"])
    if severity == "critical":
        time_window = tw_cfg.get("critical", 10)
    elif severity == "high":
        if inc_type == "stranded_vehicle" or severity_score < 70:
            time_window = tw_cfg.get("high_stranded_vehicle", 25)
        else:
            time_window = tw_cfg.get("high_default", 20)
    elif severity == "medium":
        time_window = tw_cfg.get("medium", 40)
    else:
        time_window = tw_cfg.get("low", 60)

    # 9. One-sentence explanation
    inc_id = incident.get("incidentId", "Incident")
    reasons_str = ", ".join(reasons)
    explanation = f"{inc_id} scored {severity_score} ({severity}): {reasons_str}. Help needed within {time_window} min."

    return severity_score, severity, time_window, explanation


# ── Assessment Agent ──────────────────────────────────────────────────

class AssessmentAgent(Agent):
    """
    Assessment Agent: Computes severity score, category, and response time window
    for newly reported incidents, and recomputes overall system severity.
    Rule-based, NO LLM.
    """
    name = "assessment"
    subscribes_to = ["incident.reported"]

    def __init__(self, config: dict[str, Any] | None = None) -> None:
        super().__init__()
        self.config = config or load_assessment_config()

    async def handle(self, event: dict) -> None:
        payload = event.get("payload", {})
        incident = payload.get("incident")
        if not incident:
            return

        inc_id = incident.get("incidentId")
        if not inc_id:
            return

        # 1. Compute assessment score, severity, time window, and explanation
        score, severity, time_window, explanation = compute_assessment(
            incident=incident,
            config=self.config,
        )

        # 2. Update incident in state store and publish incident.assessed
        assessed_incident = state.assess_incident(
            incident_id=inc_id,
            severity=severity,
            severity_score=score,
            time_window_minutes=time_window,
            publish=True,
        )
        if assessed_incident is None:
            # If incident wasn't registered in store yet (e.g. isolated test event)
            inc_copy = dict(incident)
            inc_copy["status"] = "assessed"
            inc_copy["severity"] = severity
            inc_copy["severityScore"] = score
            inc_copy["timeWindowMinutes"] = time_window
            state.add_incident(inc_copy, publish=False)
            self.emit("incident.assessed", {"incident": inc_copy})

        # 3. Publish agent.activity explaining the score in one sentence
        self.log_activity(explanation, incident_id=inc_id)

        # 4. Recompute overall severity for status.updated
        self.recompute_and_update_overall_severity()

    def recompute_and_update_overall_severity(self) -> Severity:
        """
        Calculates the overall system severity from all open incidents.
        Updates state and emits status.updated.
        """
        all_incidents = state.get_incidents()
        open_incidents = [
            inc for inc in all_incidents
            if inc.get("status") not in ("closed", "resolved") and inc.get("severity")
        ]

        if not open_incidents:
            overall: Severity = "low"
        else:
            max_rank = max(SEVERITY_RANKS.get(inc["severity"], 1) for inc in open_incidents)
            overall = RANK_TO_SEVERITY.get(max_rank, "low")

        current_status = state.get_system_status()
        if current_status.get("overallSeverity") != overall:
            state.update_system_status({"overallSeverity": overall}, publish=True)

        return overall
