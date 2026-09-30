/**
 * ReplayControls — controls for replaying seed events in mock mode.
 * Obsidian Command design system: sleek, minimal tactical scrub bar.
 */
import { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw, FastForward } from 'lucide-react';
import {
  startReplay,
  pauseReplay,
  resetReplay,
  setReplaySpeed,
  getReplayState,
  loadReplay,
  type ReplayState,
} from '@/realtime/replay';
import { useAppStore } from '@/store';

const SPEEDS = [0.5, 1, 2, 5, 10];

export function ReplayControls() {
  const [replayState, setReplayState] = useState<ReplayState>(getReplayState());
  const resetStore = useAppStore((s) => s.reset);

  useEffect(() => {
    startReplay(setReplayState);
    return () => pauseReplay();
  }, []);

  function handleStart() {
    startReplay(setReplayState);
  }

  function handlePause() {
    pauseReplay();
    setReplayState(getReplayState());
  }

  function handleReset() {
    pauseReplay();
    resetStore();
    resetReplay();
    loadReplay().then(() => setReplayState(getReplayState()));
  }

  function handleSpeed(speed: number) {
    setReplaySpeed(speed);
    setReplayState(getReplayState());
  }

  const progress = replayState.totalEvents > 0
    ? (replayState.currentIndex / replayState.totalEvents) * 100
    : 0;

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-white border-t border-slate-200 text-slate-700 font-sans text-xs select-none">
      {/* Label */}
      <div className="flex items-center gap-1.5 shrink-0 font-medium text-[11px] text-slate-500">
        <FastForward className="w-3.5 h-3.5 text-blue-600" />
        <span className="font-semibold uppercase tracking-wider text-slate-700">Replay</span>
      </div>

      {/* Play / Pause */}
      <button
        onClick={replayState.status === 'playing' ? handlePause : handleStart}
        id="btn-replay-play"
        className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200"
      >
        {replayState.status === 'playing' ? (
          <>
            <Pause className="w-3 h-3 text-blue-700" />
            <span>Pause</span>
          </>
        ) : (
          <>
            <Play className="w-3 h-3 text-blue-700" />
            <span>{replayState.status === 'idle' ? 'Start' : 'Resume'}</span>
          </>
        )}
      </button>

      {/* Reset */}
      <button
        onClick={handleReset}
        id="btn-replay-reset"
        className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        title="Reset replay"
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </button>

      {/* Progress track */}
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
        <div
          className="h-full rounded-full transition-all duration-300 bg-blue-600"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Event counter */}
      <span className="text-[11px] font-mono text-slate-500 shrink-0">
        {replayState.currentIndex}/{replayState.totalEvents}
      </span>

      {/* Scenario time */}
      {replayState.currentScenarioTime && (
        <span className="text-[11px] font-mono text-slate-700 shrink-0 px-2 py-0.5 rounded bg-slate-100 border border-slate-200">
          {replayState.currentScenarioTime.replace('T', ' ').substring(11, 19)}
        </span>
      )}

      {/* Speed controls */}
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-[11px] text-slate-400">Rate:</span>
        {SPEEDS.map((speed) => (
          <button
            key={speed}
            onClick={() => handleSpeed(speed)}
            id={`btn-speed-${speed}x`}
            className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-medium transition-colors ${
              replayState.speed === speed
                ? 'bg-blue-50 text-blue-700 border border-blue-200 font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {speed}x
          </button>
        ))}
      </div>

      {/* Status indicator */}
      <div className="flex items-center gap-1.5 shrink-0 text-[10px] font-mono font-medium uppercase">
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            replayState.status === 'playing'
              ? 'bg-emerald-500'
              : replayState.status === 'paused'
              ? 'bg-amber-500'
              : 'bg-slate-400'
          }`}
        />
        <span className={replayState.status === 'playing' ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
          {replayState.status}
        </span>
      </div>
    </div>
  );
}
