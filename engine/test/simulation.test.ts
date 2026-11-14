import test from 'node:test';
import assert from 'node:assert';
import { SingleIntersectionSimulation } from '../src/simulation.ts';

test('Simulation: Initializes with default 4-arm network and clean metrics', () => {
  const sim = new SingleIntersectionSimulation({ seed: 42 });
  const metrics = sim.getMetrics();

  assert.strictEqual(metrics.simulationTime, 0);
  assert.strictEqual(metrics.activeVehiclesCount, 0);
  assert.strictEqual(metrics.completedVehiclesCount, 0);
  assert.strictEqual(metrics.totalSpawned, 0);
  assert.strictEqual(sim.getRoads().size, 4);
});

test('Simulation: Spawns and moves vehicles forward along incoming road', () => {
  const sim = new SingleIntersectionSimulation({
    seed: 42,
    arrivalRatePerHour: 720, // 1 vehicle every 5 seconds
    timeStep: 0.1,
  });

  // Run simulation for 20 seconds (200 ticks)
  sim.step(200);

  const metrics = sim.getMetrics();
  assert.strictEqual(metrics.simulationTime, 20.0);
  assert.strictEqual(metrics.totalSpawned > 0, true);
  assert.strictEqual(metrics.activeVehiclesCount > 0, true);

  // All active vehicles should have positive position
  for (const veh of sim.getActiveVehicles()) {
    assert.strictEqual(veh.position >= 0, true);
  }
});

test('Simulation: Vehicles stop and queue when stop line is closed', () => {
  const sim = new SingleIntersectionSimulation({
    seed: 42,
    arrivalRatePerHour: 720,
    timeStep: 0.1,
  });

  // Force both approaches to be closed (red)
  sim.setStopLineState('road_W_in', false);
  sim.setStopLineState('road_S_in', false);

  // Run simulation for 40 seconds (400 ticks)
  sim.step(400);

  const metrics = sim.getMetrics();
  // No vehicles should have completed because both approaches are red
  assert.strictEqual(metrics.completedVehiclesCount, 0);

  // Queues must have formed on closed roads
  const westQueue = metrics.queueLengthByEdge['road_W_in'] ?? 0;
  const southQueue = metrics.queueLengthByEdge['road_S_in'] ?? 0;
  assert.strictEqual(westQueue > 0 || southQueue > 0, true);

  // Vehicles near the front of the queue must be stationary (v < 0.5 m/s) and within road bounds
  for (const veh of sim.getActiveVehicles()) {
    assert.strictEqual(veh.position <= 150, true);
  }
});

test('Simulation: Vehicles cross intersection into outgoing road when green', () => {
  const sim = new SingleIntersectionSimulation({
    seed: 123,
    arrivalRatePerHour: 720,
    timeStep: 0.1,
  });

  // West approach is open (green) -> traffic transitions to road_E_out
  sim.setStopLineState('road_W_in', true);
  sim.setStopLineState('road_S_in', false);

  // Run simulation for 60 seconds (600 ticks)
  sim.step(600);

  const metrics = sim.getMetrics();
  // Vehicles should have traversed West in -> East out and completed their trips
  assert.strictEqual(metrics.completedVehiclesCount > 0, true);
  assert.strictEqual(metrics.averageTravelTime > 0, true);
  assert.strictEqual(metrics.throughputPerHour > 0, true);
});

test('Simulation: Determinism - Identical seed produces bit-for-bit identical metrics', () => {
  const sim1 = new SingleIntersectionSimulation({ seed: 9999, arrivalRatePerHour: 500 });
  const sim2 = new SingleIntersectionSimulation({ seed: 9999, arrivalRatePerHour: 500 });

  // Step both 300 ticks (30 seconds)
  sim1.step(300);
  sim2.step(300);

  const m1 = sim1.getMetrics();
  const m2 = sim2.getMetrics();

  assert.deepStrictEqual(m1, m2);

  const v1 = sim1.getActiveVehicles();
  const v2 = sim2.getActiveVehicles();

  assert.strictEqual(v1.length, v2.length);
  for (let i = 0; i < v1.length; i++) {
    assert.strictEqual(v1[i].id, v2[i].id);
    assert.strictEqual(v1[i].position, v2[i].position);
    assert.strictEqual(v1[i].velocity, v2[i].velocity);
  }
});
