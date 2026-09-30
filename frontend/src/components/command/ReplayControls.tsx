/**
 * ReplayControls — controls for replaying seed events in mock mode.
 *
 * Beginner note:
 * This bar at the bottom of the screen lets you play/pause/reset
 * the seed scenario and control how fast it plays.
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
    // Subscribe to replay state changes
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
    <div
      className="flex items-center gap-3 px-4 py-2"
      style={{ background: 'hsl(222,47%,8%)', borderTop: '1px solid hsl(217,33%,16%)' }}
    >
      {/* Label */}
      <div className="flex items-center gap-1.5 shrink-0">
        <FastForward className="w-3.5 h-3.5" style={{ color: 'hsl(217,91%,60%)' }} />
        <span className="text-xs font-semibold" style={{ color: 'hsl(217,91%,65%)' }}>REPLAY</span>
      </div>

      {/* Play / Pause */}
      <button
        onClick={replayState.status === 'playing' ? handlePause : handleStart}
        id="btn-replay-play"
        className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors"
        style={{ background: 'hsl(217,91%,60%,0.15)', color: 'hsl(217,91%,70%)', border: '1px solid hsl(217,91%,60%,0.25)' }}
      >
        {replayState.status === 'playing'
          ? <><Pause className="w-3.5 h-3.5" /> Pause</>
          : <><Play className="w-3.5 h-3.5" /> {replayState.status === 'idle' ? 'Start' : 'Resume'}</>
        }
      </button>

      {/* Reset */}
      <button
        onClick={handleReset}
        id="btn-replay-reset"
        className="p-1.5 rounded-lg transition-colors"
        style={{ color: 'hsl(215,20%,50%)' }}
        title="Reset replay"
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </button>

      {/* Progress bar */}
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'hsl(217,33%,18%)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${progress}%`, background: 'hsl(217,91%,60%)' }}
        />
      </div>

      {/* Event counter */}
      <span className="text-xs mono shrink-0" style={{ color: 'hsl(215,20%,50%)' }}>
        {replayState.currentIndex}/{replayState.totalEvents}
      </span>

      {/* Scenario time */}
      {replayState.currentScenarioTime && (
        <span className="text-xs mono shrink-0" style={{ color: 'hsl(217,91%,60%)' }}>
          {replayState.currentScenarioTime.replace('T', ' ').substring(11, 19)}
        </span>
      )}

      {/* Speed controls */}
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-xs" style={{ color: 'hsl(215,20%,45%)' }}>Speed:</span>
        {SPEEDS.map((speed) => (
          <button
            key={speed}
            onClick={() => handleSpeed(speed)}
            id={`btn-speed-${speed}x`}
            className="px-2 py-0.5 rounded text-xs font-mono font-bold transition-colors"
            style={{
              background: replayState.speed === speed ? 'hsl(217,91%,60%,0.2)' : 'transparent',
              color: replayState.speed === speed ? 'hsl(217,91%,70%)' : 'hsl(215,20%,50%)',
              border: replayState.speed === speed ? '1px solid hsl(217,91%,60%,0.3)' : '1px solid transparent',
            }}
          >
            {speed}x
          </button>
        ))}
      </div>

      {/* Status */}
      <span className={`text-xs font-medium shrink-0 ${replayState.status === 'playing' ? 'text-green-400' : ''}`}
        style={{ color: replayState.status === 'playing' ? 'hsl(142,71%,45%)' : 'hsl(215,20%,45%)' }}>
        {replayState.status === 'playing' ? '▶ PLAYING' :
          replayState.status === 'paused' ? '⏸ PAUSED' :
          replayState.status === 'done' ? '✓ DONE' : '● IDLE'}
      </span>
    </div>
  );
}
