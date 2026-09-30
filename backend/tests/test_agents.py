"""
tests/test_agents.py — Tests for app.agents.base.Agent and AgentRunner.

Verifies:
  - Dummy agent reacts to incident.reported and emits agent.activity
  - Agent helper log_decision() appends DecisionLogEntry to state
  - AgentRunner isolates exceptions: a crashing agent logs agent.activity and does not stop the bus or other agents
  - AgentRunner start() and stop() lifecycle
"""
import asyncio
import pytest

from app.agents.base import Agent, AgentRunner
from app.bus import bus
from app.clock import clock
from app.state import state


@pytest.fixture(autouse=True)
def reset_all():
    bus.reset()
    state.reset()
    clock.reset()
    yield
    bus.reset()
    state.reset()
    clock.reset()


class DummyAssessmentAgent(Agent):
    name = "assessment"
    subscribes_to = ["incident.reported"]

    def __init__(self, done_event: asyncio.Event | None = None) -> None:
        super().__init__()
        self.handled_events = []
        self.done_event = done_event

    async def handle(self, event: dict) -> None:
        self.handled_events.append(event)
        incident = event["payload"]["incident"]
        inc_id = incident["incidentId"]

        # 1. Log activity
        self.log_activity(f"Assessing incident {inc_id}: high priority", incident_id=inc_id)

        # 2. Log decision
        self.log_decision(
            decision="assign_immediate",
            reason="Multiple people affected by deep water",
            incident_id=inc_id,
        )

        if self.done_event:
            self.done_event.set()


class CrashingAgent(Agent):
    name = "command"
    subscribes_to = ["incident.reported"]

    def __init__(self, done_event: asyncio.Event | None = None) -> None:
        super().__init__()
        self.done_event = done_event

    async def handle(self, event: dict) -> None:
        if self.done_event:
            self.done_event.set()
        raise RuntimeError("Simulated crash in CommandAgent!")


@pytest.mark.asyncio
async def test_dummy_agent_reacts_and_emits_activity():
    """
    A dummy agent reacts to incident.reported and emits agent.activity.
    """
    done_event = asyncio.Event()
    agent = DummyAssessmentAgent(done_event=done_event)
    runner = AgentRunner([agent])
    runner.start()

    # Capture activity events
    activities = []
    unsub = bus.subscribe("agent.activity", lambda evt: activities.append(evt))

    # Publish an incident.reported event
    bus.publish("incident.reported", {
        "incident": {
            "incidentId": "INC-01",
            "type": "flooded_home",
            "peopleAffected": 4,
        }
    })

    # Wait for the agent to finish handling
    await asyncio.wait_for(done_event.wait(), timeout=2.0)

    # Confirm agent handled the event
    assert len(agent.handled_events) == 1
    assert agent.handled_events[0]["type"] == "incident.reported"

    # Confirm agent emitted agent.activity
    assessment_activities = [a for a in activities if a["payload"]["agent"] == "assessment"]
    assert len(assessment_activities) == 1
    act = assessment_activities[0]["payload"]
    assert "Assessing incident INC-01" in act["message"]
    assert act["incidentId"] == "INC-01"

    # Confirm log_decision appended to state
    decisions = state.get_decision_log()
    assert len(decisions) == 1
    dec = decisions[0]
    assert dec["agent"] == "assessment"
    assert dec["decision"] == "assign_immediate"
    assert dec["incidentId"] == "INC-01"
    assert dec["decisionId"].startswith("DEC-")

    runner.stop()
    unsub()


@pytest.mark.asyncio
async def test_agent_runner_isolates_exceptions():
    """
    When an agent raises an exception during handle(), the runner isolates it,
    publishes an agent.activity error line, and does not stop the bus or other agents.
    """
    crash_event = asyncio.Event()
    healthy_event = asyncio.Event()

    crashing_agent = CrashingAgent(done_event=crash_event)
    healthy_agent = DummyAssessmentAgent(done_event=healthy_event)

    runner = AgentRunner([crashing_agent, healthy_agent])
    runner.start()

    activities = []
    unsub = bus.subscribe("agent.activity", lambda evt: activities.append(evt))

    # Publish incident event that triggers BOTH agents
    bus.publish("incident.reported", {
        "incident": {
            "incidentId": "INC-99",
            "type": "medical",
        }
    })

    await asyncio.wait_for(crash_event.wait(), timeout=2.0)
    await asyncio.wait_for(healthy_event.wait(), timeout=2.0)

    # 1. Healthy agent succeeded despite the crash
    assert len(healthy_agent.handled_events) == 1

    # 2. Crashing agent error was logged as an agent.activity line
    error_activities = [
        a for a in activities
        if a["payload"]["agent"] == "command" and "Simulated crash" in a["payload"]["message"]
    ]
    assert len(error_activities) == 1
    err_act = error_activities[0]["payload"]
    assert "Error in command: Simulated crash in CommandAgent!" in err_act["message"]

    runner.stop()
    unsub()


@pytest.mark.asyncio
async def test_runner_stop_lifecycle():
    """
    Calling stop() unsubscribes all agents so they no longer receive events.
    """
    done_event = asyncio.Event()
    agent = DummyAssessmentAgent(done_event=done_event)
    runner = AgentRunner([agent])
    runner.start()

    runner.stop()

    # Publish event after stop
    bus.publish("incident.reported", {
        "incident": {"incidentId": "INC-02"}
    })

    # Give brief time for event dispatch
    await asyncio.sleep(0.05)
    assert len(agent.handled_events) == 0
