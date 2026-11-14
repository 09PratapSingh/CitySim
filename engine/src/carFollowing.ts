/**
 * Intelligent Driver Model (IDM) Implementation.
 * 
 * THEORETICAL FOUNDATION FOR VIVA:
 * The Intelligent Driver Model (Treiber, Hennecke, and Helbing, 2000) is one of
 * the most widely respected microscopic car-following models in traffic engineering.
 * 
 * Unlike simplistic cellular automata (e.g. Nagel-Schreckenberg), IDM models
 * continuous acceleration and deceleration based on:
 * 1. The vehicle's current velocity (v)
 * 2. The desired velocity / speed limit (v0)
 * 3. The distance to the vehicle ahead (net headway s)
 * 4. The relative speed difference to the vehicle ahead (delta_v)
 * 
 * MATHEMATICAL EQUATION:
 * 
 *   a = a_max * [ 1 - (v / v0)^delta - (s* / s)^2 ]
 * 
 * where the dynamic desired minimum headway s* is:
 * 
 *   s*(v, delta_v) = s0 + max( 0, v * T + (v * delta_v) / (2 * sqrt(a_max * b)) )
 * 
 * PARAMETERS:
 * - v0: Desired free-flow speed (m/s)
 * - s0: Minimum bumper-to-bumper standstill distance (m)
 * - T: Safe time headway (seconds)
 * - a_max: Maximum comfortable acceleration (m/s^2)
 * - b: Comfortable braking deceleration (m/s^2)
 * - delta: Acceleration exponent (standard = 4)
 */

import type { Vehicle } from './types.ts';

export interface LeaderObstacle {
  /** Distance along the road (meters) where obstacle/leader front bumper is */
  position: number;
  /** Speed of the leader/obstacle (0 for stationary stop lines) */
  velocity: number;
  /** Physical length of leader (0 for virtual stop lines) */
  length: number;
}

export class CarFollowingModel {
  /**
   * Computes the longitudinal acceleration for a vehicle at the current instant.
   * 
   * @param vehicle The subject vehicle
   * @param roadSpeedLimit Speed limit of current road segment (m/s)
   * @param leader Optional leading vehicle or stop-line obstacle
   * @returns Acceleration in m/s^2 (negative indicates braking)
   */
  public static calculateAcceleration(
    vehicle: Vehicle,
    roadSpeedLimit: number,
    leader?: LeaderObstacle | null
  ): number {
    const v = vehicle.velocity;
    // Desired speed is bounded by the road speed limit and vehicle's own max speed
    const v0 = Math.max(0.1, Math.min(vehicle.maxVelocity, roadSpeedLimit));
    const aMax = vehicle.maxAcceleration;
    const b = vehicle.desiredDeceleration;
    const s0 = vehicle.jamDistance;
    const T = vehicle.safeTimeHeadway;
    const delta = vehicle.accelerationExponent;

    // 1. Free-road term: vehicle accelerates toward desired speed v0
    // When v = 0, (v/v0)^delta = 0 => acceleration = aMax
    // When v = v0, (v/v0)^delta = 1 => acceleration = 0 (equilibrium free speed)
    const freeRoadTerm = 1 - Math.pow(v / v0, delta);

    // If there is no leader ahead, vehicle only experiences free-road acceleration
    if (!leader) {
      return aMax * freeRoadTerm;
    }

    // 2. Interaction term: calculate net distance to leader's rear bumper
    // Net headway s = leader front position - leader length - vehicle front position
    const netDistance = (leader.position - leader.length) - vehicle.position;

    // Safety clamp: if vehicles are overlapping or touching, apply emergency deceleration
    if (netDistance <= 0.01) {
      return -Math.max(b * 3, 6.0); // Emergency hard braking
    }

    // Relative speed: delta_v = v_subject - v_leader
    // Positive if subject is closing in on the leader
    const deltaV = v - leader.velocity;

    // Dynamic desired gap s*
    const dynamicTerm = (v * deltaV) / (2 * Math.sqrt(aMax * b));
    const desiredGap = s0 + Math.max(0, v * T + dynamicTerm);

    // Interaction term: (s* / s)^2
    const interactionTerm = Math.pow(desiredGap / netDistance, 2);

    // Net acceleration
    let a = aMax * (freeRoadTerm - interactionTerm);

    // Clamp extreme negative deceleration to prevent non-physical infinite braking
    const maxBrakingDeceleration = -9.0; // ~0.9g emergency limit
    if (a < maxBrakingDeceleration) {
      a = maxBrakingDeceleration;
    }

    return a;
  }

  /**
   * Updates vehicle velocity and position using Semi-Implicit Euler integration.
   * 
   * NUMERICAL INTEGRATION NOTE FOR VIVA:
   * Explicit Forward Euler (x_new = x + v * dt; v_new = v + a * dt) can be unstable
   * in car-following systems and introduce artificial energy.
   * Semi-Implicit Euler updates velocity first, then uses the updated velocity to
   * advance position (v_new = v + a*dt; x_new = x + v_new*dt), which preserves
   * physical stability and avoids overshoot.
   * 
   * @param vehicle Vehicle to update
   * @param acceleration Computed acceleration for this time step (m/s^2)
   * @param dt Integration time step in seconds
   */
  public static integrate(vehicle: Vehicle, acceleration: number, dt: number): void {
    vehicle.acceleration = acceleration;

    // Update velocity and prevent reversing (cars cannot reverse on a forward lane)
    let newVelocity = Math.max(0, vehicle.velocity + acceleration * dt);
    // If moving very slowly and braking, snap to complete standstill (brake hold)
    if (newVelocity < 0.05 && acceleration < 0) {
      newVelocity = 0;
    }

    // Update position along the road segment using updated velocity
    const distanceMoved = newVelocity * dt;
    vehicle.position += distanceMoved;
    vehicle.velocity = newVelocity;
    vehicle.totalDistanceTravelled += distanceMoved;

    // Update delay metrics: if moving slower than 0.5 m/s (~1.8 km/h), treat as delayed/queued
    if (newVelocity < 0.5) {
      vehicle.totalWaitTime += dt;
    }
  }
}
