import test from 'node:test';
import assert from 'node:assert';
import { CarFollowingModel } from '../src/carFollowing.ts';
import type { Vehicle } from '../src/types.ts';

function createMockVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: 'test_veh_1',
    length: 4.5,
    position: 0,
    velocity: 0,
    acceleration: 0,
    maxVelocity: 13.89, // 50 km/h
    maxAcceleration: 1.8,
    desiredDeceleration: 2.0,
    jamDistance: 2.0,
    safeTimeHeadway: 1.2,
    accelerationExponent: 4,
    currentEdgeId: 'road_1',
    laneIndex: 0,
    spawnTime: 0,
    totalWaitTime: 0,
    totalDistanceTravelled: 0,
    state: 'active',
    ...overrides,
  };
}

test('CarFollowing: Accelerates at max rate from standstill on free road', () => {
  const veh = createMockVehicle({ velocity: 0 });
  const acc = CarFollowingModel.calculateAcceleration(veh, 13.89, null);

  // At v = 0 with no leader, acceleration should equal maxAcceleration (1.8 m/s^2)
  assert.strictEqual(Math.abs(acc - 1.8) < 1e-4, true);
});

test('CarFollowing: Free-road acceleration approaches zero near speed limit', () => {
  const veh = createMockVehicle({ velocity: 13.89 });
  const acc = CarFollowingModel.calculateAcceleration(veh, 13.89, null);

  // At v = v0, (v/v0)^4 = 1, so acc = aMax * (1 - 1) = 0
  assert.strictEqual(Math.abs(acc) < 1e-3, true);
});

test('CarFollowing: Decelerates when approaching a slower leader', () => {
  // Vehicle driving at 12 m/s, closing in on a leader ahead at 5 m/s at 20m distance
  const veh = createMockVehicle({ position: 50, velocity: 12.0 });
  const leader = {
    position: 70, // 20m ahead
    velocity: 5.0, // slower leader
    length: 4.5,
  };

  const acc = CarFollowingModel.calculateAcceleration(veh, 13.89, leader);

  // Because delta_v = 12 - 5 = 7 m/s, vehicle must brake (acc < 0)
  assert.strictEqual(acc < 0, true);
});

test('CarFollowing: Smoothly stops behind a stationary stop line without collision', () => {
  // Vehicle starting at 0m with speed 10 m/s approaching a stop line at 60m
  const veh = createMockVehicle({ position: 0, velocity: 10.0 });
  const stopLine = {
    position: 60,
    velocity: 0,
    length: 0,
  };

  const dt = 0.1;
  // Simulate 120 ticks (12 seconds) to allow complete controlled deceleration
  for (let t = 0; t < 120; t++) {
    const acc = CarFollowingModel.calculateAcceleration(veh, 13.89, stopLine);
    CarFollowingModel.integrate(veh, acc, dt);
  }

  // Vehicle must be stopped (v ~ 0)
  assert.strictEqual(veh.velocity < 0.1, true);

  // Vehicle position must not overshoot the stop line (60m)
  assert.strictEqual(veh.position <= 60, true);

  // Vehicle should settle near the jam distance s0 (~2.0m behind stop line => position ~ 58m)
  const finalDistanceToStopLine = 60 - veh.position;
  assert.strictEqual(finalDistanceToStopLine >= 1.8, true);
  assert.strictEqual(finalDistanceToStopLine <= 2.2, true);
});

test('CarFollowing: Semi-implicit Euler integration prevents negative velocity (no reverse)', () => {
  const veh = createMockVehicle({ velocity: 0.1 });
  const extremeBraking = -5.0; // strong deceleration
  const dt = 0.1;

  CarFollowingModel.integrate(veh, extremeBraking, dt);

  // Velocity should clamp to 0, not become -0.4 m/s
  assert.strictEqual(veh.velocity, 0);
  assert.strictEqual(veh.acceleration, extremeBraking);
});
