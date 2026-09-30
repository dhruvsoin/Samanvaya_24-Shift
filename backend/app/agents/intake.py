"""
agents/intake.py — Intake Agent for Samanvaya.

Responsibilities:
  - Listens to `reporter.message_sent` (from: "reporter").
  - Calls Person 4's comms layer: `extract_text(session_id, message)`.
  - Structures reports into an Incident using an LLM abstraction (`extract_incident`).
    - OllamaLLM: Local model (JSON-only, Pydantic validated, retries once).
    - RuleBasedLLM: Deterministic keyword/regex fallback (used when Ollama is unavailable or LLM_MODE=scripted).
  - Never calls the LLM to decide anything except extraction.
  - If location or type is missing: sets confidence < 0.5 and sends a follow-up question
    to the reporter (`reporter.message_sent`) instead of creating a confident incident.
  - Merge duplicates: A new report within 100 m and 10 scenario minutes of an open incident
    of the same type updates that incident and keeps the higher severity.
  - Emits `incident.reported` (via state) and `agent.activity`.
"""
from __future__ import annotations

import abc
import json
import logging
import math
import os
import re
from datetime import datetime
from typing import Any, Optional

import httpx
from pydantic import BaseModel, Field

from .base import Agent
from ..comms import extract_text
from ..clock import clock
from ..models import IncidentType, Severity
from ..state import state

logger = logging.getLogger(__name__)

SEVERITY_RANKS: dict[str, int] = {
    "low": 1,
    "medium": 2,
    "high": 3,
    "critical": 4,
}


def haversine_distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate distance in meters between two lat/lng coordinates."""
    R = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lng2 - lng1)
    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


# ── Extraction Pydantic Model ─────────────────────────────────────────

class ExtractedIncident(BaseModel):
    incident_type: Optional[IncidentType] = Field(default=None, alias="type")
    location_label: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    zone_id: Optional[str] = None
    people_affected: int = 1
    summary: str = ""
    severity_hint: Optional[Severity] = None
    confidence: float = 0.8

    model_config = {"populate_by_name": True}


# ── LLM Interface & Implementations ───────────────────────────────────

class BaseLLM(abc.ABC):
    @abc.abstractmethod
    async def extract_incident(self, text: str) -> ExtractedIncident:
        raise NotImplementedError


class RuleBasedLLM(BaseLLM):
    """
    Keyword and regex fallback extraction used in tests or when Ollama is unavailable.
    """

    KNOWN_LANDMARKS = [
        # (pattern, label, lat, lng, zone_id)
        (r"lakeside\s+colony(?:\s*,\s*2nd\s+cross)?", "Lakeside colony, 2nd cross", 12.929, 77.612, "ZONE-A"),
        (r"lakeside(?:\s+market)?", "Lakeside Market", 12.932, 77.615, "ZONE-A"),
        (r"hosur\s+road(?:\s+underpass)?|underpass", "Hosur road underpass", 12.915, 77.625, "ZONE-B"),
        (r"silk\s+board(?:\s+junction)?", "Silk Board Junction", 12.917, 77.623, "ZONE-B"),
        (r"14th\s+main(?:\s+hsr\s+layout)?|hsr\s+layout", "14th Main HSR Layout", 12.912, 77.638, "ZONE-B"),
        (r"station|metro\s+station", "South Metro Station", 12.902, 77.625, "ZONE-C"),
    ]

    async def extract_incident(self, text: str) -> ExtractedIncident:
        lower = text.lower()

        # 1. Detect Incident Type
        detected_type: Optional[IncidentType] = None
        if re.search(r"\b(medical|patient|hospital|doctor|medicine|pregnant|heart|oxygen|sick|injured|unconscious)\b", lower):
            detected_type = "medical"
        elif re.search(r"\b(road\s+blocked|underpass\s+(?:flooded|submerged|is\s+submerged)|waterlogged\s+road|bridge\s+submerged)\b", lower):
            detected_type = "road_blocked"
        elif re.search(r"\b(car|bus|vehicle|auto|bike|truck|two-wheeler|submerged\s+car)\b", lower):
            detected_type = "stranded_vehicle"
        elif re.search(r"\b(home|house|apartment|flat|living\s+room|water\s+entering|flooded\s+house)\b", lower):
            detected_type = "flooded_home"
        elif re.search(r"\b(trapped|stuck|marooned|on\s+roof|on\s+terrace|cannot\s+get\s+out|stranded)\b", lower):
            detected_type = "trapped_person"
        elif re.search(r"\b(flood|water|rain|leak|rescue)\b", lower):
            detected_type = "other"

        # 2. Detect Location & Landmark
        loc_label: Optional[str] = None
        lat: Optional[float] = None
        lng: Optional[float] = None
        zone_id: Optional[str] = None

        for pattern, label, l_lat, l_lng, z_id in self.KNOWN_LANDMARKS:
            if re.search(pattern, lower):
                loc_label = label
                lat = l_lat
                lng = l_lng
                zone_id = z_id
                break

        # 3. Detect People Count
        people = 1
        # Explicit digits with people nouns (e.g. "3 people", "4 family members", "6 residents")
        people_match = re.search(
            r"\b(\d+)\s+(?:people|persons|family\s+members|residents|kids|seniors|men|women|members|passengers|adults|children)\b",
            lower,
        )
        if people_match:
            try:
                val = int(people_match.group(1))
                if 0 < val < 100:
                    people = val
            except ValueError:
                pass
        else:
            word_nums = {
                "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
                "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
            }
            found_word = False
            for word, n in word_nums.items():
                if re.search(rf"\b{word}\s+(?:people|persons|family\s+members|residents|kids|seniors|men|women|members|passengers|adults|children)\b", lower):
                    people = n
                    found_word = True
                    break
            if not found_word:
                # Fallback: check isolated digits not part of ordinals/street designations (2nd, 3rd, 14th)
                iso_match = re.search(r"\b(\d+)\b(?!\s*(?:st|nd|rd|th|cross|main|floor|km|m\b|am|pm|min|hr|hour))", lower)
                if iso_match:
                    try:
                        val = int(iso_match.group(1))
                        if 0 < val < 100:
                            people = val
                    except ValueError:
                        pass

        # 4. Summary & Confidence
        if loc_label and detected_type:
            confidence = 0.90
            summary = f"{detected_type.replace('_', ' ').capitalize()} reported at {loc_label}"
        elif detected_type and not loc_label:
            confidence = 0.35  # Missing location -> low confidence
            summary = f"{detected_type.replace('_', ' ').capitalize()} reported (location unknown)"
        elif loc_label and not detected_type:
            confidence = 0.40  # Missing type -> low confidence
            summary = f"Distress reported at {loc_label}"
        else:
            confidence = 0.20
            summary = "Unclassified emergency report"

        # Detect severity hint if available
        severity_hint: Optional[Severity] = None
        if "critical" in lower or "danger" in lower or "cannot breathe" in lower:
            severity_hint = "critical"
        elif "heavy" in lower or "high" in lower or "trapped" in lower or "urgent" in lower:
            severity_hint = "high"

        return ExtractedIncident(
            type=detected_type,
            location_label=loc_label,
            lat=lat,
            lng=lng,
            zone_id=zone_id,
            people_affected=people,
            summary=summary,
            severity_hint=severity_hint,
            confidence=confidence,
        )


class OllamaLLM(BaseLLM):
    """
    Local LLM extraction via Ollama with JSON-only output mode and fallback.
    """

    def __init__(
        self,
        host: str | None = None,
        model: str | None = None,
        fallback: BaseLLM | None = None,
    ) -> None:
        self.host = host or os.getenv("OLLAMA_HOST", "http://localhost:11434")
        self.model = model or os.getenv("OLLAMA_MODEL", "llama3.2")
        self.fallback = fallback or RuleBasedLLM()

    async def extract_incident(self, text: str) -> ExtractedIncident:
        prompt = (
            "You are an emergency response intake assistant. Analyze this distress message and extract structured details in valid JSON.\n"
            "Allowed types: flooded_home, stranded_vehicle, medical, trapped_person, road_blocked, other.\n"
            "JSON Format:\n"
            "{\n"
            '  "type": "flooded_home" | "stranded_vehicle" | "medical" | "trapped_person" | "road_blocked" | "other" | null,\n'
            '  "location_label": string | null,\n'
            '  "lat": number | null,\n'
            '  "lng": number | null,\n'
            '  "zone_id": string | null,\n'
            '  "people_affected": integer,\n'
            '  "summary": string,\n'
            '  "confidence": number\n'
            "}\n"
            f"Message: {text}\n"
        )

        for attempt in range(2):  # retry once
            try:
                async with httpx.AsyncClient(timeout=4.0) as client:
                    resp = await client.post(
                        f"{self.host}/api/generate",
                        json={
                            "model": self.model,
                            "prompt": prompt,
                            "format": "json",
                            "stream": False,
                        },
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        raw_json = data.get("response", "{}")
                        return ExtractedIncident.model_validate_json(raw_json)
            except Exception as e:
                logger.warning("Ollama extraction attempt %d failed: %s", attempt + 1, e)

        # Fallback to RuleBasedLLM
        return await self.fallback.extract_incident(text)


def get_llm() -> BaseLLM:
    """Factory selecting LLM implementation based on environment configuration."""
    mode = os.getenv("LLM_MODE", "scripted").lower()
    if mode == "ollama":
        return OllamaLLM()
    return RuleBasedLLM()


# ── Intake Agent ──────────────────────────────────────────────────────

class IntakeAgent(Agent):
    """
    Intake Agent: Parses incoming reporter messages into structured incidents,
    prompts for missing information, and merges nearby duplicate reports.
    """
    name = "intake"
    subscribes_to = ["reporter.message_sent"]

    def __init__(self, llm: BaseLLM | None = None) -> None:
        super().__init__()
        self.llm: BaseLLM = llm or get_llm()
        # In-memory drafts for incomplete reports: { sessionId: ExtractedIncident }
        self._session_drafts: dict[str, ExtractedIncident] = {}

    async def handle(self, event: dict) -> None:
        payload = event.get("payload", {})

        # Only process messages coming from the reporter
        if payload.get("from") != "reporter":
            return

        session_id = payload.get("sessionId")
        if not session_id:
            return

        # 1. Extract text and language via Person 4 comms layer
        extracted_text_data = extract_text(session_id, payload)
        text_to_process = extracted_text_data.get("translatedText") or extracted_text_data.get("text") or ""
        original_language = extracted_text_data.get("language") or "en"

        if not text_to_process.strip():
            return

        # 2. Extract structured fields via LLM (LLM only extracts, never decides action)
        extracted = await self.llm.extract_incident(text_to_process)

        # Merge with prior session draft if this session was missing info
        if session_id in self._session_drafts:
            prior = self._session_drafts.pop(session_id)
            if not extracted.location_label and prior.location_label:
                extracted.location_label = prior.location_label
                extracted.lat = prior.lat
                extracted.lng = prior.lng
                extracted.zone_id = prior.zone_id
            if not extracted.incident_type and prior.incident_type:
                extracted.incident_type = prior.incident_type
            if extracted.location_label and extracted.incident_type:
                extracted.confidence = max(0.85, extracted.confidence)

        # 3. Check for missing location or type -> confidence < 0.5 + follow-up question
        if not extracted.location_label or not extracted.incident_type:
            extracted.confidence = min(extracted.confidence, 0.45)
            self._session_drafts[session_id] = extracted

            # Send follow-up question to reporter
            if not extracted.location_label:
                question = "Could you please tell us your exact location or a nearby landmark so we can send help?"
                missing_aspect = "location"
            else:
                question = "Could you please specify the nature of the emergency and what help is needed?"
                missing_aspect = "incident type"

            # Publish follow-up message on reporter channel
            self.emit("reporter.message_sent", {
                "sessionId": session_id,
                "messageId": state.next_id("MSG"),
                "from": "system",
                "text": question,
                "translatedText": None,
                "language": original_language,
                "channel": payload.get("channel", "chat"),
            })

            # Publish activity line
            self.log_activity(
                f"Incomplete report from session {session_id} (missing {missing_aspect}). Sent follow-up request to reporter."
            )
            return

        # 4. Check for duplicate incident (within 100m, 10 scenario minutes, same open type)
        duplicate = self._find_duplicate_incident(
            target_type=extracted.incident_type,
            lat=extracted.lat or 12.925,
            lng=extracted.lng or 77.625,
        )

        if duplicate:
            self._merge_duplicate(duplicate, extracted, session_id)
            return

        # 5. Create new confident incident
        incident_id = state.next_id("INC")
        loc = {
            "lat": extracted.lat or 12.925,
            "lng": extracted.lng or 77.625,
            "label": extracted.location_label or "Reported location",
            "zoneId": extracted.zone_id or "ZONE-A",
        }
        incident_data = {
            "incidentId": incident_id,
            "type": extracted.incident_type,
            "status": "reported",
            "severity": extracted.severity_hint,
            "severityScore": None,
            "timeWindowMinutes": None,
            "location": loc,
            "peopleAffected": extracted.people_affected,
            "language": original_language,
            "source": "reporter_chat",
            "summary": extracted.summary or f"{extracted.incident_type} at {loc['label']}",
            "confidence": extracted.confidence,
            "reportedAt": clock.now(),
            "assignedUnitIds": [],
            "reporterSessionId": session_id,
        }

        # Add to state store -> publishes incident.reported
        state.add_incident(incident_data)

        # Publish agent activity line
        self.log_activity(
            f"New incident {incident_id} structured from reporter chat: "
            f"{extracted.incident_type} at {loc['label']}. Confidence: {extracted.confidence:.2f}.",
            incident_id=incident_id,
        )

    # ── Duplicate Detection & Merging ─────────────────────────────────

    def _find_duplicate_incident(
        self,
        target_type: str,
        lat: float,
        lng: float,
    ) -> dict | None:
        """
        Returns an open incident matching:
          - Same incident type
          - Within 100 meters
          - Within 10 scenario minutes (600 seconds)
        """
        now_ts = clock.now()
        try:
            now_dt = datetime.strptime(now_ts, "%Y-%m-%dT%H:%M:%S")
        except Exception:
            now_dt = datetime.now()

        for inc in state.get_incidents():
            if inc.get("status") in ("closed", "resolved"):
                continue
            if inc.get("type") != target_type:
                continue

            inc_loc = inc.get("location") or {}
            inc_lat = inc_loc.get("lat")
            inc_lng = inc_loc.get("lng")
            if inc_lat is None or inc_lng is None:
                continue

            # Check distance threshold (<= 100 meters)
            dist = haversine_distance_m(lat, lng, inc_lat, inc_lng)
            if dist > 100.0:
                continue

            # Check time threshold (<= 10 scenario minutes)
            reported_at_str = inc.get("reportedAt")
            if reported_at_str:
                try:
                    rep_dt = datetime.strptime(reported_at_str, "%Y-%m-%dT%H:%M:%S")
                    if abs((now_dt - rep_dt).total_seconds()) > 600:
                        continue
                except Exception:
                    pass

            return inc

        return None

    def _merge_duplicate(
        self,
        existing: dict,
        new_extracted: ExtractedIncident,
        session_id: str,
    ) -> None:
        """Merges duplicate report into existing incident, keeping higher severity."""
        inc_id = existing["incidentId"]
        patch: dict[str, Any] = {}
        changed_fields: list[str] = []

        # 1. Update people affected (take max)
        if new_extracted.people_affected > existing.get("peopleAffected", 1):
            patch["peopleAffected"] = new_extracted.people_affected
            changed_fields.append("peopleAffected")

        # 2. Keep higher severity
        if new_extracted.severity_hint:
            current_sev = existing.get("severity")
            if not current_sev or SEVERITY_RANKS.get(new_extracted.severity_hint, 0) > SEVERITY_RANKS.get(current_sev, 0):
                patch["severity"] = new_extracted.severity_hint
                changed_fields.append("severity")

        # 3. Append summary info if distinct
        new_info = new_extracted.summary
        if new_info and new_info not in existing.get("summary", ""):
            patch["summary"] = f"{existing.get('summary', '')}; update: {new_info}"
            changed_fields.append("summary")

        # Update in state store -> publishes incident.updated
        if patch:
            state.update_incident(inc_id, patch, changed_fields=changed_fields)

        # Publish agent activity line
        self.log_activity(
            f"Merged duplicate report from session {session_id} into incident {inc_id} at {existing['location']['label']}.",
            incident_id=inc_id,
        )
