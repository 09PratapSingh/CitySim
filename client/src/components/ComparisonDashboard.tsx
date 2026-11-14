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
  Table
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
  fetchScenarios 
} from '../api/client.ts';
import type { 
  MapData, 
  ScenarioData, 
  ScenarioModifications, 
  SimulationComparisonResult,
  RoadSegment,
  IntersectionNode
} from '../types.ts';

interface ComparisonDashboardProps {
  baseMap: MapData;
  onOpenScenarioModal: () => void;
  stagedScenario?: ScenarioData | {
    baseMapId: string;
    scenarioName: string;
    modifications: ScenarioModifications;
    demandMultiplier: number;
    seed: number;
  } | null;
}

export const ComparisonDashboard: React.FC<ComparisonDashboardProps> = ({
  baseMap,
  onOpenScenarioModal,
  stagedScenario,
}) => {
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

  const baseMapId = baseMap.id || baseMap._id || 'map_default_4way';

  // Canvases for visual road network schematic
  const baselineCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scenarioCanvasRef = useRef<HTMLCanvasElement | null>(null);

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
    } else if (type === 'adaptive') {
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
    } else if (type === 'rush') {
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
      } else {
        params.scenarioName = scenarioTarget.scenarioName || 'Custom Staged Scenario';
        params.demandMultiplier = scenarioTarget.demandMultiplier ?? 1.0;
        params.modifications = scenarioTarget.modifications;
      }

      const result = await compareSimulations(params);
      setComparisonResult(result);
    } catch (err: any) {
      alert(`Simulation comparison failed: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
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
    ctx.clearRect(0, 0, width, height);

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

    // Draw Edges
    map.edges.forEach((edge) => {
      const fromNode = map.nodes.find((n) => n.id === edge.fromNodeId);
      const toNode = map.nodes.find((n) => n.id === edge.toNodeId);
      if (!fromNode || !toNode) return;

      const x1 = transformX(fromNode.x);
      const y1 = transformY(fromNode.y);
      const x2 = transformX(toNode.x);
      const y2 = transformY(toNode.y);

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
      ctx.lineWidth = 8;
      ctx.strokeStyle = strokeColor;
      ctx.lineCap = 'round';

      if (isClosed) {
        ctx.setLineDash([8, 6]);
      } else {
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      if (!isClosed) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#f8fafc33';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
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
    <div className="flex-1 bg-slate-950 flex flex-col overflow-y-auto select-none text-slate-100 p-6 space-y-6">
      
      {/* Header & Controls Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <Split className="w-4 h-4" />
              </span>
              <h1 className="text-xl font-bold tracking-tight text-white">
                Before / After Scenario Comparison
              </h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                Paired Dual-Run Engine
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Paired comparison runs using synchronized random seeds (Common Random Numbers variance reduction) isolate scenario intervention effects across multi-seed replications.
            </p>
          </div>

          {/* Action & Configuration Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Scenario Selector */}
            <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
              <span className="text-slate-500">Scenario:</span>
              <select
                value={selectedScenarioId}
                onChange={(e) => setSelectedScenarioId(e.target.value)}
                className="bg-transparent font-medium text-slate-200 focus:outline-none"
              >
                {stagedScenario && (
                  <option value="custom_staged" className="bg-slate-900 text-indigo-300">
                    ★ {(stagedScenario as any).name || (stagedScenario as any).scenarioName || 'Custom Staged Scenario'}
                  </option>
                )}
                {scenarios.map((s) => (
                  <option key={s.id || s._id} value={s.id || s._id} className="bg-slate-900 text-slate-200">
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Seed Input */}
            <div className="flex items-center gap-1 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800 text-xs">
              <span className="text-slate-500">Base Seed:</span>
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(parseInt(e.target.value) || 42)}
                className="w-12 bg-transparent text-center font-mono text-cyan-400 focus:outline-none"
              />
            </div>

            {/* Duration Selector: 300s, 600s (default), 900s */}
            <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800 text-xs">
              <span className="text-slate-500">Duration:</span>
              <select
                value={durationSeconds}
                onChange={(e) => setDurationSeconds(parseInt(e.target.value))}
                className="bg-transparent font-medium text-slate-200 focus:outline-none"
              >
                <option value={300} className="bg-slate-900">300s (5 min)</option>
                <option value={600} className="bg-slate-900">600s (10 min - Recommended)</option>
                <option value={900} className="bg-slate-900">900s (15 min - Deep Stress)</option>
              </select>
            </div>

            {/* Replications Selector: 1, 3, 5 (default), 10 */}
            <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800 text-xs">
              <span className="text-slate-500">Replications:</span>
              <select
                value={replications}
                onChange={(e) => setReplications(parseInt(e.target.value))}
                className="bg-transparent font-medium text-slate-200 focus:outline-none"
              >
                <option value={1} className="bg-slate-900">1 Paired Seed</option>
                <option value={3} className="bg-slate-900">3 Paired Seeds</option>
                <option value={5} className="bg-slate-900">5 Paired Seeds (Default)</option>
                <option value={10} className="bg-slate-900">10 Paired Seeds</option>
              </select>
            </div>

            {/* Modify Scenario Button */}
            <button
              onClick={onOpenScenarioModal}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            >
              <Sliders className="w-3.5 h-3.5 text-indigo-400" />
              <span>Scenario Studio</span>
            </button>

            {/* Run Dual Simulation Button */}
            <button
              onClick={handleRunClick}
              disabled={isRunning}
              className="flex items-center gap-2 px-4 py-1.5 text-xs font-bold rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 text-white shadow-lg shadow-indigo-500/25 transition disabled:opacity-50"
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
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-semibold text-slate-300">Quick Test Scenarios:</span>
            </div>
            <span className="text-[11px] text-slate-500">
              Warm-up: <span className="font-mono text-cyan-400">60s</span> (cold-start transient discarded from KPIs)
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => runPreset('closure')}
              disabled={isRunning}
              className="px-2.5 py-1 text-xs rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 transition flex items-center gap-1.5"
            >
              <AlertTriangle className="w-3 h-3 text-rose-400" />
              <span>🚧 West Road Closure</span>
            </button>
            <button
              onClick={() => runPreset('adaptive')}
              disabled={isRunning}
              className="px-2.5 py-1 text-xs rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 transition flex items-center gap-1.5"
            >
              <Zap className="w-3 h-3 text-emerald-400" />
              <span>🚦 Adaptive Signal Upgrade</span>
            </button>
            <button
              onClick={() => runPreset('rush')}
              disabled={isRunning}
              className="px-2.5 py-1 text-xs rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 transition flex items-center gap-1.5"
            >
              <Gauge className="w-3 h-3 text-amber-400" />
              <span>🚗 Rush Hour (1.8x Demand)</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Delta Cards (with Mean ± SD across replications) */}
      {comparisonResult ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Delta 1: Stopped Delay / Average Wait Time */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                Avg Stopped Wait Time
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                deltas!.deltaAvgWaitTime < 0 
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                  : deltas!.deltaAvgWaitTime > 0 
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' 
                  : 'bg-slate-800 text-slate-400'
              }`}>
                {deltas!.deltaAvgWaitTime < 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                {deltas!.pctChangeAvgWaitTime > 0 ? `+${deltas!.pctChangeAvgWaitTime}%` : `${deltas!.pctChangeAvgWaitTime}%`}
              </span>
            </div>

            <div className="my-2">
              <div className="text-2xl font-black font-mono tracking-tight text-white flex items-baseline gap-2 flex-wrap">
                <span>{scenarioMetrics?.averageWaitTime.toFixed(1)}s</span>
                <span className={`text-sm font-bold ${
                  deltas!.deltaAvgWaitTime < 0 ? 'text-emerald-400' : deltas!.deltaAvgWaitTime > 0 ? 'text-rose-400' : 'text-slate-400'
                }`}>
                  {deltas!.deltaAvgWaitTime > 0 ? `+${deltas!.deltaAvgWaitTime.toFixed(1)}s` : `${deltas!.deltaAvgWaitTime.toFixed(1)}s`}
                  {deltas!.deltaAvgWaitTimeStdDev !== undefined && deltas!.deltaAvgWaitTimeStdDev > 0 && (
                    <span className="text-xs font-mono text-slate-400 font-normal"> ± {deltas!.deltaAvgWaitTimeStdDev.toFixed(1)}s</span>
                  )}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Baseline: <span className="font-mono text-slate-300">{baselineMetrics?.averageWaitTime.toFixed(1)}s</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-800/80 flex items-center justify-between">
              <span>{deltas!.deltaAvgWaitTime < 0 ? '🟢 Delay reduced' : deltas!.deltaAvgWaitTime > 0 ? '🔴 Delay increased' : 'Neutral'}</span>
              <span className="text-[10px] text-slate-500">Post-warmup (N={deltas!.replicationsCount || 5} pairs)</span>
            </div>
          </div>

          {/* Delta 2: Average Travel Time */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                Avg Travel Time
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                deltas!.deltaAvgTravelTime < 0 
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                  : deltas!.deltaAvgTravelTime > 0 
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' 
                  : 'bg-slate-800 text-slate-400'
              }`}>
                {deltas!.deltaAvgTravelTime < 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                {deltas!.pctChangeAvgTravelTime > 0 ? `+${deltas!.pctChangeAvgTravelTime}%` : `${deltas!.pctChangeAvgTravelTime}%`}
              </span>
            </div>

            <div className="my-2">
              <div className="text-2xl font-black font-mono tracking-tight text-white flex items-baseline gap-2 flex-wrap">
                <span>{scenarioMetrics?.averageTravelTime.toFixed(1)}s</span>
                <span className={`text-sm font-bold ${
                  deltas!.deltaAvgTravelTime < 0 ? 'text-emerald-400' : deltas!.deltaAvgTravelTime > 0 ? 'text-rose-400' : 'text-slate-400'
                }`}>
                  {deltas!.deltaAvgTravelTime > 0 ? `+${deltas!.deltaAvgTravelTime.toFixed(1)}s` : `${deltas!.deltaAvgTravelTime.toFixed(1)}s`}
                  {deltas!.deltaAvgTravelTimeStdDev !== undefined && deltas!.deltaAvgTravelTimeStdDev > 0 && (
                    <span className="text-xs font-mono text-slate-400 font-normal"> ± {deltas!.deltaAvgTravelTimeStdDev.toFixed(1)}s</span>
                  )}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Baseline: <span className="font-mono text-slate-300">{baselineMetrics?.averageTravelTime.toFixed(1)}s</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-800/80 flex items-center justify-between">
              <span>Trip duration for completed trips</span>
              <span className="text-[10px] text-slate-500">Post-warmup (N={deltas!.replicationsCount || 5} pairs)</span>
            </div>
          </div>

          {/* Delta 3: Network Throughput */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
                Network Throughput
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                deltas!.deltaThroughput > 0 
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                  : deltas!.deltaThroughput < 0 
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' 
                  : 'bg-slate-800 text-slate-400'
              }`}>
                {deltas!.deltaThroughput > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {deltas!.pctChangeThroughput > 0 ? `+${deltas!.pctChangeThroughput}%` : `${deltas!.pctChangeThroughput}%`}
              </span>
            </div>

            <div className="my-2">
              <div className="text-2xl font-black font-mono tracking-tight text-white flex items-baseline gap-2 flex-wrap">
                <span>{Math.round(scenarioMetrics?.throughputPerHour || 0)}</span>
                <span className="text-xs text-slate-400">veh/h</span>
                <span className={`text-sm font-bold ${
                  deltas!.deltaThroughput > 0 ? 'text-emerald-400' : deltas!.deltaThroughput < 0 ? 'text-rose-400' : 'text-slate-400'
                }`}>
                  {deltas!.deltaThroughput > 0 ? `+${Math.round(deltas!.deltaThroughput)}` : `${Math.round(deltas!.deltaThroughput)}`}
                  {deltas!.deltaThroughputStdDev !== undefined && deltas!.deltaThroughputStdDev > 0 && (
                    <span className="text-xs font-mono text-slate-400 font-normal"> ± {Math.round(deltas!.deltaThroughputStdDev)}</span>
                  )}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Baseline: <span className="font-mono text-slate-300">{Math.round(baselineMetrics?.throughputPerHour || 0)} veh/h</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-800/80 flex items-center justify-between">
              <span>Completed trips / eval hour</span>
              <span className="text-[10px] text-slate-500">Post-warmup (N={deltas!.replicationsCount || 5} pairs)</span>
            </div>
          </div>

          {/* Delta 4: Network Mean Speed & Queue */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-amber-400" />
                Mean Network Speed
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-slate-800 text-slate-300">
                Max Q: {scenarioMetrics?.maxQueueLength || 0} veh
              </span>
            </div>

            <div className="my-2">
              <div className="text-2xl font-black font-mono tracking-tight text-white flex items-baseline gap-2 flex-wrap">
                <span>{scenarioMetrics?.averageSpeed.toFixed(1)}</span>
                <span className="text-xs text-slate-400">km/h</span>
                <span className={`text-sm font-bold ${
                  deltas!.deltaAvgSpeed > 0 ? 'text-emerald-400' : deltas!.deltaAvgSpeed < 0 ? 'text-rose-400' : 'text-slate-400'
                }`}>
                  {deltas!.deltaAvgSpeed > 0 ? `+${deltas!.deltaAvgSpeed.toFixed(1)}` : `${deltas!.deltaAvgSpeed.toFixed(1)}`}
                  {deltas!.deltaAvgSpeedStdDev !== undefined && deltas!.deltaAvgSpeedStdDev > 0 && (
                    <span className="text-xs font-mono text-slate-400 font-normal"> ± {deltas!.deltaAvgSpeedStdDev.toFixed(1)}</span>
                  )}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Baseline: <span className="font-mono text-slate-300">{baselineMetrics?.averageSpeed.toFixed(1)} km/h</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-800/80 flex items-center justify-between">
              <span>Completed: <span className="text-white font-semibold">{scenarioMetrics?.completedVehiclesCount}</span> / {scenarioMetrics?.totalSpawned} spawned</span>
              <button 
                onClick={() => setShowReplicationsTable(!showReplicationsTable)}
                className="text-[10px] text-indigo-400 hover:underline flex items-center gap-0.5"
              >
                <GitBranch className="w-3 h-3" />
                <span>{showReplicationsTable ? 'Hide Seeds' : 'View Seeds'}</span>
              </button>
            </div>
          </div>

        </div>
      ) : (
        /* Empty State */
        <div className="bg-slate-900/60 border border-dashed border-slate-800 rounded-2xl p-12 text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Split className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">No Simulation Comparison Run Yet</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
              Select a scenario or click one of the quick test presets above to simulate Baseline vs Modified runs with paired random seeds and 60s warm-up exclusion.
            </p>
          </div>
          <button
            onClick={() => runPreset('closure')}
            disabled={isRunning}
            className="px-5 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg transition"
          >
            Run West Road Closure Test (600s, 5 Replications)
          </button>
        </div>
      )}

      {/* Multi-Seed Replications Breakdown Table (Expandable) */}
      {comparisonResult && showReplicationsTable && replicationsData.length > 0 && (
        <div className="bg-slate-900/90 border border-indigo-500/30 rounded-2xl p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-indigo-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Multi-Seed Paired Replications (N = {replicationsData.length} pairs, Common Random Numbers)
              </h3>
            </div>
            <span className="text-[11px] text-slate-400">
              Each pair shares an identical seed between Baseline and Scenario
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                  <th className="py-2 px-3">Pair #</th>
                  <th className="py-2 px-3">Seed</th>
                  <th className="py-2 px-3">Baseline Wait</th>
                  <th className="py-2 px-3">Scenario Wait</th>
                  <th className="py-2 px-3">Δ Wait</th>
                  <th className="py-2 px-3">Baseline Throughput</th>
                  <th className="py-2 px-3">Scenario Throughput</th>
                  <th className="py-2 px-3">Δ Throughput</th>
                  <th className="py-2 px-3">Δ Travel Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {replicationsData.map((rep, idx) => (
                  <tr key={rep.seed} className="hover:bg-slate-800/20">
                    <td className="py-1.5 px-3 text-slate-400">Pair {idx + 1}</td>
                    <td className="py-1.5 px-3 text-cyan-400 font-bold">{rep.seed}</td>
                    <td className="py-1.5 px-3 text-slate-300">{rep.baselineWait.toFixed(1)}s</td>
                    <td className="py-1.5 px-3 text-slate-300">{rep.scenarioWait.toFixed(1)}s</td>
                    <td className={`py-1.5 px-3 font-bold ${rep.deltaWait < 0 ? 'text-emerald-400' : rep.deltaWait > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                      {rep.deltaWait > 0 ? `+${rep.deltaWait.toFixed(1)}s` : `${rep.deltaWait.toFixed(1)}s`}
                    </td>
                    <td className="py-1.5 px-3 text-slate-300">{Math.round(rep.baselineThroughput)} veh/h</td>
                    <td className="py-1.5 px-3 text-slate-300">{Math.round(rep.scenarioThroughput)} veh/h</td>
                    <td className={`py-1.5 px-3 font-bold ${rep.deltaThroughput > 0 ? 'text-emerald-400' : rep.deltaThroughput < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                      {rep.deltaThroughput > 0 ? `+${Math.round(rep.deltaThroughput)}` : `${Math.round(rep.deltaThroughput)}`}
                    </td>
                    <td className="py-1.5 px-3 text-slate-300">
                      {rep.deltaTravel > 0 ? `+${rep.deltaTravel.toFixed(1)}s` : `${rep.deltaTravel.toFixed(1)}s`}
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-950 font-bold text-slate-200 border-t-2 border-slate-700">
                  <td colSpan={2} className="py-2 px-3 text-indigo-300">Mean ± StdDev</td>
                  <td className="py-2 px-3">-</td>
                  <td className="py-2 px-3">-</td>
                  <td className="py-2 px-3 text-white">
                    {deltas!.deltaAvgWaitTime > 0 ? `+${deltas!.deltaAvgWaitTime.toFixed(1)}s` : `${deltas!.deltaAvgWaitTime.toFixed(1)}s`}
                    {deltas!.deltaAvgWaitTimeStdDev ? ` ± ${deltas!.deltaAvgWaitTimeStdDev.toFixed(1)}s` : ''}
                  </td>
                  <td className="py-2 px-3">-</td>
                  <td className="py-2 px-3">-</td>
                  <td className="py-2 px-3 text-white">
                    {deltas!.deltaThroughput > 0 ? `+${Math.round(deltas!.deltaThroughput)}` : `${Math.round(deltas!.deltaThroughput)}`}
                    {deltas!.deltaThroughputStdDev ? ` ± ${Math.round(deltas!.deltaThroughputStdDev)}` : ''}
                  </td>
                  <td className="py-2 px-3 text-white">
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
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Eye className="w-4 h-4 text-cyan-400" />
                Spatial Congestion & Impact Visualization
              </h3>
              <p className="text-xs text-slate-400">
                Visual comparison of link density ratios (V/C) and road closure status.
              </p>
            </div>

            {/* Visual View Mode Switcher */}
            <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-medium self-start">
              <button
                onClick={() => setActiveVisualMode('side_by_side')}
                className={`px-3 py-1 rounded-md transition ${
                  activeVisualMode === 'side_by_side' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Side-by-Side Dual View
              </button>
              <button
                onClick={() => setActiveVisualMode('baseline')}
                className={`px-3 py-1 rounded-md transition ${
                  activeVisualMode === 'baseline' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Baseline Only
              </button>
              <button
                onClick={() => setActiveVisualMode('scenario')}
                className={`px-3 py-1 rounded-md transition ${
                  activeVisualMode === 'scenario' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
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
              <div className="bg-slate-950 rounded-xl p-4 border border-slate-800/80 flex flex-col items-center">
                <div className="w-full flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                    Baseline Network (Scenario A)
                  </span>
                  <span className="text-[11px] text-slate-500">Unmodified 1.0x</span>
                </div>
                <canvas
                  ref={baselineCanvasRef}
                  width={380}
                  height={240}
                  className="rounded-lg bg-slate-900 border border-slate-800 max-w-full"
                />
                <div className="w-full flex items-center justify-between text-[11px] text-slate-400 mt-2 px-1">
                  <span>Throughput: {Math.round(baselineMetrics?.throughputPerHour || 0)} veh/h</span>
                  <span>Wait: {baselineMetrics?.averageWaitTime.toFixed(1)}s</span>
                </div>
              </div>
            )}

            {/* Scenario Canvas */}
            {(activeVisualMode === 'side_by_side' || activeVisualMode === 'scenario') && (
              <div className="bg-slate-950 rounded-xl p-4 border border-slate-800/80 flex flex-col items-center">
                <div className="w-full flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-400" />
                    Modified Scenario: {comparisonResult.scenario.scenarioName}
                  </span>
                  <span className="text-[11px] text-amber-400">
                    {deltas!.deltaAvgWaitTime > 0 ? `+${deltas!.deltaAvgWaitTime.toFixed(1)}s delay` : `${deltas!.deltaAvgWaitTime.toFixed(1)}s delay`}
                  </span>
                </div>
                <canvas
                  ref={scenarioCanvasRef}
                  width={380}
                  height={240}
                  className="rounded-lg bg-slate-900 border border-slate-800 max-w-full"
                />
                <div className="w-full flex items-center justify-between text-[11px] text-slate-400 mt-2 px-1">
                  <span>Throughput: {Math.round(scenarioMetrics?.throughputPerHour || 0)} veh/h</span>
                  <span>Wait: {scenarioMetrics?.averageWaitTime.toFixed(1)}s</span>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Comparative Recharts Graphs Section */}
      {comparisonResult && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-indigo-400" />
                Comparative Time-Series Metrics
              </h3>
              <p className="text-xs text-slate-400">
                Continuous performance trajectories across simulation duration (interval: 5.0s, warm-up: 60s).
              </p>
            </div>

            {/* Chart Type Tabs */}
            <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-medium self-start">
              <button
                onClick={() => setActiveChartTab('delay')}
                className={`px-3 py-1 rounded-md transition ${
                  activeChartTab === 'delay' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Stopped Delay over Time
              </button>
              <button
                onClick={() => setActiveChartTab('speed')}
                className={`px-3 py-1 rounded-md transition ${
                  activeChartTab === 'speed' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Speed Trajectory
              </button>
              <button
                onClick={() => setActiveChartTab('vehicles')}
                className={`px-3 py-1 rounded-md transition ${
                  activeChartTab === 'vehicles' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Active Vehicles / Queues
              </button>
              <button
                onClick={() => setActiveChartTab('throughput')}
                className={`px-3 py-1 rounded-md transition ${
                  activeChartTab === 'throughput' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Completed Trips
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
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0}/>
                    </linearGradient>
                    <linearGradient id="colorScenWait" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="time" stroke="#64748b" tickFormatter={(v) => `${v}s`} />
                  <YAxis stroke="#64748b" unit="s" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem' }} 
                    formatter={(val: number) => [`${val.toFixed(1)}s`]}
                    labelFormatter={(l) => `Sim Time: ${l}s`}
                  />
                  <Legend />
                  <ReferenceLine 
                    x={60} 
                    stroke="#f59e0b" 
                    strokeDasharray="3 3" 
                    label={{ value: 'Warm-up End (60s)', fill: '#f59e0b', fontSize: 10, position: 'insideTopRight' }} 
                  />
                  <Area 
                    type="monotone" 
                    dataKey="baselineWaitTime" 
                    name="Baseline Wait Time" 
                    stroke="#38bdf8" 
                    fillOpacity={1} 
                    fill="url(#colorBaseWait)" 
                    strokeWidth={2}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="scenarioWaitTime" 
                    name="Modified Scenario Wait Time" 
                    stroke="#f43f5e" 
                    fillOpacity={1} 
                    fill="url(#colorScenWait)" 
                    strokeWidth={2}
                  />
                </AreaChart>
              ) : activeChartTab === 'speed' ? (
                <LineChart data={comparisonResult.comparativeTimeSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="time" stroke="#64748b" tickFormatter={(v) => `${v}s`} />
                  <YAxis stroke="#64748b" unit=" km/h" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem' }} 
                    formatter={(val: number) => [`${val.toFixed(1)} km/h`]}
                    labelFormatter={(l) => `Sim Time: ${l}s`}
                  />
                  <Legend />
                  <ReferenceLine 
                    x={60} 
                    stroke="#f59e0b" 
                    strokeDasharray="3 3" 
                    label={{ value: 'Warm-up (60s)', fill: '#f59e0b', fontSize: 10, position: 'insideTopRight' }} 
                  />
                  <Line 
                    type="monotone" 
                    dataKey="baselineSpeed" 
                    name="Baseline Speed" 
                    stroke="#38bdf8" 
                    strokeWidth={2} 
                    dot={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="scenarioSpeed" 
                    name="Scenario Speed" 
                    stroke="#10b981" 
                    strokeWidth={2} 
                    dot={false}
                  />
                </LineChart>
              ) : activeChartTab === 'vehicles' ? (
                <LineChart data={comparisonResult.comparativeTimeSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="time" stroke="#64748b" tickFormatter={(v) => `${v}s`} />
                  <YAxis stroke="#64748b" unit=" veh" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem' }} 
                    labelFormatter={(l) => `Sim Time: ${l}s`}
                  />
                  <Legend />
                  <ReferenceLine 
                    x={60} 
                    stroke="#f59e0b" 
                    strokeDasharray="3 3" 
                    label={{ value: 'Warm-up (60s)', fill: '#f59e0b', fontSize: 10, position: 'insideTopRight' }} 
                  />
                  <Line 
                    type="monotone" 
                    dataKey="baselineActiveVehicles" 
                    name="Baseline Active Vehicles" 
                    stroke="#38bdf8" 
                    strokeWidth={2} 
                    dot={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="scenarioActiveVehicles" 
                    name="Scenario Active Vehicles" 
                    stroke="#fbbf24" 
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="name" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem' }} />
                  <Legend />
                  <Bar dataKey="Baseline" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Scenario" fill="#818cf8" radius={[4, 4, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Road Segment Breakdown Table */}
      {comparisonResult && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              Road Segment Comparative Congestion Breakdown
            </h3>
            <span className="text-xs text-slate-500">
              Evaluated across {baseMap.edges.length} total directed links
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2.5 px-3 font-semibold">Link ID</th>
                  <th className="py-2.5 px-3 font-semibold">Direction</th>
                  <th className="py-2.5 px-3 font-semibold">Status</th>
                  <th className="py-2.5 px-3 font-semibold">Baseline V/C</th>
                  <th className="py-2.5 px-3 font-semibold">Scenario V/C</th>
                  <th className="py-2.5 px-3 font-semibold">Congestion Shift</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {baseMap.edges.map((edge: RoadSegment) => {
                  const bCong = comparisonResult.baseline.roadCongestion[edge.id];
                  const sCong = comparisonResult.scenario.roadCongestion[edge.id];
                  const isClosed = (stagedScenario as any)?.modifications?.closedEdgeIds?.includes(edge.id) ||
                    scenarios.find((s) => (s.id || s._id) === selectedScenarioId)?.modifications?.closedEdgeIds?.includes(edge.id);

                  const bVc = bCong ? bCong.volumeToCapacityRatio : 0;
                  const sVc = sCong ? sCong.volumeToCapacityRatio : 0;
                  const dVc = sVc - bVc;

                  return (
                    <tr key={edge.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-2 px-3 font-bold text-white">{edge.id}</td>
                      <td className="py-2 px-3 text-slate-400 font-sans">{edge.fromNodeId} &rarr; {edge.toNodeId}</td>
                      <td className="py-2 px-3">
                        {isClosed ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            🚧 CLOSED
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300">
                            OPEN
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-slate-300">
                        {bVc.toFixed(2)} ({bCong?.congestionLevel || 'FREE_FLOW'})
                      </td>
                      <td className="py-2 px-3 text-slate-300">
                        {isClosed ? 'N/A' : `${sVc.toFixed(2)} (${sCong?.congestionLevel || 'FREE_FLOW'})`}
                      </td>
                      <td className="py-2 px-3">
                        {isClosed ? (
                          <span className="text-rose-400">Traffic Diverted</span>
                        ) : dVc > 0.1 ? (
                          <span className="text-amber-400">+{dVc.toFixed(2)} (Higher flow)</span>
                        ) : dVc < -0.1 ? (
                          <span className="text-emerald-400">{dVc.toFixed(2)} (Relieved / Lower flow)</span>
                        ) : (
                          <span className="text-slate-500">Unchanged</span>
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

    </div>
  );
};
