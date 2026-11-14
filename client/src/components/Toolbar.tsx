import React from 'react';
import { 
  MousePointer, 
  CircleDot, 
  Route, 
  Trash2, 
  Hand, 
  Grid, 
  Maximize2, 
  RotateCcw,
  Plus
} from 'lucide-react';
import type { EditorTool } from '../types.ts';

interface ToolbarProps {
  currentTool: EditorTool;
  setCurrentTool: (tool: EditorTool) => void;
  gridSnap: boolean;
  setGridSnap: (snap: boolean) => void;
  onResetView: () => void;
  onClearMap: () => void;
  roadMode: 'two-way' | 'one-way';
  setRoadMode: (mode: 'two-way' | 'one-way') => void;
  nodeCount: number;
  edgeCount: number;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  currentTool,
  setCurrentTool,
  gridSnap,
  setGridSnap,
  onResetView,
  onClearMap,
  roadMode,
  setRoadMode,
  nodeCount,
  edgeCount,
}) => {
  const tools: { id: EditorTool; label: string; icon: React.ReactNode; shortcut: string }[] = [
    { id: 'select', label: 'Select / Move', icon: <MousePointer className="w-4 h-4" />, shortcut: 'V' },
    { id: 'add_node', label: 'Add Intersection', icon: <CircleDot className="w-4 h-4" />, shortcut: 'N' },
    { id: 'draw_edge', label: 'Draw Road', icon: <Route className="w-4 h-4" />, shortcut: 'E' },
    { id: 'delete', label: 'Delete Element', icon: <Trash2 className="w-4 h-4" />, shortcut: 'D' },
    { id: 'pan', label: 'Pan View', icon: <Hand className="w-4 h-4" />, shortcut: 'H' },
  ];

  return (
    <aside className="absolute left-4 top-18 z-20 flex flex-col gap-2">
      {/* Primary Tool Palette */}
      <div className="bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl p-1.5 shadow-xl flex flex-col gap-1">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => setCurrentTool(tool.id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition group relative ${
              currentTool === tool.id
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
            title={`${tool.label} (${tool.shortcut})`}
          >
            {tool.icon}
            <span className="hidden md:inline">{tool.label}</span>
            <kbd className="hidden lg:inline ml-auto text-[10px] text-slate-500 font-mono bg-slate-800 px-1 rounded">
              {tool.shortcut}
            </kbd>
          </button>
        ))}
      </div>

      {/* Road Drawing Configuration (Active when drawing edge) */}
      {currentTool === 'draw_edge' && (
        <div className="bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl p-2 shadow-xl flex flex-col gap-1 text-xs">
          <span className="text-[11px] font-semibold text-slate-400 px-1">Road Type</span>
          <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800">
            <button
              onClick={() => setRoadMode('two-way')}
              className={`flex-1 py-1 rounded text-center transition ${
                roadMode === 'two-way' ? 'bg-slate-800 text-emerald-400' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Two-Way
            </button>
            <button
              onClick={() => setRoadMode('one-way')}
              className={`flex-1 py-1 rounded text-center transition ${
                roadMode === 'one-way' ? 'bg-slate-800 text-emerald-400' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              One-Way
            </button>
          </div>
        </div>
      )}

      {/* Utility Actions */}
      <div className="bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl p-1.5 shadow-xl flex flex-col gap-1">
        <button
          onClick={() => setGridSnap(!gridSnap)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            gridSnap
              ? 'text-cyan-400 bg-cyan-950/40 border border-cyan-800/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
          title="Toggle Grid Snapping (25m grid)"
        >
          <Grid className="w-4 h-4" />
          <span className="hidden md:inline">Snap Grid</span>
        </button>

        <button
          onClick={onResetView}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          title="Reset View & Center"
        >
          <Maximize2 className="w-4 h-4" />
          <span className="hidden md:inline">Fit View</span>
        </button>

        <button
          onClick={onClearMap}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 transition"
          title="Clear all nodes and roads"
        >
          <RotateCcw className="w-4 h-4" />
          <span className="hidden md:inline">Clear All</span>
        </button>
      </div>

      {/* Stats counter tag */}
      <div className="px-3 py-1.5 bg-slate-900/80 border border-slate-800/60 rounded-lg text-[11px] text-slate-400 flex items-center justify-between">
        <span>Nodes: <strong className="text-slate-200 font-mono">{nodeCount}</strong></span>
        <span className="mx-1">•</span>
        <span>Roads: <strong className="text-slate-200 font-mono">{edgeCount}</strong></span>
      </div>
    </aside>
  );
};
