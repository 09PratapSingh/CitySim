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
 * Helper to compute sample mean and sample standard deviation.
 */
function computeStats(arr: number[]): { mean: number; stdDev: number } {
  const n = arr.length;
  if (n === 0) return { mean: 0, stdDev: 0 };
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  if (n === 1) return { mean: Number(mean.toFixed(2)), stdDev: 0 };
  const variance = arr.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (n - 1);
  return {
    mean: Number(mean.toFixed(2)),
    stdDev: Number(Math.sqrt(variance).toFixed(2)),
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
      const dSpeed = Number((sAgg.averageSpeed - bAgg.averageSpeed).toFixed(2));
      const dCompleted = sAgg.completedVehiclesCount - bAgg.completedVehiclesCount;

      waitDeltas.push(dWait);
      travelDeltas.push(dTravel);
      throughputDeltas.push(dThroughput);
      speedDeltas.push(dSpeed);
      completedDeltas.push(dCompleted);

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
        baselineSpeed: bAgg.averageSpeed,
        scenarioSpeed: sAgg.averageSpeed,
        deltaSpeed: dSpeed,
      });
    }

    // Compute sample mean and standard deviation for each KPI delta
    const waitStats = computeStats(waitDeltas);
    const travelStats = computeStats(travelDeltas);
    const tpStats = computeStats(throughputDeltas);
    const speedStats = computeStats(speedDeltas);
    const compStats = computeStats(completedDeltas);

    const basePrimaryAgg = primaryBaselineRun!.aggregateMetrics;
    const pctChangeAvgWaitTime = basePrimaryAgg.averageWaitTime > 0
      ? Number(((waitStats.mean / basePrimaryAgg.averageWaitTime) * 100).toFixed(1))
      : 0;

    const pctChangeAvgTravelTime = basePrimaryAgg.averageTravelTime > 0
      ? Number(((travelStats.mean / basePrimaryAgg.averageTravelTime) * 100).toFixed(1))
      : 0;

    const pctChangeThroughput = basePrimaryAgg.throughputPerHour > 0
      ? Number(((tpStats.mean / basePrimaryAgg.throughputPerHour) * 100).toFixed(1))
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

    res.status(200).json({
      success: true,
      data: {
        baseline: primaryBaselineRun,
        scenario: primaryScenarioRun,
        deltas: {
          deltaAvgWaitTime: waitStats.mean,
          deltaAvgWaitTimeStdDev: waitStats.stdDev,
          pctChangeAvgWaitTime,

          deltaAvgTravelTime: travelStats.mean,
          deltaAvgTravelTimeStdDev: travelStats.stdDev,
          pctChangeAvgTravelTime,

          deltaThroughput: tpStats.mean,
          deltaThroughputStdDev: tpStats.stdDev,
          pctChangeThroughput,

          deltaAvgSpeed: speedStats.mean,
          deltaAvgSpeedStdDev: speedStats.stdDev,

          deltaCompleted: compStats.mean,
          deltaCompletedStdDev: compStats.stdDev,

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
