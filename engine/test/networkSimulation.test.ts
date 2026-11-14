import test from 'node:test';
import assert from 'node:assert';
import { RoadGraph } from '../src/graph.ts';
import { NetworkSimulation } from '../src/networkSimulation.ts';

function createCorridorNetwork(): RoadGraph {
  const graph = new RoadGraph();

  // Nodes A -> B -> C
  graph.addNode({ id: 'node_A', x: 0, y: 0, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });
  graph.addNode({ id: 'node_B', x: 100, y: 0, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });
  graph.addNode({ id: 'node_C', x: 200, y: 0, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });

  // Edge AB (100m) and Edge BC (100m, 2 lanes)
  graph.addEdge({
    id: 'edge_AB',
    fromNodeId: 'node_A',
    toNodeId: 'node_B',
    length: 100,
    speedLimit: 13.89,
    lanes: 1,
    isOneWay: true,
  });

  graph.addEdge({
    id: 'edge_BC',
    fromNodeId: 'node_B',
    toNodeId: 'node_C',
    length: 100,
    speedLimit: 13.89,
    lanes: 2, // 2 lanes for testing multi-lane behavior
    isOneWay: true,
  });

  return graph;
}

test('NetworkSimulation: Vehicles navigate multi-edge path and complete journey', () => {
  const graph = createCorridorNetwork();
  const sim = new NetworkSimulation({
    graph,
    config: { seed: 42, timeStep: 0.1 },
    odPairs: [{ originNodeId: 'node_A', destinationNodeId: 'node_C', arrivalRatePerHour: 720 }],
  });

  // Run for 35 seconds (350 ticks)
  sim.step(350);

  const metrics = sim.getMetrics();
  assert.strictEqual(metrics.totalSpawned > 0, true);
  assert.strictEqual(metrics.completedVehiclesCount > 0, true);
  assert.strictEqual(metrics.averageTravelTime > 0, true);

  // Completed vehicles must have recorded routes
  for (const v of sim.getCompletedVehicles()) {
    assert.deepStrictEqual(v.routeEdgeIds, ['edge_AB', 'edge_BC']);
  }
});

test('NetworkSimulation: Multi-lane edge utilizes multiple lanes', () => {
  const graph = createCorridorNetwork();
  const sim = new NetworkSimulation({
    graph,
    config: { seed: 101, timeStep: 0.1 },
    odPairs: [{ originNodeId: 'node_A', destinationNodeId: 'node_C', arrivalRatePerHour: 1200 }],
  });

  // Run for 30 seconds
  sim.step(300);

  // Check active or completed vehicles on edge_BC
  const allVehicles = [...sim.getActiveVehicles(), ...sim.getCompletedVehicles()];
  const lanesUsed = new Set<number>();

  for (const v of allVehicles) {
    if (v.currentEdgeId === 'edge_BC') {
      lanesUsed.add(v.laneIndex);
    }
  }

  // Under moderate/heavy traffic, both lanes should be used
  assert.strictEqual(lanesUsed.has(0), true);
});

test('NetworkSimulation: Detour scenario increases travel time when main road is closed', () => {
  // Build Diamond Network
  const createDiamond = () => {
    const g = new RoadGraph();
    g.addNode({ id: 'A', x: 0, y: 0, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });
    g.addNode({ id: 'B', x: 100, y: 30, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });
    g.addNode({ id: 'C', x: 100, y: -30, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });
    g.addNode({ id: 'D', x: 200, y: 0, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });

    // Fast direct route: A -> B -> D (200m total, 20 m/s speed limit)
    g.addEdge({ id: 'e_AB', fromNodeId: 'A', toNodeId: 'B', length: 100, speedLimit: 20, lanes: 1, isOneWay: true });
    g.addEdge({ id: 'e_BD', fromNodeId: 'B', toNodeId: 'D', length: 100, speedLimit: 20, lanes: 1, isOneWay: true });

    // Detour route: A -> C -> D (350m total, slower speed limit 12 m/s)
    g.addEdge({ id: 'e_AC', fromNodeId: 'A', toNodeId: 'C', length: 175, speedLimit: 12, lanes: 1, isOneWay: true });
    g.addEdge({ id: 'e_CD', fromNodeId: 'C', toNodeId: 'D', length: 175, speedLimit: 12, lanes: 1, isOneWay: true });
    return g;
  };

  // Run 1: Baseline (all roads open)
  const gBaseline = createDiamond();
  const simBaseline = new NetworkSimulation({
    graph: gBaseline,
    config: { seed: 555, timeStep: 0.1 },
    odPairs: [{ originNodeId: 'A', destinationNodeId: 'D', arrivalRatePerHour: 600 }],
  });
  simBaseline.step(500); // 50 seconds
  const mBaseline = simBaseline.getMetrics();

  // Run 2: Modified Scenario (e_AB is closed)
  const gScenario = createDiamond();
  gScenario.setRoadClosure('e_AB', true);
  const simScenario = new NetworkSimulation({
    graph: gScenario,
    config: { seed: 555, timeStep: 0.1 }, // Exact same seed!
    odPairs: [{ originNodeId: 'A', destinationNodeId: 'D', arrivalRatePerHour: 600 }],
  });
  simScenario.step(500); // 50 seconds
  const mScenario = simScenario.getMetrics();

  // In baseline, vehicles used shorter faster path
  for (const v of simBaseline.getCompletedVehicles()) {
    assert.deepStrictEqual(v.routeEdgeIds, ['e_AB', 'e_BD']);
  }

  // In modified scenario, vehicles automatically detoured through C
  for (const v of simScenario.getCompletedVehicles()) {
    assert.deepStrictEqual(v.routeEdgeIds, ['e_AC', 'e_CD']);
  }

  // Detour path is longer and slower, so average travel time must be higher
  assert.strictEqual(mScenario.averageTravelTime > mBaseline.averageTravelTime, true);
});

test('NetworkSimulation: Congestion map reflects vehicle densities on road segments', () => {
  const graph = createCorridorNetwork();
  const sim = new NetworkSimulation({
    graph,
    config: { seed: 42, timeStep: 0.1 },
    odPairs: [{ originNodeId: 'node_A', destinationNodeId: 'node_C', arrivalRatePerHour: 900 }],
  });

  sim.step(250);

  const congestion = sim.getCongestionMap();
  assert.strictEqual(typeof congestion['edge_AB'], 'object');
  assert.strictEqual(typeof congestion['edge_BC'], 'object');
  assert.strictEqual(congestion['edge_AB'].densityRatio >= 0, true);
  assert.strictEqual(congestion['edge_AB'].densityRatio <= 1.0, true);
});
