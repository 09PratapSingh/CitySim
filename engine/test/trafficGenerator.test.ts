import test from 'node:test';
import assert from 'node:assert';
import { ODMatrix, TrafficGenerator } from '../src/trafficGenerator.ts';
import { RoadGraph } from '../src/graph.ts';
import { PRNG } from '../src/prng.ts';

function buildSimpleGraph(): RoadGraph {
  const g = new RoadGraph();
  g.addNode({ id: 'Z1', x: 0, y: 0, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });
  g.addNode({ id: 'Z2', x: 200, y: 0, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });
  g.addNode({ id: 'Z3', x: 100, y: 100, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });

  g.addEdge({ id: 'e12', fromNodeId: 'Z1', toNodeId: 'Z2', length: 200, speedLimit: 13.89, lanes: 1, isOneWay: true });
  g.addEdge({ id: 'e13', fromNodeId: 'Z1', toNodeId: 'Z3', length: 141, speedLimit: 13.89, lanes: 1, isOneWay: true });
  g.addEdge({ id: 'e32', fromNodeId: 'Z3', toNodeId: 'Z2', length: 141, speedLimit: 13.89, lanes: 1, isOneWay: true });
  return g;
}

test('ODMatrix: Correctly configures flows and computes total demand', () => {
  const matrix = new ODMatrix();
  matrix.setFlow('Z1', 'Z2', 400);
  matrix.setFlow('Z1', 'Z3', 250);

  assert.strictEqual(matrix.getFlow('Z1', 'Z2'), 400);
  assert.strictEqual(matrix.getFlow('Z1', 'Z3'), 250);
  assert.strictEqual(matrix.getFlow('Z3', 'Z2'), 0); // Unset is 0
  assert.strictEqual(matrix.getTotalHourlyDemand(), 650);

  // Throws if origin and destination are identical
  assert.throws(() => {
    matrix.setFlow('Z1', 'Z1', 100);
  });
});

test('ODMatrix: Demand scaling multiplies all flows proportionally', () => {
  const matrix = new ODMatrix();
  matrix.setFlow('A', 'B', 200);
  matrix.setFlow('A', 'C', 300);

  const rushHour = matrix.scaleDemand(1.5);
  assert.strictEqual(rushHour.getFlow('A', 'B'), 300);
  assert.strictEqual(rushHour.getFlow('A', 'C'), 450);
  assert.strictEqual(rushHour.getTotalHourlyDemand(), 750);
});

test('ODMatrix: Serializes to JSON and restores identically', () => {
  const matrix = new ODMatrix();
  matrix.setFlow('N1', 'N2', 500);
  matrix.setFlow('N1', 'N3', 150);

  const json = matrix.toJSON();
  const restored = ODMatrix.fromJSON(json);

  assert.strictEqual(restored.getTotalHourlyDemand(), 650);
  assert.strictEqual(restored.getFlow('N1', 'N2'), 500);
});

test('TrafficGenerator: Generates Poisson arrivals matching demand rate', () => {
  const graph = buildSimpleGraph();
  const matrix = new ODMatrix();
  const ratePerHour = 1800; // 1800 veh/hr = 0.5 veh/sec (mean inter-arrival = 2.0s)
  matrix.setFlow('Z1', 'Z2', ratePerHour);

  const prng = new PRNG(12345);
  const generator = new TrafficGenerator(graph, matrix, prng);

  // Poll over 100 simulated seconds
  let arrivalsCount = 0;
  for (let t = 0; t <= 100; t += 0.5) {
    const arrivals = generator.pollArrivals(t);
    arrivalsCount += arrivals.length;
  }

  // Over 100s at 0.5 veh/sec, expected arrivals ~ 50 vehicles
  assert.strictEqual(arrivalsCount >= 40 && arrivalsCount <= 60, true);
});
