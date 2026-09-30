"""
conftest.py — Shared pytest fixtures.
"""
import pytest
from app.state import state as _state


@pytest.fixture(autouse=True)
def reset_state_before_each():
    """Wipe all runtime state before every test so tests are fully isolated."""
    _state.reset()
    yield
    _state.reset()
