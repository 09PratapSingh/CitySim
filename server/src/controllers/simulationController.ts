import type { Request, Response } from 'express';
import { DataStore } from '../models/store.ts';
import { RoadGraph } from '../../../engine/src/graph.ts';
import { ODMatrix } from '../../../engine/src/trafficGenerator.ts';
import { NetworkSimulation } from '../../../engine/src/networkSimulation.ts';
import type { MapData, ScenarioData, ScenarioModifications, RunData } from '../types.ts';

/**
 * Helper to execute a single deterministic engine simulation run.
 */
export function executeEngineRun(options: {
  baseMap: MapData;
  scenario?: ScenarioData | null;
  modifications?: ScenarioModifications | null;
  seed: number;
  durationSeconds: number;
  demandMultiplier: number;
  warmupSeconds?: number;
  timeStep?: number;
  snapshotInterval?: number;
  scenarioName?: string;
  scenarioId?: string;
}): RunData {
  const {
    baseMap,
    scenario,
    modifications,
    seed,
    durationSeconds,
    demandMultiplier,
    warmupSeconds = 0,
    timeStep = 0.1,
    snapshotInterval = 5.0,
    scenarioName = 'Simulation Run',
    scenarioId,
  } = options;

  // 1. Construct RoadGraph from Base Map
  const graph = RoadGraph.fromJSON({
    nodes: baseMap.nodes,
    edges: baseMap.edges,
  });

  // 2. Resolve and apply modifications
  const activeMods = modifications || scenario?.modifications;
  if (activeMods) {
    // Road closures
    if (Array.isArray(activeMods.closedEdgeIds)) {
      for (const closedEdgeId of activeMods.closedEdgeIds) {
        if (graph.getEdge(closedEdgeId)) {
          graph.setRoadClosure(closedEdgeId, true);
        }
      }
    }

    // Speed limit overrides
    if (Array.isArray(activeMods.speedLimitOverrides)) {
      for (const override of activeMods.speedLimitOverrides) {
        const edge = graph.getEdge(override.edgeId);
        if (edge) {
          edge.speedLimit = override.speedLimit;
        }
      }
    }

    // Signal overrides
    if (Array.isArray(activeMods.signalOverrides)) {
      for (const sigOverride of activeMods.signalOverrides) {
        const node = graph.getNode(sigOverride.nodeId);
        if (node) {
          node.controlType = sigOverride.controlType;
          if (node.signalConfig) {
            node.signalConfig.type = sigOverride.controlType;
          }
          if (sigOverride.greenDuration && node.signalConfig?.phases) {
            for (const phase of node.signalConfig.phases) {
              phase.greenDuration = sigOverride.greenDuration;
            }
          }
        }
      }
    }
  }

  // 3. Build Origin-Destination (O-D) Demand Matrix
  const odMatrix = new ODMatrix();
  const allNodes = graph.getAllNodes();

  const explicitOD = scenario?.odPairs || (baseMap as any).odPairs;
  if (Array.isArray(explicitOD) && explicitOD.length > 0) {
    for (const od of explicitOD) {
      odMatrix.setFlow(
        od.originNodeId,
        od.destinationNodeId,
        od.arrivalRatePerHour * demandMultiplier
      );
    }
  } else {
    const origins = allNodes.filter((n) => graph.getIncomingEdges(n.id).length === 0);
    const destinations = allNodes.filter((n) => graph.getOutgoingEdges(n.id).length === 0);
    const baseFlowRate = 600 * demandMultiplier;

    if (origins.length > 0 && destinations.length > 0) {
      for (const orig of origins) {
        for (const dest of destinations) {
          if (orig.id !== dest.id) {
            odMatrix.setFlow(orig.id, dest.id, baseFlowRate);
          }
        }
      }
    } else {
      for (let i = 0; i < allNodes.length; i++) {
        for (let j = 0; j < allNodes.length; j++) {
          if (i !== j && graph.getOutgoingEdges(allNodes[i].id).length > 0 && graph.getIncomingEdges(allNodes[j].id).length > 0) {
            odMatrix.setFlow(allNodes[i].id, allNodes[j].id, Math.max(100, baseFlowRate / allNodes.length));
          }
        }
      }
    }
  }

  // 4. Instantiate and execute the simulation
  const sim = new NetworkSimulation({
    graph,
    config: { seed, timeStep },
    odMatrix,
    snapshotInterval,
  });

  const totalTicks = Math.round(durationSeconds / timeStep);
  sim.step(totalTicks);

  // 5. Compile metrics with warmup period
  const comprehensiveMetrics = sim.getComprehensiveMetrics(warmupSeconds);

  return {
    scenarioId: scenarioId || scenario?.id || undefined,
    baseMapId: baseMap.id || (baseMap as any)._id || 'unknown',
    scenarioName: scenarioName || scenario?.name || 'Simulation Run',
    seed,
    durationSeconds,
    modifications: activeMods || undefined,
    aggregateMetrics: comprehensiveMetrics,
    timeSeries: comprehensiveMetrics.timeSeries,
    roadCongestion: comprehensiveMetrics.roadCongestion,
    status: 'completed',
    createdAt: new Date(),
  };
}

export async function runHeadlessSimulation(req: Request, res: Response): Promise<void> {
  try {
    const {
      baseMapId,
      scenarioId,
      modifications,
      seed: explicitSeed,
      durationSeconds = 60,
      warmupSeconds = 0,
      timeStep = 0.1,
      snapshotInterval = 5.0,
      demandMultiplier: explicitMultiplier,
    } = req.body;

    if (!baseMapId) {
      res.status(400).json({ success: false, error: 'baseMapId is required.' });
      return;
    }

    const baseMap = await DataStore.getMapById(baseMapId);
    if (!baseMap) {
      res.status(404).json({ success: false, error: `Base map with ID '${baseMapId}' not found.` });
      return;
    }

    let scenario: ScenarioData | null = null;
    if (scenarioId) {
      scenario = await DataStore.getScenarioById(scenarioId);
      if (!scenario) {
        res.status(404).json({ success: false, error: `Scenario with ID '${scenarioId}' not found.` });
        return;
      }
    }

    const seed = explicitSeed ?? scenario?.seed ?? 42;
    const demandMultiplier = explicitMultiplier ?? scenario?.demandMultiplier ?? 1.0;

    const runResult = executeEngineRun({
      baseMap,
      scenario,
      modifications,
      seed,
      durationSeconds,
      demandMultiplier,
      warmupSeconds,
      timeStep,
      snapshotInterval,
      scenarioName: scenario?.name || 'Simulation Run',
      scenarioId: scenarioId || undefined,
    });

    const savedRun = await DataStore.createRun(runResult);

    res.status(200).json({
      success: true,
      data: savedRun,
    });
  } catch (error: any) {
    console.error('Error executing simulation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Critical values t* for two-tailed Student's t-distribution at alpha = 0.05 (95% Confidence Interval).
 */
function getTCritical95(df: number): number {
  const tTable: Record<number, number> = {
    1: 12.706,
    2: 4.303,
    3: 3.182,
    4: 2.776,
    5: 2.571,
    6: 2.447,
    7: 2.365,
    8: 2.306,
    9: 2.262,
    10: 2.228,
    15: 2.131,
    20: 2.086,
    30: 2.042,
  };
  if (tTable[df]) return tTable[df];
  if (df > 30) return 1.96;
  const keys = Object.keys(tTable).map(Number).sort((a, b) => a - b);
  for (let i = 0; i < keys.length - 1; i++) {
    if (df > keys[i] && df < keys[i + 1]) {
      const frac = (df - keys[i]) / (keys[i + 1] - keys[i]);
      return Number((tTable[keys[i]] + frac * (tTable[keys[i + 1]] - tTable[keys[i]])).toFixed(3));
    }
  }
  return 2.0;
}

interface MetricStats {
  mean: number;
  stdDev: number;
  sem: number;
  ci95: [number, number];
  isSignificant: boolean;
}

/**
 * Computes sample mean, sample standard deviation, and 95% Confidence Interval
 * using Student's t-distribution (df = N - 1).
 */
function computeStats(arr: number[]): MetricStats {
  const n = arr.length;
  if (n === 0) return { mean: 0, stdDev: 0, sem: 0, ci95: [0, 0], isSignificant: false };
  const rawMean = arr.reduce((a, b) => a + b, 0) / n;
  const mean = Number(rawMean.toFixed(2));
  if (n === 1) return { mean, stdDev: 0, sem: 0, ci95: [mean, mean], isSignificant: false };

  const variance = arr.reduce((sum, x) => sum + (x - rawMean) ** 2, 0) / (n - 1);
  const stdDev = Number(Math.sqrt(variance).toFixed(2));
  const sem = Number((stdDev / Math.sqrt(n)).toFixed(2));
  const tCrit = getTCritical95(n - 1);
  const margin = Number((tCrit * (stdDev / Math.sqrt(n))).toFixed(2));
  const lower = Number((mean - margin).toFixed(2));
  const upper = Number((mean + margin).toFixed(2));
  // Statistically significant if 0 is outside [lower, upper]
  const isSignificant = (lower > 0 && upper > 0) || (lower < 0 && upper < 0);
  return {
    mean,
    stdDev,
    sem,
    ci95: [lower, upper],
    isSignificant,
  };
}

/**
 * Dual-Run Simulation Comparison endpoint:
 * Executes paired Baseline (A) and Scenario (B) runs across N replications,
 * applying Common Random Numbers variance reduction, warm-up transient exclusion,
 * and computing sample mean and standard deviation for all KPI deltas.
 */
export async function compareSimulations(req: Request, res: Response): Promise<void> {
  try {
    const {
      baseMapId,
      scenarioId,
      modifications,
      scenarioName,
      seed = 42,
      durationSeconds = 600,
      warmupSeconds = 60,
      replications = 5,
      timeStep = 0.1,
      snapshotInterval = 5.0,
      demandMultiplier: explicitMultiplier,
    } = req.body;

    if (!baseMapId) {
      res.status(400).json({ success: false, error: 'baseMapId is required.' });
      return;
    }

    const baseMap = await DataStore.getMapById(baseMapId);
    if (!baseMap) {
      res.status(404).json({ success: false, error: `Base map with ID '${baseMapId}' not found.` });
      return;
    }

    let scenario: ScenarioData | null = null;
    if (scenarioId) {
      scenario = await DataStore.getScenarioById(scenarioId);
      if (!scenario) {
        res.status(404).json({ success: false, error: `Scenario with ID '${scenarioId}' not found.` });
        return;
      }
    }

    const scenarioDemand = explicitMultiplier ?? scenario?.demandMultiplier ?? 1.0;
    const resolvedScenarioName = scenarioName || scenario?.name || 'Modified Scenario';

    // Number of paired replications (clamped between 1 and 10)
    const numReps = Math.max(1, Math.min(10, typeof replications === 'number' ? replications : 5));
    const seedsUsed: number[] = Array.from({ length: numReps }, (_, i) => seed + i * 101);

    const waitDeltas: number[] = [];
    const travelDeltas: number[] = [];
    const throughputDeltas: number[] = [];
    const speedDeltas: number[] = [];
    const completedDeltas: number[] = [];

    const baselineWaits: number[] = [];
    const scenarioWaits: number[] = [];
    const baselineTravels: number[] = [];
    const scenarioTravels: number[] = [];
    const baselineThroughputs: number[] = [];
    const scenarioThroughputs: number[] = [];
    const baselineSpeeds: number[] = [];
    const scenarioSpeeds: number[] = [];
    const baselineCompleteds: number[] = [];
    const scenarioCompleteds: number[] = [];

    const replicationDetails: Array<{
      seed: number;
      baselineWait: number;
      scenarioWait: number;
      deltaWait: number;
      baselineThroughput: number;
      scenarioThroughput: number;
      deltaThroughput: number;
      baselineTravel: number;
      scenarioTravel: number;
      deltaTravel: number;
      baselineSpeed: number;
      scenarioSpeed: number;
      deltaSpeed: number;
    }> = [];

    let primaryBaselineRun: RunData | null = null;
    let primaryScenarioRun: RunData | null = null;

    // Run paired replications (Baseline vs Scenario with identical seed per pair)
    for (let i = 0; i < seedsUsed.length; i++) {
      const repSeed = seedsUsed[i];

      const baselineRun = executeEngineRun({
        baseMap,
        scenario: null,
        modifications: null,
        seed: repSeed,
        durationSeconds,
        demandMultiplier: 1.0,
        warmupSeconds,
        timeStep,
        snapshotInterval,
        scenarioName: 'Baseline (Unmodified)',
      });

      const scenarioRun = executeEngineRun({
        baseMap,
        scenario,
        modifications,
        seed: repSeed,
        durationSeconds,
        demandMultiplier: scenarioDemand,
        warmupSeconds,
        timeStep,
        snapshotInterval,
        scenarioName: resolvedScenarioName,
        scenarioId: scenarioId || undefined,
      });

      if (i === 0) {
        primaryBaselineRun = await DataStore.createRun(baselineRun);
        primaryScenarioRun = await DataStore.createRun(scenarioRun);
      }

      const bAgg = baselineRun.aggregateMetrics;
      const sAgg = scenarioRun.aggregateMetrics;

      const dWait = Number((sAgg.averageWaitTime - bAgg.averageWaitTime).toFixed(2));
      const dTravel = Number((sAgg.averageTravelTime - bAgg.averageTravelTime).toFixed(2));
      const dThroughput = Number((sAgg.throughputPerHour - bAgg.throughputPerHour).toFixed(1));
      const bSpeedKmh = Number((bAgg.averageSpeed * 3.6).toFixed(1));
      const sSpeedKmh = Number((sAgg.averageSpeed * 3.6).toFixed(1));
      const dSpeed = Number((sSpeedKmh - bSpeedKmh).toFixed(1));
      const dCompleted = sAgg.completedVehiclesCount - bAgg.completedVehiclesCount;

      waitDeltas.push(dWait);
      travelDeltas.push(dTravel);
      throughputDeltas.push(dThroughput);
      speedDeltas.push(dSpeed);
      completedDeltas.push(dCompleted);

      baselineWaits.push(bAgg.averageWaitTime);
      scenarioWaits.push(sAgg.averageWaitTime);
      baselineTravels.push(bAgg.averageTravelTime);
      scenarioTravels.push(sAgg.averageTravelTime);
      baselineThroughputs.push(bAgg.throughputPerHour);
      scenarioThroughputs.push(sAgg.throughputPerHour);
      baselineSpeeds.push(bSpeedKmh);
      scenarioSpeeds.push(sSpeedKmh);
      baselineCompleteds.push(bAgg.completedVehiclesCount);
      scenarioCompleteds.push(sAgg.completedVehiclesCount);

      replicationDetails.push({
        seed: repSeed,
        baselineWait: bAgg.averageWaitTime,
        scenarioWait: sAgg.averageWaitTime,
        deltaWait: dWait,
        baselineThroughput: bAgg.throughputPerHour,
        scenarioThroughput: sAgg.throughputPerHour,
        deltaThroughput: dThroughput,
        baselineTravel: bAgg.averageTravelTime,
        scenarioTravel: sAgg.averageTravelTime,
        deltaTravel: dTravel,
        baselineSpeed: bSpeedKmh,
        scenarioSpeed: sSpeedKmh,
        deltaSpeed: dSpeed,
      });
    }

    // Compute sample mean, standard deviation, and 95% Confidence Interval for each KPI delta
    const waitStats = computeStats(waitDeltas);
    const travelStats = computeStats(travelDeltas);
    const tpStats = computeStats(throughputDeltas);
    const speedStats = computeStats(speedDeltas);
    const compStats = computeStats(completedDeltas);

    // Baseline & Scenario means across all replications
    const baselineMeanWaitTime = Number((baselineWaits.reduce((a, b) => a + b, 0) / numReps).toFixed(1));
    const scenarioMeanWaitTime = Number((scenarioWaits.reduce((a, b) => a + b, 0) / numReps).toFixed(1));

    const baselineMeanTravelTime = Number((baselineTravels.reduce((a, b) => a + b, 0) / numReps).toFixed(1));
    const scenarioMeanTravelTime = Number((scenarioTravels.reduce((a, b) => a + b, 0) / numReps).toFixed(1));

    const baselineMeanThroughput = Number((baselineThroughputs.reduce((a, b) => a + b, 0) / numReps).toFixed(0));
    const scenarioMeanThroughput = Number((scenarioThroughputs.reduce((a, b) => a + b, 0) / numReps).toFixed(0));

    const baselineMeanSpeed = Number((baselineSpeeds.reduce((a, b) => a + b, 0) / numReps).toFixed(1));
    const scenarioMeanSpeed = Number((scenarioSpeeds.reduce((a, b) => a + b, 0) / numReps).toFixed(1));

    const baselineMeanCompleted = Number((baselineCompleteds.reduce((a, b) => a + b, 0) / numReps).toFixed(0));
    const scenarioMeanCompleted = Number((scenarioCompleteds.reduce((a, b) => a + b, 0) / numReps).toFixed(0));

    const pctChangeAvgWaitTime = baselineMeanWaitTime > 0
      ? Number(((waitStats.mean / baselineMeanWaitTime) * 100).toFixed(1))
      : 0;

    const pctChangeAvgTravelTime = baselineMeanTravelTime > 0
      ? Number(((travelStats.mean / baselineMeanTravelTime) * 100).toFixed(1))
      : 0;

    const pctChangeThroughput = baselineMeanThroughput > 0
      ? Number(((tpStats.mean / baselineMeanThroughput) * 100).toFixed(1))
      : 0;

    // Align comparative time series from primary run
    const maxSnapshots = Math.max(primaryBaselineRun!.timeSeries.length, primaryScenarioRun!.timeSeries.length);
    const comparativeTimeSeries = [];

    for (let i = 0; i < maxSnapshots; i++) {
      const bSnap = primaryBaselineRun!.timeSeries[i] || primaryBaselineRun!.timeSeries[primaryBaselineRun!.timeSeries.length - 1];
      const sSnap = primaryScenarioRun!.timeSeries[i] || primaryScenarioRun!.timeSeries[primaryScenarioRun!.timeSeries.length - 1];
      const time = bSnap?.time ?? bSnap?.timestamp ?? sSnap?.time ?? sSnap?.timestamp ?? i * snapshotInterval;

      comparativeTimeSeries.push({
        time,
        baselineWaitTime: bSnap?.averageWaitTime ?? bSnap?.currentAvgWaitTime ?? 0,
        scenarioWaitTime: sSnap?.averageWaitTime ?? sSnap?.currentAvgWaitTime ?? 0,
        baselineSpeed: bSnap?.averageSpeed ?? (bSnap?.currentAvgSpeed ? Number((bSnap.currentAvgSpeed * 3.6).toFixed(1)) : 0),
        scenarioSpeed: sSnap?.averageSpeed ?? (sSnap?.currentAvgSpeed ? Number((sSnap.currentAvgSpeed * 3.6).toFixed(1)) : 0),
        baselineActiveVehicles: bSnap?.activeVehiclesCount ?? bSnap?.activeVehicles ?? 0,
        scenarioActiveVehicles: sSnap?.activeVehiclesCount ?? sSnap?.activeVehicles ?? 0,
        baselineCompleted: bSnap?.completedVehiclesCount ?? bSnap?.completedVehicles ?? 0,
        scenarioCompleted: sSnap?.completedVehiclesCount ?? sSnap?.completedVehicles ?? 0,
      });
    }

    // Persist primary runs into DataStore so past runs browser can access them
    try {
      const savedBase = await DataStore.createRun({
        baseMapId,
        scenarioId: 'baseline',
        scenarioName: `Baseline (${baseMap.name})`,
        seed,
        durationSeconds,
        modifications: { closedEdgeIds: [], signalOverrides: [], speedLimitOverrides: [] },
        aggregateMetrics: primaryBaselineRun!.aggregateMetrics,
        timeSeries: primaryBaselineRun!.timeSeries,
        roadCongestion: primaryBaselineRun!.roadCongestion,
        status: 'completed',
      });
      primaryBaselineRun!.id = savedBase.id;

      const savedScen = await DataStore.createRun({
        baseMapId,
        scenarioId: scenarioId || 'scenario_custom',
        scenarioName: resolvedScenarioName,
        seed,
        durationSeconds,
        modifications: modifications || scenario?.modifications || { closedEdgeIds: [], signalOverrides: [], speedLimitOverrides: [] },
        aggregateMetrics: primaryScenarioRun!.aggregateMetrics,
        timeSeries: primaryScenarioRun!.timeSeries,
        roadCongestion: primaryScenarioRun!.roadCongestion,
        status: 'completed',
      });
      primaryScenarioRun!.id = savedScen.id;
    } catch (saveErr) {
      console.warn('Could not auto-persist comparison runs to history:', saveErr);
    }

    res.status(200).json({
      success: true,
      data: {
        baseline: primaryBaselineRun,
        scenario: primaryScenarioRun,
        deltas: {
          deltaAvgWaitTime: waitStats.mean,
          deltaAvgWaitTimeStdDev: waitStats.stdDev,
          deltaAvgWaitTimeCI: waitStats.ci95,
          isWaitTimeSignificant: waitStats.isSignificant,
          baselineMeanWaitTime,
          scenarioMeanWaitTime,
          pctChangeAvgWaitTime,

          deltaAvgTravelTime: travelStats.mean,
          deltaAvgTravelTimeStdDev: travelStats.stdDev,
          deltaAvgTravelTimeCI: travelStats.ci95,
          isTravelTimeSignificant: travelStats.isSignificant,
          baselineMeanTravelTime,
          scenarioMeanTravelTime,
          pctChangeAvgTravelTime,

          deltaThroughput: tpStats.mean,
          deltaThroughputStdDev: tpStats.stdDev,
          deltaThroughputCI: tpStats.ci95,
          isThroughputSignificant: tpStats.isSignificant,
          baselineMeanThroughput,
          scenarioMeanThroughput,
          pctChangeThroughput,

          deltaAvgSpeed: speedStats.mean,
          deltaAvgSpeedStdDev: speedStats.stdDev,
          deltaAvgSpeedCI: speedStats.ci95,
          isSpeedSignificant: speedStats.isSignificant,
          baselineMeanSpeed,
          scenarioMeanSpeed,

          deltaCompleted: compStats.mean,
          deltaCompletedStdDev: compStats.stdDev,
          deltaCompletedCI: compStats.ci95,
          isCompletedSignificant: compStats.isSignificant,
          baselineMeanCompleted,
          scenarioMeanCompleted,

          deltaSpawned: primaryScenarioRun!.aggregateMetrics.totalSpawned - primaryBaselineRun!.aggregateMetrics.totalSpawned,
          deltaMaxQueue: primaryScenarioRun!.aggregateMetrics.maxQueueLength - primaryBaselineRun!.aggregateMetrics.maxQueueLength,
          warmupSeconds,
          replicationsCount: numReps,
          seedsUsed,
        },
        comparativeTimeSeries,
        replications: replicationDetails,
      },
    });
  } catch (error: any) {
    console.error('Error comparing simulations:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function listRuns(req: Request, res: Response): Promise<void> {
  try {
    const { scenarioId } = req.query;
    const runs = await DataStore.getRuns(scenarioId as string | undefined);
    res.json({ success: true, count: runs.length, data: runs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function getRun(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const run = await DataStore.getRunById(id);
    if (!run) {
      res.status(404).json({ success: false, error: `Simulation run '${id}' not found.` });
      return;
    }
    res.json({ success: true, data: run });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function generateSummaryReport(req: Request, res: Response): Promise<void> {
  try {
    const {
      baseMapName = 'Urban Network',
      scenarioName = 'Modified Scenario',
      seed = 42,
      durationSeconds = 600,
      replicationsCount = 5,
      deltas,
    } = req.body;

    const report = {
      title: 'CitySim Executive Traffic Scenario Impact Report',
      generatedAt: new Date().toISOString(),
      metadata: {
        baseMapName,
        scenarioName,
        seed,
        durationSeconds,
        replicationsCount,
      },
      summary: deltas
        ? `Simulation evaluated ${replicationsCount} paired replications using Common Random Numbers. ` +
          `Average stopped delay changed by ${deltas.deltaAvgWaitTime > 0 ? '+' : ''}${deltas.deltaAvgWaitTime?.toFixed(1)}s ` +
          `(${deltas.pctChangeAvgWaitTime > 0 ? '+' : ''}${deltas.pctChangeAvgWaitTime}%), which is ` +
          `${deltas.isWaitTimeSignificant ? 'statistically significant (p < 0.05)' : 'not statistically significant at the 95% confidence level'}. ` +
          `Throughput shifted by ${deltas.deltaThroughput > 0 ? '+' : ''}${Math.round(deltas.deltaThroughput || 0)} veh/h.`
        : 'Simulation report generated successfully.',
      deltas,
    };

    res.json({ success: true, data: report });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
