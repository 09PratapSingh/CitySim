import React from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  StepForward, 
  Zap, 
  Dice5, 
  Clock, 
  Sparkles 
} from 'lucide-react';

interface SimulationControlsProps {
  isRunning: boolean;
  isPaused: boolean;
  currentTime: number;
  speed: number;
  seed: number;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStep: () => void;
  onStop: () => void;
  onSetSpeed: (speed: number) => void;
  onSetSeed: (seed: number) => void;
}

export const SimulationControls: React.FC<SimulationControlsProps> = ({
  isRunning,
  isPaused,
  currentTime,
  speed,
  seed,
  onStart,
  onPause,
  onResume,
  onStep,
  onStop,
  onSetSpeed,
  onSetSeed,
}) => {
  const speeds = [0.5, 1.0, 2.0, 5.0, 10.0];

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    return `${mins.toString().padStart(2, '0')}:${Number(secs) < 10 ? '0' : ''}${secs}s`;
  };

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-slate-900/95 backdrop-blur-md border border-slate-800/80 rounded-2xl px-4 py-2.5 shadow-2xl select-none">
      {/* Primary Play / Pause / Stop Buttons */}
      <div className="flex items-center gap-1.5 pr-3 border-r border-slate-800">
        {!isRunning ? (
          <button
            onClick={onStart}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-semibold text-xs shadow-lg shadow-emerald-950 transition active:scale-95"
            title="Start Simulation"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Start</span>
          </button>
        ) : isPaused ? (
          <button
            onClick={onResume}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-lg transition active:scale-95"
            title="Resume Simulation"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Resume</span>
          </button>
        ) : (
          <button
            onClick={onPause}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs shadow-lg transition active:scale-95"
            title="Pause Simulation"
          >
            <Pause className="w-4 h-4 fill-current" />
            <span>Pause</span>
          </button>
        )}

        <button
          onClick={onStep}
          disabled={!isRunning || !isPaused}
          className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
          title="Single Step Forward (+0.1s tick)"
        >
          <StepForward className="w-4 h-4" />
        </button>

        <button
          onClick={onStop}
          disabled={!isRunning}
          className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 disabled:opacity-40 disabled:cursor-not-allowed transition"
          title="Reset Simulation"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Speed Multipliers */}
      <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800/80">
        {speeds.map((s) => (
          <button
            key={s}
            onClick={() => onSetSpeed(s)}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition ${
              speed === s
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            {s}x
          </button>
        ))}
      </div>

      {/* Clock Readout */}
      <div className="flex items-center gap-2 px-3 py-1 bg-slate-950 rounded-xl border border-slate-800/80">
        <Clock className="w-3.5 h-3.5 text-cyan-400" />
        <span className="font-mono text-xs font-semibold text-slate-200">
          {formatTime(currentTime)}
        </span>
      </div>

      {/* Random Seed Configurator */}
      <div className="flex items-center gap-1.5 pl-3 border-l border-slate-800">
        <span className="text-[11px] text-slate-400">Seed:</span>
        <input
          type="number"
          disabled={isRunning}
          value={seed}
          onChange={(e) => onSetSeed(Number(e.target.value) || 1)}
          className="w-14 px-1.5 py-1 text-xs font-mono bg-slate-950 text-slate-200 border border-slate-800 rounded-lg text-center disabled:opacity-50"
        />
        <button
          disabled={isRunning}
          onClick={() => onSetSeed(Math.floor(Math.random() * 9000) + 1000)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-slate-800 disabled:opacity-40 transition"
          title="Generate Random Seed"
        >
          <Dice5 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
