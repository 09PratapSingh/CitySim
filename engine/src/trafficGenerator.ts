/**
 * Synthetic Traffic Generation Engine with Origin-Destination (O-D) Matrix.
 * 
 * THEORETICAL FOUNDATION FOR VIVA:
 * In civil transportation modeling, network demand is structured as an
 * Origin-Destination (O-D) Matrix:
 * 
 *        Dest 1     Dest 2    ...   Dest M
 * Orig 1 [ T_11      T_12     ...    T_1M  ]
 * Orig 2 [ T_21      T_22     ...    T_2M  ]
 *  ...   [  ...       ...     ...     ...  ]
 * Orig N [ T_N1      T_N2     ...    T_NM  ]
 * 
 * where T_ij represents the trips per hour originating at zone i and terminating at zone j.
 * 
 * Each cell (i, j) generates vehicles as an independent Poisson process:
 * - Number of arrivals in interval [t, t + dt] ~ Poisson(lambda_ij * dt)
 * - Inter-arrival time between consecutive vehicles ~ Exponential(lambda_ij)
 *   where lambda_ij = T_ij / 3600 (vehicles per second).
 * 
 * When evaluating scenarios (e.g. comparing rush-hour vs normal), a Demand Multiplier
 * alpha scales all flows uniformly: T'_ij = alpha * T_ij.
 */

import { PRNG } from './prng.ts';
import { RoadGraph } from './graph.ts';
import { Router } from './routing.ts';
import type { Vehicle, RouteResult } from './types.ts';

export interface ODFlow {
  originNodeId: string;
  destinationNodeId: string;
  ratePerHour: number;
}

export class ODMatrix {
  private flows: Map<string, ODFlow> = new Map();

  /**
   * Defines or updates the vehicle demand between an origin and destination node.
   * @param originId Origin node ID
   * @param destId Destination node ID
   * @param ratePerHour Rate in vehicles per hour
   */
  public setFlow(originId: string, destId: string, ratePerHour: number): void {
    if (originId === destId) {
      throw new Error(`Origin and destination cannot be the same node ('${originId}').`);
    }
    if (ratePerHour < 0) {
      throw new Error(`Rate per hour cannot be negative: ${ratePerHour}`);
    }

    const key = `${originId}->${destId}`;
    if (ratePerHour === 0) {
      this.flows.delete(key);
    } else {
      this.flows.set(key, {
        originNodeId: originId,
        destinationNodeId: destId,
        ratePerHour,
      });
    }
  }

  public getFlow(originId: string, destId: string): number {
    return this.flows.get(`${originId}->${destId}`)?.ratePerHour ?? 0;
  }

  public getAllFlows(): ODFlow[] {
    return Array.from(this.flows.values());
  }

  public getTotalHourlyDemand(): number {
    let total = 0;
    for (const flow of this.flows.values()) {
      total += flow.ratePerHour;
    }
    return total;
  }

  /**
   * Returns a new ODMatrix scaled by a demand multiplier (e.g., 1.5 for rush-hour peak).
   */
  public scaleDemand(multiplier: number): ODMatrix {
    if (multiplier < 0) {
      throw new Error(`Demand multiplier must be non-negative, received: ${multiplier}`);
    }
    const scaled = new ODMatrix();
    for (const flow of this.flows.values()) {
      scaled.setFlow(
        flow.originNodeId,
        flow.destinationNodeId,
        flow.ratePerHour * multiplier
      );
    }
    return scaled;
  }

  public toJSON(): ODFlow[] {
    return this.getAllFlows();
  }

  public static fromJSON(flows: ODFlow[]): ODMatrix {
    const matrix = new ODMatrix();
    for (const f of flows) {
      matrix.setFlow(f.originNodeId, f.destinationNodeId, f.ratePerHour);
    }
    return matrix;
  }
}

export interface ScheduledArrival {
  flowKey: string;
  originNodeId: string;
  destinationNodeId: string;
  route: RouteResult;
  scheduledTime: number;
}

export class TrafficGenerator {
  private graph: RoadGraph;
  private odMatrix: ODMatrix;
  private prng: PRNG;
  private nextArrivalTimes: Map<string, number> = new Map();
  private cachedRoutes: Map<string, RouteResult | null> = new Map();
  private vehicleCounter: number = 0;

  constructor(graph: RoadGraph, odMatrix: ODMatrix, prng: PRNG) {
    this.graph = graph;
    this.odMatrix = odMatrix;
    this.prng = prng;

    this.initArrivalSchedules();
  }

  /**
   * Initializes initial Poisson arrival timestamps for each OD pair.
   */
  public initArrivalSchedules(currentTime: number = 0): void {
    this.nextArrivalTimes.clear();
    this.cachedRoutes.clear();

    for (const flow of this.odMatrix.getAllFlows()) {
      const key = `${flow.originNodeId}->${flow.destinationNodeId}`;
      const lambdaPerSec = flow.ratePerHour / 3600;

      // Sample first arrival from Exponential distribution
      const firstInterval = this.prng.nextExponential(lambdaPerSec);
      this.nextArrivalTimes.set(key, currentTime + firstInterval);

      // Pre-compute A* route
      const route = Router.astar(
        this.graph,
        flow.originNodeId,
        flow.destinationNodeId,
        'travel_time'
      );
      this.cachedRoutes.set(key, route);
    }
  }

  /**
   * Re-evaluates routes when road closures or network changes occur.
   */
  public refreshRoutes(): void {
    for (const flow of this.odMatrix.getAllFlows()) {
      const key = `${flow.originNodeId}->${flow.destinationNodeId}`;
      const route = Router.astar(
        this.graph,
        flow.originNodeId,
        flow.destinationNodeId,
        'travel_time'
      );
      this.cachedRoutes.set(key, route);
    }
  }

  /**
   * Identifies any vehicle arrivals that are scheduled on or before currentTime.
   * Advances schedules forward according to the Poisson process.
   */
  public pollArrivals(currentTime: number): ScheduledArrival[] {
    const arrivals: ScheduledArrival[] = [];

    for (const flow of this.odMatrix.getAllFlows()) {
      const key = `${flow.originNodeId}->${flow.destinationNodeId}`;
      let scheduledTime = this.nextArrivalTimes.get(key);

      while (scheduledTime !== undefined && currentTime >= scheduledTime) {
        let route = this.cachedRoutes.get(key);
        if (!route) {
          route = Router.astar(
            this.graph,
            flow.originNodeId,
            flow.destinationNodeId,
            'travel_time'
          );
          this.cachedRoutes.set(key, route);
        }

        if (route && route.edgePath.length > 0) {
          arrivals.push({
            flowKey: key,
            originNodeId: flow.originNodeId,
            destinationNodeId: flow.destinationNodeId,
            route,
            scheduledTime,
          });

          // Schedule next arrival from the theoretical arrival time to prevent discretization drift
          const lambdaPerSec = flow.ratePerHour / 3600;
          const nextInterval = this.prng.nextExponential(lambdaPerSec);
          scheduledTime = scheduledTime + nextInterval;
          this.nextArrivalTimes.set(key, scheduledTime);
        } else {
          // No route reachable: back off and retry later
          this.nextArrivalTimes.set(key, currentTime + 5.0);
          break;
        }
      }
    }

    return arrivals;
  }

  /**
   * Creates a instantiated vehicle entity ready to be placed on a road.
   */
  public createVehicle(
    arrival: ScheduledArrival,
    currentTime: number,
    laneIndex: number,
    vehicleParams: {
      defaultLength?: number;
      defaultMaxAcceleration?: number;
      defaultDeceleration?: number;
      defaultJamDistance?: number;
      defaultSafeHeadway?: number;
    } = {}
  ): Vehicle {
    this.vehicleCounter++;

    const firstEdgeId = arrival.route.edgePath[0];
    const firstEdge = this.graph.getEdge(firstEdgeId)!;

    // Small driver behavioral variance (+/- 8% speed variation)
    const speedVariation = this.prng.nextFloat(0.92, 1.08);
    const desiredSpeed = firstEdge.speedLimit * speedVariation;

    const vehicle: Vehicle = {
      id: `veh_${this.vehicleCounter}`,
      length: vehicleParams.defaultLength ?? 4.5,
      position: 0,
      velocity: Math.min(desiredSpeed, firstEdge.speedLimit * 0.5),
      acceleration: 0,
      maxVelocity: desiredSpeed,
      maxAcceleration: vehicleParams.defaultMaxAcceleration ?? 1.8,
      desiredDeceleration: vehicleParams.defaultDeceleration ?? 2.2,
      jamDistance: vehicleParams.defaultJamDistance ?? 2.0,
      safeTimeHeadway: vehicleParams.defaultSafeHeadway ?? 1.2,
      accelerationExponent: 4,
      currentEdgeId: firstEdgeId,
      laneIndex,
      spawnTime: currentTime,
      totalWaitTime: 0,
      totalDistanceTravelled: 0,
      state: 'active',
      routeEdgeIds: [...arrival.route.edgePath],
      routeIndex: 0,
      originNodeId: arrival.originNodeId,
      destinationNodeId: arrival.destinationNodeId,
    };

    return vehicle;
  }

  public getODMatrix(): ODMatrix {
    return this.odMatrix;
  }

  public setODMatrix(odMatrix: ODMatrix, currentTime: number = 0): void {
    this.odMatrix = odMatrix;
    this.initArrivalSchedules(currentTime);
  }

  public getTotalSpawnedCount(): number {
    return this.vehicleCounter;
  }
}
