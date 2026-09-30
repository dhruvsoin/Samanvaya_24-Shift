"""
Compatibility re-export for agents.assessment.
"""
from app.agents.assessment import (  # noqa: F401
    AssessmentAgent,
    compute_assessment,
    load_assessment_config,
)

__all__ = [
    "AssessmentAgent",
    "compute_assessment",
    "load_assessment_config",
]
