import React, { useState, useEffect } from 'react';
import { 
  FolderOpen, 
  Save, 
  Trash2, 
  X, 
  Map as MapIcon, 
  Sparkles, 
  Plus, 
  AlertCircle,
  Check
} from 'lucide-react';
import type { MapData, IntersectionNode, RoadSegment } from '../types.ts';
import { fetchMaps, createMap, deleteMap } from '../api/client.ts';

interface MapManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentNodes: IntersectionNode[];
  currentEdges: RoadSegment[];
  currentMapName: string;
  onLoadMap: (map: MapData) => void;
}

export const MapManagerModal: React.FC<MapManagerModalProps> = ({
  isOpen,
  onClose,
  currentNodes,
  currentEdges,
  currentMapName,
  onLoadMap,
}) => {
  const [activeTab, setActiveTab] = useState<'load' | 'save' | 'templates'>('load');
  const [savedMaps, setSavedMaps] = useState<MapData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Save form states
  const [saveName, setSaveName] = useState(currentMapName || 'My Road Network');
  const [saveDescription, setSaveDescription] = useState('Custom urban road network model.');

  useEffect(() => {
    if (isOpen) {
      loadSavedMaps();
      setSaveName(currentMapName || 'My Road Network');
      setError(null);
      setSuccessMessage(null);
    }
  }, [isOpen, currentMapName]);

  const loadSavedMaps = async () => {
    setLoading(true);
    try {
      const maps = await fetchMaps();
      setSavedMaps(maps);
    } catch (err: any) {
      setError(err.message || 'Failed to load maps');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saveName.trim()) {
      setError('Please provide a map name.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const newMap = await createMap({
        name: saveName.trim(),
        description: saveDescription.trim(),
        nodes: currentNodes,
        edges: currentEdges,
      });
      setSuccessMessage(`Map '${newMap.name}' saved successfully!`);
      loadSavedMaps();
      setTimeout(() => {
        onLoadMap(newMap);
        onClose();
      }, 700);
    } catch (err: any) {
      setError(err.message || 'Failed to save map');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMap = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this map?')) return;

    try {
      await deleteMap(id);
      setSavedMaps((prev) => prev.filter((m) => (m.id || m._id) !== id));
    } catch (err: any) {
      setError(err.message || 'Failed to delete map');
    }
  };

  // Preset Template Generators
  const loadPreset = (presetType: '4way' | 'grid' | 'grid_3x3' | 'arterial') => {
    let preset: MapData;

    if (presetType === 'grid_3x3') {
      preset = {
        name: '3x3 City Block Grid',
        description: 'Urban 3x3 street grid (9 nodes, 24 directional links) with a signalized center intersection and perimeter bypasses for detour routing.',
        nodes: [
          { id: 'node_TL', x: 200, y: 150, controlType: 'unsignalized', incomingEdgeIds: ['road_TC_TL', 'road_ML_TL'], outgoingEdgeIds: ['road_TL_TC', 'road_TL_ML'] },
          { id: 'node_TC', x: 400, y: 150, controlType: 'unsignalized', incomingEdgeIds: ['road_TL_TC', 'road_TR_TC', 'road_C_TC'], outgoingEdgeIds: ['road_TC_TL', 'road_TC_TR', 'road_TC_C'] },
          { id: 'node_TR', x: 600, y: 150, controlType: 'unsignalized', incomingEdgeIds: ['road_TC_TR', 'road_MR_TR'], outgoingEdgeIds: ['road_TR_TC', 'road_TR_MR'] },
          { id: 'node_ML', x: 200, y: 300, controlType: 'unsignalized', incomingEdgeIds: ['road_TL_ML', 'road_BL_ML', 'road_C_ML'], outgoingEdgeIds: ['road_ML_TL', 'road_ML_BL', 'road_ML_C'] },
          {
            id: 'node_C',
            x: 400,
            y: 300,
            controlType: 'fixed_signal',
            incomingEdgeIds: ['road_ML_C', 'road_MR_C', 'road_TC_C', 'road_BC_C'],
            outgoingEdgeIds: ['road_C_ML', 'road_C_MR', 'road_C_TC', 'road_C_BC'],
            signalConfig: {
              type: 'fixed_signal',
              cycleTime: 59,
              phases: [
                { id: 'phase_EW', name: 'East-West Movement', greenEdgeIds: ['road_ML_C', 'road_MR_C'], greenDuration: 25, yellowDuration: 3, allRedDuration: 1.5 },
                { id: 'phase_NS', name: 'North-South Movement', greenEdgeIds: ['road_TC_C', 'road_BC_C'], greenDuration: 25, yellowDuration: 3, allRedDuration: 1.5 },
              ],
            },
          },
          { id: 'node_MR', x: 600, y: 300, controlType: 'unsignalized', incomingEdgeIds: ['road_TR_MR', 'road_BR_MR', 'road_C_MR'], outgoingEdgeIds: ['road_MR_TR', 'road_MR_BR', 'road_MR_C'] },
          { id: 'node_BL', x: 200, y: 450, controlType: 'unsignalized', incomingEdgeIds: ['road_ML_BL', 'road_BC_BL'], outgoingEdgeIds: ['road_BL_ML', 'road_BL_BC'] },
          { id: 'node_BC', x: 400, y: 450, controlType: 'unsignalized', incomingEdgeIds: ['road_BL_BC', 'road_BR_BC', 'road_C_BC'], outgoingEdgeIds: ['road_BC_BL', 'road_BC_BR', 'road_BC_C'] },
          { id: 'node_BR', x: 600, y: 450, controlType: 'unsignalized', incomingEdgeIds: ['road_BC_BR', 'road_MR_BR'], outgoingEdgeIds: ['road_BR_BC', 'road_BR_MR'] },
        ],
        edges: [
          { id: 'road_TL_TC', fromNodeId: 'node_TL', toNodeId: 'node_TC', length: 200, speedLimit: 13.89, lanes: 1, isOneWay: true },
          { id: 'road_TC_TL', fromNodeId: 'node_TC', toNodeId: 'node_TL', length: 200, speedLimit: 13.89, lanes: 1, isOneWay: true },
          { id: 'road_TC_TR', fromNodeId: 'node_TC', toNodeId: 'node_TR', length: 200, speedLimit: 13.89, lanes: 1, isOneWay: true },
          { id: 'road_TR_TC', fromNodeId: 'node_TR', toNodeId: 'node_TC', length: 200, speedLimit: 13.89, lanes: 1, isOneWay: true },

          { id: 'road_ML_C', fromNodeId: 'node_ML', toNodeId: 'node_C', length: 200, speedLimit: 13.89, lanes: 1, isOneWay: true },
          { id: 'road_C_ML', fromNodeId: 'node_C', toNodeId: 'node_ML', length: 200, speedLimit: 13.89, lanes: 1, isOneWay: true },
          { id: 'road_C_MR', fromNodeId: 'node_C', toNodeId: 'node_MR', length: 200, speedLimit: 13.89, lanes: 1, isOneWay: true },
          { id: 'road_MR_C', fromNodeId: 'node_MR', toNodeId: 'node_C', length: 200, speedLimit: 13.89, lanes: 1, isOneWay: true },

          { id: 'road_BL_BC', fromNodeId: 'node_BL', toNodeId: 'node_BC', length: 200, speedLimit: 13.89, lanes: 1, isOneWay: true },
          { id: 'road_BC_BL', fromNodeId: 'node_BC', toNodeId: 'node_BL', length: 200, speedLimit: 13.89, lanes: 1, isOneWay: true },
          { id: 'road_BC_BR', fromNodeId: 'node_BC', toNodeId: 'node_BR', length: 200, speedLimit: 13.89, lanes: 1, isOneWay: true },
          { id: 'road_BR_BC', fromNodeId: 'node_BR', toNodeId: 'node_BC', length: 200, speedLimit: 13.89, lanes: 1, isOneWay: true },

          { id: 'road_TL_ML', fromNodeId: 'node_TL', toNodeId: 'node_ML', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true },
          { id: 'road_ML_TL', fromNodeId: 'node_ML', toNodeId: 'node_TL', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true },
          { id: 'road_ML_BL', fromNodeId: 'node_ML', toNodeId: 'node_BL', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true },
          { id: 'road_BL_ML', fromNodeId: 'node_BL', toNodeId: 'node_ML', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true },

          { id: 'road_TC_C', fromNodeId: 'node_TC', toNodeId: 'node_C', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true },
          { id: 'road_C_TC', fromNodeId: 'node_C', toNodeId: 'node_TC', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true },
          { id: 'road_C_BC', fromNodeId: 'node_C', toNodeId: 'node_BC', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true },
          { id: 'road_BC_C', fromNodeId: 'node_BC', toNodeId: 'node_C', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true },

          { id: 'road_TR_MR', fromNodeId: 'node_TR', toNodeId: 'node_MR', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true },
          { id: 'road_MR_TR', fromNodeId: 'node_MR', toNodeId: 'node_TR', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true },
          { id: 'road_MR_BR', fromNodeId: 'node_MR', toNodeId: 'node_BR', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true },
          { id: 'road_BR_MR', fromNodeId: 'node_BR', toNodeId: 'node_MR', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true },
        ],
        odPairs: [
          { originNodeId: 'node_ML', destinationNodeId: 'node_MR', arrivalRatePerHour: 800 },
          { originNodeId: 'node_TC', destinationNodeId: 'node_BC', arrivalRatePerHour: 200 },
        ],
      };
    } else if (presetType === '4way') {
      preset = {
        name: '4-Way Signalized Crossroad',
        description: 'Single central intersection with 4 approach arms.',
        nodes: [
          {
            id: 'node_center',
            x: 400,
            y: 300,
            controlType: 'fixed_signal',
            incomingEdgeIds: ['road_W_C', 'road_S_C'],
            outgoingEdgeIds: ['road_C_E', 'road_C_N'],
            signalConfig: {
              type: 'fixed_signal',
              cycleTime: 59,
              phases: [
                { id: 'phase_EW', name: 'East-West Movement', greenEdgeIds: ['road_W_C'], greenDuration: 25, yellowDuration: 3, allRedDuration: 1.5 },
                { id: 'phase_NS', name: 'North-South Movement', greenEdgeIds: ['road_S_C'], greenDuration: 25, yellowDuration: 3, allRedDuration: 1.5 },
              ],
            },
          },
          { id: 'node_west', x: 150, y: 300, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] },
          { id: 'node_south', x: 400, y: 550, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] },
          { id: 'node_east', x: 650, y: 300, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] },
          { id: 'node_north', x: 400, y: 50, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] },
        ],
        edges: [
          { id: 'road_W_C', fromNodeId: 'node_west', toNodeId: 'node_center', length: 250, lanes: 2, speedLimit: 13.89, isOneWay: true },
          { id: 'road_S_C', fromNodeId: 'node_south', toNodeId: 'node_center', length: 250, lanes: 2, speedLimit: 13.89, isOneWay: true },
          { id: 'road_C_E', fromNodeId: 'node_center', toNodeId: 'node_east', length: 250, lanes: 2, speedLimit: 13.89, isOneWay: true },
          { id: 'road_C_N', fromNodeId: 'node_center', toNodeId: 'node_north', length: 250, lanes: 2, speedLimit: 13.89, isOneWay: true },
        ],
      };
    } else if (presetType === 'grid') {
      preset = {
        name: '2x2 Downtown Urban Grid',
        description: 'Coordinated grid with 4 signalized intersections and 2-way arterial avenues.',
        nodes: [
          { id: 'J_NW', x: 250, y: 200, controlType: 'adaptive_signal', incomingEdgeIds: [], outgoingEdgeIds: [] },
          { id: 'J_NE', x: 550, y: 200, controlType: 'adaptive_signal', incomingEdgeIds: [], outgoingEdgeIds: [] },
          { id: 'J_SW', x: 250, y: 500, controlType: 'adaptive_signal', incomingEdgeIds: [], outgoingEdgeIds: [] },
          { id: 'J_SE', x: 550, y: 500, controlType: 'adaptive_signal', incomingEdgeIds: [], outgoingEdgeIds: [] },
          // Boundary source / sink portals
          { id: 'Entry_W1', x: 50, y: 200, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] },
          { id: 'Entry_W2', x: 50, y: 500, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] },
          { id: 'Exit_E1', x: 750, y: 200, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] },
          { id: 'Exit_E2', x: 750, y: 500, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] },
          { id: 'Entry_N1', x: 250, y: 50, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] },
          { id: 'Exit_S1', x: 250, y: 650, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] },
          { id: 'Entry_N2', x: 550, y: 50, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] },
          { id: 'Exit_S2', x: 550, y: 650, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] },
        ],
        edges: [
          // West-East Avenues
          { id: 'R_W1_NW', fromNodeId: 'Entry_W1', toNodeId: 'J_NW', length: 200, lanes: 2, speedLimit: 13.89, isOneWay: true },
          { id: 'R_NW_NE', fromNodeId: 'J_NW', toNodeId: 'J_NE', length: 300, lanes: 2, speedLimit: 13.89, isOneWay: true },
          { id: 'R_NE_E1', fromNodeId: 'J_NE', toNodeId: 'Exit_E1', length: 200, lanes: 2, speedLimit: 13.89, isOneWay: true },

          { id: 'R_W2_SW', fromNodeId: 'Entry_W2', toNodeId: 'J_SW', length: 200, lanes: 2, speedLimit: 13.89, isOneWay: true },
          { id: 'R_SW_SE', fromNodeId: 'J_SW', toNodeId: 'J_SE', length: 300, lanes: 2, speedLimit: 13.89, isOneWay: true },
          { id: 'R_SE_E2', fromNodeId: 'J_SE', toNodeId: 'Exit_E2', length: 200, lanes: 2, speedLimit: 13.89, isOneWay: true },

          // North-South Streets
          { id: 'R_N1_NW', fromNodeId: 'Entry_N1', toNodeId: 'J_NW', length: 150, lanes: 1, speedLimit: 11.11, isOneWay: true },
          { id: 'R_NW_SW', fromNodeId: 'J_NW', toNodeId: 'J_SW', length: 300, lanes: 1, speedLimit: 11.11, isOneWay: true },
          { id: 'R_SW_S1', fromNodeId: 'J_SW', toNodeId: 'Exit_S1', length: 150, lanes: 1, speedLimit: 11.11, isOneWay: true },

          { id: 'R_N2_NE', fromNodeId: 'Entry_N2', toNodeId: 'J_NE', length: 150, lanes: 1, speedLimit: 11.11, isOneWay: true },
          { id: 'R_NE_SE', fromNodeId: 'J_NE', toNodeId: 'J_SE', length: 300, lanes: 1, speedLimit: 11.11, isOneWay: true },
          { id: 'R_SE_S2', fromNodeId: 'J_SE', toNodeId: 'Exit_S2', length: 150, lanes: 1, speedLimit: 11.11, isOneWay: true },
        ],
      };
    } else {
      preset = {
        name: 'Arterial Bypass with T-Junction',
        description: 'High-speed 4-lane arterial bypass merged with a local urban feeder avenue.',
        nodes: [
          { id: 'node_bypass_w', x: 100, y: 300, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] },
          { id: 'node_junction', x: 450, y: 300, controlType: 'adaptive_signal', incomingEdgeIds: [], outgoingEdgeIds: [] },
          { id: 'node_bypass_e', x: 800, y: 300, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] },
          { id: 'node_feeder_s', x: 450, y: 580, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] },
        ],
        edges: [
          { id: 'road_arterial_in', fromNodeId: 'node_bypass_w', toNodeId: 'node_junction', length: 350, lanes: 3, speedLimit: 19.44, isOneWay: true },
          { id: 'road_arterial_out', fromNodeId: 'node_junction', toNodeId: 'node_bypass_e', length: 350, lanes: 3, speedLimit: 19.44, isOneWay: true },
          { id: 'road_feeder_in', fromNodeId: 'node_feeder_s', toNodeId: 'node_junction', length: 280, lanes: 2, speedLimit: 11.11, isOneWay: true },
        ],
      };
    }

    onLoadMap(preset);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 select-none">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-slate-100">Map Management</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 px-5 bg-slate-950/50">
          <button
            onClick={() => setActiveTab('load')}
            className={`py-3 px-4 text-xs font-medium border-b-2 transition ${
              activeTab === 'load'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Saved Maps ({savedMaps.length})
          </button>
          <button
            onClick={() => setActiveTab('save')}
            className={`py-3 px-4 text-xs font-medium border-b-2 transition ${
              activeTab === 'save'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Save Current Map
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`py-3 px-4 text-xs font-medium border-b-2 transition ${
              activeTab === 'templates'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Starter Templates
          </button>
        </div>

        {/* Feedback Alerts */}
        {error && (
          <div className="mx-5 mt-4 p-3 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMessage && (
          <div className="mx-5 mt-4 p-3 rounded-lg bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="p-5 overflow-y-auto flex-1 text-xs">
          {activeTab === 'load' && (
            <div className="space-y-3">
              {loading ? (
                <div className="text-center py-8 text-slate-500">Loading maps from backend...</div>
              ) : savedMaps.length === 0 ? (
                <div className="text-center py-8 text-slate-500 space-y-2">
                  <p>No saved maps found.</p>
                  <p className="text-[11px] text-slate-600">Save the current map or load a starter template.</p>
                </div>
              ) : (
                savedMaps.map((map) => {
                  const id = map.id || map._id || '';
                  return (
                    <div
                      key={id}
                      onClick={() => {
                        onLoadMap(map);
                        onClose();
                      }}
                      className="p-3.5 bg-slate-950/60 hover:bg-slate-800/60 border border-slate-800 rounded-xl cursor-pointer transition flex items-center justify-between group"
                    >
                      <div className="space-y-1">
                        <div className="font-semibold text-slate-200 group-hover:text-emerald-400 transition">
                          {map.name}
                        </div>
                        <div className="text-slate-400 text-[11px] line-clamp-1">
                          {map.description || 'No description'}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono flex items-center gap-3 pt-0.5">
                          <span>{map.nodes?.length ?? 0} Nodes</span>
                          <span>{map.edges?.length ?? 0} Roads</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => handleDeleteMap(id, e)}
                          className="p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition opacity-0 group-hover:opacity-100"
                          title="Delete Map"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === 'save' && (
            <form onSubmit={handleSaveMap} className="space-y-4">
              <div>
                <label className="block text-slate-300 font-medium mb-1.5">Map Name</label>
                <input
                  type="text"
                  required
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="e.g. Metro Crossroads or Downtown Corridor"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1.5">Description (Optional)</label>
                <textarea
                  rows={3}
                  value={saveDescription}
                  onChange={(e) => setSaveDescription(e.target.value)}
                  placeholder="Notes on geometry, speed limits, or signal strategies..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                <span>Current Map Network:</span>
                <span className="font-mono text-slate-200">
                  {currentNodes.length} Nodes &nbsp;|&nbsp; {currentEdges.length} Road Segments
                </span>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-emerald-950 transition disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{loading ? 'Saving...' : 'Save to Database'}</span>
              </button>
            </form>
          )}

          {activeTab === 'templates' && (
            <div className="grid grid-cols-1 gap-3">
              {[
                {
                  id: 'grid_3x3',
                  title: '3x3 City Block Grid',
                  desc: 'Urban 3x3 street grid (9 nodes, 24 directional links) with signalized center and detour bypasses.',
                  nodes: '9 Nodes',
                  edges: '24 Roads',
                },
                {
                  id: '4way',
                  title: '4-Way Signalized Crossroad',
                  desc: 'Standard 4-arm single intersection testing baseline signal cycles vs adaptive green extensions.',
                  nodes: '5 Nodes',
                  edges: '4 Roads',
                },
                {
                  id: 'grid',
                  title: '2x2 Downtown Urban Grid',
                  desc: '4 interconnected intersections with parallel arterial avenues for route choice and spillback testing.',
                  nodes: '12 Nodes',
                  edges: '12 Roads',
                },
                {
                  id: 'arterial',
                  title: 'Arterial Bypass with T-Junction',
                  desc: 'High-speed 3-lane expressway with a local feeder ramp meeting at an adaptive signal.',
                  nodes: '4 Nodes',
                  edges: '3 Roads',
                },
              ].map((tmpl) => (
                <div
                  key={tmpl.id}
                  onClick={() => loadPreset(tmpl.id as any)}
                  className="p-3.5 bg-slate-950/60 hover:bg-slate-800/60 border border-slate-800 rounded-xl cursor-pointer transition space-y-1.5 group"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200 group-hover:text-cyan-400 transition">
                      {tmpl.title}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">{tmpl.nodes} • {tmpl.edges}</span>
                  </div>
                  <p className="text-[11px] text-slate-400">{tmpl.desc}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
