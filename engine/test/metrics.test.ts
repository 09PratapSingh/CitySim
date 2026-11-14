import test from 'node:test';
import assert from 'node:assert';
import { RoadGraph } from '../src/graph.ts';
import { NetworkSimulation } from '../src/networkSimulation.ts';
import { ODMatrix } from '../src/trafficGenerator.ts';

function createTestCorridor(): RoadGraph {
  const g = new RoadGraph();
  g.addNode({ id: 'N1', x: 0, y: 0, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });
  g.addNode({ id: 'N2', x: 150, y: 0, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });
  g.addNode({ id: 'N3', x: 300, y: 0, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });

  g.addEdge({ id: 'e1', fromNodeId: 'N1', toNodeId: 'N2', length: 150, speedLimit: 15.0, lanes: 1, isOneWay: true });
  g.addEdge({ id: 'e2', fromNodeId: 'N2', toNodeId: 'N3', length: 150, speedLimit: 15.0, lanes: 2, isOneWay: true });
  return g;
}

test('Metrics: Law of Throughput Conservation holds strictly', () => {
  const graph = createTestCorridor();
  const odMatrix = new ODMatrix();
  odMatrix.setFlow('N1', 'N3', 900); // 900 veh/hr

  const sim = new NetworkSimulation({
    graph,
    config: { seed: 42, timeStep: 0.1 },
    odMatrix,
    snapshotInterval: 5.0,
  });

  // Run for 40 seconds (400 ticks)
  sim.step(400);

  const metrics = sim.getComprehensiveMetrics();

  // Law of Conservation: Total Spawned == Active Vehicles + Completed Vehicles
  const totalAccountedFor = metrics.activeVehiclesCount + metrics.completedVehiclesCount;
  assert.strictEqual(metrics.totalSpawned, totalAccountedFor);
  assert.strictEqual(metrics.totalSpawned > 0, true);
});

test('Metrics: Travel Time Index (TTI) is >= 1.0 and delay <= total travel time', () => {
  const graph = createTestCorridor();
  const odMatrix = new ODMatrix();
  odMatrix.setFlow('N1', 'N3', 1000);

  const sim = new NetworkSimulation({
    graph,
    config: { seed: 101, timeStep: 0.1 },
    odMatrix,
  });

  sim.step(500); // 50 seconds

  const metrics = sim.getComprehensiveMetrics();
  assert.strictEqual(metrics.completedVehiclesCount > 0, true);

  // TTI = Average Travel Time / Free Flow Travel Time >= 1.0
  assert.strictEqual(metrics.travelTimeIndex >= 1.0, true);

  // Average stopped delay must not exceed total travel time
  assert.strictEqual(metrics.averageWaitTime <= metrics.averageTravelTime, true);
});

test('Metrics: Periodic time-series snapshots are recorded at configured intervals', () => {
  const graph = createTestCorridor();
  const odMatrix = new ODMatrix();
  odMatrix.setFlow('N1', 'N3', 600);

  const sim = new NetworkSimulation({
    graph,
    config: { seed: 88, timeStep: 0.1 },
    odMatrix,
    snapshotInterval: 5.0, // Every 5 seconds
  });

  // Step 30 seconds
  sim.step(300);

  const timeSeries = sim.getTimeSeries();

  // For 30s with 5s intervals, expect at least 6 snapshots (0s, 5s, 10s, 15s, 20s, 25s, 30s)
  assert.strictEqual(timeSeries.length >= 6, true);

  // Timestamps must be monotonically increasing
  for (let i = 1; i < timeSeries.length; i++) {
    assert.strictEqual(timeSeries[i].timestamp > timeSeries[i - 1].timestamp, true);
  }
});

test('Metrics: Segment-level congestion data computes valid density and speed metrics', () => {
  const graph = createTestCorridor();
  const odMatrix = new ODMatrix();
  odMatrix.setFlow('N1', 'N3', 800);

  const sim = new NetworkSimulation({
    graph,
    config: { seed: 55, timeStep: 0.1 },
    odMatrix,
  });

  sim.step(250);

  const congestion = sim.getCongestionMap();
  assert.notStrictEqual(congestion['e1'], undefined);
  assert.notStrictEqual(congestion['e2'], undefined);

  // Density ratio must be bounded between 0.0 and 1.0
  assert.strictEqual(congestion['e1'].densityRatio >= 0.0, true);
  assert.strictEqual(congestion['e1'].densityRatio <= 1.0, true);
  assert.strictEqual(congestion['e1'].averageSpeed >= 0.0, true);
});

test('Metrics: Zero vehicles state avoids NaN and defaults to clean free-flow values', () => {
  const graph = createTestCorridor();
  const odMatrix = new ODMatrix(); // No traffic demand

  const sim = new NetworkSimulation({
    graph,
    config: { seed: 1, timeStep: 0.1 },
    odMatrix,
  });

  sim.step(10); // 1 second with 0 vehicles

  const metrics = sim.getComprehensiveMetrics();

  // Zero vehicles: average speed and wait time must be strictly 0, never NaN
  assert.strictEqual(metrics.activeVehiclesCount, 0);
  assert.strictEqual(metrics.averageSpeed, 0);
  assert.strictEqual(metrics.avgSpeed, 0);
  assert.strictEqual(isNaN(metrics.averageSpeed), false);
  assert.strictEqual(metrics.averageWaitTime, 0);
  assert.strictEqual(metrics.avgWaitTime, 0);
  assert.strictEqual(isNaN(metrics.averageWaitTime), false);
  assert.strictEqual(metrics.throughputPerHour, 0);

  // All roads must be FREE_FLOW with 0 density ratio
  const congestion = metrics.roadCongestion;
  for (const edgeId of ['e1', 'e2']) {
    const seg = congestion[edgeId];
    assert.strictEqual(seg.vehicleCount, 0);
    assert.strictEqual(seg.densityRatio, 0);
    assert.strictEqual(seg.volumeToCapacityRatio, 0);
    assert.strictEqual(seg.density, 0);
    assert.strictEqual(seg.congestionLevel, 'FREE_FLOW');
  }
});

test('Metrics: Field name aliases match standard properties for client compatibility', () => {
  const graph = createTestCorridor();
  const odMatrix = new ODMatrix();
  odMatrix.setFlow('N1', 'N3', 600);

  const sim = new NetworkSimulation({
    graph,
    config: { seed: 99, timeStep: 0.1 },
    odMatrix,
  });

  sim.step(300); // 30 seconds

  const metrics = sim.getComprehensiveMetrics();

  assert.strictEqual(metrics.activeVehicleCount, metrics.activeVehiclesCount);
  assert.strictEqual(metrics.totalCompleted, metrics.completedVehiclesCount);
  assert.strictEqual(metrics.totalGenerated, metrics.totalSpawned);
  assert.strictEqual(metrics.avgSpeed, metrics.averageSpeed);
  assert.strictEqual(metrics.avgWaitTime, metrics.averageWaitTime);
  assert.strictEqual(metrics.avgTravelTime, metrics.averageTravelTime);
  assert.strictEqual(metrics.currentTime, metrics.simulationTime);

  // Check road congestion aliases
  for (const seg of Object.values(metrics.roadCongestion)) {
    assert.strictEqual(seg.volumeToCapacityRatio, seg.densityRatio);
    assert.strictEqual(typeof seg.density, 'number');
    assert.strictEqual(['FREE_FLOW', 'MODERATE', 'HEAVY', 'CONGESTED'].includes(seg.congestionLevel), true);
  }
});

test('Metrics: Default 4-Way map 120-second run strictly conserves vehicles and tracks throughput', () => {
  const defaultMap = {
    nodes: [
      { id: 'node_center', x: 200, y: 200, controlType: 'fixed_signal', incomingEdgeIds: [], outgoingEdgeIds: [] },
      { id: 'node_west', x: 50, y: 200, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] },
      { id: 'node_south', x: 200, y: 350, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] },
      { id: 'node_east', x: 350, y: 200, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] },
      { id: 'node_north', x: 200, y: 50, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] },
    ],
    edges: [
      { id: 'road_W_C', fromNodeId: 'node_west', toNodeId: 'node_center', length: 150, speedLimit: 13.89, lanes: 2, isOneWay: true },
      { id: 'road_S_C', fromNodeId: 'node_south', toNodeId: 'node_center', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true },
      { id: 'road_C_E', fromNodeId: 'node_center', toNodeId: 'node_east', length: 150, speedLimit: 13.89, lanes: 2, isOneWay: true },
      { id: 'road_C_N', fromNodeId: 'node_center', toNodeId: 'node_north', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true },
    ],
  };

  const graph = RoadGraph.fromJSON(defaultMap as any);
  const odMatrix = new ODMatrix();
  odMatrix.setFlow('node_west', 'node_east', 600);
  odMatrix.setFlow('node_west', 'node_north', 600);
  odMatrix.setFlow('node_south', 'node_east', 600);
  odMatrix.setFlow('node_south', 'node_north', 600);

  const sim = new NetworkSimulation({
    graph,
    config: { seed: 42, timeStep: 0.1 },
    odMatrix,
  });

  // Run 120 seconds (1200 ticks)
  sim.step(1200);

  const metrics = sim.getComprehensiveMetrics();

  // Strict conservation: Spawned = Active + Completed
  assert.strictEqual(metrics.totalSpawned, metrics.activeVehiclesCount + metrics.completedVehiclesCount);
  assert.strictEqual(metrics.completedVehiclesCount > 0, true);
  assert.strictEqual(metrics.throughputPerHour > 0, true);
  assert.strictEqual(metrics.averageSpeed > 0, true);
  assert.strictEqual(metrics.averageSpeed <= 13.89, true);
});
