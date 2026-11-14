/**
 * Single Intersection Microscopic Traffic Simulation Engine.
 * 
 * CORE RESPONSIBILITY:
 * Manages the discrete-time progression of vehicles approaching, queuing at,
 * and traversing an intersection using the Intelligent Driver Model (IDM)
 * and a seeded Poisson arrival process.
 */

import { PRNG } from './prng.ts';
import { CarFollowingModel, type LeaderObstacle } from './carFollowing.ts';
import type {
  Vehicle,
  RoadSegment,
  IntersectionNode,
  SimulationConfig,
  SimulationMetrics,
} from './types.ts';

export interface SingleIntersectionNetwork {
  intersection: IntersectionNode;
  incomingRoads: RoadSegment[];
  outgoingRoads: RoadSegment[];
  // Mapping of incoming road -> outgoing road target
  routeMap: Record<string, string>;
}

export class SingleIntersectionSimulation {
  private config: SimulationConfig;
  private prng: PRNG;
  private currentTime: number = 0;
  private vehicleCounter: number = 0;

  // Road network elements
  private intersection: IntersectionNode;
  private roads: Map<string, RoadSegment> = new Map();
  private incomingRoadIds: string[] = [];
  private outgoingRoadIds: string[] = [];
  private routeMap: Map<string, string> = new Map();

  // Control state: whether the stop line on an incoming road is open (green) or closed (red)
  private stopLineOpen: Map<string, boolean> = new Map();

  // Active and completed vehicles
  private activeVehicles: Vehicle[] = [];
  private completedVehicles: Vehicle[] = [];

  // Spawner schedules per incoming road: timestamp of next scheduled arrival
  private nextSpawnTime: Map<string, number> = new Map();

  // Peak metrics tracking
  private peakQueueLength: number = 0;

  constructor(
    config: Partial<SimulationConfig> = {},
    customNetwork?: SingleIntersectionNetwork
  ) {
    this.config = {
      timeStep: config.timeStep ?? 0.1,
      seed: config.seed ?? 42,
      arrivalRatePerHour: config.arrivalRatePerHour ?? 360, // 360 veh/hr = 0.1 veh/sec = 1 car every 10s per approach
      defaultVehicleLength: config.defaultVehicleLength ?? 4.5,
      defaultMaxAcceleration: config.defaultMaxAcceleration ?? 1.8,
      defaultDeceleration: config.defaultDeceleration ?? 2.2,
      defaultJamDistance: config.defaultJamDistance ?? 2.0,
      defaultSafeHeadway: config.defaultSafeHeadway ?? 1.2,
    };

    this.prng = new PRNG(this.config.seed);

    if (customNetwork) {
      this.initCustomNetwork(customNetwork);
    } else {
      this.initDefaultIntersection();
    }

    this.initSpawner();
  }

  /**
   * Initializes a default canonical 4-arm cross intersection:
   * - West incoming -> Center -> East outgoing (Through movement)
   * - South incoming -> Center -> North outgoing (Through movement)
   */
  private initDefaultIntersection(): void {
    const centerNode: IntersectionNode = {
      id: 'node_center',
      x: 0,
      y: 0,
      controlType: 'fixed_signal',
      incomingEdgeIds: ['road_W_in', 'road_S_in'],
      outgoingEdgeIds: ['road_E_out', 'road_N_out'],
    };

    const roadWestIn: RoadSegment = {
      id: 'road_W_in',
      fromNodeId: 'node_west',
      toNodeId: 'node_center',
      length: 150, // 150 meters
      speedLimit: 13.89, // ~50 km/h
      lanes: 1,
      isOneWay: true,
      startCoord: { x: -150, y: 0 },
      endCoord: { x: 0, y: 0 },
    };

    const roadSouthIn: RoadSegment = {
      id: 'road_S_in',
      fromNodeId: 'node_south',
      toNodeId: 'node_center',
      length: 150,
      speedLimit: 13.89,
      lanes: 1,
      isOneWay: true,
      startCoord: { x: 0, y: 150 },
      endCoord: { x: 0, y: 0 },
    };

    const roadEastOut: RoadSegment = {
      id: 'road_E_out',
      fromNodeId: 'node_center',
      toNodeId: 'node_east',
      length: 150,
      speedLimit: 13.89,
      lanes: 1,
      isOneWay: true,
      startCoord: { x: 0, y: 0 },
      endCoord: { x: 150, y: 0 },
    };

    const roadNorthOut: RoadSegment = {
      id: 'road_N_out',
      fromNodeId: 'node_center',
      toNodeId: 'node_north',
      length: 150,
      speedLimit: 13.89,
      lanes: 1,
      isOneWay: true,
      startCoord: { x: 0, y: 0 },
      endCoord: { x: 0, y: -150 },
    };

    this.intersection = centerNode;
    this.addRoad(roadWestIn, true);
    this.addRoad(roadSouthIn, true);
    this.addRoad(roadEastOut, false);
    this.addRoad(roadNorthOut, false);

    // Route connections: West traffic goes East; South traffic goes North
    this.routeMap.set('road_W_in', 'road_E_out');
    this.routeMap.set('road_S_in', 'road_N_out');

    // Default right of way: West approach is open (green), South approach is closed (red)
    this.stopLineOpen.set('road_W_in', true);
    this.stopLineOpen.set('road_S_in', false);
  }

  private initCustomNetwork(network: SingleIntersectionNetwork): void {
    this.intersection = network.intersection;
    for (const r of network.incomingRoads) {
      this.addRoad(r, true);
      this.stopLineOpen.set(r.id, true);
    }
    for (const r of network.outgoingRoads) {
      this.addRoad(r, false);
    }
    for (const [inId, outId] of Object.entries(network.routeMap)) {
      this.routeMap.set(inId, outId);
    }
  }

  private addRoad(road: RoadSegment, isIncoming: boolean): void {
    this.roads.set(road.id, road);
    if (isIncoming) {
      this.incomingRoadIds.push(road.id);
    } else {
      this.outgoingRoadIds.push(road.id);
    }
  }

  /**
   * Initializes the Poisson arrival schedule for incoming approaches.
   */
  private initSpawner(): void {
    const lambdaPerSec = this.config.arrivalRatePerHour / 3600;
    for (const roadId of this.incomingRoadIds) {
      // First vehicle scheduled after an exponential delay
      const firstArrival = this.prng.nextExponential(lambdaPerSec);
      this.nextSpawnTime.set(roadId, firstArrival);
    }
  }

  /**
   * Sets whether the stop line on an incoming approach allows vehicles through.
   * (e.g. true = green signal, false = red signal)
   */
  public setStopLineState(incomingRoadId: string, isOpen: boolean): void {
    if (!this.roads.has(incomingRoadId)) {
      throw new Error(`Unknown incoming road: ${incomingRoadId}`);
    }
    this.stopLineOpen.set(incomingRoadId, isOpen);
  }

  public getStopLineState(incomingRoadId: string): boolean {
    return this.stopLineOpen.get(incomingRoadId) ?? true;
  }

  /**
   * Advances the simulation by one discrete time-step (dt).
   */
  public tick(): void {
    const dt = this.config.timeStep;

    // 1. Check and spawn new vehicles arriving via the Poisson process
    this.spawnVehicles();

    // 2. Process vehicle physics on each road segment
    this.updateVehicleDynamics(dt);

    // 3. Handle intersection crossing and exit transitions
    this.handleTransitions();

    // 4. Update queue metrics
    this.updateQueueMetrics();

    // Advance simulation clock
    this.currentTime += dt;
  }

  /**
   * Advances the simulation by multiple time steps or seconds.
   */
  public step(count: number = 1): void {
    for (let i = 0; i < count; i++) {
      this.tick();
    }
  }

  /**
   * Spawns vehicles according to Poisson arrival distribution.
   */
  private spawnVehicles(): void {
    const lambdaPerSec = this.config.arrivalRatePerHour / 3600;

    for (const roadId of this.incomingRoadIds) {
      const scheduledTime = this.nextSpawnTime.get(roadId) ?? 0;

      if (this.currentTime >= scheduledTime) {
        const road = this.roads.get(roadId)!;
        const entryClear = this.isEntryClear(roadId);

        if (entryClear) {
          this.createAndInsertVehicle(road);
          // Schedule next arrival after current scheduled timestamp
          const nextInterval = this.prng.nextExponential(lambdaPerSec);
          this.nextSpawnTime.set(roadId, this.currentTime + nextInterval);
        } else {
          // If the entrance is jammed with a queue, back off slightly and retry next tick
          this.nextSpawnTime.set(roadId, this.currentTime + 0.5);
        }
      }
    }
  }

  /**
   * Checks if there is sufficient room at the start of the road to spawn a vehicle.
   */
  private isEntryClear(roadId: string): boolean {
    const vehiclesOnRoad = this.activeVehicles.filter(
      (v) => v.currentEdgeId === roadId
    );
    const requiredClearance =
      (this.config.defaultVehicleLength ?? 4.5) +
      (this.config.defaultJamDistance ?? 2.0);

    for (const v of vehiclesOnRoad) {
      // If any vehicle is within the entry clearance zone (near position 0)
      if (v.position < requiredClearance) {
        return false;
      }
    }
    return true;
  }

  /**
   * Creates a new vehicle instance with slight stochastic behavioral variation.
   */
  private createAndInsertVehicle(road: RoadSegment): Vehicle {
    this.vehicleCounter++;

    // Desired speed variation: +/- 10% around road speed limit
    const speedVariation = this.prng.nextFloat(0.9, 1.1);
    const desiredSpeed = road.speedLimit * speedVariation;

    const vehicle: Vehicle = {
      id: `veh_${this.vehicleCounter}`,
      length: this.config.defaultVehicleLength!,
      position: 0,
      velocity: Math.min(desiredSpeed, road.speedLimit * 0.5), // Injected at moderate entry speed
      acceleration: 0,
      maxVelocity: desiredSpeed,
      maxAcceleration: this.config.defaultMaxAcceleration!,
      desiredDeceleration: this.config.defaultDeceleration!,
      jamDistance: this.config.defaultJamDistance!,
      safeTimeHeadway: this.config.defaultSafeHeadway!,
      accelerationExponent: 4,
      currentEdgeId: road.id,
      laneIndex: 0,
      spawnTime: this.currentTime,
      totalWaitTime: 0,
      totalDistanceTravelled: 0,
      state: 'active',
    };

    this.activeVehicles.push(vehicle);
    return vehicle;
  }

  /**
   * Updates acceleration and integrates position for all vehicles on all roads.
   */
  private updateVehicleDynamics(dt: number): void {
    // Group active vehicles by road ID
    const vehiclesByRoad = new Map<string, Vehicle[]>();
    for (const roadId of this.roads.keys()) {
      vehiclesByRoad.set(roadId, []);
    }
    for (const vehicle of this.activeVehicles) {
      const list = vehiclesByRoad.get(vehicle.currentEdgeId);
      if (list) {
        list.push(vehicle);
      }
    }

    // For each road, compute IDM accelerations
    for (const [roadId, roadVehicles] of vehiclesByRoad.entries()) {
      const road = this.roads.get(roadId)!;
      // Sort vehicles by position along the road descending (furthest ahead first)
      roadVehicles.sort((a, b) => b.position - a.position);

      const isIncoming = this.incomingRoadIds.includes(roadId);
      const isStopLineOpen = this.stopLineOpen.get(roadId) ?? true;

      for (let i = 0; i < roadVehicles.length; i++) {
        const vehicle = roadVehicles[i];
        let leaderObstacle: LeaderObstacle | null = null;

        if (i > 0) {
          // Normal case: there is a vehicle ahead in the same road segment
          const leadVehicle = roadVehicles[i - 1];
          leaderObstacle = {
            position: leadVehicle.position,
            velocity: leadVehicle.velocity,
            length: leadVehicle.length,
          };
        } else if (isIncoming && !isStopLineOpen) {
          // First vehicle on an incoming road facing a closed (red) stop line:
          // Treat the stop line at the end of the road (position = road.length) as a stationary obstacle!
          leaderObstacle = {
            position: road.length,
            velocity: 0,
            length: 0, // Virtual stop bar has zero physical length
          };
        }

        // Compute IDM acceleration
        const acc = CarFollowingModel.calculateAcceleration(
          vehicle,
          road.speedLimit,
          leaderObstacle
        );

        // Integrate velocity and position
        CarFollowingModel.integrate(vehicle, acc, dt);
      }
    }
  }

  /**
   * Handles vehicles crossing the intersection or reaching their destination.
   */
  private handleTransitions(): void {
    const remainingActive: Vehicle[] = [];

    for (const vehicle of this.activeVehicles) {
      const road = this.roads.get(vehicle.currentEdgeId)!;
      const isIncoming = this.incomingRoadIds.includes(road.id);

      if (vehicle.position >= road.length) {
        if (isIncoming) {
          // Vehicle reached the end of an incoming road
          const isStopLineOpen = this.stopLineOpen.get(road.id) ?? true;

          if (isStopLineOpen) {
            // Right of way is granted: transfer to target outgoing road
            const targetRoadId = this.routeMap.get(road.id);
            if (targetRoadId && this.roads.has(targetRoadId)) {
              // Transition to outgoing road
              vehicle.currentEdgeId = targetRoadId;
              // Retain excess distance beyond intersection line for continuity
              vehicle.position = vehicle.position - road.length;
              remainingActive.push(vehicle);
            } else {
              // No outgoing road configured: trip finishes here
              this.completeVehicle(vehicle);
            }
          } else {
            // Stop line was closed: clamp position exactly to stop bar minus jam distance
            vehicle.position = Math.min(
              road.length,
              vehicle.position
            );
            vehicle.velocity = 0;
            remainingActive.push(vehicle);
          }
        } else {
          // Vehicle reached the end of an outgoing road: trip successfully completed
          this.completeVehicle(vehicle);
        }
      } else {
        remainingActive.push(vehicle);
      }
    }

    this.activeVehicles = remainingActive;
  }

  private completeVehicle(vehicle: Vehicle): void {
    vehicle.state = 'completed';
    vehicle.completionTime = this.currentTime;
    this.completedVehicles.push(vehicle);
  }

  /**
   * Evaluates current queue lengths across incoming approaches.
   * A vehicle is deemed queued if velocity < 0.5 m/s (~1.8 km/h).
   */
  private updateQueueMetrics(): void {
    let currentTotalQueued = 0;
    for (const roadId of this.incomingRoadIds) {
      const queuedCount = this.activeVehicles.filter(
        (v) => v.currentEdgeId === roadId && v.velocity < 0.5
      ).length;
      if (queuedCount > currentTotalQueued) {
        currentTotalQueued = queuedCount;
      }
    }
    if (currentTotalQueued > this.peakQueueLength) {
      this.peakQueueLength = currentTotalQueued;
    }
  }

  /**
   * Compiles the performance metrics of the simulation up to the current instant.
   */
  public getMetrics(): SimulationMetrics {
    const elapsedSeconds = Math.max(0.001, this.currentTime);
    const elapsedHours = elapsedSeconds / 3600;

    // Completed vehicle metrics
    const completedCount = this.completedVehicles.length;
    let sumTravelTime = 0;
    let sumWaitTime = 0;

    for (const v of this.completedVehicles) {
      sumTravelTime += (v.completionTime ?? this.currentTime) - v.spawnTime;
      sumWaitTime += v.totalWaitTime;
    }

    // Active vehicle speed calculation
    let sumSpeed = 0;
    for (const v of this.activeVehicles) {
      sumSpeed += v.velocity;
    }
    const averageSpeed =
      this.activeVehicles.length > 0
        ? sumSpeed / this.activeVehicles.length
        : 0;

    // Queue breakdown per incoming road
    const queueLengthByEdge: Record<string, number> = {};
    for (const roadId of this.incomingRoadIds) {
      const q = this.activeVehicles.filter(
        (v) => v.currentEdgeId === roadId && v.velocity < 0.5
      ).length;
      queueLengthByEdge[roadId] = q;
    }

    return {
      simulationTime: Number(this.currentTime.toFixed(2)),
      activeVehiclesCount: this.activeVehicles.length,
      completedVehiclesCount: completedCount,
      totalSpawned: this.vehicleCounter,
      averageSpeed: Number(averageSpeed.toFixed(2)),
      averageWaitTime:
        completedCount > 0
          ? Number((sumWaitTime / completedCount).toFixed(2))
          : 0,
      averageTravelTime:
        completedCount > 0
          ? Number((sumTravelTime / completedCount).toFixed(2))
          : 0,
      maxQueueLength: this.peakQueueLength,
      throughputPerHour: Number((completedCount / elapsedHours).toFixed(1)),
      queueLengthByEdge,
    };
  }

  // Getters for UI and testing inspection
  public getCurrentTime(): number {
    return this.currentTime;
  }

  public getActiveVehicles(): ReadonlyArray<Vehicle> {
    return this.activeVehicles;
  }

  public getCompletedVehicles(): ReadonlyArray<Vehicle> {
    return this.completedVehicles;
  }

  public getRoads(): ReadonlyMap<string, RoadSegment> {
    return this.roads;
  }

  public getIntersection(): IntersectionNode {
    return this.intersection;
  }
}
