import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar.tsx';
import { Toolbar } from './components/Toolbar.tsx';
import { CanvasViewport } from './components/CanvasViewport.tsx';
import { Inspector } from './components/Inspector.tsx';
import { SimulationControls } from './components/SimulationControls.tsx';
import { MetricsOverlay } from './components/MetricsOverlay.tsx';
import { MapManagerModal } from './components/MapManagerModal.tsx';
import { ScenarioEditorModal } from './components/ScenarioEditorModal.tsx';
import { ComparisonDashboard } from './components/ComparisonDashboard.tsx';
import { PastRunsModal } from './components/PastRunsModal.tsx';
import { useSocketSimulation } from './hooks/useSocketSimulation.ts';
import { fetchMaps } from './api/client.ts';
import type { 
  IntersectionNode, 
  RoadSegment, 
  EditorTool, 
  SelectedElement, 
  MapData, 
  ViewportTransform 
} from './types.ts';

// Canonical fallback 4-way map
const DEFAULT_INITIAL_MAP: MapData = {
  name: 'Default 4-Way Intersection',
  description: 'Canonical 4-arm cross intersection with East-West and North-South flows.',
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
    { id: 'road_W_C', fromNodeId: 'node_west', toNodeId: 'node_center', length: 250, speedLimit: 13.89, lanes: 2, isOneWay: true },
    { id: 'road_S_C', fromNodeId: 'node_south', toNodeId: 'node_center', length: 250, speedLimit: 13.89, lanes: 1, isOneWay: true },
    { id: 'road_C_E', fromNodeId: 'node_center', toNodeId: 'node_east', length: 250, speedLimit: 13.89, lanes: 2, isOneWay: true },
    { id: 'road_C_N', fromNodeId: 'node_center', toNodeId: 'node_north', length: 250, speedLimit: 13.89, lanes: 1, isOneWay: true },
  ],
};

export const App: React.FC = () => {
  // App UI State
  const [activeMode, setActiveMode] = useState<'editor' | 'simulation' | 'comparison'>('editor');
  const [currentTool, setCurrentTool] = useState<EditorTool>('select');
  const [gridSnap, setGridSnap] = useState(true);
  const [roadMode, setRoadMode] = useState<'two-way' | 'one-way'>('two-way');
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [isScenarioModalOpen, setIsScenarioModalOpen] = useState(false);
  const [isPastRunsModalOpen, setIsPastRunsModalOpen] = useState(false);
  const [stagedScenario, setStagedScenario] = useState<any>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Map Data State
  const [mapId, setMapId] = useState<string | null>('map_default_4way');
  const [mapName, setMapName] = useState('Default 4-Way Intersection');
  const [nodes, setNodes] = useState<IntersectionNode[]>(DEFAULT_INITIAL_MAP.nodes);
  const [edges, setEdges] = useState<RoadSegment[]>(DEFAULT_INITIAL_MAP.edges);
  const [mapOdPairs, setMapOdPairs] = useState<any[] | undefined>(undefined);
  const [availableMaps, setAvailableMaps] = useState<MapData[]>([]);
  const [selection, setSelection] = useState<SelectedElement | null>(null);

  // Viewport Transform (Center initial 4-way intersection)
  const [viewport, setViewport] = useState<ViewportTransform>({
    x: 400,
    y: 300,
    zoom: 1.0,
  });

  // Simulation State & WebSockets
  const [seed, setSeed] = useState(42);
  const sim = useSocketSimulation();

  // Load existing maps on startup
  useEffect(() => {
    fetchMaps()
      .then((maps) => {
        if (maps && maps.length > 0) {
          setAvailableMaps(maps);
          loadMap(maps[0]);
        }
      })
      .catch((err) => {
        console.warn('Using local fallback map, backend will connect when ready:', err.message);
      });
  }, []);

  // Keyboard Shortcuts for viva & speed
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'v' || e.key === 'V') setCurrentTool('select');
      else if (e.key === 'n' || e.key === 'N') setCurrentTool('add_node');
      else if (e.key === 'e' || e.key === 'E') setCurrentTool('draw_edge');
      else if (e.key === 'd' || e.key === 'D') setCurrentTool('delete');
      else if (e.key === 'h' || e.key === 'H') setCurrentTool('pan');
      else if (e.key === 'Escape') {
        setSelection(null);
        setCurrentTool('select');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const loadMap = (data: MapData) => {
    setMapId(data.id || data._id || null);
    setMapName(data.name || 'Untitled Map');
    setNodes(data.nodes || []);
    setEdges(data.edges || []);
    setMapOdPairs(data.odPairs);
    setSelection(null);
    setHasUnsavedChanges(false);

    // Center viewport on map bounding box
    if (data.nodes && data.nodes.length > 0) {
      const avgX = data.nodes.reduce((sum, n) => sum + n.x, 0) / data.nodes.length;
      const avgY = data.nodes.reduce((sum, n) => sum + n.y, 0) / data.nodes.length;
      setViewport({ x: avgX, y: avgY, zoom: 1.0 });
    }
  };

  // Node Management Handlers
  const handleAddNode = useCallback((x: number, y: number) => {
    const newId = `node_${nodes.length + 1}_${Date.now().toString().slice(-4)}`;
    const newNode: IntersectionNode = {
      id: newId,
      x,
      y,
      controlType: 'unsignalized',
      incomingEdgeIds: [],
      outgoingEdgeIds: [],
    };
    setNodes((prev) => [...prev, newNode]);
    setSelection({ type: 'node', id: newId });
    setHasUnsavedChanges(true);
  }, [nodes.length]);

  const handleMoveNode = useCallback((nodeId: string, x: number, y: number) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, x, y } : n))
    );
    // Recalculate lengths for all incident edges
    setEdges((prev) =>
      prev.map((e) => {
        if (e.fromNodeId === nodeId || e.toNodeId === nodeId) {
          const from = e.fromNodeId === nodeId ? { x, y } : nodes.find((n) => n.id === e.fromNodeId);
          const to = e.toNodeId === nodeId ? { x, y } : nodes.find((n) => n.id === e.toNodeId);
          if (from && to) {
            const length = Math.round(Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2));
            return { ...e, length: Math.max(10, length) };
          }
        }
        return e;
      })
    );
    setHasUnsavedChanges(true);
  }, [nodes]);

  const handleUpdateNode = useCallback((nodeId: string, updates: Partial<IntersectionNode>) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, ...updates } : n))
    );
    setHasUnsavedChanges(true);
  }, []);

  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.fromNodeId !== nodeId && e.toNodeId !== nodeId));
    setSelection(null);
    setHasUnsavedChanges(true);
  }, []);

  // Road Edge Management Handlers
  const handleAddEdge = useCallback((fromNodeId: string, toNodeId: string, isOneWay: boolean) => {
    const fromNode = nodes.find((n) => n.id === fromNodeId);
    const toNode = nodes.find((n) => n.id === toNodeId);
    if (!fromNode || !toNode) return;

    const length = Math.max(10, Math.round(Math.sqrt((toNode.x - fromNode.x) ** 2 + (toNode.y - fromNode.y) ** 2)));

    const forwardId = `road_${fromNodeId}_${toNodeId}`;
    const newEdges: RoadSegment[] = [
      {
        id: forwardId,
        fromNodeId,
        toNodeId,
        length,
        lanes: 2,
        speedLimit: 13.89, // 50 km/h
        isOneWay,
        isClosed: false,
      },
    ];

    if (!isOneWay) {
      const backwardId = `road_${toNodeId}_${fromNodeId}`;
      newEdges.push({
        id: backwardId,
        fromNodeId: toNodeId,
        toNodeId: fromNodeId,
        length,
        lanes: 2,
        speedLimit: 13.89,
        isOneWay: false,
        isClosed: false,
      });
    }

    setEdges((prev) => [...prev, ...newEdges]);
    setSelection({ type: 'edge', id: forwardId });
    setHasUnsavedChanges(true);
  }, [nodes]);

  const handleUpdateEdge = useCallback((edgeId: string, updates: Partial<RoadSegment>) => {
    setEdges((prev) =>
      prev.map((e) => (e.id === edgeId ? { ...e, ...updates } : e))
    );
    setHasUnsavedChanges(true);
  }, []);

  const handleDeleteEdge = useCallback((edgeId: string) => {
    setEdges((prev) => prev.filter((e) => e.id !== edgeId));
    setSelection(null);
    setHasUnsavedChanges(true);
  }, []);

  const handleClearMap = useCallback(() => {
    if (confirm('Are you sure you want to clear the entire map?')) {
      setNodes([]);
      setEdges([]);
      setSelection(null);
      setHasUnsavedChanges(true);
    }
  }, []);

  const handleResetView = useCallback(() => {
    if (nodes.length === 0) {
      setViewport({ x: 400, y: 300, zoom: 1.0 });
      return;
    }
    const avgX = nodes.reduce((sum, n) => sum + n.x, 0) / nodes.length;
    const avgY = nodes.reduce((sum, n) => sum + n.y, 0) / nodes.length;
    setViewport({ x: avgX, y: avgY, zoom: 1.0 });
  }, [nodes]);

  // Simulation Trigger Handlers
  const handleStartSim = () => {
    // Start simulation using mapId or live canvas geometry
    sim.startSimulation(mapId || undefined, {
      customMap: { nodes, edges },
      seed,
      speedMultiplier: sim.speed,
    });
    setActiveMode('simulation');
  };

  return (
    <div className="flex flex-col w-screen h-screen bg-slate-100 text-slate-900 overflow-hidden font-sans">
      {/* Top Navigation Bar */}
      <Navbar
        mapName={mapName}
        activeMode={activeMode}
        setActiveMode={setActiveMode}
        isRunning={sim.isRunning}
        isPaused={sim.isPaused}
        onStartSimulation={handleStartSim}
        onPauseSimulation={sim.pauseSimulation}
        onResumeSimulation={sim.resumeSimulation}
        onStopSimulation={sim.stopSimulation}
        onOpenMapManager={() => setIsMapModalOpen(true)}
        onOpenScenarioModal={() => setIsScenarioModalOpen(true)}
        onOpenPastRuns={() => setIsPastRunsModalOpen(true)}
        isConnected={sim.isConnected}
        hasUnsavedChanges={hasUnsavedChanges}
      />

      {/* Main Content Area */}
      {activeMode === 'comparison' ? (
        <ComparisonDashboard
          baseMap={{ id: mapId || undefined, name: mapName, nodes, edges, odPairs: mapOdPairs }}
          availableMaps={availableMaps}
          onSelectMap={(targetMap) => {
            loadMap(targetMap);
          }}
          onOpenScenarioModal={() => setIsScenarioModalOpen(true)}
          stagedScenario={stagedScenario}
        />
      ) : (
        <div className="relative flex-1 w-full h-full flex overflow-hidden">
          {/* Editor Toolbar (Visible in Editor Mode) */}
          {activeMode === 'editor' && (
            <Toolbar
              currentTool={currentTool}
              setCurrentTool={setCurrentTool}
              gridSnap={gridSnap}
              setGridSnap={setGridSnap}
              onResetView={handleResetView}
              onClearMap={handleClearMap}
              roadMode={roadMode}
              setRoadMode={setRoadMode}
              nodeCount={nodes.length}
              edgeCount={edges.length}
            />
          )}

          {/* 2D HTML5 Canvas Viewport */}
          <CanvasViewport
            activeMode={activeMode}
            currentTool={currentTool}
            gridSnap={gridSnap}
            roadMode={roadMode}
            nodes={nodes}
            edges={edges}
            selection={selection}
            onSelect={setSelection}
            onAddNode={handleAddNode}
            onAddEdge={handleAddEdge}
            onMoveNode={handleMoveNode}
            onDeleteNode={handleDeleteNode}
            onDeleteEdge={handleDeleteEdge}
            simulationFrame={sim.currentFrame}
            viewport={viewport}
            setViewport={setViewport}
          />

          {/* Inspector Sidebar (when element selected in Editor mode) */}
          {activeMode === 'editor' && (
            <Inspector
              selection={selection}
              nodes={nodes}
              edges={edges}
              onUpdateNode={handleUpdateNode}
              onUpdateEdge={handleUpdateEdge}
              onDeleteNode={handleDeleteNode}
              onDeleteEdge={handleDeleteEdge}
              onClose={() => setSelection(null)}
            />
          )}

          {/* Metrics Telemetry HUD (Visible in Simulation Mode) */}
          {activeMode === 'simulation' && (
            <MetricsOverlay
              metrics={sim.metrics}
              isRunning={sim.isRunning}
            />
          )}

          {/* Bottom Playback Controls HUD (Visible in Simulation Mode) */}
          {activeMode === 'simulation' && (
            <SimulationControls
              isRunning={sim.isRunning}
              isPaused={sim.isPaused}
              currentTime={sim.currentFrame?.time ?? 0}
              speed={sim.speed}
              seed={seed}
              onStart={handleStartSim}
              onPause={sim.pauseSimulation}
              onResume={sim.resumeSimulation}
              onStep={sim.stepSimulation}
              onStop={sim.stopSimulation}
              onSetSpeed={sim.setSpeedMultiplier}
              onSetSeed={setSeed}
            />
          )}
        </div>
      )}

      {/* Map Manager / Template Modal */}
      <MapManagerModal
        isOpen={isMapModalOpen}
        onClose={() => setIsMapModalOpen(false)}
        currentNodes={nodes}
        currentEdges={edges}
        currentMapName={mapName}
        onLoadMap={loadMap}
      />

      {/* Scenario Editor / Studio Modal */}
      <ScenarioEditorModal
        isOpen={isScenarioModalOpen}
        onClose={() => setIsScenarioModalOpen(false)}
        baseMap={{ id: mapId || undefined, name: mapName, nodes, edges }}
        onRunComparison={(scenario) => {
          setStagedScenario(scenario);
          setActiveMode('comparison');
        }}
      />

      {/* Past Runs History Modal */}
      <PastRunsModal
        isOpen={isPastRunsModalOpen}
        onClose={() => setIsPastRunsModalOpen(false)}
        onInspectRun={(_run) => {
          setIsPastRunsModalOpen(false);
          setActiveMode('comparison');
        }}
      />
    </div>
  );
};
