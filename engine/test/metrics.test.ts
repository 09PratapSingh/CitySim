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
