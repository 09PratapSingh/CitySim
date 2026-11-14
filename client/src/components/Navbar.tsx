import React from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Map as MapIcon, 
  Settings2, 
  Save, 
  FolderOpen, 
  Activity,
  Layers,
  Sparkles,
  Split,
  Sliders
} from 'lucide-react';

interface NavbarProps {
  mapName: string;
  activeMode: 'editor' | 'simulation' | 'comparison';
  setActiveMode: (mode: 'editor' | 'simulation' | 'comparison') => void;
  isRunning: boolean;
  isPaused: boolean;
  onStartSimulation: () => void;
  onPauseSimulation: () => void;
  onResumeSimulation: () => void;
  onStopSimulation: () => void;
  onOpenMapManager: () => void;
  onOpenScenarioModal?: () => void;
  isConnected: boolean;
  hasUnsavedChanges: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  mapName,
  activeMode,
  setActiveMode,
  isRunning,
  isPaused,
  onStartSimulation,
  onPauseSimulation,
  onResumeSimulation,
  onStopSimulation,
  onOpenMapManager,
  onOpenScenarioModal,
  isConnected,
  hasUnsavedChanges,
}) => {
  return (
    <header className="h-14 bg-slate-900/90 backdrop-blur border-b border-slate-800 px-4 flex items-center justify-between z-30 select-none">
      {/* Brand & Map Name */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 font-bold text-lg tracking-tight bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
          <Layers className="w-5 h-5 text-emerald-400" />
          <span>CitySim</span>
        </div>
        <div className="h-4 w-px bg-slate-800" />
        
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenMapManager}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
            <span className="max-w-[140px] truncate">{mapName || 'Untitled Map'}</span>
            {hasUnsavedChanges && (
              <span className="w-2 h-2 rounded-full bg-amber-400" title="Unsaved changes" />
            )}
          </button>
        </div>
      </div>

      {/* Mode Switcher: Editor vs Live Simulation */}
      <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs font-medium">
        <button
          onClick={() => {
            if (isRunning) onStopSimulation();
            setActiveMode('editor');
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition ${
            activeMode === 'editor'
              ? 'bg-slate-800 text-emerald-400 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Settings2 className="w-3.5 h-3.5" />
          <span>Map Editor</span>
        </button>

        <button
          onClick={() => setActiveMode('simulation')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition ${
            activeMode === 'simulation'
              ? 'bg-slate-800 text-cyan-400 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Live Simulation</span>
          {isRunning && (
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          )}
        </button>

        <button
          onClick={() => {
            if (isRunning) onStopSimulation();
            setActiveMode('comparison');
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition ${
            activeMode === 'comparison'
              ? 'bg-slate-800 text-indigo-400 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Split className="w-3.5 h-3.5" />
          <span>Scenario Comparison</span>
        </button>
      </div>

      {/* Quick Actions & Status */}
      <div className="flex items-center gap-2">
        {activeMode === 'simulation' ? (
          <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded-md border border-slate-800">
            {!isRunning ? (
              <button
                onClick={onStartSimulation}
                className="flex items-center gap-1.5 px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Run</span>
              </button>
            ) : isPaused ? (
              <button
                onClick={onResumeSimulation}
                className="flex items-center gap-1.5 px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Resume</span>
              </button>
            ) : (
              <button
                onClick={onPauseSimulation}
                className="flex items-center gap-1.5 px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition"
              >
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>Pause</span>
              </button>
            )}

            {isRunning && (
              <button
                onClick={onStopSimulation}
                className="flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-800 text-rose-400 text-xs font-medium transition"
                title="Stop Simulation"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ) : activeMode === 'comparison' ? (
          <button
            onClick={onOpenScenarioModal}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Scenario Studio</span>
          </button>
        ) : (
          <button
            onClick={onOpenMapManager}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save / Load</span>
          </button>
        )}

        <div className="h-4 w-px bg-slate-800" />

        {/* Backend Connectivity Status Dot */}
        <div 
          className="flex items-center gap-1.5 px-2 py-1 text-[11px] rounded bg-slate-950 border border-slate-800 text-slate-400"
          title={isConnected ? 'Backend connected (Socket.IO online)' : 'Connecting to backend...'}
        >
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-rose-400'}`} />
          <span className="hidden sm:inline">{isConnected ? 'Server Online' : 'Connecting'}</span>
        </div>
      </div>
    </header>
  );
};
