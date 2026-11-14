import type { Request, Response } from 'express';
import { DataStore } from '../models/store.ts';
import { RoadGraph } from '../../../engine/src/graph.ts';
import { ODMatrix } from '../../../engine/src/trafficGenerator.ts';
import { NetworkSimulation } from '../../../engine/src/networkSimulation.ts';
import { SignalControllerFactory } from '../../../engine/src/signals.ts';
import type { MapData, ScenarioData } from '../types.ts';

export async function runHeadlessSimulation(req: Request, res: Response): Promise<void> {
  try {
    const {
      baseMapId,
      scenarioId,
      seed: explicitSeed,
      durationSeconds = 60,
      timeStep = 0.1,
      snapshotInterval = 5.0,
      demandMultiplier: explicitMultiplier,
    } = req.body;

    if (!baseMapId) {
      res.status(400).json({ success: false, error: 'baseMapId is required.' });
      return;
    }

    // 1. Fetch Base Map
    const baseMap = await DataStore.getMapById(baseMapId);
    if (!baseMap) {
      res.status(404).json({ success: false, error: `Base map with ID '${baseMapId}' not found.` });
      return;
    }

    // 2. Fetch Scenario (if provided)
    let scenario: ScenarioData | null = null;
    if (scenarioId) {
      scenario = await DataStore.getScenarioById(scenarioId);
      if (!scenario) {
        res.status(404).json({ success: false, error: `Scenario with ID '${scenarioId}' not found.` });
        return;
      }
    }

    // 3. Resolve execution parameters
    const seed = explicitSeed ?? scenario?.seed ?? 42;
    const demandMultiplier = explicitMultiplier ?? scenario?.demandMultiplier ?? 1.0;

    // 4. Construct RoadGraph from Base Map
    const graph = RoadGraph.fromJSON({
      nodes: baseMap.nodes,
      edges: baseMap.edges,
    });

    // 5. Apply Scenario Modifications
    if (scenario && scenario.modifications) {
      // Road closures
      if (Array.isArray(scenario.modifications.closedEdgeIds)) {
        for (const closedEdgeId of scenario.modifications.closedEdgeIds) {
          if (graph.getEdge(closedEdgeId)) {
            graph.setRoadClosure(closedEdgeId, true);
          }
        }
      }

      // Speed limit overrides
      if (Array.isArray(scenario.modifications.speedLimitOverrides)) {
        for (const override of scenario.modifications.speedLimitOverrides) {
          const edge = graph.getEdge(override.edgeId);
          if (edge) {
            edge.speedLimit = override.speedLimit;
          }
        }
      }

      // Signal overrides
      if (Array.isArray(scenario.modifications.signalOverrides)) {
        for (const sigOverride of scenario.modifications.signalOverrides) {
          const node = graph.getNode(sigOverride.nodeId);
          if (node) {
            node.controlType = sigOverride.controlType;
          }
        }
      }
    }

    // 6. Build Origin-Destination (O-D) Demand Matrix
    const odMatrix = new ODMatrix();
    const allNodes = graph.getAllNodes();

    // Identify entry nodes (nodes with 0 incoming edges or boundary endpoints)
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
      // General planar graph: create flows between any nodes separated by >= 2 edges
      for (let i = 0; i < allNodes.length; i++) {
        for (let j = 0; j < allNodes.length; j++) {
          if (i !== j && graph.getOutgoingEdges(allNodes[i].id).length > 0 && graph.getIncomingEdges(allNodes[j].id).length > 0) {
            odMatrix.setFlow(allNodes[i].id, allNodes[j].id, Math.max(100, baseFlowRate / allNodes.length));
          }
        }
      }
    }

    // 7. Instantiate and execute the simulation
    const sim = new NetworkSimulation({
      graph,
      config: { seed, timeStep },
      odMatrix,
      snapshotInterval,
    });

    const totalTicks = Math.round(durationSeconds / timeStep);
    sim.step(totalTicks);

    // 8. Compile metrics
    const comprehensiveMetrics = sim.getComprehensiveMetrics();

    // 9. Persist simulation run in DataStore
    const savedRun = await DataStore.createRun({
      scenarioId: scenarioId || undefined,
      baseMapId,
      scenarioName: scenario?.name || 'Baseline Simulation',
      seed,
      durationSeconds,
      aggregateMetrics: comprehensiveMetrics,
      timeSeries: comprehensiveMetrics.timeSeries,
      roadCongestion: comprehensiveMetrics.roadCongestion,
      status: 'completed',
    });

    res.status(200).json({
      success: true,
      data: savedRun,
    });
  } catch (error: any) {
    console.error('Error executing simulation:', error);
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
