import React from 'react';
import { 
  X, 
  Printer, 
  FileText, 
  Sparkles 
} from 'lucide-react';
import type { 
  SimulationComparisonResult, 
  MapData, 
  RoadSegment 
} from '../types.ts';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  baseMap: MapData;
  comparisonResult: SimulationComparisonResult | null;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  baseMap,
  comparisonResult,
}) => {
  if (!isOpen || !comparisonResult) return null;

  const { baseline, scenario, deltas, replications } = comparisonResult;

  const handlePrint = () => {
    window.print();
  };

  const isWaitBetter = (deltas.deltaAvgWaitTime ?? 0) < 0;
  const isWaitSignificant = deltas.isWaitTimeSignificant;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      {/* Modal Container */}
      <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] print:max-h-none print:m-0 print:border-none print:shadow-none print:w-full print:bg-white print:text-black">
        
        {/* Modal Top Bar (Hidden when printing) */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 print:hidden">
          <div className="flex items-center gap-2 text-indigo-600 font-bold text-sm">
            <FileText className="w-4 h-4" />
            <span>Executive Traffic Scenario Impact Report</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save as PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Report Body */}
        <div className="p-8 overflow-y-auto space-y-6 text-slate-800 print:text-black print:p-0 print:overflow-visible">
          
          {/* Official Document Header */}
          <div className="border-b border-slate-200 pb-5 print:border-slate-300">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-emerald-600 to-indigo-600 bg-clip-text text-transparent print:text-black">
                    CitySim
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono border border-slate-200 print:border-slate-400">
                    CSE Major Project
                  </span>
                </div>
                <h1 className="text-lg font-bold text-slate-900 print:text-black">
                  Traffic Infrastructure Scenario Impact Assessment
                </h1>
                <p className="text-xs text-slate-500 print:text-slate-600 mt-0.5">
                  Microscopic Paired-Run Simulation & Statistical Significance Audit
                </p>
              </div>

              <div className="text-right text-xs font-mono text-slate-500 print:text-slate-600 space-y-0.5">
                <div>Date: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}</div>
                <div>Status: <span className="text-emerald-600 font-bold print:text-black">VALIDATED</span></div>
                <div>Method: Common Random Numbers (CRN)</div>
              </div>
            </div>

            {/* Run Metadata Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100 print:border-slate-300 text-xs font-mono">
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 print:bg-slate-100 print:border-slate-300">
                <span className="text-slate-500 block text-[10px] uppercase font-sans">Base Network</span>
                <span className="font-bold text-slate-800 print:text-black truncate block">{baseMap.name}</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 print:bg-slate-100 print:border-slate-300">
                <span className="text-slate-500 block text-[10px] uppercase font-sans">Scenario Evaluated</span>
                <span className="font-bold text-indigo-700 print:text-black truncate block">{scenario.scenarioName || 'Modified Scenario'}</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 print:bg-slate-100 print:border-slate-300">
                <span className="text-slate-500 block text-[10px] uppercase font-sans">Replications / Duration</span>
                <span className="font-bold text-slate-800 print:text-black">{deltas.replicationsCount} Pairs &bull; {baseline.durationSeconds}s</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 print:bg-slate-100 print:border-slate-300">
                <span className="text-slate-500 block text-[10px] uppercase font-sans">Warm-Up Excluded</span>
                <span className="font-bold text-slate-800 print:text-black">{deltas.warmupSeconds}s transient</span>
              </div>
            </div>
          </div>

          {/* Executive Summary Callout */}
          <div className={`p-4 rounded-xl border ${
            !isWaitSignificant 
              ? 'bg-slate-50 border-slate-200 text-slate-700 print:bg-slate-50 print:border-slate-300' 
              : isWaitBetter 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900 print:bg-emerald-50 print:border-emerald-300 print:text-black' 
              : 'bg-rose-50 border-rose-200 text-rose-900 print:bg-rose-50 print:border-rose-300 print:text-black'
          }`}>
            <div className="flex items-center gap-2 font-bold text-sm mb-1">
              <Sparkles className="w-4 h-4 text-indigo-600 print:hidden" />
              <span>Executive Briefing & Statistical Conclusion</span>
            </div>
            <p className="text-xs leading-relaxed">
              Comparison across <strong className="font-mono">{deltas.replicationsCount} paired simulation seeds</strong> indicates that 
              the proposed intervention (<strong>{scenario.scenarioName}</strong>) results in an average stopped wait time shift of{' '}
              <strong className="font-mono">{deltas.deltaAvgWaitTime > 0 ? `+${deltas.deltaAvgWaitTime.toFixed(1)}s` : `${deltas.deltaAvgWaitTime.toFixed(1)}s`} ({deltas.pctChangeAvgWaitTime > 0 ? `+${deltas.pctChangeAvgWaitTime}%` : `${deltas.pctChangeAvgWaitTime}%`})</strong>.
              {' '}
              {isWaitSignificant ? (
                <span>
                  This change is <strong className="underline decoration-emerald-600">statistically significant</strong> at the 95% confidence level (<em>p</em> &lt; 0.05), with a Student's <em>t</em>-distribution 95% Confidence Interval of [{deltas.deltaAvgWaitTimeCI?.[0]}s, {deltas.deltaAvgWaitTimeCI?.[1]}s].
                </span>
              ) : (
                <span>
                  The 95% Confidence Interval [{deltas.deltaAvgWaitTimeCI?.[0]}s, {deltas.deltaAvgWaitTimeCI?.[1]}s] spans zero, indicating that observed differences fall within expected stochastic traffic variance and are <strong className="underline decoration-slate-400">not statistically significant</strong> (<em>p</em> &gt; 0.05).
                </span>
              )}
              {' '}Total network throughput realized was <strong className="font-mono">{Math.round(deltas.scenarioMeanThroughput || 0)} veh/h</strong> vs <strong className="font-mono">{Math.round(deltas.baselineMeanThroughput || 0)} veh/h</strong> baseline (&Delta; = {deltas.deltaThroughput > 0 ? `+${Math.round(deltas.deltaThroughput)}` : `${Math.round(deltas.deltaThroughput)}`} veh/h).
            </p>
          </div>

          {/* Key Performance Indicators (KPI) Comparison Matrix */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 print:text-black mb-2.5">
              1. Performance Indicators Matrix (Mean across {deltas.replicationsCount} Replications)
            </h3>
            <table className="w-full text-xs text-left border border-slate-200 print:border-slate-300 rounded-lg overflow-hidden">
              <thead className="bg-slate-50 print:bg-slate-100 text-slate-600 print:text-black border-b border-slate-200 print:border-slate-300">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Metric</th>
                  <th className="py-2.5 px-3 font-semibold">Baseline Mean</th>
                  <th className="py-2.5 px-3 font-semibold">Scenario Mean</th>
                  <th className="py-2.5 px-3 font-semibold">Paired &Delta; (Mean &plusmn; StdDev)</th>
                  <th className="py-2.5 px-3 font-semibold">95% Confidence Interval</th>
                  <th className="py-2.5 px-3 font-semibold">Significance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 print:divide-slate-200 font-mono">
                <tr>
                  <td className="py-2 px-3 font-sans font-medium text-slate-900 print:text-black">Stopped Wait Delay</td>
                  <td className="py-2 px-3 text-slate-700 print:text-black">{(deltas.baselineMeanWaitTime ?? 0).toFixed(1)} s</td>
                  <td className="py-2 px-3 text-slate-700 print:text-black">{(deltas.scenarioMeanWaitTime ?? 0).toFixed(1)} s</td>
                  <td className="py-2 px-3 font-bold text-slate-900 print:text-black">
                    {deltas.deltaAvgWaitTime > 0 ? `+${deltas.deltaAvgWaitTime.toFixed(1)}` : deltas.deltaAvgWaitTime.toFixed(1)}s &plusmn; {(deltas.deltaAvgWaitTimeStdDev ?? 0).toFixed(1)}s
                  </td>
                  <td className="py-2 px-3 text-slate-500 print:text-black">[{deltas.deltaAvgWaitTimeCI?.[0]}, {deltas.deltaAvgWaitTimeCI?.[1]}] s</td>
                  <td className="py-2 px-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-sans font-bold ${
                      !deltas.isWaitTimeSignificant ? 'bg-slate-100 text-slate-600 print:border' :
                      deltas.deltaAvgWaitTime < 0 ? 'bg-emerald-100 text-emerald-800 print:text-black' : 'bg-rose-100 text-rose-800 print:text-black'
                    }`}>
                      {deltas.isWaitTimeSignificant ? 'p < 0.05' : 'Not Significant'}
                    </span>
                  </td>
                </tr>

                <tr>
                  <td className="py-2 px-3 font-sans font-medium text-slate-900 print:text-black">Travel Time</td>
                  <td className="py-2 px-3 text-slate-700 print:text-black">{deltas.baselineMeanTravelTime?.toFixed(1)} s</td>
                  <td className="py-2 px-3 text-slate-700 print:text-black">{deltas.scenarioMeanTravelTime?.toFixed(1)} s</td>
                  <td className="py-2 px-3 font-bold text-slate-900 print:text-black">
                    {deltas.deltaAvgTravelTime > 0 ? `+${deltas.deltaAvgTravelTime?.toFixed(1)}` : deltas.deltaAvgTravelTime?.toFixed(1)}s &plusmn; {deltas.deltaAvgTravelTimeStdDev?.toFixed(1)}s
                  </td>
                  <td className="py-2 px-3 text-slate-500 print:text-black">[{deltas.deltaAvgTravelTimeCI?.[0]}, {deltas.deltaAvgTravelTimeCI?.[1]}] s</td>
                  <td className="py-2 px-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-sans font-bold ${
                      !deltas.isTravelTimeSignificant ? 'bg-slate-100 text-slate-600 print:border' :
                      (deltas.deltaAvgTravelTime ?? 0) < 0 ? 'bg-emerald-100 text-emerald-800 print:text-black' : 'bg-rose-100 text-rose-800 print:text-black'
                    }`}>
                      {deltas.isTravelTimeSignificant ? 'p < 0.05' : 'Not Significant'}
                    </span>
                  </td>
                </tr>

                <tr>
                  <td className="py-2 px-3 font-sans font-medium text-slate-900 print:text-black">Hourly Throughput</td>
                  <td className="py-2 px-3 text-slate-700 print:text-black">{Math.round(deltas.baselineMeanThroughput || 0)} veh/h</td>
                  <td className="py-2 px-3 text-slate-700 print:text-black">{Math.round(deltas.scenarioMeanThroughput || 0)} veh/h</td>
                  <td className="py-2 px-3 font-bold text-slate-900 print:text-black">
                    {deltas.deltaThroughput > 0 ? `+${Math.round(deltas.deltaThroughput)}` : Math.round(deltas.deltaThroughput)} &plusmn; {Math.round(deltas.deltaThroughputStdDev || 0)} veh/h
                  </td>
                  <td className="py-2 px-3 text-slate-500 print:text-black">[{deltas.deltaThroughputCI?.[0]}, {deltas.deltaThroughputCI?.[1]}] veh/h</td>
                  <td className="py-2 px-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-sans font-bold ${
                      !deltas.isThroughputSignificant ? 'bg-slate-100 text-slate-600 print:border' :
                      (deltas.deltaThroughput ?? 0) > 0 ? 'bg-emerald-100 text-emerald-800 print:text-black' : 'bg-rose-100 text-rose-800 print:text-black'
                    }`}>
                      {deltas.isThroughputSignificant ? 'p < 0.05' : 'Not Significant'}
                    </span>
                  </td>
                </tr>

                <tr>
                  <td className="py-2 px-3 font-sans font-medium text-slate-900 print:text-black">Mean Speed</td>
                  <td className="py-2 px-3 text-slate-700 print:text-black">{deltas.baselineMeanSpeed?.toFixed(1)} km/h</td>
                  <td className="py-2 px-3 text-slate-700 print:text-black">{deltas.scenarioMeanSpeed?.toFixed(1)} km/h</td>
                  <td className="py-2 px-3 font-bold text-slate-900 print:text-black">
                    {deltas.deltaAvgSpeed > 0 ? `+${deltas.deltaAvgSpeed?.toFixed(1)}` : deltas.deltaAvgSpeed?.toFixed(1)} &plusmn; {deltas.deltaAvgSpeedStdDev?.toFixed(1)} km/h
                  </td>
                  <td className="py-2 px-3 text-slate-500 print:text-black">[{deltas.deltaAvgSpeedCI?.[0]}, {deltas.deltaAvgSpeedCI?.[1]}] km/h</td>
                  <td className="py-2 px-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-sans font-bold ${
                      !deltas.isSpeedSignificant ? 'bg-slate-100 text-slate-600 print:border' :
                      (deltas.deltaAvgSpeed ?? 0) > 0 ? 'bg-emerald-100 text-emerald-800 print:text-black' : 'bg-rose-100 text-rose-800 print:text-black'
                    }`}>
                      {deltas.isSpeedSignificant ? 'p < 0.05' : 'Not Significant'}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Seed-by-Seed Replication Table */}
          {replications && replications.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 print:text-black mb-2.5">
                2. Multi-Seed Paired Replications Breakdown (N = {replications.length})
              </h3>
              <table className="w-full text-xs text-left border border-slate-200 print:border-slate-300 rounded-lg overflow-hidden font-mono">
                <thead className="bg-slate-50 print:bg-slate-100 text-slate-600 print:text-black border-b border-slate-200 print:border-slate-300">
                  <tr>
                    <th className="py-2 px-3">Pair</th>
                    <th className="py-2 px-3">Seed</th>
                    <th className="py-2 px-3">Base Wait</th>
                    <th className="py-2 px-3">Scen Wait</th>
                    <th className="py-2 px-3">&Delta; Wait</th>
                    <th className="py-2 px-3">Base Throughput</th>
                    <th className="py-2 px-3">Scen Throughput</th>
                    <th className="py-2 px-3">&Delta; Throughput</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 print:divide-slate-200">
                  {replications.map((r, i) => (
                    <tr key={r.seed}>
                      <td className="py-1.5 px-3 text-slate-500 print:text-black font-sans">Pair {i + 1}</td>
                      <td className="py-1.5 px-3 text-indigo-600 print:text-black font-bold">{r.seed}</td>
                      <td className="py-1.5 px-3 text-slate-700 print:text-black">{r.baselineWait.toFixed(1)}s</td>
                      <td className="py-1.5 px-3 text-slate-700 print:text-black">{r.scenarioWait.toFixed(1)}s</td>
                      <td className="py-1.5 px-3 font-bold text-slate-900 print:text-black">
                        {r.deltaWait > 0 ? `+${r.deltaWait.toFixed(1)}s` : `${r.deltaWait.toFixed(1)}s`}
                      </td>
                      <td className="py-1.5 px-3 text-slate-700 print:text-black">{Math.round(r.baselineThroughput)} veh/h</td>
                      <td className="py-1.5 px-3 text-slate-700 print:text-black">{Math.round(r.scenarioThroughput)} veh/h</td>
                      <td className="py-1.5 px-3 font-bold text-slate-900 print:text-black">
                        {r.deltaThroughput > 0 ? `+${Math.round(r.deltaThroughput)}` : `${Math.round(r.deltaThroughput)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Road Congestion & Route Diversion Summary */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 print:text-black mb-2.5">
              3. Road Infrastructure & Route Diversion Analysis
            </h3>
            <table className="w-full text-xs text-left border border-slate-200 print:border-slate-300 rounded-lg overflow-hidden">
              <thead className="bg-slate-50 print:bg-slate-100 text-slate-600 print:text-black border-b border-slate-200 print:border-slate-300">
                <tr>
                  <th className="py-2 px-3">Edge ID</th>
                  <th className="py-2 px-3">Corridor</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">Baseline V/C</th>
                  <th className="py-2 px-3">Scenario V/C</th>
                  <th className="py-2 px-3">Impact / Routing Behavior</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 print:divide-slate-200 font-mono">
                {baseMap.edges.map((edge: RoadSegment) => {
                  const bCong = baseline.roadCongestion[edge.id];
                  const sCong = scenario.roadCongestion[edge.id];
                  const closedEdges = scenario.modifications?.closedEdgeIds || [];
                  const isClosed = closedEdges.includes(edge.id);
                  const bVc = bCong ? bCong.volumeToCapacityRatio : 0;
                  const sVc = sCong ? sCong.volumeToCapacityRatio : 0;
                  const dVc = sVc - bVc;

                  const remainingOutgoing = baseMap.edges.filter(
                    (e) => e.fromNodeId === edge.fromNodeId && !closedEdges.includes(e.id)
                  );
                  const hasAlternate = remainingOutgoing.length > 0;

                  return (
                    <tr key={edge.id}>
                      <td className="py-1.5 px-3 font-bold text-slate-900 print:text-black">{edge.id}</td>
                      <td className="py-1.5 px-3 text-slate-500 print:text-black font-sans">{edge.fromNodeId} &rarr; {edge.toNodeId}</td>
                      <td className="py-1.5 px-3">
                        {isClosed ? (
                          <span className="font-bold text-rose-600 print:text-black">CLOSED</span>
                        ) : (
                          <span className="text-slate-500 print:text-black">OPEN</span>
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-slate-700">{bVc.toFixed(2)}</td>
                      <td className="py-1.5 px-3 text-slate-700">{isClosed ? 'N/A' : sVc.toFixed(2)}</td>
                      <td className="py-1.5 px-3 font-sans">
                        {isClosed ? (
                          hasAlternate ? (
                            <span className="text-amber-700 print:text-black font-medium">Traffic Diverted to alternate corridor</span>
                          ) : (
                            <span className="text-rose-600 print:text-black font-semibold">No alternate route (Demand unserved)</span>
                          )
                        ) : dVc > 0.1 ? (
                          <span className="text-amber-700 print:text-black font-medium">+{dVc.toFixed(2)} (Higher flow / Detour load)</span>
                        ) : dVc < -0.1 ? (
                          <span className="text-emerald-700 print:text-black font-medium">{dVc.toFixed(2)} (Relieved)</span>
                        ) : (
                          <span className="text-slate-400 print:text-black">Unchanged</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer & Sign-off */}
          <div className="pt-4 border-t border-slate-200 print:border-slate-300 text-[11px] text-slate-500 print:text-slate-600 flex justify-between items-center">
            <span>CitySim Microscopic Traffic Engineering Laboratory &bull; CSE Major Project</span>
            <span>Generated from Seed {baseline.seed} &bull; Page 1 of 1</span>
          </div>

        </div>
      </div>
    </div>
  );
};
