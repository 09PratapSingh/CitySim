import { describe, it } from 'node:test';
import assert from 'node:assert';
import { RoadGraph } from '../src/graph.ts';
import { Router } from '../src/routing.ts';
import { NetworkSimulation } from '../src/networkSimulation.ts';
import { ODMatrix } from '../src/trafficGenerator.ts';

function create3x3GridGraph(): RoadGraph {
  const graph = new RoadGraph();

  // 9 Nodes (3x3 Grid)
  graph.addNode({ id: 'node_TL', x: 200, y: 150, controlType: 'unsignalized' });
  graph.addNode({ id: 'node_TC', x: 400, y: 150, controlType: 'unsignalized' });
  graph.addNode({ id: 'node_TR', x: 600, y: 150, controlType: 'unsignalized' });

  graph.addNode({ id: 'node_ML', x: 200, y: 300, controlType: 'unsignalized' });
  graph.addNode({
    id: 'node_C',
    x: 400,
    y: 300,
    controlType: 'fixed_signal',
    signalConfig: {
      type: 'fixed_signal',
      cycleTime: 59,
      phases: [
        { id: 'phase_EW', name: 'East-West Movement', greenEdgeIds: ['road_ML_C', 'road_MR_C'], greenDuration: 25, yellowDuration: 3, allRedDuration: 1.5 },
        { id: 'phase_NS', name: 'North-South Movement', greenEdgeIds: ['road_TC_C', 'road_BC_C'], greenDuration: 25, yellowDuration: 3, allRedDuration: 1.5 },
      ],
    },
  });
  graph.addNode({ id: 'node_MR', x: 600, y: 300, controlType: 'unsignalized' });

  graph.addNode({ id: 'node_BL', x: 200, y: 450, controlType: 'unsignalized' });
  graph.addNode({ id: 'node_BC', x: 400, y: 450, controlType: 'unsignalized' });
  graph.addNode({ id: 'node_BR', x: 600, y: 450, controlType: 'unsignalized' });

  // 12 Bidirectional Links = 24 Directed Edges
  // Horizontal edges (dx = 200m)
  graph.addEdge({ id: 'road_TL_TC', fromNodeId: 'node_TL', toNodeId: 'node_TC', length: 200, lanes: 1, speedLimit: 13.89, isOneWay: true });
  graph.addEdge({ id: 'road_TC_TL', fromNodeId: 'node_TC', toNodeId: 'node_TL', length: 200, lanes: 1, speedLimit: 13.89, isOneWay: true });
  graph.addEdge({ id: 'road_TC_TR', fromNodeId: 'node_TC', toNodeId: 'node_TR', length: 200, lanes: 1, speedLimit: 13.89, isOneWay: true });
  graph.addEdge({ id: 'road_TR_TC', fromNodeId: 'node_TR', toNodeId: 'node_TC', length: 200, lanes: 1, speedLimit: 13.89, isOneWay: true });

  graph.addEdge({ id: 'road_ML_C', fromNodeId: 'node_ML', toNodeId: 'node_C', length: 200, lanes: 1, speedLimit: 13.89, isOneWay: true });
  graph.addEdge({ id: 'road_C_ML', fromNodeId: 'node_C', toNodeId: 'node_ML', length: 200, lanes: 1, speedLimit: 13.89, isOneWay: true });
  graph.addEdge({ id: 'road_C_MR', fromNodeId: 'node_C', toNodeId: 'node_MR', length: 200, lanes: 1, speedLimit: 13.89, isOneWay: true });
  graph.addEdge({ id: 'road_MR_C', fromNodeId: 'node_MR', toNodeId: 'node_C', length: 200, lanes: 1, speedLimit: 13.89, isOneWay: true });

  graph.addEdge({ id: 'road_BL_BC', fromNodeId: 'node_BL', toNodeId: 'node_BC', length: 200, lanes: 1, speedLimit: 13.89, isOneWay: true });
  graph.addEdge({ id: 'road_BC_BL', fromNodeId: 'node_BC', toNodeId: 'node_BL', length: 200, lanes: 1, speedLimit: 13.89, isOneWay: true });
  graph.addEdge({ id: 'road_BC_BR', fromNodeId: 'node_BC', toNodeId: 'node_BR', length: 200, lanes: 1, speedLimit: 13.89, isOneWay: true });
  graph.addEdge({ id: 'road_BR_BC', fromNodeId: 'node_BR', toNodeId: 'node_BC', length: 200, lanes: 1, speedLimit: 13.89, isOneWay: true });

  // Vertical edges (dy = 150m)
  graph.addEdge({ id: 'road_TL_ML', fromNodeId: 'node_TL', toNodeId: 'node_ML', length: 150, lanes: 1, speedLimit: 13.89, isOneWay: true });
  graph.addEdge({ id: 'road_ML_TL', fromNodeId: 'node_ML', toNodeId: 'node_TL', length: 150, lanes: 1, speedLimit: 13.89, isOneWay: true });
  graph.addEdge({ id: 'road_ML_BL', fromNodeId: 'node_ML', toNodeId: 'node_BL', length: 150, lanes: 1, speedLimit: 13.89, isOneWay: true });
  graph.addEdge({ id: 'road_BL_ML', fromNodeId: 'node_BL', toNodeId: 'node_ML', length: 150, lanes: 1, speedLimit: 13.89, isOneWay: true });

  graph.addEdge({ id: 'road_TC_C', fromNodeId: 'node_TC', toNodeId: 'node_C', length: 150, lanes: 1, speedLimit: 13.89, isOneWay: true });
  graph.addEdge({ id: 'road_C_TC', fromNodeId: 'node_C', toNodeId: 'node_TC', length: 150, lanes: 1, speedLimit: 13.89, isOneWay: true });
  graph.addEdge({ id: 'road_C_BC', fromNodeId: 'node_C', toNodeId: 'node_BC', length: 150, lanes: 1, speedLimit: 13.89, isOneWay: true });
  graph.addEdge({ id: 'road_BC_C', fromNodeId: 'node_BC', toNodeId: 'node_C', length: 150, lanes: 1, speedLimit: 13.89, isOneWay: true });

  graph.addEdge({ id: 'road_TR_MR', fromNodeId: 'node_TR', toNodeId: 'node_MR', length: 150, lanes: 1, speedLimit: 13.89, isOneWay: true });
  graph.addEdge({ id: 'road_MR_TR', fromNodeId: 'node_MR', toNodeId: 'node_TR', length: 150, lanes: 1, speedLimit: 13.89, isOneWay: true });
  graph.addEdge({ id: 'road_MR_BR', fromNodeId: 'node_MR', toNodeId: 'node_BR', length: 150, lanes: 1, speedLimit: 13.89, isOneWay: true });
  graph.addEdge({ id: 'road_BR_MR', fromNodeId: 'node_BR', toNodeId: 'node_MR', length: 150, lanes: 1, speedLimit: 13.89, isOneWay: true });

  return graph;
}

describe('3x3 Grid Network & Alternate Route Detour Logic', () => {
  it('A* finds direct shortest path through center in baseline (node_ML -> node_C -> node_MR)', () => {
    const graph = create3x3GridGraph();

    const route = Router.astar(graph, 'node_ML', 'node_MR');
    assert.ok(route, 'Baseline route must exist');
    assert.deepStrictEqual(route.nodePath, ['node_ML', 'node_C', 'node_MR']);
    assert.deepStrictEqual(route.edgePath, ['road_ML_C', 'road_C_MR']);
    assert.strictEqual(route.totalDistance, 400); // 200m + 200m
  });

  it('A* finds detour route via perimeter corridor when road_ML_C is closed', () => {
    const graph = create3x3GridGraph();

    // Close road_ML_C (Center Route Closure)
    graph.setRoadClosure('road_ML_C', true);

    const detourRoute = Router.astar(graph, 'node_ML', 'node_MR');
    assert.ok(detourRoute, 'Detour route must exist and not be null');
    assert.ok(!detourRoute.edgePath.includes('road_ML_C'), 'Detour must NOT use closed road_ML_C');

    // Either North corridors (via node_TL) or South corridors (via node_BL)
    const routesViaTop = detourRoute.nodePath.includes('node_TL') && detourRoute.nodePath.includes('node_TC');
    const routesViaBottom = detourRoute.nodePath.includes('node_BL') && detourRoute.nodePath.includes('node_BC');
    assert.ok(
      routesViaTop || routesViaBottom,
      `Path must detour via top corridor or bottom corridor: got ${detourRoute.nodePath.join('->')}`
    );

    // Total distance is 700m (4 segments)
    assert.strictEqual(detourRoute.totalDistance, 700);
    assert.strictEqual(detourRoute.edgePath.length, 4);
  });

  it('Full Simulation: Diverts 100% of demand via detour when road_ML_C is closed without dropping vehicles', () => {
    // 1. Run Baseline simulation
    const baseGraph = create3x3GridGraph();
    const odMatrix = new ODMatrix();
    odMatrix.setFlow('node_ML', 'node_MR', 800); // 800 veh/h primary demand

    const baseSim = new NetworkSimulation({
      graph: baseGraph,
      config: { seed: 42, timeStep: 0.1 },
      odMatrix,
    });

    // Run for 300 seconds
    baseSim.step(3000);
    const baseMetrics = baseSim.getMetrics();

    assert.ok(baseMetrics.totalSpawned > 40, `Baseline must spawn vehicles (got ${baseMetrics.totalSpawned})`);
    assert.ok(baseMetrics.completedVehiclesCount > 30, `Baseline must complete vehicles (got ${baseMetrics.completedVehiclesCount})`);
    assert.strictEqual(
      baseMetrics.totalSpawned,
      baseMetrics.completedVehiclesCount + baseMetrics.activeVehiclesCount,
      'Vehicle conservation must hold in baseline'
    );

    // 2. Run Scenario simulation with Center Route Closure (road_ML_C closed)
    const scenGraph = create3x3GridGraph();
    scenGraph.setRoadClosure('road_ML_C', true);

    const scenSim = new NetworkSimulation({
      graph: scenGraph,
      config: { seed: 42, timeStep: 0.1 },
      odMatrix,
    });

    scenSim.step(3000);
    const scenMetrics = scenSim.getMetrics();

    // Verify demand is preserved and NOT dropped!
    assert.strictEqual(
      scenMetrics.totalSpawned,
      baseMetrics.totalSpawned,
      `Identical seed (42) must spawn exact same number of arrivals (Baseline: ${baseMetrics.totalSpawned}, Scenario: ${scenMetrics.totalSpawned})`
    );

    assert.ok(
      scenMetrics.completedVehiclesCount > 25,
      `Detour scenario must complete journeys via alternate route (completed: ${scenMetrics.completedVehiclesCount})`
    );

    assert.strictEqual(
      scenMetrics.totalSpawned,
      scenMetrics.completedVehiclesCount + scenMetrics.activeVehiclesCount,
      'Vehicle conservation must strictly hold during detour'
    );

    // Travel time must be higher for the detour route because length increased from 400m to 700m
    console.log(`\n--- 3x3 Grid Detour Verification Results (300s, Seed 42) ---`);
    console.log(`Baseline (400m direct): Spawned = ${baseMetrics.totalSpawned}, Completed = ${baseMetrics.completedVehiclesCount}, Active = ${baseMetrics.activeVehiclesCount}, Mean Travel Time = ${baseMetrics.averageTravelTime.toFixed(1)}s`);
    console.log(`Scenario (700m detour): Spawned = ${scenMetrics.totalSpawned}, Completed = ${scenMetrics.completedVehiclesCount}, Active = ${scenMetrics.activeVehiclesCount}, Mean Travel Time = ${scenMetrics.averageTravelTime.toFixed(1)}s`);
    console.log(`Demand Preservation: 100% (${scenMetrics.totalSpawned} spawned, 0 dropped)\n`);

    assert.ok(
      scenMetrics.averageTravelTime > baseMetrics.averageTravelTime,
      `Detour travel time (${scenMetrics.averageTravelTime.toFixed(1)}s) must exceed baseline travel time (${baseMetrics.averageTravelTime.toFixed(1)}s) due to 75% longer path`
    );
  });
});
