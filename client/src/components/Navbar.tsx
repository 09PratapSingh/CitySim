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
  Sliders,
  History
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
  onOpenPastRuns?: () => void;
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
  onOpenPastRuns,
  isConnected,
  hasUnsavedChanges,
}) => {
  return (
    <header className="h-14 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 flex items-center justify-between z-30 select-none shadow-xs text-slate-800">
      {/* Brand & Map Name */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 font-black text-lg tracking-tight bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
          <Layers className="w-5 h-5 text-emerald-600" />
          <span>CitySim</span>
        </div>
        <div className="h-4 w-px bg-slate-300" />
        
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenMapManager}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition shadow-2xs"
          >
            <FolderOpen className="w-3.5 h-3.5 text-slate-500" />
            <span className="max-w-[140px] truncate">{mapName || 'Untitled Map'}</span>
            {hasUnsavedChanges && (
              <span className="w-2 h-2 rounded-full bg-amber-500" title="Unsaved changes" />
            )}
          </button>
          {onOpenPastRuns && (
            <button
              onClick={onOpenPastRuns}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition shadow-2xs"
              title="View Historical Simulation Runs"
            >
              <History className="w-3.5 h-3.5 text-indigo-600" />
              <span>History</span>
            </button>
          )}
        </div>
      </div>

      {/* Mode Switcher: Editor vs Live Simulation vs Comparison */}
      <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-medium">
        <button
          onClick={() => {
            if (isRunning) onStopSimulation();
            setActiveMode('editor');
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition ${
            activeMode === 'editor'
              ? 'bg-white text-emerald-700 shadow-xs border border-slate-200/80 font-semibold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Settings2 className="w-3.5 h-3.5" />
          <span>Map Editor</span>
        </button>

        <button
          onClick={() => setActiveMode('simulation')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition ${
            activeMode === 'simulation'
              ? 'bg-white text-cyan-700 shadow-xs border border-slate-200/80 font-semibold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Live Simulation</span>
          {isRunning && (
            <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
          )}
        </button>

        <button
          onClick={() => {
            if (isRunning) onStopSimulation();
            setActiveMode('comparison');
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition ${
            activeMode === 'comparison'
              ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/80 font-semibold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Split className="w-3.5 h-3.5" />
          <span>Scenario Comparison</span>
        </button>
      </div>

      {/* Quick Actions & Status */}
      <div className="flex items-center gap-2">
        {activeMode === 'simulation' ? (
          <div className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">
            {!isRunning ? (
              <button
                onClick={onStartSimulation}
                className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs transition"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Run</span>
              </button>
            ) : isPaused ? (
              <button
                onClick={onResumeSimulation}
                className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs transition"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Resume</span>
              </button>
            ) : (
              <button
                onClick={onPauseSimulation}
                className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-500 hover:bg-amber-400 text-white text-xs font-semibold shadow-xs transition"
              >
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>Pause</span>
              </button>
            )}

            {isRunning && (
              <button
                onClick={onStopSimulation}
                className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-rose-100 text-rose-600 text-xs font-medium transition"
                title="Stop Simulation"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ) : activeMode === 'comparison' ? (
          <button
            onClick={onOpenScenarioModal}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Scenario Studio</span>
          </button>
        ) : (
          <button
            onClick={onOpenMapManager}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save / Load</span>
          </button>
        )}

        <div className="h-4 w-px bg-slate-300" />

        {/* Backend Connectivity Status Dot */}
        <div 
          className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-lg border transition ${
            isConnected 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
              : 'bg-amber-50 border-amber-200 text-amber-700 animate-pulse'
          }`}
          title={isConnected ? 'Backend connected (Socket.IO online)' : 'Reconnecting to backend at http://localhost:5000...'}
        >
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          <span className="hidden sm:inline">{isConnected ? 'Server Online' : 'Connecting'}</span>
        </div>
      </div>
    </header>
  );
};
