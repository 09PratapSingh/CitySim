import React, { useState, useEffect } from 'react';
import { 
  X, 
  Sliders, 
  AlertTriangle, 
  Zap, 
  Clock, 
  Activity, 
  Check, 
  Save, 
  Trash2, 
  Play, 
  Sparkles,
  Layers,
  ArrowRight
} from 'lucide-react';
import { 
  fetchScenarios, 
  createScenario, 
  updateScenario, 
  deleteScenario 
} from '../api/client.ts';
import type { 
  MapData, 
  RoadSegment, 
  IntersectionNode, 
  ScenarioData, 
  ScenarioModifications,
  IntersectionControlType 
} from '../types.ts';

interface ScenarioEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  baseMap: MapData;
  onRunComparison: (scenarioData: ScenarioData | {
    baseMapId: string;
    scenarioName: string;
    modifications: ScenarioModifications;
    demandMultiplier: number;
    seed: number;
  }) => void;
}

export const ScenarioEditorModal: React.FC<ScenarioEditorModalProps> = ({
  isOpen,
  onClose,
  baseMap,
  onRunComparison,
}) => {
  const [activeTab, setActiveTab] = useState<'editor' | 'saved'>('editor');
  const [savedScenarios, setSavedScenarios] = useState<ScenarioData[]>([]);
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Form State
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [name, setName] = useState('Rush Hour with Detour');
  const [description, setDescription] = useState('Simulates road closure during peak travel hours.');
  const [demandMultiplier, setDemandMultiplier] = useState<number>(1.25);
  const [seed, setSeed] = useState<number>(42);
  const [closedEdges, setClosedEdges] = useState<string[]>([]);
  const [speedOverrides, setSpeedOverrides] = useState<Record<string, number>>({});
  const [signalOverrides, setSignalOverrides] = useState<Record<string, IntersectionControlType>>({});

  const baseMapId = baseMap.id || baseMap._id || 'map_default_4way';

  // Load saved scenarios on open
  useEffect(() => {
    if (isOpen) {
      loadSavedScenarios();
    }
  }, [isOpen, baseMapId]);

  const loadSavedScenarios = async () => {
    try {
      setLoading(true);
      const list = await fetchScenarios(baseMapId);
      setSavedScenarios(list);
    } catch (err: any) {
      console.error('Error fetching scenarios:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Preset Handlers
  const applyPreset = (type: 'closure' | 'adaptive' | 'rush' | 'calm') => {
    if (type === 'closure') {
      setName('West Approach Closure (Detour Test)');
      setDescription('Simulates emergency arterial closure of road_W_C, forcing traffic diversion.');
      setDemandMultiplier(1.0);
      // Pick first edge as closed
      const targetEdge = baseMap.edges[0]?.id || 'road_W_C';
      setClosedEdges([targetEdge]);
      setSignalOverrides({});
      setSpeedOverrides({});
    } else if (type === 'adaptive') {
      setName('Smart Adaptive Signal Optimization');
      setDescription('Upgrades center intersection to dynamic queue-responsive actuation.');
      setDemandMultiplier(1.0);
      setClosedEdges([]);
      const sigMap: Record<string, IntersectionControlType> = {};
      baseMap.nodes.forEach((n) => {
        if (n.controlType !== 'unsignalized') {
          sigMap[n.id] = 'adaptive_signal';
        }
      });
      setSignalOverrides(sigMap);
      setSpeedOverrides({});
    } else if (type === 'rush') {
      setName('Peak Rush Hour Surge (1.8x)');
      setDescription('Simulates high volume peak commuter traffic across all corridors.');
      setDemandMultiplier(1.8);
      setClosedEdges([]);
      setSignalOverrides({});
      setSpeedOverrides({});
    } else if (type === 'calm') {
      setName('Off-Peak Baseline Flow (0.7x)');
      setDescription('Light night-time traffic with reduced congestion pressure.');
      setDemandMultiplier(0.7);
      setClosedEdges([]);
      setSignalOverrides({});
      setSpeedOverrides({});
    }
  };

  const toggleRoadClosure = (edgeId: string) => {
    setClosedEdges((prev) => 
      prev.includes(edgeId) ? prev.filter((id) => id !== edgeId) : [...prev, edgeId]
    );
  };

  const handleSpeedChange = (edgeId: string, speedKmh: number) => {
    const speedMs = Number((speedKmh / 3.6).toFixed(2));
    setSpeedOverrides((prev) => ({ ...prev, [edgeId]: speedMs }));
  };

  const handleSignalChange = (nodeId: string, type: IntersectionControlType) => {
    setSignalOverrides((prev) => ({ ...prev, [nodeId]: type }));
  };

  const handleSaveScenario = async () => {
    if (!name.trim()) {
      alert('Please provide a scenario name.');
      return;
    }

    const modifications: ScenarioModifications = {
      closedEdgeIds: closedEdges,
      speedLimitOverrides: Object.entries(speedOverrides).map(([edgeId, speedLimit]) => ({
        edgeId,
        speedLimit,
      })),
      signalOverrides: Object.entries(signalOverrides).map(([nodeId, controlType]) => ({
        nodeId,
        controlType,
      })),
    };

    try {
      setLoading(true);
      if (scenarioId) {
        await updateScenario(scenarioId, {
          name,
          description,
          demandMultiplier,
          seed,
          modifications,
        });
        setSaveStatus('Scenario updated successfully!');
      } else {
        const created = await createScenario({
          baseMapId,
          name,
          description,
          demandMultiplier,
          seed,
          modifications,
        });
        setScenarioId(created.id || created._id || null);
        setSaveStatus('Scenario saved successfully!');
      }
      await loadSavedScenarios();
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err: any) {
      alert(`Error saving scenario: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteComparison = () => {
    const modifications: ScenarioModifications = {
      closedEdgeIds: closedEdges,
      speedLimitOverrides: Object.entries(speedOverrides).map(([edgeId, speedLimit]) => ({
        edgeId,
        speedLimit,
      })),
      signalOverrides: Object.entries(signalOverrides).map(([nodeId, controlType]) => ({
        nodeId,
        controlType,
      })),
    };

    onRunComparison({
      baseMapId,
      scenarioName: name,
      demandMultiplier,
      seed,
      modifications,
    });
    onClose();
  };

  const loadScenarioIntoEditor = (scen: ScenarioData) => {
    setScenarioId(scen.id || scen._id || null);
    setName(scen.name);
    setDescription(scen.description || '');
    setDemandMultiplier(scen.demandMultiplier ?? 1.0);
    setSeed(scen.seed ?? 42);
    setClosedEdges(scen.modifications?.closedEdgeIds || []);

    const spdMap: Record<string, number> = {};
    scen.modifications?.speedLimitOverrides?.forEach((o) => {
      spdMap[o.edgeId] = o.speedLimit;
    });
    setSpeedOverrides(spdMap);

    const sigMap: Record<string, IntersectionControlType> = {};
    scen.modifications?.signalOverrides?.forEach((s) => {
      sigMap[s.nodeId] = s.controlType;
    });
    setSignalOverrides(sigMap);

    setActiveTab('editor');
  };

  const handleDeleteScenario = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Delete this scenario?')) return;
    try {
      await deleteScenario(id);
      await loadSavedScenarios();
      if (scenarioId === id) {
        setScenarioId(null);
      }
    } catch (err: any) {
      alert(`Failed to delete: ${err.message}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[92vh] shadow-2xl flex flex-col overflow-hidden text-slate-100">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                Scenario Studio & Modifications
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                  Stage 7
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Base Map: <span className="font-semibold text-slate-200">{baseMap.name}</span> ({baseMap.nodes.length} intersections, {baseMap.edges.length} road links)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tabs */}
            <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-medium mr-2">
              <button
                onClick={() => setActiveTab('editor')}
                className={`px-3 py-1 rounded-md transition ${
                  activeTab === 'editor' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Modify Scenario
              </button>
              <button
                onClick={() => setActiveTab('saved')}
                className={`px-3 py-1 rounded-md transition flex items-center gap-1.5 ${
                  activeTab === 'saved' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>Saved Library</span>
                <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] text-indigo-300">
                  {savedScenarios.length}
                </span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        {activeTab === 'editor' ? (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* Presets Quick-Bar */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Quick Scenario Presets
                </span>
                <span className="text-[11px] text-slate-500">Click to auto-populate scenario parameters</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                <button
                  type="button"
                  onClick={() => applyPreset('closure')}
                  className="flex items-start gap-2.5 p-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-left transition"
                >
                  <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-rose-200">Road Closure</div>
                    <div className="text-[10px] text-rose-300/70">Close West arterial approach</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => applyPreset('adaptive')}
                  className="flex items-start gap-2.5 p-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-left transition"
                >
                  <Zap className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-emerald-200">Adaptive Signals</div>
                    <div className="text-[10px] text-emerald-300/70">Dynamic queue extension</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => applyPreset('rush')}
                  className="flex items-start gap-2.5 p-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-left transition"
                >
                  <Activity className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-amber-200">Rush Hour (1.8x)</div>
                    <div className="text-[10px] text-amber-300/70">Peak demand stress test</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => applyPreset('calm')}
                  className="flex items-start gap-2.5 p-2.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-left transition"
                >
                  <Clock className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-cyan-200">Off-Peak (0.7x)</div>
                    <div className="text-[10px] text-cyan-300/70">Night / Light traffic</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Scenario Identity & Traffic Demand */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-950/50 p-4 rounded-xl border border-slate-800">
              <div className="md:col-span-2 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Scenario Title</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                    placeholder="e.g. West Approach Road Closure"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Description / Hypothesis</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-300 focus:outline-none focus:border-indigo-500"
                    placeholder="e.g. Detour traffic to south corridor increases average wait time by >30%."
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-slate-300">Traffic Demand Multiplier</span>
                    <span className="font-bold text-indigo-400">{demandMultiplier.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2.5"
                    step="0.05"
                    value={demandMultiplier}
                    onChange={(e) => setDemandMultiplier(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                    <span>0.5x (300 veh/h)</span>
                    <span>1.0x (600 veh/h)</span>
                    <span>2.5x (1500 veh/h)</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Simulation Seed (Mulberry32)</label>
                  <input
                    type="number"
                    value={seed}
                    onChange={(e) => setSeed(parseInt(e.target.value) || 42)}
                    className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Road Closures & Speed Overrides Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                  Road Link Closures & Speed Regulation
                </h3>
                <span className="text-[11px] text-slate-500">
                  {closedEdges.length} / {baseMap.edges.length} roads closed
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-1">
                {baseMap.edges.map((edge: RoadSegment) => {
                  const isClosed = closedEdges.includes(edge.id);
                  const currentSpeedMs = speedOverrides[edge.id] ?? edge.speedLimit;
                  const currentSpeedKmh = Math.round(currentSpeedMs * 3.6);

                  return (
                    <div
                      key={edge.id}
                      className={`p-3 rounded-xl border transition ${
                        isClosed 
                          ? 'border-rose-500/50 bg-rose-500/10' 
                          : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-white">{edge.id}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                              {edge.lanes} {edge.lanes === 1 ? 'lane' : 'lanes'}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {edge.fromNodeId} &rarr; {edge.toNodeId} ({Math.round(edge.length)}m)
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleRoadClosure(edge.id)}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition ${
                            isClosed
                              ? 'bg-rose-600 text-white shadow-sm'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {isClosed ? '🚧 CLOSED' : 'OPEN'}
                        </button>
                      </div>

                      {/* Speed Limit Slider */}
                      {!isClosed && (
                        <div className="mt-2 pt-2 border-t border-slate-800/80">
                          <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                            <span>Speed Limit</span>
                            <span className="font-mono text-cyan-400">{currentSpeedKmh} km/h</span>
                          </div>
                          <input
                            type="range"
                            min="20"
                            max="100"
                            step="5"
                            value={currentSpeedKmh}
                            onChange={(e) => handleSpeedChange(edge.id, parseInt(e.target.value))}
                            className="w-full h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-cyan-500"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Intersection Signal Overrides */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  Intersection Signal Control Overrides
                </h3>
                <span className="text-[11px] text-slate-500">
                  Switch between Unsignalized, Fixed-Time, or Adaptive Queue-Actuated
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-48 overflow-y-auto pr-1">
                {baseMap.nodes.map((node: IntersectionNode) => {
                  const currentControl = signalOverrides[node.id] || node.controlType;

                  return (
                    <div
                      key={node.id}
                      className="p-3 rounded-xl border border-slate-800 bg-slate-950/40 flex items-center justify-between"
                    >
                      <div>
                        <div className="text-xs font-semibold text-white">{node.id}</div>
                        <div className="text-[10px] text-slate-400">
                          Default: <span className="capitalize">{node.controlType.replace('_', ' ')}</span>
                        </div>
                      </div>

                      <select
                        value={currentControl}
                        onChange={(e) => handleSignalChange(node.id, e.target.value as IntersectionControlType)}
                        className={`text-xs px-2.5 py-1.5 rounded-lg border focus:outline-none transition ${
                          currentControl === 'adaptive_signal'
                            ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                            : currentControl === 'fixed_signal'
                            ? 'bg-amber-950/80 border-amber-500/50 text-amber-300'
                            : 'bg-slate-900 border-slate-700 text-slate-300'
                        }`}
                      >
                        <option value="unsignalized">Unsignalized (Yield / Stop)</option>
                        <option value="fixed_signal">Fixed-Time Signal FSM</option>
                        <option value="adaptive_signal">Adaptive Actuated Signal</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        ) : (
          /* Saved Scenarios Tab */
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-2">
                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs">Loading saved scenarios...</span>
              </div>
            ) : savedScenarios.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <div className="w-12 h-12 mx-auto rounded-full bg-slate-800/80 flex items-center justify-center text-slate-500">
                  <Sliders className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-semibold text-slate-300">No saved scenarios yet</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Use the 'Modify Scenario' tab to configure road closures, adaptive signals, or rush hour surges, then click Save.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('editor')}
                  className="px-4 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition"
                >
                  Create New Scenario
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {savedScenarios.map((scen) => (
                  <div
                    key={scen.id || scen._id}
                    className="p-4 rounded-xl border border-slate-800 bg-slate-950/50 hover:border-indigo-500/50 transition flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h4 className="font-bold text-sm text-white">{scen.name}</h4>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => handleDeleteScenario(scen.id || scen._id!, e)}
                            className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                            title="Delete scenario"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <p className="text-xs text-slate-400 mb-3 line-clamp-2">
                        {scen.description || 'No description provided.'}
                      </p>

                      <div className="flex flex-wrap gap-1.5 text-[10px] mb-4">
                        <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                          Demand: {scen.demandMultiplier}x
                        </span>
                        {scen.modifications?.closedEdgeIds?.length ? (
                          <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            {scen.modifications.closedEdgeIds.length} closed
                          </span>
                        ) : null}
                        {scen.modifications?.signalOverrides?.length ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            {scen.modifications.signalOverrides.length} signal override
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-3 border-t border-slate-800/80">
                      <button
                        type="button"
                        onClick={() => loadScenarioIntoEditor(scen)}
                        className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
                      >
                        Edit Scenario
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onRunComparison(scen);
                          onClose();
                        }}
                        className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center justify-center gap-1.5"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Run vs Baseline</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {saveStatus && (
              <span className="text-xs text-emerald-400 flex items-center gap-1.5 animate-fade-in font-medium">
                <Check className="w-3.5 h-3.5" />
                {saveStatus}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-medium rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
            >
              Cancel
            </button>

            {activeTab === 'editor' && (
              <>
                <button
                  type="button"
                  onClick={handleSaveScenario}
                  disabled={loading}
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 transition flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Scenario</span>
                </button>

                <button
                  type="button"
                  onClick={handleExecuteComparison}
                  disabled={loading}
                  className="px-4 py-1.5 text-xs font-bold rounded-lg bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 text-white shadow-lg shadow-indigo-500/25 transition flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Run Dual Comparison</span>
                </button>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
