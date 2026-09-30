/**
 * Replay — plays back seed/events.json through the same event pipeline as the
 * real WebSocket, so the demo looks identical whether you use mock or real mode.
 *
 * Beginner note:
 * The seed file has timestamps like "2026-10-10T09:01:14" for each event.
 * We compute gaps between consecutive events and replay them at the right pace.
 * The speed multiplier (1x, 2x, 5x, 10x) makes gaps shorter.
 *
 * IMPORTANT: We never use Date.now() for scenario time.
 * All times come from the event payloads.
 */
import { handleEvent } from './eventMapper';
import type { ContractEvent } from '@contracts/types';

type ReplayStatus = 'idle' | 'playing' | 'paused' | 'done';

interface ReplayState {
  status: ReplayStatus;
  speed: number;
  currentIndex: number;
  totalEvents: number;
  currentScenarioTime: string | null;
}

type StatusCallback = (state: ReplayState) => void;

let _events: ContractEvent[] = [];
let _speed = 1;
let _currentIndex = 0;
let _status: ReplayStatus = 'idle';
let _timer: ReturnType<typeof setTimeout> | null = null;
let _onStatusChange: StatusCallback | null = null;

function getState(): ReplayState {
  return {
    status: _status,
    speed: _speed,
    currentIndex: _currentIndex,
    totalEvents: _events.length,
    currentScenarioTime: _currentIndex > 0 ? _events[_currentIndex - 1]?.ts ?? null : null,
  };
}

function notify() {
  _onStatusChange?.(getState());
}

function scheduleNext() {
  if (_currentIndex >= _events.length) {
    _status = 'done';
    notify();
    return;
  }

  const current = _events[_currentIndex];

  // Calculate gap to the next event
  const next = _events[_currentIndex + 1];
  let delayMs = 0;
  if (next) {
    const tsCurrent = new Date(current.ts).getTime();
    const tsNext = new Date(next.ts).getTime();
    const gapMs = Math.max(0, tsNext - tsCurrent);
    delayMs = gapMs / _speed;
  }

  // Dispatch the current event immediately
  handleEvent(current);
  _currentIndex++;
  notify();

  // Then schedule the next one after the gap
  _timer = setTimeout(scheduleNext, Math.min(delayMs, 60_000)); // cap gap at 60s even at 1x
}

export async function loadReplay() {
  // Dynamic import — loads the seed file only when needed
  const data = await import('../mocks/data/events.json');
  _events = data.default as ContractEvent[];
  _currentIndex = 0;
  _status = 'idle';
  notify();
}

export function startReplay(onStatusChange: StatusCallback) {
  _onStatusChange = onStatusChange;
  if (_status === 'idle' || _status === 'done') {
    _currentIndex = 0;
    _status = 'playing';
    notify();
    scheduleNext();
  } else if (_status === 'paused') {
    _status = 'playing';
    notify();
    scheduleNext();
  }
}

export function pauseReplay() {
  if (_timer) clearTimeout(_timer);
  _timer = null;
  _status = 'paused';
  notify();
}

export function resetReplay() {
  if (_timer) clearTimeout(_timer);
  _timer = null;
  _currentIndex = 0;
  _status = 'idle';
  notify();
}

export function setReplaySpeed(speed: number) {
  _speed = speed;
  notify();
}

export function getReplayState(): ReplayState {
  return getState();
}

export type { ReplayStatus, ReplayState };
