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
      <div className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl p-1.5 shadow-lg flex flex-col gap-1 text-slate-700">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => setCurrentTool(tool.id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition group relative ${
              currentTool === tool.id
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 font-semibold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title={`${tool.label} (${tool.shortcut})`}
          >
            {tool.icon}
            <span className="hidden md:inline">{tool.label}</span>
            <kbd className="hidden lg:inline ml-auto text-[10px] text-slate-400 font-mono bg-slate-100 border border-slate-200 px-1 rounded">
              {tool.shortcut}
            </kbd>
          </button>
        ))}
      </div>

      {/* Road Drawing Configuration (Active when drawing edge) */}
      {currentTool === 'draw_edge' && (
        <div className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl p-2 shadow-lg flex flex-col gap-1 text-xs text-slate-700">
          <span className="text-[11px] font-semibold text-slate-500 px-1">Road Type</span>
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              onClick={() => setRoadMode('two-way')}
              className={`flex-1 py-1 rounded text-center transition ${
                roadMode === 'two-way' ? 'bg-white text-emerald-700 font-semibold shadow-2xs' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Two-Way
            </button>
            <button
              onClick={() => setRoadMode('one-way')}
              className={`flex-1 py-1 rounded text-center transition ${
                roadMode === 'one-way' ? 'bg-white text-emerald-700 font-semibold shadow-2xs' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              One-Way
            </button>
          </div>
        </div>
      )}

      {/* Utility Actions */}
      <div className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl p-1.5 shadow-lg flex flex-col gap-1 text-slate-700">
        <button
          onClick={() => setGridSnap(!gridSnap)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            gridSnap
              ? 'text-cyan-700 bg-cyan-50 border border-cyan-200 font-semibold shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
          title="Toggle Grid Snapping (25m grid)"
        >
          <Grid className="w-4 h-4" />
          <span className="hidden md:inline">Snap Grid</span>
        </button>

        <button
          onClick={onResetView}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
          title="Reset View & Center"
        >
          <Maximize2 className="w-4 h-4" />
          <span className="hidden md:inline">Fit View</span>
        </button>

        <button
          onClick={onClearMap}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 transition"
          title="Clear all nodes and roads"
        >
          <Trash2 className="w-4 h-4" />
          <span className="hidden md:inline">Clear All</span>
        </button>
      </div>

      {/* Stats counter tag */}
      <div className="px-3 py-1.5 bg-white/95 border border-slate-200 rounded-lg text-[11px] text-slate-600 shadow-sm flex items-center justify-between">
        <span>Nodes: <strong className="text-slate-900 font-mono font-bold">{nodeCount}</strong></span>
        <span className="mx-1 text-slate-300">•</span>
        <span>Roads: <strong className="text-slate-900 font-mono font-bold">{edgeCount}</strong></span>
      </div>
    </aside>
  );
};
