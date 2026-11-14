import React from 'react';
import { 
  Sliders, 
  Trash2, 
  ShieldAlert, 
  TrafficCone, 
  Zap, 
  Clock, 
  Gauge, 
  Layers, 
  Info,
  X
} from 'lucide-react';
import type { 
  IntersectionNode, 
  RoadSegment, 
  SelectedElement, 
  IntersectionControlType 
} from '../types.ts';

interface InspectorProps {
  selection: SelectedElement | null;
  nodes: IntersectionNode[];
  edges: RoadSegment[];
  onUpdateNode: (nodeId: string, updates: Partial<IntersectionNode>) => void;
  onUpdateEdge: (edgeId: string, updates: Partial<RoadSegment>) => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  onClose: () => void;
}

export const Inspector: React.FC<InspectorProps> = ({
  selection,
  nodes,
  edges,
  onUpdateNode,
  onUpdateEdge,
  onDeleteNode,
  onDeleteEdge,
  onClose,
}) => {
  if (!selection) {
    return (
      <aside className="absolute right-4 top-18 z-20 w-72 bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl p-4 shadow-xl text-xs flex flex-col gap-3 select-none">
        <div className="flex items-center gap-2 font-semibold text-slate-300 pb-2 border-b border-slate-800">
          <Info className="w-4 h-4 text-emerald-400" />
          <span>Quick Controls Guide</span>
        </div>
        <div className="space-y-2 text-slate-400">
          <p><strong className="text-slate-200">Select:</strong> Click any node or road to inspect and edit its physical properties.</p>
          <p><strong className="text-slate-200">Add Node:</strong> Click anywhere on canvas to create an intersection.</p>
          <p><strong className="text-slate-200">Draw Road:</strong> Click a start node, then click a target node to connect them.</p>
          <p><strong className="text-slate-200">Pan & Zoom:</strong> Drag with middle mouse or hand tool; scroll wheel to zoom.</p>
        </div>
        <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-500">
          Tip: Set intersection to <strong className="text-cyan-400">Adaptive Signal</strong> to test dynamic queue-actuated green times.
        </div>
      </aside>
    );
  }

  if (selection.type === 'node') {
    const node = nodes.find((n) => n.id === selection.id);
    if (!node) return null;

    return (
      <aside className="absolute right-4 top-18 z-20 w-80 bg-slate-900/95 backdrop-blur border border-slate-800 rounded-xl p-4 shadow-2xl text-xs flex flex-col gap-4 select-none">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2 font-semibold text-slate-200">
            <Sliders className="w-4 h-4 text-emerald-400" />
            <span>Intersection Properties</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-800 text-slate-400">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Node ID and Position */}
        <div className="space-y-1">
          <span className="text-[11px] font-medium text-slate-400">Node Identifier</span>
          <div className="font-mono text-slate-200 bg-slate-950 px-2 py-1.5 rounded border border-slate-800">
            {node.id}
          </div>
          <div className="text-[11px] text-slate-500 font-mono mt-1">
            X: {Math.round(node.x)}m &nbsp;|&nbsp; Y: {Math.round(node.y)}m
          </div>
        </div>

        {/* Signal Control Strategy */}
        <div className="space-y-2">
          <label className="text-[11px] font-medium text-slate-300">Right-of-Way Control</label>
          <div className="flex flex-col gap-1.5">
            {[
              { id: 'unsignalized', label: 'Unsignalized (Yield / Priority)', icon: <TrafficCone className="w-3.5 h-3.5 text-slate-400" />, desc: 'Vehicles yield and navigate without traffic lights' },
              { id: 'fixed_signal', label: 'Fixed-Time Signal', icon: <Clock className="w-3.5 h-3.5 text-cyan-400" />, desc: 'Pre-timed cyclic phases (e.g. 30s East-West, 30s North-South)' },
              { id: 'adaptive_signal', label: 'Adaptive Queue-Responsive', icon: <Zap className="w-3.5 h-3.5 text-emerald-400" />, desc: 'Actuated dynamic green time extension based on queue length' },
            ].map((ctrl) => (
              <button
                key={ctrl.id}
                onClick={() => onUpdateNode(node.id, { controlType: ctrl.id as IntersectionControlType })}
                className={`flex flex-col text-left p-2 rounded-lg border transition ${
                  node.controlType === ctrl.id
                    ? 'bg-slate-800/90 border-emerald-500/50 text-emerald-300'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2 font-medium">
                  {ctrl.icon}
                  <span>{ctrl.label}</span>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 pl-5.5">{ctrl.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Connected Edges */}
        <div className="space-y-1">
          <span className="text-[11px] font-medium text-slate-400">Connected Roads</span>
          <div className="text-[11px] text-slate-500 space-y-0.5">
            <div>Incoming approaches: {edges.filter((e) => e.toNodeId === node.id).length}</div>
            <div>Outgoing exits: {edges.filter((e) => e.fromNodeId === node.id).length}</div>
          </div>
        </div>

        {/* Delete Action */}
        <button
          onClick={() => onDeleteNode(node.id)}
          className="mt-2 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 font-medium transition"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Delete Intersection</span>
        </button>
      </aside>
    );
  }

  if (selection.type === 'edge') {
    const edge = edges.find((e) => e.id === selection.id);
    if (!edge) return null;

    const speedKmH = Math.round(edge.speedLimit * 3.6);

    return (
      <aside className="absolute right-4 top-18 z-20 w-80 bg-slate-900/95 backdrop-blur border border-slate-800 rounded-xl p-4 shadow-2xl text-xs flex flex-col gap-4 select-none">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2 font-semibold text-slate-200">
            <Sliders className="w-4 h-4 text-emerald-400" />
            <span>Road Segment Properties</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-800 text-slate-400">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Road ID & Connectivity */}
        <div className="space-y-1">
          <span className="text-[11px] font-medium text-slate-400">Road Identifier</span>
          <div className="font-mono text-slate-200 bg-slate-950 px-2 py-1.5 rounded border border-slate-800 truncate">
            {edge.id}
          </div>
          <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
            <span>{edge.fromNodeId} &rarr; {edge.toNodeId}</span>
            <span className="font-mono text-slate-300">{Math.round(edge.length)} meters</span>
          </div>
        </div>

        {/* Number of Lanes */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-medium text-slate-300 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span>Lane Capacity</span>
            </label>
            <span className="font-mono text-slate-200">{edge.lanes} {edge.lanes === 1 ? 'Lane' : 'Lanes'}</span>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {[1, 2, 3, 4].map((lane) => (
              <button
                key={lane}
                onClick={() => onUpdateEdge(edge.id, { lanes: lane })}
                className={`py-1.5 rounded text-center font-medium transition ${
                  edge.lanes === lane
                    ? 'bg-cyan-600 text-white shadow'
                    : 'bg-slate-950 border border-slate-800 text-slate-400 hover:bg-slate-800'
                }`}
              >
                {lane}
              </button>
            ))}
          </div>
        </div>

        {/* Speed Limit Slider */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-medium text-slate-300 flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-amber-400" />
              <span>Speed Limit</span>
            </label>
            <span className="font-mono text-amber-300 font-semibold">{speedKmH} km/h <span className="text-[10px] text-slate-400">({edge.speedLimit.toFixed(1)} m/s)</span></span>
          </div>
          <input
            type="range"
            min="20"
            max="100"
            step="5"
            value={speedKmH}
            onChange={(e) => {
              const kmh = Number(e.target.value);
              onUpdateEdge(edge.id, { speedLimit: kmh / 3.6 });
            }}
            className="w-full accent-emerald-500 cursor-pointer"
          />
        </div>

        {/* Road Closure Toggle (Scenario Testing Feature) */}
        <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className={`w-4 h-4 ${edge.isClosed ? 'text-rose-400' : 'text-slate-500'}`} />
            <div>
              <div className="text-[11px] font-medium text-slate-200">Road Closure</div>
              <div className="text-[10px] text-slate-500">Block traffic flow (Incident / Works)</div>
            </div>
          </div>
          <button
            onClick={() => onUpdateEdge(edge.id, { isClosed: !edge.isClosed })}
            className={`px-3 py-1 rounded text-xs font-semibold transition ${
              edge.isClosed
                ? 'bg-rose-600 text-white shadow-[0_0_10px_#f43f5e]'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {edge.isClosed ? 'CLOSED' : 'OPEN'}
          </button>
        </div>

        {/* Directionality Toggle */}
        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
          <span>Directionality</span>
          <span className="font-medium text-slate-200">{edge.isOneWay ? 'One-Way' : 'Two-Way'}</span>
        </div>

        {/* Delete Edge Action */}
        <button
          onClick={() => onDeleteEdge(edge.id)}
          className="mt-2 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 font-medium transition"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Delete Road Segment</span>
        </button>
      </aside>
    );
  }

  return null;
};
