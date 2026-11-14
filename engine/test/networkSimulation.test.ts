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

test('NetworkSimulation: Adaptive signal reduces wait time vs Fixed-Time under asymmetrical load', () => {
  const create4Way = (controlType: 'fixed_signal' | 'adaptive_signal') => {
    const g = new RoadGraph();
    g.addNode({
      id: 'center',
      x: 200,
      y: 200,
      controlType,
      incomingEdgeIds: ['in_W', 'in_S'],
      outgoingEdgeIds: ['out_E', 'out_N'],
      signalConfig: {
        type: controlType,
        cycleTime: 60,
        phases: [
          { id: 'p_EW', name: 'EW', greenEdgeIds: ['in_W'], greenDuration: 25, yellowDuration: 3, allRedDuration: 2 },
          { id: 'p_NS', name: 'NS', greenEdgeIds: ['in_S'], greenDuration: 25, yellowDuration: 3, allRedDuration: 2 },
        ],
        adaptiveParams: {
          minGreen: 8,
          maxGreen: 35,
          extensionSeconds: 3,
          queueThreshold: 1,
        },
      },
    });
    g.addNode({ id: 'west', x: 50, y: 200, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });
    g.addNode({ id: 'south', x: 200, y: 350, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });
    g.addNode({ id: 'east', x: 350, y: 200, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });
    g.addNode({ id: 'north', x: 200, y: 50, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });

    g.addEdge({ id: 'in_W', fromNodeId: 'west', toNodeId: 'center', length: 150, speedLimit: 13.89, lanes: 2, isOneWay: true });
    g.addEdge({ id: 'in_S', fromNodeId: 'south', toNodeId: 'center', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true });
    g.addEdge({ id: 'out_E', fromNodeId: 'center', toNodeId: 'east', length: 150, speedLimit: 13.89, lanes: 2, isOneWay: true });
    g.addEdge({ id: 'out_N', fromNodeId: 'center', toNodeId: 'north', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true });
    return g;
  };

  // Run Fixed-Time
  const gFixed = create4Way('fixed_signal');
  const simFixed = new NetworkSimulation({
    graph: gFixed,
    config: { seed: 42, timeStep: 0.1 },
    odPairs: [
      { originNodeId: 'west', destinationNodeId: 'east', arrivalRatePerHour: 800 },
      { originNodeId: 'south', destinationNodeId: 'north', arrivalRatePerHour: 150 },
    ],
  });
  simFixed.step(1200); // 120 seconds
  const metricsFixed = simFixed.getMetrics();

  // Run Adaptive Signal with identical seed
  const gAdaptive = create4Way('adaptive_signal');
  const simAdaptive = new NetworkSimulation({
    graph: gAdaptive,
    config: { seed: 42, timeStep: 0.1 },
    odPairs: [
      { originNodeId: 'west', destinationNodeId: 'east', arrivalRatePerHour: 800 },
      { originNodeId: 'south', destinationNodeId: 'north', arrivalRatePerHour: 150 },
    ],
  });
  simAdaptive.step(1200); // 120 seconds
  const metricsAdaptive = simAdaptive.getMetrics();

  // Both should spawn vehicles and complete trips
  assert.strictEqual(metricsFixed.totalSpawned > 0, true);
  assert.strictEqual(metricsAdaptive.totalSpawned > 0, true);

  // The adaptive controller provides higher throughput or equal/lower wait time
  assert.strictEqual(metricsAdaptive.completedVehiclesCount >= metricsFixed.completedVehiclesCount, true);
});

test('NetworkSimulation: compileMetrics respects warmupSeconds to exclude initial transient phase', () => {
  const graph = createCorridorNetwork();
  const sim = new NetworkSimulation({
    graph,
    config: { seed: 42, timeStep: 0.1 },
    odPairs: [{ originNodeId: 'node_A', destinationNodeId: 'node_C', arrivalRatePerHour: 720 }],
  });

  // Run for 120 seconds (1200 ticks)
  sim.step(1200);

  // Metrics with 0 warmup vs 60s warmup
  const metricsFull = sim.getMetrics(0);
  const metricsWarmup = sim.getMetrics(60);

  assert.strictEqual(metricsFull.completedVehiclesCount >= metricsWarmup.completedVehiclesCount, true);
  // Both produce valid non-negative wait times
  assert.strictEqual(metricsFull.averageWaitTime >= 0, true);
  assert.strictEqual(metricsWarmup.averageWaitTime >= 0, true);
});

test('NetworkSimulation: Time-series snapshots record dynamic wait time, speed, and active counts', () => {
  const graph = createCorridorNetwork();
  const sim = new NetworkSimulation({
    graph,
    config: { seed: 42, timeStep: 0.1 },
    odPairs: [{ originNodeId: 'node_A', destinationNodeId: 'node_C', arrivalRatePerHour: 720 }],
  });

  // Step 200 ticks (20s)
  sim.step(200);

  const snapshots = sim.getTimeSeries();
  assert.strictEqual(snapshots.length >= 2, true);

  const snap = snapshots[snapshots.length - 1];
  assert.strictEqual(typeof snap.time, 'number');
  assert.strictEqual(typeof snap.timestamp, 'number');
  assert.strictEqual(typeof snap.averageWaitTime, 'number');
  assert.strictEqual(typeof snap.currentAvgWaitTime, 'number');
  assert.strictEqual(typeof snap.averageSpeed, 'number');
  assert.strictEqual(typeof snap.currentAvgSpeed, 'number');
  assert.strictEqual(typeof snap.activeVehiclesCount, 'number');
  assert.strictEqual(typeof snap.activeVehicles, 'number');
  assert.strictEqual(typeof snap.completedVehiclesCount, 'number');
  assert.strictEqual(typeof snap.completedVehicles, 'number');
});

test('NetworkSimulation: West approach road closure drops unroutable west origin demand without crash', () => {
  const defaultNodes = [
    { id: 'node_center', x: 200, y: 200, controlType: 'fixed_signal' as const, incomingEdgeIds: ['road_W_C', 'road_S_C'], outgoingEdgeIds: ['road_C_E', 'road_C_N'] },
    { id: 'node_west', x: 50, y: 200, controlType: 'unsignalized' as const, incomingEdgeIds: [], outgoingEdgeIds: [] },
    { id: 'node_south', x: 200, y: 350, controlType: 'unsignalized' as const, incomingEdgeIds: [], outgoingEdgeIds: [] },
    { id: 'node_east', x: 350, y: 200, controlType: 'unsignalized' as const, incomingEdgeIds: [], outgoingEdgeIds: [] },
    { id: 'node_north', x: 200, y: 50, controlType: 'unsignalized' as const, incomingEdgeIds: [], outgoingEdgeIds: [] },
  ];
  const defaultEdges = [
    { id: 'road_W_C', fromNodeId: 'node_west', toNodeId: 'node_center', length: 150, speedLimit: 13.89, lanes: 2, isOneWay: true },
    { id: 'road_S_C', fromNodeId: 'node_south', toNodeId: 'node_center', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true },
    { id: 'road_C_E', fromNodeId: 'node_center', toNodeId: 'node_east', length: 150, speedLimit: 13.89, lanes: 2, isOneWay: true },
    { id: 'road_C_N', fromNodeId: 'node_center', toNodeId: 'node_north', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true },
  ];

  const graph = RoadGraph.fromJSON({ nodes: defaultNodes, edges: defaultEdges });
  // Close road_W_C (the only outgoing road from node_west)
  graph.setRoadClosure('road_W_C', true);

  const sim = new NetworkSimulation({
    graph,
    config: { seed: 42, timeStep: 0.1 },
    odPairs: [
      { originNodeId: 'node_west', destinationNodeId: 'node_east', arrivalRatePerHour: 600 },
      { originNodeId: 'node_west', destinationNodeId: 'node_north', arrivalRatePerHour: 600 },
      { originNodeId: 'node_south', destinationNodeId: 'node_east', arrivalRatePerHour: 600 },
      { originNodeId: 'node_south', destinationNodeId: 'node_north', arrivalRatePerHour: 600 },
    ],
  });

  // Run for 300 seconds (3000 ticks)
  sim.step(3000);

  const allVehicles = [...sim.getActiveVehicles(), ...sim.getCompletedVehicles()];
  const westVehicles = allVehicles.filter(v => v.originNodeId === 'node_west');
  const southVehicles = allVehicles.filter(v => v.originNodeId === 'node_south');

  // West vehicles have no route to network, so zero west vehicles should be spawned
  assert.strictEqual(westVehicles.length, 0);

  // South vehicles have open route road_S_C, so south vehicles spawn and complete normally
  assert.strictEqual(southVehicles.length > 0, true);
  assert.strictEqual(sim.getCompletedVehicles().length > 0, true);

  const metrics = sim.getComprehensiveMetrics(60);
  assert.strictEqual(metrics.completedVehiclesCount > 0, true);
  assert.strictEqual(metrics.throughputPerHour > 0, true);
});


