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
    <div className="flex items-center gap-3 px-4 py-2 bg-obsidian-well border-t border-obsidian-border text-slate-300 font-sans text-xs">
      {/* Label */}
      <div className="flex items-center gap-1.5 shrink-0 font-mono text-[11px] font-semibold text-slate-400">
        <FastForward className="w-3.5 h-3.5 text-sky-400" />
        <span>REPLAY</span>
      </div>

      {/* Play / Pause */}
      <button
        onClick={replayState.status === 'playing' ? handlePause : handleStart}
        id="btn-replay-play"
        className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono font-medium transition-colors bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30"
      >
        {replayState.status === 'playing' ? (
          <>
            <Pause className="w-3 h-3" />
            <span>Pause</span>
          </>
        ) : (
          <>
            <Play className="w-3 h-3" />
            <span>{replayState.status === 'idle' ? 'Start' : 'Resume'}</span>
          </>
        )}
      </button>

      {/* Reset */}
      <button
        onClick={handleReset}
        id="btn-replay-reset"
        className="p-1 rounded text-slate-400 hover:text-white hover:bg-obsidian-surface border border-transparent hover:border-obsidian-border transition-colors"
        title="Reset replay"
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </button>

      {/* Progress track */}
      <div className="flex-1 h-1 rounded-full bg-obsidian-surface overflow-hidden border border-obsidian-border/50">
        <div
          className="h-full rounded-full transition-all duration-300 bg-sky-400"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Event counter */}
      <span className="text-[11px] font-mono text-slate-400 shrink-0">
        {replayState.currentIndex}/{replayState.totalEvents}
      </span>

      {/* Scenario time */}
      {replayState.currentScenarioTime && (
        <span className="text-[11px] font-mono text-sky-300 shrink-0 px-1.5 py-0.5 rounded bg-obsidian-surface border border-obsidian-border">
          {replayState.currentScenarioTime.replace('T', ' ').substring(11, 19)}
        </span>
      )}

      {/* Speed controls */}
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-[11px] font-mono text-slate-500">Rate:</span>
        {SPEEDS.map((speed) => (
          <button
            key={speed}
            onClick={() => handleSpeed(speed)}
            id={`btn-speed-${speed}x`}
            className={`px-1.5 py-0.2 rounded text-[11px] font-mono font-medium transition-colors ${
              replayState.speed === speed
                ? 'bg-sky-500/15 text-sky-300 border border-sky-500/40'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {speed}x
          </button>
        ))}
      </div>

      {/* Status indicator */}
      <div className="flex items-center gap-1.5 shrink-0 text-[10px] font-mono font-semibold uppercase">
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            replayState.status === 'playing'
              ? 'bg-emerald-400 animate-pulse'
              : replayState.status === 'paused'
              ? 'bg-amber-400'
              : 'bg-slate-500'
          }`}
        />
        <span className={replayState.status === 'playing' ? 'text-emerald-400' : 'text-slate-400'}>
          {replayState.status}
        </span>
      </div>
    </div>
  );
}
