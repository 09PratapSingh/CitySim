import React, { useState } from 'react';
import { 
  Activity, 
  Car, 
  Clock, 
  Gauge, 
  CheckCircle2, 
  ChevronDown, 
  ChevronUp,
  AlertTriangle
} from 'lucide-react';
import type { SimulationMetrics } from '../types.ts';

interface MetricsOverlayProps {
  metrics: SimulationMetrics | null;
  isRunning: boolean;
}

export const MetricsOverlay: React.FC<MetricsOverlayProps> = ({ metrics, isRunning }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!metrics && !isRunning) return null;

  const getCongestionBadge = () => {
    if (!metrics) return { text: 'IDLE', color: 'bg-slate-800 text-slate-400 border-slate-700' };

    // Compute average V/C ratio across roads
    const roadEntries = Object.values(metrics.roadCongestion || {});
    if (roadEntries.length === 0) {
      return { text: 'FREE FLOW', color: 'bg-emerald-950/60 text-emerald-400 border-emerald-800' };
    }

    // Extract valid density / VC ratios
    const validRatios = roadEntries
      .map((r) => r.volumeToCapacityRatio ?? r.densityRatio ?? 0)
      .filter((v) => typeof v === 'number' && !isNaN(v));

    if (validRatios.length === 0) {
      return { text: 'FREE FLOW', color: 'bg-emerald-950/60 text-emerald-400 border-emerald-800' };
    }

    const avgVC = validRatios.reduce((sum, v) => sum + v, 0) / validRatios.length;

    if (avgVC < 0.3) {
      return { text: 'FREE FLOW', color: 'bg-emerald-950/60 text-emerald-400 border-emerald-800' };
    } else if (avgVC < 0.6) {
      return { text: 'MODERATE', color: 'bg-cyan-950/60 text-cyan-400 border-cyan-800' };
    } else if (avgVC < 0.85) {
      return { text: 'HEAVY', color: 'bg-amber-950/60 text-amber-400 border-amber-800' };
    } else {
      return { text: 'CONGESTED', color: 'bg-rose-950/60 text-rose-400 border-rose-800' };
    }
  };

  const badge = getCongestionBadge();
  const rawSpeed = metrics?.avgSpeed ?? metrics?.averageSpeed ?? 0;
  const speedKmH = isNaN(rawSpeed) ? '0.0' : (rawSpeed * 3.6).toFixed(1);

  const activeCount = metrics?.activeVehiclesCount ?? metrics?.activeVehicleCount ?? 0;
  const completedCount = metrics?.completedVehiclesCount ?? metrics?.totalCompleted ?? 0;
  const spawnedCount = metrics?.totalSpawned ?? metrics?.totalGenerated ?? (activeCount + completedCount);
  const throughputVal = metrics?.throughputPerHour ?? 0;
  const rawWait = metrics?.avgWaitTime ?? metrics?.averageWaitTime ?? 0;
  const waitSec = isNaN(rawWait) ? '0.0' : rawWait.toFixed(1);

  return (
    <div className="absolute right-4 top-18 z-20 w-72 bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-xl shadow-2xl overflow-hidden select-none">
      {/* Header */}
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className="px-3.5 py-2.5 bg-slate-950/70 border-b border-slate-800/80 flex items-center justify-between cursor-pointer hover:bg-slate-950/90 transition"
      >
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-semibold text-slate-200">Live Traffic Telemetry</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${badge.color}`}>
            {badge.text}
          </span>
          {isExpanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          )}
        </div>
      </div>

      {/* Metric Cards */}
      {isExpanded && (
        <div className="p-3 grid grid-cols-2 gap-2 text-xs">
          {/* Active Vehicles */}
          <div className="bg-slate-950/60 border border-slate-800/80 p-2.5 rounded-lg flex flex-col">
            <span className="text-[10px] text-slate-400 flex items-center gap-1">
              <Car className="w-3 h-3 text-cyan-400" /> Active Vehicles
            </span>
            <span className="font-mono text-base font-bold text-slate-100 mt-1">
              {activeCount}
            </span>
          </div>

          {/* Network Throughput */}
          <div className="bg-slate-950/60 border border-slate-800/80 p-2.5 rounded-lg flex flex-col">
            <span className="text-[10px] text-slate-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Throughput
            </span>
            <span className="font-mono text-base font-bold text-emerald-400 mt-1">
              {Math.round(throughputVal)} <span className="text-[10px] font-normal text-slate-400">veh/h</span>
            </span>
          </div>

          {/* Average Delay / Wait */}
          <div className="bg-slate-950/60 border border-slate-800/80 p-2.5 rounded-lg flex flex-col">
            <span className="text-[10px] text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3 text-amber-400" /> Avg Wait Time
            </span>
            <span className="font-mono text-base font-bold text-amber-300 mt-1">
              {waitSec} <span className="text-[10px] font-normal text-slate-400">s</span>
            </span>
          </div>

          {/* Mean Speed */}
          <div className="bg-slate-950/60 border border-slate-800/80 p-2.5 rounded-lg flex flex-col">
            <span className="text-[10px] text-slate-400 flex items-center gap-1">
              <Gauge className="w-3 h-3 text-purple-400" /> Mean Speed
            </span>
            <span className="font-mono text-base font-bold text-purple-300 mt-1">
              {speedKmH} <span className="text-[10px] font-normal text-slate-400">km/h</span>
            </span>
          </div>

          {/* Total Trips Completed & Spawned (Strictly Conserved) */}
          <div className="col-span-2 bg-slate-950/40 border border-slate-800/60 px-2.5 py-1.5 rounded-lg flex items-center justify-between text-[11px] text-slate-400">
            <span>Completed Trips: <strong className="text-slate-200 font-mono">{completedCount}</strong></span>
            <span>Spawned: <strong className="text-slate-200 font-mono">{spawnedCount}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
};
