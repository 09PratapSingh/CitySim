import React, { useState, useEffect } from 'react';
import { 
  History, 
  X, 
  Download, 
  Eye, 
  Code, 
  Search, 
  RefreshCw 
} from 'lucide-react';
import { fetchRuns } from '../api/client.ts';
import type { RunData } from '../types.ts';

interface PastRunsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInspectRun?: (run: RunData) => void;
}

export const PastRunsModal: React.FC<PastRunsModalProps> = ({
  isOpen,
  onClose,
  onInspectRun,
}) => {
  const [runs, setRuns] = useState<RunData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedRunJson, setSelectedRunJson] = useState<RunData | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadRuns();
      setSelectedRunJson(null);
      setSearchFilter('');
    }
  }, [isOpen]);

  const loadRuns = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRuns();
      setRuns(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch historical runs');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadCSV = (run: RunData) => {
    const headers = ['Time (s)', 'Active Vehicles', 'Completed Vehicles', 'Avg Speed (km/h)', 'Avg Wait Time (s)', 'Throughput (veh/h)', 'Max Queue'];
    const rows = (run.timeSeries || []).map((s) => [
      s.time ?? (s as any).timestamp ?? 0,
      s.activeVehiclesCount ?? (s as any).activeVehicles ?? 0,
      s.completedVehiclesCount ?? (s as any).completedVehicles ?? 0,
      s.averageSpeed ?? (s as any).currentAvgSpeed ? Number(((s as any).currentAvgSpeed * 3.6).toFixed(1)) : 0,
      s.averageWaitTime ?? (s as any).currentAvgWaitTime ?? 0,
      s.throughputPerHour ?? (s as any).currentThroughputRate ?? 0,
      s.maxQueueLength ?? 0,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `citysim-run-${run.id || run._id || 'history'}-seed${run.seed}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  const filteredRuns = runs.filter((r) => {
    const term = searchFilter.toLowerCase();
    const name = (r.scenarioName || '').toLowerCase();
    const map = (r.baseMapId || '').toLowerCase();
    const id = (r.id || r._id || '').toLowerCase();
    return name.includes(term) || map.includes(term) || id.includes(term);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 select-none">
      <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-200">
              <History className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">Historical Simulation Runs Browser</h2>
              <p className="text-xs text-slate-500">View, inspect, and export simulation execution records stored in the database</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadRuns}
              disabled={loading}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200 transition"
              title="Refresh Runs"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="px-6 py-3 border-b border-slate-200 bg-white flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by scenario name, base map, or run ID..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
            />
          </div>
          <span className="text-xs font-mono text-slate-500">
            {filteredRuns.length} of {runs.length} runs
          </span>
        </div>

        {/* Main Content Area */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-16 text-slate-500 text-xs">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
              Loading historical runs from database...
            </div>
          ) : filteredRuns.length === 0 ? (
            <div className="text-center py-16 text-slate-500 text-xs space-y-2">
              <History className="w-8 h-8 mx-auto text-slate-400 mb-2" />
              <p className="font-semibold text-slate-700">No simulation runs recorded yet.</p>
              <p className="text-slate-500 text-[11px]">Run a scenario comparison or live simulation to populate history.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-[11px]">
                    <th className="py-2.5 px-3">Run & Scenario</th>
                    <th className="py-2.5 px-3">Map</th>
                    <th className="py-2.5 px-3">Seed / Time</th>
                    <th className="py-2.5 px-3">Avg Wait</th>
                    <th className="py-2.5 px-3">Avg Speed</th>
                    <th className="py-2.5 px-3">Throughput</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {filteredRuns.map((run) => {
                    const id = run.id || run._id || 'unknown';
                    const wait = run.aggregateMetrics?.averageWaitTime ?? 0;
                    const speed = (run.aggregateMetrics?.averageSpeed ?? 0) * 3.6;
                    const tp = run.aggregateMetrics?.throughputPerHour ?? 0;
                    const completed = run.aggregateMetrics?.completedVehiclesCount ?? 0;
                    const dateStr = run.createdAt ? new Date(run.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recent';

                    return (
                      <tr key={id} className="hover:bg-slate-50 transition">
                        <td className="py-3 px-3">
                          <div className="font-sans font-bold text-slate-900">
                            {run.scenarioName || 'Unnamed Simulation'}
                          </div>
                          <div className="text-[10px] text-slate-500 flex items-center gap-2 pt-0.5">
                            <span>ID: {id.slice(-8)}</span>
                            <span>&bull;</span>
                            <span>{dateStr}</span>
                          </div>
                        </td>

                        <td className="py-3 px-3 text-slate-600 font-sans">
                          {run.baseMapId}
                        </td>

                        <td className="py-3 px-3 text-slate-700">
                          <div>Seed {run.seed}</div>
                          <div className="text-[10px] text-slate-500 font-sans">{run.durationSeconds}s run</div>
                        </td>

                        <td className="py-3 px-3 text-slate-900 font-bold">
                          {wait.toFixed(1)}s
                        </td>

                        <td className="py-3 px-3 text-slate-700">
                          {speed.toFixed(1)} km/h
                        </td>

                        <td className="py-3 px-3 text-slate-700">
                          <div>{Math.round(tp)} veh/h</div>
                          <div className="text-[10px] text-slate-500">{completed} trips</div>
                        </td>

                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {onInspectRun && (
                              <button
                                onClick={() => {
                                  onInspectRun(run);
                                  onClose();
                                }}
                                className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 text-[11px] font-sans flex items-center gap-1 transition"
                                title="Inspect Run Metrics"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Inspect</span>
                              </button>
                            )}

                            <button
                              onClick={() => handleDownloadCSV(run)}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                              title="Download Run CSV"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => setSelectedRunJson(run)}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                              title="View Raw JSON"
                            >
                              <Code className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Raw JSON Viewer Sub-Modal */}
          {selectedRunJson && (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">
                  Raw JSON Record: {selectedRunJson.id || selectedRunJson._id}
                </span>
                <button
                  onClick={() => setSelectedRunJson(null)}
                  className="text-xs text-slate-500 hover:text-slate-900 font-semibold"
                >
                  Close JSON
                </button>
              </div>
              <pre className="text-[10px] font-mono text-slate-800 bg-white border border-slate-200 p-3 rounded-lg overflow-x-auto max-h-56">
                {JSON.stringify(selectedRunJson, null, 2)}
              </pre>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
