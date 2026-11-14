import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  RotateCcw, 
  Sliders, 
  TrendingDown, 
  TrendingUp, 
  Minus, 
  CheckCircle2, 
  AlertTriangle, 
  Zap, 
  Clock, 
  Gauge, 
  ArrowRight,
  Layers,
  Sparkles,
  BarChart3,
  Split,
  Eye,
  GitBranch,
  Table,
  Download,
  FileText,
  History
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import { 
  compareSimulations, 
  fetchScenarios,
  fetchMaps
} from '../api/client.ts';
import type { 
  MapData, 
  ScenarioData, 
  ScenarioModifications, 
  SimulationComparisonResult,
  RoadSegment,
  IntersectionNode
} from '../types.ts';
import { ReportModal } from './ReportModal.tsx';
import { PastRunsModal } from './PastRunsModal.tsx';

interface ComparisonDashboardProps {
  baseMap: MapData;
  availableMaps?: MapData[];
  onSelectMap?: (map: MapData) => void;
  onOpenScenarioModal: () => void;
  stagedScenario?: ScenarioData | {
    baseMapId: string;
    scenarioName: string;
    modifications: ScenarioModifications;
    demandMultiplier: number;
    seed: number;
    odPairs?: any[];
  } | null;
}

export const ComparisonDashboard: React.FC<ComparisonDashboardProps> = ({
  baseMap,
  availableMaps,
  onSelectMap,
  onOpenScenarioModal,
  stagedScenario,
}) => {
  const [mapList, setMapList] = useState<MapData[]>(availableMaps || []);
  const [scenarios, setScenarios] = useState<ScenarioData[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('custom_staged');
  const [seed, setSeed] = useState<number>(42);
  const [durationSeconds, setDurationSeconds] = useState<number>(600); // 600s default
  const [warmupSeconds, setWarmupSeconds] = useState<number>(60); // 60s warm-up default
  const [replications, setReplications] = useState<number>(5); // 5 paired seeds default
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [comparisonResult, setComparisonResult] = useState<SimulationComparisonResult | null>(null);
  const [activeVisualMode, setActiveVisualMode] = useState<'side_by_side' | 'baseline' | 'scenario'>('side_by_side');
  const [activeChartTab, setActiveChartTab] = useState<'delay' | 'speed' | 'vehicles' | 'throughput'>('delay');
  const [showReplicationsTable, setShowReplicationsTable] = useState<boolean>(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [isPastRunsOpen, setIsPastRunsOpen] = useState<boolean>(false);

  const baseMapId = baseMap.id || baseMap._id || 'map_default_4way';

  // Canvases for visual road network schematic
  const baselineCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scenarioCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Sync available maps
  useEffect(() => {
    if (availableMaps && availableMaps.length > 0) {
      setMapList(availableMaps);
    } else {
      fetchMaps()
        .then((maps) => {
          if (maps && maps.length > 0) setMapList(maps);
        })
        .catch((err) => console.error('Failed to load maps list:', err));
    }
  }, [availableMaps]);

  // Load scenarios for current base map
  useEffect(() => {
    fetchScenarios(baseMapId)
      .then((data) => {
        setScenarios(data);
        if (data.length > 0 && !stagedScenario) {
          setSelectedScenarioId(data[0].id || data[0]._id || 'custom_staged');
        }
      })
      .catch((err) => console.error('Failed to load scenarios:', err));
  }, [baseMapId, stagedScenario]);

  // Auto-run if stagedScenario was passed from ScenarioEditorModal
  useEffect(() => {
    if (stagedScenario) {
      setSelectedScenarioId('custom_staged');
      executeComparison(stagedScenario);
    }
  }, [stagedScenario]);

  // Quick Presets
  const runPreset = (type: 'closure' | 'adaptive' | 'rush') => {
    if (type === 'closure') {
      const matchScen = scenarios.find((s) => s.modifications?.closedEdgeIds?.length > 0 || (s.id || s._id) === 'scen_default_closure');
      if (matchScen) {
        setSelectedScenarioId(matchScen.id || matchScen._id || 'scen_default_closure');
        executeComparison(matchScen);
      } else {
        const targetEdge = baseMap.edges[0]?.id || 'road_W_C';
        executeComparison({
          baseMapId,
          scenarioName: 'West Approach Road Closure',
          demandMultiplier: 1.0,
          seed,
          modifications: {
            closedEdgeIds: [targetEdge],
            signalOverrides: [],
            speedLimitOverrides: [],
          },
        });
      }
    } else if (type === 'adaptive') {
      const matchScen = scenarios.find((s) => s.modifications?.signalOverrides?.some((sig: any) => sig.controlType === 'adaptive_signal') || (s.id || s._id) === 'scen_default_adaptive');
      if (matchScen) {
        setSelectedScenarioId(matchScen.id || matchScen._id || 'scen_default_adaptive');
        executeComparison(matchScen);
      } else {
        const sigMap = baseMap.nodes
          .filter((n) => n.controlType !== 'unsignalized')
          .map((n) => ({ nodeId: n.id, controlType: 'adaptive_signal' as const }));

        executeComparison({
          baseMapId,
          scenarioName: 'Smart Adaptive Signal Upgrade',
          demandMultiplier: 1.0, // Same demand as baseline for isolated signal comparison
          seed,
          modifications: {
            closedEdgeIds: [],
            signalOverrides: sigMap,
            speedLimitOverrides: [],
          },
        });
      }
    } else if (type === 'rush') {
      const matchScen = scenarios.find((s) => s.demandMultiplier > 1 || (s.id || s._id) === 'scen_default_rushhour');
      if (matchScen) {
        setSelectedScenarioId(matchScen.id || matchScen._id || 'scen_default_rushhour');
        executeComparison(matchScen);
      } else {
        executeComparison({
          baseMapId,
          scenarioName: 'Peak Rush Hour Demand (1.8x)',
          demandMultiplier: 1.8,
          seed,
          modifications: {
            closedEdgeIds: [],
            signalOverrides: [],
            speedLimitOverrides: [],
          },
        });
      }
    }
  };

  const handleSelectScenario = (newId: string) => {
    setSelectedScenarioId(newId);
    if (newId === 'custom_staged' && stagedScenario) {
      executeComparison(stagedScenario);
    } else {
      const scen = scenarios.find((s) => (s.id || s._id) === newId);
      if (scen) {
        executeComparison(scen);
      }
    }
  };

  const handleRunClick = () => {
    if (selectedScenarioId === 'custom_staged' && stagedScenario) {
      executeComparison(stagedScenario);
    } else {
      const scen = scenarios.find((s) => (s.id || s._id) === selectedScenarioId);
      if (scen) {
        executeComparison(scen);
      } else {
        runPreset('closure');
      }
    }
  };

  const executeComparison = async (scenarioTarget: any) => {
    try {
      setIsRunning(true);
      const params: any = {
        baseMapId,
        seed,
        durationSeconds,
        warmupSeconds,
        replications,
      };

      if (scenarioTarget.id || scenarioTarget._id) {
        params.scenarioId = scenarioTarget.id || scenarioTarget._id;
        params.scenarioName = scenarioTarget.name;
        params.demandMultiplier = scenarioTarget.demandMultiplier ?? 1.0;
        if (scenarioTarget.odPairs) {
          params.odPairs = scenarioTarget.odPairs;
        }
      } else {
        params.scenarioName = scenarioTarget.scenarioName || 'Custom Staged Scenario';
        params.demandMultiplier = scenarioTarget.demandMultiplier ?? 1.0;
        params.modifications = scenarioTarget.modifications;
        if (scenarioTarget.odPairs) {
          params.odPairs = scenarioTarget.odPairs;
        }
      }

      const result = await compareSimulations(params);
      setComparisonResult(result);
    } catch (err: any) {
      alert(`Simulation comparison failed: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  // CSV Exporter 1: Road-level comparative congestion breakdown
  const handleExportRoadMetricsCSV = () => {
    if (!comparisonResult) return;
    const headers = [
      'road_id',
      'from_node',
      'to_node',
      'length_m',
      'speed_limit_kmh',
      'lanes',
      'status',
      'baseline_density_veh_km',
      'baseline_vc_ratio',
      'baseline_congestion_level',
      'scenario_density_veh_km',
      'scenario_vc_ratio',
      'scenario_congestion_level',
      'vc_ratio_delta',
      'traffic_impact_assessment'
    ];

    const closedEdges = comparisonResult.scenario.modifications?.closedEdgeIds || 
      (stagedScenario as any)?.modifications?.closedEdgeIds || [];

    const rows = baseMap.edges.map((edge) => {
      const bCong = comparisonResult.baseline.roadCongestion[edge.id];
      const sCong = comparisonResult.scenario.roadCongestion[edge.id];
      const isClosed = closedEdges.includes(edge.id);
      const bVc = bCong ? bCong.volumeToCapacityRatio : 0;
      const sVc = sCong ? sCong.volumeToCapacityRatio : 0;
      const dVc = sVc - bVc;

      const remainingOutgoing = baseMap.edges.filter(
        (e) => e.fromNodeId === edge.fromNodeId && !closedEdges.includes(e.id)
      );
      const hasAlternate = remainingOutgoing.length > 0;

      let impact = 'Unchanged';
      if (isClosed) {
        impact = hasAlternate ? 'Traffic Diverted to alternate path' : 'No alternate route (Demand dropped)';
      } else if (dVc > 0.1) {
        impact = `+${dVc.toFixed(2)} (Higher flow / Spillover)`;
      } else if (dVc < -0.1) {
        impact = `${dVc.toFixed(2)} (Relieved / Lower flow)`;
      }

      return [
        edge.id,
        edge.fromNodeId,
        edge.toNodeId,
        edge.length,
        (edge.speedLimit * 3.6).toFixed(1),
        edge.lanes,
        isClosed ? 'CLOSED' : 'OPEN',
        (bCong?.density || 0).toFixed(2),
        bVc.toFixed(2),
        bCong?.congestionLevel || 'FREE_FLOW',
        isClosed ? '0.00' : (sCong?.density || 0).toFixed(2),
        isClosed ? '0.00' : sVc.toFixed(2),
        isClosed ? 'N/A' : (sCong?.congestionLevel || 'FREE_FLOW'),
        isClosed ? 'N/A' : dVc.toFixed(2),
        `"${impact}"`
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `citysim_road_congestion_seed${comparisonResult.baseline.seed}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // CSV Exporter 2: Network-level continuous time-series metrics
  const handleExportTimeSeriesCSV = () => {
    if (!comparisonResult || !comparisonResult.comparativeTimeSeries) return;
    const series = comparisonResult.comparativeTimeSeries;
    const headers = [
      'time_s',
      'baseline_wait_time_s',
      'scenario_wait_time_s',
      'baseline_mean_speed_kmh',
      'scenario_mean_speed_kmh',
      'baseline_active_vehicles',
      'scenario_active_vehicles',
      'baseline_completed_trips',
      'scenario_completed_trips',
    ];

    const rows = series.map((row) => [
      row.time,
      row.baselineWaitTime.toFixed(2),
      row.scenarioWaitTime.toFixed(2),
      row.baselineSpeed.toFixed(2),
      row.scenarioSpeed.toFixed(2),
      row.baselineActiveVehicles,
      row.scenarioActiveVehicles,
      row.baselineCompleted,
      row.scenarioCompleted,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `citysim_time_series_seed${comparisonResult.baseline.seed}_${durationSeconds}s.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Draw schematic road network on canvases
  useEffect(() => {
    if (baselineCanvasRef.current) {
      drawNetworkSchematic(baselineCanvasRef.current, baseMap, comparisonResult?.baseline.roadCongestion, false);
    }
    if (scenarioCanvasRef.current) {
      const closedIds = comparisonResult?.scenario.aggregateMetrics ? 
        (stagedScenario as any)?.modifications?.closedEdgeIds || 
        scenarios.find((s) => (s.id || s._id) === selectedScenarioId)?.modifications?.closedEdgeIds || [] : [];
      drawNetworkSchematic(scenarioCanvasRef.current, baseMap, comparisonResult?.scenario.roadCongestion, true, closedIds);
    }
  }, [baseMap, comparisonResult, activeVisualMode]);

  const drawNetworkSchematic = (
    canvas: HTMLCanvasElement,
    map: MapData,
    congestionData?: Record<string, any>,
    isScenario = false,
    closedEdgeIds: string[] = []
  ) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    // Off-white Day Mode schematic canvas background
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, height);

    if (map.nodes.length === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    map.nodes.forEach((n) => {
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y);
    });

    const padding = 45;
    const mapW = Math.max(10, maxX - minX);
    const mapH = Math.max(10, maxY - minY);
    const scale = Math.min((width - padding * 2) / mapW, (height - padding * 2) / mapH);

    const transformX = (x: number) => padding + (x - minX) * scale;
    const transformY = (y: number) => padding + (y - minY) * scale;

    // Sort edges so open edges are drawn first and closed edges are drawn on top
    const sortedEdges = [...map.edges].sort((a, b) => {
      const aClosed = isScenario && (a.isClosed || closedEdgeIds.includes(a.id));
      const bClosed = isScenario && (b.isClosed || closedEdgeIds.includes(b.id));
      if (aClosed && !bClosed) return 1;
      if (!aClosed && bClosed) return -1;
      return 0;
    });

    // Draw Edges
    sortedEdges.forEach((edge) => {
      const fromNode = map.nodes.find((n) => n.id === edge.fromNodeId);
      const toNode = map.nodes.find((n) => n.id === edge.toNodeId);
      if (!fromNode || !toNode) return;

      const x1 = transformX(fromNode.x);
      const y1 = transformY(fromNode.y);
      const x2 = transformX(toNode.x);
      const y2 = transformY(toNode.y);

      // Check if reverse edge exists for lateral separation of opposing lanes
      const hasReverse = map.edges.some(
        (e) => e.fromNodeId === edge.toNodeId && e.toNodeId === edge.fromNodeId
      );
      let drawX1 = x1, drawY1 = y1, drawX2 = x2, drawY2 = y2;
      if (hasReverse) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const offset = 3.0; // 3px lateral offset to the right of forward direction
        drawX1 = x1 + nx * offset;
        drawY1 = y1 + ny * offset;
        drawX2 = x2 + nx * offset;
        drawY2 = y2 + ny * offset;
      }

      const isClosed = isScenario && (edge.isClosed || closedEdgeIds.includes(edge.id));
      const cong = congestionData ? congestionData[edge.id] : null;

      let strokeColor = '#334155';
      if (isClosed) {
        strokeColor = '#e11d48';
      } else if (cong) {
        switch (cong.congestionLevel) {
          case 'FREE_FLOW': strokeColor = '#10b981'; break;
          case 'MODERATE': strokeColor = '#eab308'; break;
          case 'HEAVY': strokeColor = '#f97316'; break;
          case 'CONGESTED': strokeColor = '#ef4444'; break;
          default: strokeColor = '#334155';
        }
      }

      ctx.save();
      ctx.lineWidth = hasReverse ? 5 : 8;
      ctx.strokeStyle = strokeColor;
      ctx.lineCap = 'round';

      if (isClosed) {
        ctx.setLineDash([8, 6]);
      } else {
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.moveTo(drawX1, drawY1);
      ctx.lineTo(drawX2, drawY2);
      ctx.stroke();

      if (!isClosed) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#f8fafc33';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(drawX1, drawY1);
        ctx.lineTo(drawX2, drawY2);
        ctx.stroke();
      }

      const midX = (drawX1 + drawX2) / 2;
      const midY = (drawY1 + drawY2) / 2;
      if (isClosed) {
        ctx.font = 'bold 10px sans-serif';
        ctx.fillStyle = '#fee2e2';
        ctx.fillText('🚧 CLOSED', midX - 25, midY - 8);
      } else if (cong && cong.densityRatio > 0.05) {
        ctx.font = '9px monospace';
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText(`V/C: ${cong.volumeToCapacityRatio?.toFixed(2) || '0.00'}`, midX - 18, midY - 6);
      }

      ctx.restore();
    });

    // Draw Nodes
    map.nodes.forEach((node) => {
      const nx = transformX(node.x);
      const ny = transformY(node.y);

      ctx.save();
      ctx.beginPath();
      ctx.arc(nx, ny, 10, 0, Math.PI * 2);

      if (node.controlType === 'adaptive_signal' || (isScenario && (stagedScenario as any)?.modifications?.signalOverrides?.some((s: any) => s.nodeId === node.id && s.controlType === 'adaptive_signal'))) {
        ctx.fillStyle = '#059669';
        ctx.strokeStyle = '#34d399';
      } else if (node.controlType === 'fixed_signal') {
        ctx.fillStyle = '#d97706';
        ctx.strokeStyle = '#fbbf24';
      } else {
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = '#64748b';
      }

      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();

      ctx.font = '9px sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(node.id, nx - 12, ny + 18);
      ctx.restore();
    });
  };

  const deltas = comparisonResult?.deltas;
  const baselineMetrics = comparisonResult?.baseline.aggregateMetrics;
  const scenarioMetrics = comparisonResult?.scenario.aggregateMetrics;
  const replicationsData = comparisonResult?.replications || [];

  return (
    <div className="flex-1 bg-slate-100 flex flex-col overflow-y-auto select-none text-slate-800 p-6 space-y-6">
      
      {/* Header & Controls Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs text-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">
                <Split className="w-4 h-4" />
              </span>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Before / After Scenario Comparison
              </h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                Paired Dual-Run Engine
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Paired comparison runs using synchronized random seeds (Common Random Numbers variance reduction) isolate scenario intervention effects across multi-seed replications.
            </p>
          </div>

          {/* Action & Configuration Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Map Selector */}
            {mapList.length > 1 && (
              <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-700">
                <span className="text-slate-500">Map:</span>
                <select
                  value={baseMap.id || baseMap._id || ''}
                  onChange={(e) => {
                    const found = mapList.find((m) => (m.id || m._id) === e.target.value);
                    if (found && onSelectMap) {
                      onSelectMap(found);
                    }
                  }}
                  className="bg-transparent font-semibold text-slate-800 focus:outline-none"
                >
                  {mapList.map((m) => (
                    <option key={m.id || m._id} value={m.id || m._id} className="bg-white text-slate-800">
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Scenario Selector */}
            <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-700">
              <span className="text-slate-500">Scenario:</span>
              <select
                value={selectedScenarioId}
                onChange={(e) => handleSelectScenario(e.target.value)}
                className="bg-transparent font-semibold text-slate-800 focus:outline-none"
              >
                {stagedScenario && (
                  <option value="custom_staged" className="bg-white text-indigo-700 font-bold">
                    ★ {(stagedScenario as any).name || (stagedScenario as any).scenarioName || 'Custom Staged Scenario'}
                  </option>
                )}
                {scenarios.map((s) => (
                  <option key={s.id || s._id} value={s.id || s._id} className="bg-white text-slate-800">
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Seed Input */}
            <div className="flex items-center gap-1 bg-slate-100 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-700">
              <span className="text-slate-500">Base Seed:</span>
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(parseInt(e.target.value) || 42)}
                className="w-12 bg-transparent text-center font-mono font-bold text-indigo-600 focus:outline-none"
              />
            </div>

            {/* Duration Selector: 300s, 600s (default), 900s */}
            <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-700">
              <span className="text-slate-500">Duration:</span>
              <select
                value={durationSeconds}
                onChange={(e) => setDurationSeconds(parseInt(e.target.value))}
                className="bg-transparent font-semibold text-slate-800 focus:outline-none"
              >
                <option value={300} className="bg-white text-slate-800">300s (5 min)</option>
                <option value={600} className="bg-white text-slate-800">600s (10 min - Recommended)</option>
                <option value={900} className="bg-white text-slate-800">900s (15 min - Deep Stress)</option>
              </select>
            </div>

            {/* Replications Selector: 1, 3, 5 (default), 10 */}
            <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-700">
              <span className="text-slate-500">Replications:</span>
              <select
                value={replications}
                onChange={(e) => setReplications(parseInt(e.target.value))}
                className="bg-transparent font-semibold text-slate-800 focus:outline-none"
              >
                <option value={1} className="bg-white text-slate-800">1 Paired Seed</option>
                <option value={3} className="bg-white text-slate-800">3 Paired Seeds</option>
                <option value={5} className="bg-white text-slate-800">5 Paired Seeds (Default)</option>
                <option value={10} className="bg-white text-slate-800">10 Paired Seeds</option>
              </select>
            </div>

            {/* Modify Scenario Button */}
            <button
              onClick={onOpenScenarioModal}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition shadow-2xs"
            >
              <Sliders className="w-3.5 h-3.5 text-indigo-600" />
              <span>Scenario Studio</span>
            </button>

            {/* Executive PDF Report Button */}
            {comparisonResult && (
              <button
                onClick={() => setIsReportModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition shadow-2xs"
                title="View and print executive summary PDF report"
              >
                <FileText className="w-3.5 h-3.5 text-indigo-600" />
                <span>Executive Report</span>
              </button>
            )}

            {/* Past Runs History Button */}
            <button
              onClick={() => setIsPastRunsOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition shadow-2xs"
              title="Browse and inspect previous simulation runs"
            >
              <History className="w-3.5 h-3.5 text-cyan-600" />
              <span>Past Runs</span>
            </button>

            {/* Run Dual Simulation Button */}
            <button
              onClick={handleRunClick}
              disabled={isRunning}
              className="flex items-center gap-2 px-4 py-1.5 text-xs font-bold rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white shadow-md shadow-indigo-600/20 transition disabled:opacity-50"
            >
              {isRunning ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Simulating {replications} Paired Runs...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Run Dual Comparison</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Quick Presets Sub-bar */}
        <div className="mt-4 pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span className="font-semibold text-slate-700">Quick Test Scenarios:</span>
            </div>
            <span className="text-[11px] text-slate-500">
              Warm-up: <span className="font-mono font-bold text-cyan-700">60s</span> (cold-start transient discarded from KPIs)
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => runPreset('closure')}
              disabled={isRunning}
              className="px-2.5 py-1 text-xs rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 transition font-semibold flex items-center gap-1.5"
            >
              <AlertTriangle className="w-3 h-3 text-rose-600" />
              <span>🚧 West Road Closure</span>
            </button>
            <button
              onClick={() => runPreset('adaptive')}
              disabled={isRunning}
              className="px-2.5 py-1 text-xs rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition font-semibold flex items-center gap-1.5"
            >
              <Zap className="w-3 h-3 text-emerald-600" />
              <span>🚦 Adaptive Signal Upgrade</span>
            </button>
            <button
              onClick={() => runPreset('rush')}
              disabled={isRunning}
              className="px-2.5 py-1 text-xs rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 transition font-semibold flex items-center gap-1.5"
            >
              <Gauge className="w-3 h-3 text-amber-600" />
              <span>🚗 Rush Hour (1.8x Demand)</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Delta Cards (with Mean ± SD across replications and 95% Confidence Intervals) */}
      {comparisonResult ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Delta 1: Stopped Delay / Average Wait Time */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col justify-between text-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-600" />
                Avg Stopped Wait Time
              </span>
              <span 
                className={`text-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                  !deltas!.isWaitTimeSignificant
                    ? 'bg-slate-100 text-slate-600 border border-slate-200'
                    : deltas!.deltaAvgWaitTime < 0 
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                }`}
                title={deltas!.deltaAvgWaitTimeCI ? `95% CI: [${deltas!.deltaAvgWaitTimeCI[0]}s, ${deltas!.deltaAvgWaitTimeCI[1]}s]` : undefined}
              >
                {!deltas!.isWaitTimeSignificant ? (
                  <>
                    <Minus className="w-3 h-3 text-slate-500" />
                    <span>Not Significant</span>
                  </>
                ) : (
                  <>
                    {deltas!.deltaAvgWaitTime < 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                    <span>{deltas!.pctChangeAvgWaitTime > 0 ? `+${deltas!.pctChangeAvgWaitTime}%` : `${deltas!.pctChangeAvgWaitTime}%`}</span>
                  </>
                )}
              </span>
            </div>

            <div className="my-2">
              <div className="text-2xl font-black font-mono tracking-tight text-slate-900 flex items-baseline gap-2 flex-wrap">
                <span>{(deltas?.scenarioMeanWaitTime ?? scenarioMetrics?.averageWaitTime ?? 0).toFixed(1)}s</span>
                <span className={`text-sm font-bold ${
                  !deltas!.isWaitTimeSignificant 
                    ? 'text-slate-500' 
                    : deltas!.deltaAvgWaitTime < 0 
                    ? 'text-emerald-600' 
                    : 'text-rose-600'
                }`}>
                  {deltas!.deltaAvgWaitTime > 0 ? `+${deltas!.deltaAvgWaitTime.toFixed(1)}s` : `${deltas!.deltaAvgWaitTime.toFixed(1)}s`}
                  {deltas!.deltaAvgWaitTimeStdDev !== undefined && deltas!.deltaAvgWaitTimeStdDev > 0 && (
                    <span className="text-xs font-mono text-slate-400 font-normal"> ± {deltas!.deltaAvgWaitTimeStdDev.toFixed(1)}s</span>
                  )}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Baseline (Mean): <span className="font-mono text-slate-700 font-bold">{(deltas?.baselineMeanWaitTime ?? baselineMetrics?.averageWaitTime ?? 0).toFixed(1)}s</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-100 flex items-center justify-between">
              <span>
                {!deltas!.isWaitTimeSignificant 
                  ? '⚪ No significant difference' 
                  : deltas!.deltaAvgWaitTime < 0 
                  ? '🟢 Delay reduced' 
                  : '🔴 Delay increased'}
              </span>
              <span className="text-[10px] text-slate-400" title={deltas!.deltaAvgWaitTimeCI ? `95% CI: [${deltas!.deltaAvgWaitTimeCI[0]}s, ${deltas!.deltaAvgWaitTimeCI[1]}s]` : ''}>
                Mean across {deltas!.replicationsCount || 5} pairs
              </span>
            </div>
          </div>

          {/* Delta 2: Average Travel Time */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col justify-between text-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-cyan-600" />
                Avg Travel Time
              </span>
              <span 
                className={`text-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                  !deltas!.isTravelTimeSignificant
                    ? 'bg-slate-100 text-slate-600 border border-slate-200'
                    : deltas!.deltaAvgTravelTime < 0 
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                }`}
                title={deltas!.deltaAvgTravelTimeCI ? `95% CI: [${deltas!.deltaAvgTravelTimeCI[0]}s, ${deltas!.deltaAvgTravelTimeCI[1]}s]` : undefined}
              >
                {!deltas!.isTravelTimeSignificant ? (
                  <>
                    <Minus className="w-3 h-3 text-slate-500" />
                    <span>Not Significant</span>
                  </>
                ) : (
                  <>
                    {deltas!.deltaAvgTravelTime < 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                    <span>{deltas!.pctChangeAvgTravelTime > 0 ? `+${deltas!.pctChangeAvgTravelTime}%` : `${deltas!.pctChangeAvgTravelTime}%`}</span>
                  </>
                )}
              </span>
            </div>

            <div className="my-2">
              <div className="text-2xl font-black font-mono tracking-tight text-slate-900 flex items-baseline gap-2 flex-wrap">
                <span>{(deltas?.scenarioMeanTravelTime ?? scenarioMetrics?.averageTravelTime ?? 0).toFixed(1)}s</span>
                <span className={`text-sm font-bold ${
                  !deltas!.isTravelTimeSignificant
                    ? 'text-slate-500'
                    : deltas!.deltaAvgTravelTime < 0 
                    ? 'text-emerald-600' 
                    : 'text-rose-600'
                }`}>
                  {deltas!.deltaAvgTravelTime > 0 ? `+${deltas!.deltaAvgTravelTime.toFixed(1)}s` : `${deltas!.deltaAvgTravelTime.toFixed(1)}s`}
                  {deltas!.deltaAvgTravelTimeStdDev !== undefined && deltas!.deltaAvgTravelTimeStdDev > 0 && (
                    <span className="text-xs font-mono text-slate-400 font-normal"> ± {deltas!.deltaAvgTravelTimeStdDev.toFixed(1)}s</span>
                  )}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Baseline (Mean): <span className="font-mono text-slate-700 font-bold">{(deltas?.baselineMeanTravelTime ?? baselineMetrics?.averageTravelTime ?? 0).toFixed(1)}s</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-100 flex items-center justify-between">
              <span>Trip duration for completed trips</span>
              <span className="text-[10px] text-slate-400" title={deltas!.deltaAvgTravelTimeCI ? `95% CI: [${deltas!.deltaAvgTravelTimeCI[0]}s, ${deltas!.deltaAvgTravelTimeCI[1]}s]` : ''}>
                Mean across {deltas!.replicationsCount || 5} pairs
              </span>
            </div>
          </div>

          {/* Delta 3: Network Throughput */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col justify-between text-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5 text-emerald-600" />
                Network Throughput
              </span>
              <span 
                className={`text-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                  !deltas!.isThroughputSignificant
                    ? 'bg-slate-100 text-slate-600 border border-slate-200'
                    : deltas!.deltaThroughput > 0 
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                }`}
                title={deltas!.deltaThroughputCI ? `95% CI: [${deltas!.deltaThroughputCI[0]} veh/h, ${deltas!.deltaThroughputCI[1]} veh/h]` : undefined}
              >
                {!deltas!.isThroughputSignificant ? (
                  <>
                    <Minus className="w-3 h-3 text-slate-500" />
                    <span>Not Significant</span>
                  </>
                ) : (
                  <>
                    {deltas!.deltaThroughput > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    <span>{deltas!.pctChangeThroughput > 0 ? `+${deltas!.pctChangeThroughput}%` : `${deltas!.pctChangeThroughput}%`}</span>
                  </>
                )}
              </span>
            </div>

            <div className="my-2">
              <div className="text-2xl font-black font-mono tracking-tight text-slate-900 flex items-baseline gap-2 flex-wrap">
                <span>{Math.round(deltas?.scenarioMeanThroughput ?? scenarioMetrics?.throughputPerHour ?? 0)}</span>
                <span className="text-xs text-slate-400 font-semibold">veh/h</span>
                <span className={`text-sm font-bold ${
                  !deltas!.isThroughputSignificant
                    ? 'text-slate-500'
                    : deltas!.deltaThroughput > 0 
                    ? 'text-emerald-600' 
                    : 'text-rose-600'
                }`}>
                  {deltas!.deltaThroughput > 0 ? `+${Math.round(deltas!.deltaThroughput)}` : `${Math.round(deltas!.deltaThroughput)}`}
                  {deltas!.deltaThroughputStdDev !== undefined && deltas!.deltaThroughputStdDev > 0 && (
                    <span className="text-xs font-mono text-slate-400 font-normal"> ± {Math.round(deltas!.deltaThroughputStdDev)}</span>
                  )}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Baseline (Mean): <span className="font-mono text-slate-700 font-bold">{Math.round(deltas?.baselineMeanThroughput ?? baselineMetrics?.throughputPerHour ?? 0)} veh/h</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-100 flex items-center justify-between">
              <span>Completed trips / eval hour</span>
              <span className="text-[10px] text-slate-400" title={deltas!.deltaThroughputCI ? `95% CI: [${deltas!.deltaThroughputCI[0]} veh/h, ${deltas!.deltaThroughputCI[1]} veh/h]` : ''}>
                Mean across {deltas!.replicationsCount || 5} pairs
              </span>
            </div>
          </div>

          {/* Delta 4: Network Mean Speed & Queue */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col justify-between text-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-amber-500" />
                Mean Network Speed
              </span>
              <span 
                className={`text-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                  !deltas!.isSpeedSignificant
                    ? 'bg-slate-100 text-slate-600 border border-slate-200'
                    : deltas!.deltaAvgSpeed > 0 
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                }`}
                title={deltas!.deltaAvgSpeedCI ? `95% CI: [${deltas!.deltaAvgSpeedCI[0]} km/h, ${deltas!.deltaAvgSpeedCI[1]} km/h]` : undefined}
              >
                {!deltas!.isSpeedSignificant ? (
                  <>
                    <Minus className="w-3 h-3 text-slate-500" />
                    <span>Not Significant</span>
                  </>
                ) : (
                  <>
                    {deltas!.deltaAvgSpeed > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    <span>{deltas!.deltaAvgSpeed > 0 ? `+${deltas!.deltaAvgSpeed.toFixed(1)}` : `${deltas!.deltaAvgSpeed.toFixed(1)}`} km/h</span>
                  </>
                )}
              </span>
            </div>

            <div className="my-2">
              <div className="text-2xl font-black font-mono tracking-tight text-slate-900 flex items-baseline gap-2 flex-wrap">
                <span>{(deltas?.scenarioMeanSpeed ?? ((scenarioMetrics?.averageSpeed ?? 0) * 3.6)).toFixed(1)}</span>
                <span className="text-xs text-slate-400 font-semibold">km/h</span>
                <span className={`text-sm font-bold ${
                  !deltas!.isSpeedSignificant
                    ? 'text-slate-500'
                    : deltas!.deltaAvgSpeed > 0 
                    ? 'text-emerald-600' 
                    : 'text-rose-600'
                }`}>
                  {deltas!.deltaAvgSpeed > 0 ? `+${deltas!.deltaAvgSpeed.toFixed(1)}` : `${deltas!.deltaAvgSpeed.toFixed(1)}`}
                  {deltas!.deltaAvgSpeedStdDev !== undefined && deltas!.deltaAvgSpeedStdDev > 0 && (
                    <span className="text-xs font-mono text-slate-400 font-normal"> ± {deltas!.deltaAvgSpeedStdDev.toFixed(1)}</span>
                  )}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Baseline (Mean): <span className="font-mono text-slate-700 font-bold">{(deltas?.baselineMeanSpeed ?? ((baselineMetrics?.averageSpeed ?? 0) * 3.6)).toFixed(1)} km/h</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-100 flex items-center justify-between">
              <span>Completed (Mean): <span className="text-slate-900 font-bold">{deltas?.scenarioMeanCompleted ?? scenarioMetrics?.completedVehiclesCount}</span> veh</span>
              <button 
                onClick={() => setShowReplicationsTable(!showReplicationsTable)}
                className="text-[10px] text-indigo-600 font-semibold hover:underline flex items-center gap-0.5"
              >
                <GitBranch className="w-3 h-3" />
                <span>{showReplicationsTable ? 'Hide Seeds' : 'View Seeds'}</span>
              </button>
            </div>
          </div>

        </div>
      ) : (
        /* Empty State */
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center space-y-4 shadow-2xs">
          <div className="w-16 h-16 mx-auto rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
            <Split className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">No Simulation Comparison Run Yet</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              Select a scenario or click one of the quick test presets above to simulate Baseline vs Modified runs with paired random seeds and 60s warm-up exclusion.
            </p>
          </div>
          <button
            onClick={() => runPreset('closure')}
            disabled={isRunning}
            className="px-5 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition"
          >
            Run {scenarios.find((s) => s.modifications?.closedEdgeIds?.length > 0)?.name || 'Road Closure Test'} ({durationSeconds}s, {replications} Replications)
          </button>
        </div>
      )}

      {/* Multi-Seed Replications Breakdown Table (Expandable) */}
      {comparisonResult && showReplicationsTable && replicationsData.length > 0 && (
        <div className="bg-white border border-indigo-200 rounded-2xl p-5 shadow-xs space-y-3 text-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-indigo-600" />
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Multi-Seed Paired Replications (N = {replicationsData.length} pairs, Common Random Numbers)
              </h3>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              Each pair shares an identical seed between Baseline and Scenario
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-[11px]">
                  <th className="py-2 px-3 font-semibold">Pair #</th>
                  <th className="py-2 px-3 font-semibold">Seed</th>
                  <th className="py-2 px-3 font-semibold">Baseline Wait</th>
                  <th className="py-2 px-3 font-semibold">Scenario Wait</th>
                  <th className="py-2 px-3 font-semibold">Δ Wait</th>
                  <th className="py-2 px-3 font-semibold">Baseline Throughput</th>
                  <th className="py-2 px-3 font-semibold">Scenario Throughput</th>
                  <th className="py-2 px-3 font-semibold">Δ Throughput</th>
                  <th className="py-2 px-3 font-semibold">Δ Travel Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {replicationsData.map((rep, idx) => (
                  <tr key={rep.seed} className="hover:bg-slate-50/80 transition">
                    <td className="py-1.5 px-3 text-slate-500 font-sans font-medium">Pair {idx + 1}</td>
                    <td className="py-1.5 px-3 text-indigo-600 font-bold">{rep.seed}</td>
                    <td className="py-1.5 px-3 text-slate-700">{rep.baselineWait.toFixed(1)}s</td>
                    <td className="py-1.5 px-3 text-slate-700">{rep.scenarioWait.toFixed(1)}s</td>
                    <td className={`py-1.5 px-3 font-bold ${rep.deltaWait < 0 ? 'text-emerald-600' : rep.deltaWait > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                      {rep.deltaWait > 0 ? `+${rep.deltaWait.toFixed(1)}s` : `${rep.deltaWait.toFixed(1)}s`}
                    </td>
                    <td className="py-1.5 px-3 text-slate-700">{Math.round(rep.baselineThroughput)} veh/h</td>
                    <td className="py-1.5 px-3 text-slate-700">{Math.round(rep.scenarioThroughput)} veh/h</td>
                    <td className={`py-1.5 px-3 font-bold ${rep.deltaThroughput > 0 ? 'text-emerald-600' : rep.deltaThroughput < 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                      {rep.deltaThroughput > 0 ? `+${Math.round(rep.deltaThroughput)}` : `${Math.round(rep.deltaThroughput)}`}
                    </td>
                    <td className="py-1.5 px-3 text-slate-700">
                      {rep.deltaTravel > 0 ? `+${rep.deltaTravel.toFixed(1)}s` : `${rep.deltaTravel.toFixed(1)}s`}
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-bold text-slate-900 border-t-2 border-slate-200">
                  <td colSpan={2} className="py-2 px-3 text-indigo-700">Mean ± StdDev</td>
                  <td className="py-2 px-3">-</td>
                  <td className="py-2 px-3">-</td>
                  <td className="py-2 px-3 text-slate-900">
                    {deltas!.deltaAvgWaitTime > 0 ? `+${deltas!.deltaAvgWaitTime.toFixed(1)}s` : `${deltas!.deltaAvgWaitTime.toFixed(1)}s`}
                    {deltas!.deltaAvgWaitTimeStdDev ? ` ± ${deltas!.deltaAvgWaitTimeStdDev.toFixed(1)}s` : ''}
                  </td>
                  <td className="py-2 px-3">-</td>
                  <td className="py-2 px-3">-</td>
                  <td className="py-2 px-3 text-slate-900">
                    {deltas!.deltaThroughput > 0 ? `+${Math.round(deltas!.deltaThroughput)}` : `${Math.round(deltas!.deltaThroughput)}`}
                    {deltas!.deltaThroughputStdDev ? ` ± ${Math.round(deltas!.deltaThroughputStdDev)}` : ''}
                  </td>
                  <td className="py-2 px-3 text-slate-900">
                    {deltas!.deltaAvgTravelTime > 0 ? `+${deltas!.deltaAvgTravelTime.toFixed(1)}s` : `${deltas!.deltaAvgTravelTime.toFixed(1)}s`}
                    {deltas!.deltaAvgTravelTimeStdDev ? ` ± ${deltas!.deltaAvgTravelTimeStdDev.toFixed(1)}s` : ''}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Comparative Visual Network Schematic & Toggle */}
      {comparisonResult && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Eye className="w-4 h-4 text-indigo-600" />
                Spatial Congestion & Impact Visualization
              </h3>
              <p className="text-xs text-slate-500">
                Visual comparison of link density ratios (V/C) and road closure status.
              </p>
            </div>

            {/* Visual View Mode Switcher */}
            <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-medium self-start">
              <button
                onClick={() => setActiveVisualMode('side_by_side')}
                className={`px-3 py-1 rounded-md transition ${
                  activeVisualMode === 'side_by_side' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Side-by-Side Dual View
              </button>
              <button
                onClick={() => setActiveVisualMode('baseline')}
                className={`px-3 py-1 rounded-md transition ${
                  activeVisualMode === 'baseline' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Baseline Only
              </button>
              <button
                onClick={() => setActiveVisualMode('scenario')}
                className={`px-3 py-1 rounded-md transition ${
                  activeVisualMode === 'scenario' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Modified Scenario Only
              </button>
            </div>
          </div>

          {/* Canvas Viewports */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Baseline Canvas */}
            {(activeVisualMode === 'side_by_side' || activeVisualMode === 'baseline') && (
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 flex flex-col items-center">
                <div className="w-full flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    Baseline Network (Scenario A)
                  </span>
                  <span className="text-[11px] text-slate-500">Unmodified 1.0x</span>
                </div>
                <canvas
                  ref={baselineCanvasRef}
                  width={380}
                  height={240}
                  className="rounded-lg bg-white border border-slate-200 shadow-xs max-w-full"
                />
                <div className="w-full flex items-center justify-between text-[11px] text-slate-600 mt-2 px-1">
                  <span>Throughput (Seed {comparisonResult.baseline.seed}): {Math.round(baselineMetrics?.throughputPerHour || 0)} veh/h</span>
                  <span>Wait (Seed {comparisonResult.baseline.seed}): {baselineMetrics?.averageWaitTime.toFixed(1)}s</span>
                </div>
              </div>
            )}

            {/* Scenario Canvas */}
            {(activeVisualMode === 'side_by_side' || activeVisualMode === 'scenario') && (
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 flex flex-col items-center">
                <div className="w-full flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                    Modified Scenario: {comparisonResult.scenario.scenarioName || 'Modified Scenario'}
                  </span>
                  <span className={`text-[11px] font-medium ${!deltas!.isWaitTimeSignificant ? 'text-slate-500' : deltas!.deltaAvgWaitTime < 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {!deltas!.isWaitTimeSignificant 
                      ? `Δ ${deltas!.deltaAvgWaitTime > 0 ? '+' : ''}${deltas!.deltaAvgWaitTime.toFixed(1)}s (not sig)` 
                      : `${deltas!.deltaAvgWaitTime > 0 ? '+' : ''}${deltas!.deltaAvgWaitTime.toFixed(1)}s delay`}
                  </span>
                </div>
                <canvas
                  ref={scenarioCanvasRef}
                  width={380}
                  height={240}
                  className="rounded-lg bg-white border border-slate-200 shadow-xs max-w-full"
                />
                <div className="w-full flex items-center justify-between text-[11px] text-slate-600 mt-2 px-1">
                  <span>Throughput (Seed {comparisonResult.scenario.seed}): {Math.round(scenarioMetrics?.throughputPerHour || 0)} veh/h</span>
                  <span>Wait (Seed {comparisonResult.scenario.seed}): {scenarioMetrics?.averageWaitTime.toFixed(1)}s</span>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Comparative Recharts Graphs Section */}
      {comparisonResult && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-indigo-600" />
                Comparative Time-Series Metrics (Primary Run: Seed {comparisonResult.baseline.seed})
              </h3>
              <p className="text-xs text-slate-500">
                Continuous performance trajectories for Seed {comparisonResult.baseline.seed} across simulation duration (interval: 5.0s, warm-up: 60s).
              </p>
            </div>

            {/* Chart Type Tabs and CSV Export */}
            <div className="flex flex-wrap items-center gap-2 self-start">
              <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-medium">
                <button
                  onClick={() => setActiveChartTab('delay')}
                  className={`px-3 py-1 rounded-md transition ${
                    activeChartTab === 'delay' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Stopped Delay over Time
                </button>
                <button
                  onClick={() => setActiveChartTab('speed')}
                  className={`px-3 py-1 rounded-md transition ${
                    activeChartTab === 'speed' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Speed Trajectory
                </button>
                <button
                  onClick={() => setActiveChartTab('vehicles')}
                  className={`px-3 py-1 rounded-md transition ${
                    activeChartTab === 'vehicles' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Active Vehicles / Queues
                </button>
                <button
                  onClick={() => setActiveChartTab('throughput')}
                  className={`px-3 py-1 rounded-md transition ${
                    activeChartTab === 'throughput' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Completed Trips
                </button>
              </div>

              <button
                onClick={handleExportTimeSeriesCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-300 text-xs font-medium transition"
                title="Download full 5s interval continuous time-series CSV"
              >
                <Download className="w-3.5 h-3.5 text-indigo-600" />
                <span>Export Time-Series CSV</span>
              </button>
            </div>
          </div>

          {/* Chart Display Area */}
          <div className="h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              {activeChartTab === 'delay' ? (
                <AreaChart data={comparisonResult.comparativeTimeSeries}>
                  <defs>
                    <linearGradient id="colorBaseWait" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0284c7" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#0284c7" stopOpacity={0.0}/>
                    </linearGradient>
                    <linearGradient id="colorScenWait" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#e11d48" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#e11d48" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="time" stroke="#64748b" tickFormatter={(v) => `${v}s`} />
                  <YAxis stroke="#64748b" unit="s" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '0.75rem', color: '#0f172a', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} 
                    formatter={(val: number) => [`${val.toFixed(1)}s`]}
                    labelFormatter={(l) => `Sim Time: ${l}s`}
                  />
                  <Legend />
                  <ReferenceLine 
                    x={60} 
                    stroke="#d97706" 
                    strokeDasharray="3 3" 
                    label={{ value: 'Warm-up End (60s)', fill: '#d97706', fontSize: 10, position: 'insideTopRight' }} 
                  />
                  <Area 
                    type="monotone" 
                    dataKey="baselineWaitTime" 
                    name={`Baseline Wait Time (Seed ${comparisonResult.baseline.seed})`} 
                    stroke="#0284c7" 
                    fillOpacity={1} 
                    fill="url(#colorBaseWait)" 
                    strokeWidth={2}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="scenarioWaitTime" 
                    name={`Modified Scenario Wait Time (Seed ${comparisonResult.scenario.seed})`} 
                    stroke="#e11d48" 
                    fillOpacity={1} 
                    fill="url(#colorScenWait)" 
                    strokeWidth={2}
                  />
                </AreaChart>
              ) : activeChartTab === 'speed' ? (
                <LineChart data={comparisonResult.comparativeTimeSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="time" stroke="#64748b" tickFormatter={(v) => `${v}s`} />
                  <YAxis stroke="#64748b" unit=" km/h" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '0.75rem', color: '#0f172a', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} 
                    formatter={(val: number) => [`${val.toFixed(1)} km/h`]}
                    labelFormatter={(l) => `Sim Time: ${l}s`}
                  />
                  <Legend />
                  <ReferenceLine 
                    x={60} 
                    stroke="#d97706" 
                    strokeDasharray="3 3" 
                    label={{ value: 'Warm-up (60s)', fill: '#d97706', fontSize: 10, position: 'insideTopRight' }} 
                  />
                  <Line 
                    type="monotone" 
                    dataKey="baselineSpeed" 
                    name={`Baseline Speed (Seed ${comparisonResult.baseline.seed})`} 
                    stroke="#0284c7" 
                    strokeWidth={2} 
                    dot={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="scenarioSpeed" 
                    name={`Scenario Speed (Seed ${comparisonResult.scenario.seed})`} 
                    stroke="#059669" 
                    strokeWidth={2} 
                    dot={false}
                  />
                </LineChart>
              ) : activeChartTab === 'vehicles' ? (
                <LineChart data={comparisonResult.comparativeTimeSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="time" stroke="#64748b" tickFormatter={(v) => `${v}s`} />
                  <YAxis stroke="#64748b" unit=" veh" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '0.75rem', color: '#0f172a', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} 
                    labelFormatter={(l) => `Sim Time: ${l}s`}
                  />
                  <Legend />
                  <ReferenceLine 
                    x={60} 
                    stroke="#d97706" 
                    strokeDasharray="3 3" 
                    label={{ value: 'Warm-up (60s)', fill: '#d97706', fontSize: 10, position: 'insideTopRight' }} 
                  />
                  <Line 
                    type="monotone" 
                    dataKey="baselineActiveVehicles" 
                    name={`Baseline Active Vehicles (Seed ${comparisonResult.baseline.seed})`} 
                    stroke="#0284c7" 
                    strokeWidth={2} 
                    dot={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="scenarioActiveVehicles" 
                    name={`Scenario Active Vehicles (Seed ${comparisonResult.scenario.seed})`} 
                    stroke="#d97706" 
                    strokeWidth={2} 
                    dot={false}
                  />
                </LineChart>
              ) : (
                <BarChart data={[
                  {
                    name: 'Throughput (veh/h)',
                    Baseline: Math.round(baselineMetrics?.throughputPerHour || 0),
                    Scenario: Math.round(scenarioMetrics?.throughputPerHour || 0),
                  },
                  {
                    name: 'Completed Trips',
                    Baseline: baselineMetrics?.completedVehiclesCount || 0,
                    Scenario: scenarioMetrics?.completedVehiclesCount || 0,
                  },
                  {
                    name: 'Total Spawned',
                    Baseline: baselineMetrics?.totalSpawned || 0,
                    Scenario: scenarioMetrics?.totalSpawned || 0,
                  }
                ]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '0.75rem', color: '#0f172a', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                  <Legend />
                  <Bar dataKey="Baseline" fill="#0284c7" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Scenario" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Road Segment Breakdown Table */}
      {comparisonResult && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-600" />
                Road Segment Comparative Congestion Breakdown
              </h3>
              <p className="text-xs text-slate-500">
                Evaluated across {baseMap.edges.length} total directed links. Shows Volume/Capacity and diversion status.
              </p>
            </div>
            <button
              onClick={handleExportRoadMetricsCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-300 text-xs font-medium transition self-start sm:self-auto"
              title="Download road-level congestion breakdown as CSV"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Export Road CSV</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 px-3 font-semibold">Link ID</th>
                  <th className="py-2.5 px-3 font-semibold">Direction</th>
                  <th className="py-2.5 px-3 font-semibold">Status</th>
                  <th className="py-2.5 px-3 font-semibold">Baseline V/C</th>
                  <th className="py-2.5 px-3 font-semibold">Scenario V/C</th>
                  <th className="py-2.5 px-3 font-semibold">Congestion Shift</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {baseMap.edges.map((edge: RoadSegment) => {
                  const bCong = comparisonResult.baseline.roadCongestion[edge.id];
                  const sCong = comparisonResult.scenario.roadCongestion[edge.id];
                  const closedEdges = comparisonResult.scenario.modifications?.closedEdgeIds || 
                    (stagedScenario as any)?.modifications?.closedEdgeIds || [];
                  const isClosed = closedEdges.includes(edge.id);

                  const bVc = bCong ? bCong.volumeToCapacityRatio : 0;
                  const sVc = sCong ? sCong.volumeToCapacityRatio : 0;
                  const dVc = sVc - bVc;

                  // Check if the origin node has any other outgoing road in this scenario
                  const remainingOutgoing = baseMap.edges.filter(
                    (e) => e.fromNodeId === edge.fromNodeId && !closedEdges.includes(e.id)
                  );
                  const hasAlternateRoute = remainingOutgoing.length > 0;

                  return (
                    <tr key={edge.id} className="hover:bg-slate-50 transition">
                      <td className="py-2 px-3 font-bold text-slate-900">{edge.id}</td>
                      <td className="py-2 px-3 text-slate-500 font-sans">{edge.fromNodeId} &rarr; {edge.toNodeId}</td>
                      <td className="py-2 px-3">
                        {isClosed ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            🚧 CLOSED
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700 font-semibold border border-slate-200">
                            OPEN
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-slate-700">
                        {bVc.toFixed(2)} ({bCong?.congestionLevel || 'FREE_FLOW'})
                      </td>
                      <td className="py-2 px-3 text-slate-700">
                        {isClosed ? 'N/A' : `${sVc.toFixed(2)} (${sCong?.congestionLevel || 'FREE_FLOW'})`}
                      </td>
                      <td className="py-2 px-3 font-sans">
                        {isClosed ? (
                          hasAlternateRoute ? (
                            <span className="text-amber-700 font-medium">Traffic Diverted to alternate route</span>
                          ) : (
                            <span className="text-rose-600 font-semibold">No alternate route (Demand unserved)</span>
                          )
                        ) : dVc > 0.1 ? (
                          <span className="text-amber-700 font-medium">+{dVc.toFixed(2)} (Higher flow)</span>
                        ) : dVc < -0.1 ? (
                          <span className="text-emerald-700 font-medium">{dVc.toFixed(2)} (Relieved / Lower flow)</span>
                        ) : (
                          <span className="text-slate-400">Unchanged</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Executive Report Modal (Print / PDF) */}
      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        baseMap={baseMap}
        comparisonResult={comparisonResult}
      />

      {/* Historical Runs Browser Modal */}
      <PastRunsModal
        isOpen={isPastRunsOpen}
        onClose={() => setIsPastRunsOpen(false)}
        onInspectRun={(_run) => {
          setIsPastRunsOpen(false);
        }}
      />

    </div>
  );
};
