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
      <aside className="absolute right-4 top-18 z-20 w-72 bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl p-4 shadow-xl text-xs flex flex-col gap-3 select-none text-slate-800">
        <div className="flex items-center gap-2 font-semibold text-slate-800 pb-2 border-b border-slate-200">
          <Info className="w-4 h-4 text-emerald-600" />
          <span>Quick Controls Guide</span>
        </div>
        <div className="space-y-2 text-slate-600">
          <p><strong className="text-slate-900">Select:</strong> Click any node or road to inspect and edit its physical properties.</p>
          <p><strong className="text-slate-900">Add Node:</strong> Click anywhere on canvas to create an intersection.</p>
          <p><strong className="text-slate-900">Draw Road:</strong> Click a start node, then click a target node to connect them.</p>
          <p><strong className="text-slate-900">Pan & Zoom:</strong> Drag with middle mouse or hand tool; scroll wheel to zoom.</p>
        </div>
        <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-500">
          Tip: Set intersection to <strong className="text-cyan-700">Adaptive Signal</strong> to test dynamic queue-actuated green times.
        </div>
      </aside>
    );
  }

  if (selection.type === 'node') {
    const node = nodes.find((n) => n.id === selection.id);
    if (!node) return null;

    return (
      <aside className="absolute right-4 top-18 z-20 w-80 bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl p-4 shadow-xl text-xs flex flex-col gap-4 select-none text-slate-800">
        <div className="flex items-center justify-between pb-2 border-b border-slate-200">
          <div className="flex items-center gap-2 font-bold text-slate-800">
            <Sliders className="w-4 h-4 text-emerald-600" />
            <span>Intersection Properties</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Node ID and Position */}
        <div className="space-y-1">
          <span className="text-[11px] font-semibold text-slate-500">Node Identifier</span>
          <div className="font-mono text-slate-900 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 font-bold">
            {node.id}
          </div>
          <div className="text-[11px] text-slate-500 font-mono mt-1">
            X: {Math.round(node.x)}m &nbsp;|&nbsp; Y: {Math.round(node.y)}m
          </div>
        </div>

        {/* Signal Control Strategy */}
        <div className="space-y-2">
          <label className="text-[11px] font-semibold text-slate-700">Right-of-Way Control</label>
          <div className="flex flex-col gap-1.5">
            {[
              { id: 'unsignalized', label: 'Unsignalized (Yield / Priority)', icon: <TrafficCone className="w-3.5 h-3.5 text-slate-500" />, desc: 'Vehicles yield and navigate without traffic lights' },
              { id: 'fixed_signal', label: 'Fixed-Time Signal', icon: <Clock className="w-3.5 h-3.5 text-cyan-600" />, desc: 'Pre-timed cyclic phases (e.g. 25s East-West, 25s North-South)' },
              { id: 'adaptive_signal', label: 'Adaptive Queue-Responsive', icon: <Zap className="w-3.5 h-3.5 text-emerald-600" />, desc: 'Actuated dynamic green time extension based on queue backlog' },
            ].map((ctrl) => (
              <button
                key={ctrl.id}
                onClick={() => onUpdateNode(node.id, { controlType: ctrl.id as IntersectionControlType })}
                className={`flex flex-col text-left p-2.5 rounded-lg border transition ${
                  node.controlType === ctrl.id
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-medium shadow-2xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2 font-semibold">
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
          <span className="text-[11px] font-semibold text-slate-500">Connected Roads</span>
          <div className="text-[11px] text-slate-600 space-y-0.5 font-mono">
            <div>Incoming: {edges.filter((e) => e.toNodeId === node.id).map((e) => e.id).join(', ') || 'None'}</div>
            <div>Outgoing: {edges.filter((e) => e.fromNodeId === node.id).map((e) => e.id).join(', ') || 'None'}</div>
          </div>
        </div>

        {/* Delete Node Button */}
        <button
          onClick={() => onDeleteNode(node.id)}
          className="mt-2 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold transition shadow-2xs"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Delete Intersection</span>
        </button>
      </aside>
    );
  }

  // Edge Inspector
  if (selection.type === 'edge') {
    const edge = edges.find((e) => e.id === selection.id);
    if (!edge) return null;

    const speedKmH = Math.round(edge.speedLimit * 3.6);

    return (
      <aside className="absolute right-4 top-18 z-20 w-80 bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl p-4 shadow-xl text-xs flex flex-col gap-4 select-none text-slate-800">
        <div className="flex items-center justify-between pb-2 border-b border-slate-200">
          <div className="flex items-center gap-2 font-bold text-slate-800">
            <Sliders className="w-4 h-4 text-emerald-600" />
            <span>Road Segment Properties</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Road ID & Connectivity */}
        <div className="space-y-1">
          <span className="text-[11px] font-semibold text-slate-500">Road Identifier</span>
          <div className="font-mono text-slate-900 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 font-bold truncate">
            {edge.id}
          </div>
          <div className="text-[11px] text-slate-600 flex items-center justify-between pt-1">
            <span>{edge.fromNodeId} &rarr; {edge.toNodeId}</span>
            <span className="font-mono text-slate-700 font-semibold">{Math.round(edge.length)} meters</span>
          </div>
        </div>

        {/* Number of Lanes */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-cyan-600" />
              <span>Lane Capacity</span>
            </label>
            <span className="font-mono text-slate-900 font-bold">{edge.lanes} {edge.lanes === 1 ? 'Lane' : 'Lanes'}</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {[1, 2, 3, 4].map((lane) => (
              <button
                key={lane}
                onClick={() => onUpdateEdge(edge.id, { lanes: lane })}
                className={`py-1.5 rounded-lg text-center font-bold transition ${
                  edge.lanes === lane
                    ? 'bg-cyan-600 text-white shadow-xs'
                    : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
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
            <label className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-amber-500" />
              <span>Speed Limit</span>
            </label>
            <span className="font-mono text-amber-700 font-bold">{speedKmH} km/h <span className="text-[10px] text-slate-400 font-normal">({edge.speedLimit.toFixed(1)} m/s)</span></span>
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
            className="w-full accent-emerald-600 cursor-pointer"
          />
        </div>

        {/* Road Closure Toggle (Scenario Testing Feature) */}
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className={`w-4 h-4 ${edge.isClosed ? 'text-rose-600' : 'text-slate-400'}`} />
            <div>
              <div className="text-[11px] font-bold text-slate-800">Road Closure</div>
              <div className="text-[10px] text-slate-500">Block traffic flow (Incident / Works)</div>
            </div>
          </div>
          <button
            onClick={() => onUpdateEdge(edge.id, { isClosed: !edge.isClosed })}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition shadow-xs ${
              edge.isClosed
                ? 'bg-rose-600 text-white shadow-rose-200'
                : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
            }`}
          >
            {edge.isClosed ? 'CLOSED' : 'OPEN'}
          </button>
        </div>

        {/* Directionality Toggle */}
        <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1">
          <span>Directionality</span>
          <span className="font-semibold text-slate-800">{edge.isOneWay ? 'One-Way' : 'Two-Way'}</span>
        </div>

        {/* Delete Edge Button */}
        <button
          onClick={() => onDeleteEdge(edge.id)}
          className="mt-2 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold transition shadow-2xs"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Delete Road Segment</span>
        </button>
      </aside>
    );
  }

  return null;
};
