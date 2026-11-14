/**
 * Multi-Road Network Microscopic Simulation Engine.
 * 
 * CORE RESPONSIBILITY FOR STAGE 2 & 3:
 * Simulates microscopic vehicle movement across an arbitrary directed graph network.
 * Features:
 * - A* / Dijkstra based Origin-to-Destination (O-D) routing.
 * - Multi-edge path progression and intersection traversal.
 * - Multi-lane road segment support with lane assignment.
 * - Dynamic detour routing when roads are closed (Scenario testing).
 * - Fixed-time and Adaptive queue-responsive traffic signal controllers.
 * - "Don't block the box" spillback prevention to prevent intersection gridlock.
 * - Comprehensive network-wide metrics and road-level congestion indexes.
 */

import { PRNG } from './prng.ts';
import { RoadGraph } from './graph.ts';
import { Router } from './routing.ts';
import { CarFollowingModel, type LeaderObstacle } from './carFollowing.ts';
import {
  TrafficSignalController,
  SignalControllerFactory,
} from './signals.ts';
import type {
  Vehicle,
  RoadSegment,
  IntersectionNode,
  SimulationConfig,
  SimulationMetrics,
  RouteResult,
  SignalState,
} from './types.ts';

export interface ODPair {
  originNodeId: string;
  destinationNodeId: string;
  arrivalRatePerHour: number;
}

export interface NetworkSimulationOptions {
  graph: RoadGraph;
  config?: Partial<SimulationConfig>;
  odPairs?: ODPair[];
}

export class NetworkSimulation {
  private graph: RoadGraph;
  private config: SimulationConfig;
  private prng: PRNG;
  private currentTime: number = 0;
  private vehicleCounter: number = 0;

  // Origin-Destination demands
  private odPairs: ODPair[] = [];
  // Key: `${originNodeId}->${destinationNodeId}`, Value: next spawn timestamp
  private nextSpawnTimes: Map<string, number> = new Map();

  // Traffic Signal Controllers mapped by Node ID
  private signalControllers: Map<string, TrafficSignalController> = new Map();

  // Manual stop-line fallback state: key is edgeId, value is boolean (true = open, false = closed)
  private stopLineOpen: Map<string, boolean> = new Map();

  // Vehicles
  private activeVehicles: Vehicle[] = [];
  private completedVehicles: Vehicle[] = [];

  // Metrics
  private peakQueueLength: number = 0;

  constructor(options: NetworkSimulationOptions) {
    this.graph = options.graph;

    this.config = {
      timeStep: options.config?.timeStep ?? 0.1,
      seed: options.config?.seed ?? 42,
      arrivalRatePerHour: options.config?.arrivalRatePerHour ?? 360,
      defaultVehicleLength: options.config?.defaultVehicleLength ?? 4.5,
      defaultMaxAcceleration: options.config?.defaultMaxAcceleration ?? 1.8,
      defaultDeceleration: options.config?.defaultDeceleration ?? 2.2,
      defaultJamDistance: options.config?.defaultJamDistance ?? 2.0,
      defaultSafeHeadway: options.config?.defaultSafeHeadway ?? 1.2,
    };

    this.prng = new PRNG(this.config.seed);

    // Initialize stop line states for all edges as open by default
    for (const edge of this.graph.getAllEdges()) {
      this.stopLineOpen.set(edge.id, true);
    }

    // Auto-discover and initialize signal controllers from graph nodes
    this.initSignalControllers();

    if (options.odPairs && options.odPairs.length > 0) {
      this.setODPairs(options.odPairs);
    }
  }

  /**
   * Initializes signal controllers from the graph's intersection configurations.
   */
  private initSignalControllers(): void {
    for (const node of this.graph.getAllNodes()) {
      if (node.controlType === 'fixed_signal' || node.controlType === 'adaptive_signal') {
        const controller = SignalControllerFactory.create(node);
        if (controller) {
          this.signalControllers.set(node.id, controller);
        }
      }
    }
  }

  /**
   * Attaches or overrides a signal controller for a specific intersection node.
   */
  public addSignalController(controller: TrafficSignalController): void {
    this.signalControllers.set(controller.nodeId, controller);
  }

  public getSignalController(nodeId: string): TrafficSignalController | undefined {
    return this.signalControllers.get(nodeId);
  }

  public getAllSignalControllers(): TrafficSignalController[] {
    return Array.from(this.signalControllers.values());
  }

  /**
   * Returns current signal aspect for an edge ('GREEN' | 'YELLOW' | 'RED' | 'ALL_RED').
   */
  public getSignalStateForEdge(edgeId: string): SignalState {
    const edge = this.graph.getEdge(edgeId);
    if (!edge) return 'GREEN';

    const controller = this.signalControllers.get(edge.toNodeId);
    if (controller) {
      return controller.getEdgeSignalState(edgeId);
    }

    // Unsignalized or manual override
    return this.stopLineOpen.get(edgeId) ?? true ? 'GREEN' : 'RED';
  }

  /**
   * Sets or updates the Origin-Destination pairs and initializes Poisson schedules.
   */
  public setODPairs(odPairs: ODPair[]): void {
    this.odPairs = odPairs;
    this.nextSpawnTimes.clear();

    for (const od of odPairs) {
      const key = `${od.originNodeId}->${od.destinationNodeId}`;
      const lambdaPerSec = od.arrivalRatePerHour / 3600;
      const initialDelay = this.prng.nextExponential(lambdaPerSec);
      this.nextSpawnTimes.set(key, initialDelay);
    }
  }

  /**
   * Sets whether the stop line at the downstream end of an edge is open (green) or closed (red).
   */
  public setStopLineState(edgeId: string, isOpen: boolean): void {
    if (!this.graph.getEdge(edgeId)) {
      throw new Error(`Edge '${edgeId}' does not exist in graph.`);
    }
    this.stopLineOpen.set(edgeId, isOpen);
  }

  public getStopLineState(edgeId: string): boolean {
    const state = this.getSignalStateForEdge(edgeId);
    return state === 'GREEN';
  }

  /**
   * Advances simulation by one time-step (dt).
   */
  public tick(): void {
    const dt = this.config.timeStep;

    // 1. Advance traffic signal controllers and update phases
    this.updateSignals(dt);

    // 2. Spawn new vehicles according to OD Poisson rates and A* routing
    this.spawnVehicles();

    // 3. Update microscopic physics (IDM) per road edge and per lane
    this.updateVehicleDynamics(dt);

    // 4. Handle multi-edge transitions across intersection nodes and trip completions
    this.handleTransitions();

    // 5. Update queue metrics
    this.updateQueueMetrics();

    // Advance clock
    this.currentTime += dt;
  }

  /**
   * Advances simulation by multiple steps.
   */
  public step(count: number = 1): void {
    for (let i = 0; i < count; i++) {
      this.tick();
    }
  }

  /**
   * Updates all intersection signal controllers with real-time queue feedback.
   */
  private updateSignals(dt: number): void {
    // Gather current queue lengths per approach for adaptive controllers
    const incomingQueues = new Map<string, number>();
    for (const edge of this.graph.getAllEdges()) {
      const q = this.activeVehicles.filter(
        (v) => v.currentEdgeId === edge.id && v.velocity < 0.5
      ).length;
      incomingQueues.set(edge.id, q);
    }

    // Step each signal controller forward
    for (const controller of this.signalControllers.values()) {
      controller.update(dt, incomingQueues);
    }
  }

  /**
   * Spawns vehicles for OD pairs that have reached their scheduled arrival timestamp.
   */
  private spawnVehicles(): void {
    for (const od of this.odPairs) {
      const key = `${od.originNodeId}->${od.destinationNodeId}`;
      const scheduledTime = this.nextSpawnTimes.get(key) ?? 0;

      if (this.currentTime >= scheduledTime) {
        // Calculate route using A*
        const route = Router.astar(
          this.graph,
          od.originNodeId,
          od.destinationNodeId,
          'travel_time'
        );

        if (route && route.edgePath.length > 0) {
          const firstEdgeId = route.edgePath[0];
          const firstEdge = this.graph.getEdge(firstEdgeId)!;

          // Select least congested lane on the entry edge
          const selectedLane = this.selectEntryLane(firstEdge);

          if (this.isLaneEntryClear(firstEdgeId, selectedLane)) {
            this.createVehicle(od, route, selectedLane);

            // Schedule next arrival
            const lambdaPerSec = od.arrivalRatePerHour / 3600;
            const nextInterval = this.prng.nextExponential(lambdaPerSec);
            this.nextSpawnTimes.set(key, this.currentTime + nextInterval);
          } else {
            // Entry blocked by traffic: delay slightly and retry next tick
            this.nextSpawnTimes.set(key, this.currentTime + 0.5);
          }
        } else {
          // No route available (e.g. disconnected or blocked): retry later
          this.nextSpawnTimes.set(key, this.currentTime + 2.0);
        }
      }
    }
  }

  /**
   * Selects the lane on an edge with the fewest vehicles (load balancing).
   */
  private selectEntryLane(edge: RoadSegment): number {
    if (edge.lanes <= 1) return 0;

    const vehiclesOnEdge = this.activeVehicles.filter(
      (v) => v.currentEdgeId === edge.id
    );
    const laneCounts = new Array(edge.lanes).fill(0);

    for (const v of vehiclesOnEdge) {
      if (v.laneIndex < edge.lanes) {
        laneCounts[v.laneIndex]++;
      }
    }

    let minLane = 0;
    let minCount = laneCounts[0];
    for (let l = 1; l < edge.lanes; l++) {
      if (laneCounts[l] < minCount) {
        minCount = laneCounts[l];
        minLane = l;
      }
    }
    return minLane;
  }

  /**
   * Checks if the start of a lane is clear for safe injection.
   */
  private isLaneEntryClear(edgeId: string, laneIndex: number): boolean {
    const requiredClearance =
      (this.config.defaultVehicleLength ?? 4.5) +
      (this.config.defaultJamDistance ?? 2.0);

    for (const v of this.activeVehicles) {
      if (v.currentEdgeId === edgeId && v.laneIndex === laneIndex) {
        if (v.position < requiredClearance) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Creates a vehicle with planned route and inserts it into the active list.
   */
  private createVehicle(
    od: ODPair,
    route: RouteResult,
    laneIndex: number
  ): Vehicle {
    this.vehicleCounter++;

    const firstEdge = this.graph.getEdge(route.edgePath[0])!;
    const speedVariation = this.prng.nextFloat(0.92, 1.08);
    const desiredSpeed = firstEdge.speedLimit * speedVariation;

    const vehicle: Vehicle = {
      id: `veh_${this.vehicleCounter}`,
      length: this.config.defaultVehicleLength!,
      position: 0,
      velocity: Math.min(desiredSpeed, firstEdge.speedLimit * 0.6),
      acceleration: 0,
      maxVelocity: desiredSpeed,
      maxAcceleration: this.config.defaultMaxAcceleration!,
      desiredDeceleration: this.config.defaultDeceleration!,
      jamDistance: this.config.defaultJamDistance!,
      safeTimeHeadway: this.config.defaultSafeHeadway!,
      accelerationExponent: 4,
      currentEdgeId: firstEdge.id,
      laneIndex,
      spawnTime: this.currentTime,
      totalWaitTime: 0,
      totalDistanceTravelled: 0,
      state: 'active',
      routeEdgeIds: [...route.edgePath],
      routeIndex: 0,
      originNodeId: od.originNodeId,
      destinationNodeId: od.destinationNodeId,
    };

    this.activeVehicles.push(vehicle);
    return vehicle;
  }

  /**
   * Updates microscopic vehicle dynamics per edge and per lane.
   */
  private updateVehicleDynamics(dt: number): void {
    // Partition vehicles by edgeId and laneIndex
    const vehiclesByLane = new Map<string, Vehicle[]>();

    for (const v of this.activeVehicles) {
      const laneKey = `${v.currentEdgeId}#${v.laneIndex}`;
      let list = vehiclesByLane.get(laneKey);
      if (!list) {
        list = [];
        vehiclesByLane.set(laneKey, list);
      }
      list.push(v);
    }

    // Process each lane independently
    for (const [laneKey, laneVehicles] of vehiclesByLane.entries()) {
      const [edgeId] = laneKey.split('#');
      const edge = this.graph.getEdge(edgeId);
      if (!edge) continue;

      // Sort descending by position (furthest along the lane is leader)
      laneVehicles.sort((a, b) => b.position - a.position);

      const signalAspect = this.getSignalStateForEdge(edgeId);

      for (let i = 0; i < laneVehicles.length; i++) {
        const vehicle = laneVehicles[i];
        let leaderObstacle: LeaderObstacle | null = null;

        if (i > 0) {
          // Standard case: following another car in the same lane
          const leadVehicle = laneVehicles[i - 1];
          leaderObstacle = {
            position: leadVehicle.position,
            velocity: leadVehicle.velocity,
            length: leadVehicle.length,
          };
        } else {
          // First car in lane approaching the intersection stop bar
          let shouldHaltAtStopBar = false;

          if (signalAspect === 'RED' || signalAspect === 'ALL_RED') {
            shouldHaltAtStopBar = true;
          } else if (signalAspect === 'YELLOW') {
            // Dilemma zone evaluation:
            // Stopping distance d_stop = v^2 / (2 * b)
            const dStop = (vehicle.velocity * vehicle.velocity) / (2 * vehicle.desiredDeceleration);
            const dRemaining = edge.length - vehicle.position;
            // If vehicle can stop comfortably without harsh emergency deceleration, it halts
            if (dRemaining > dStop && dRemaining > 6.0) {
              shouldHaltAtStopBar = true;
            }
          }

          // Don't Block the Box rule:
          // If signal is GREEN or YELLOW, but the downstream exit road is full, do not enter the intersection!
          if (!shouldHaltAtStopBar && (signalAspect === 'GREEN' || signalAspect === 'YELLOW')) {
            const route = vehicle.routeEdgeIds ?? [];
            const currentIdx = vehicle.routeIndex ?? 0;
            if (currentIdx < route.length - 1) {
              const nextEdgeId = route[currentIdx + 1];
              if (!this.isExitClearForEntry(nextEdgeId)) {
                shouldHaltAtStopBar = true;
              }
            }
          }

          if (shouldHaltAtStopBar) {
            leaderObstacle = {
              position: edge.length,
              velocity: 0,
              length: 0,
            };
          }
        }

        const acc = CarFollowingModel.calculateAcceleration(
          vehicle,
          edge.speedLimit,
          leaderObstacle
        );

        CarFollowingModel.integrate(vehicle, acc, dt);
      }
    }
  }

  /**
   * Checks if an outgoing road has room for an entering vehicle (anti-gridlock check).
   */
  private isExitClearForEntry(edgeId: string): boolean {
    const edge = this.graph.getEdge(edgeId);
    if (!edge) return true;

    // Check if vehicles are queued right at the beginning of the road segment
    const vehiclesNearEntry = this.activeVehicles.filter(
      (v) => v.currentEdgeId === edgeId && v.position < 12.0 && v.velocity < 1.0
    );

    // If all lanes at the entry are occupied by stationary cars, exit is blocked
    return vehiclesNearEntry.length < edge.lanes;
  }

  /**
   * Handles vehicles transitioning from one edge to the next or completing their trip.
   */
  private handleTransitions(): void {
    const remainingActive: Vehicle[] = [];

    for (const vehicle of this.activeVehicles) {
      const edge = this.graph.getEdge(vehicle.currentEdgeId);
      if (!edge) {
        continue;
      }

      if (vehicle.position >= edge.length) {
        const route = vehicle.routeEdgeIds ?? [];
        const currentIdx = vehicle.routeIndex ?? 0;

        if (currentIdx < route.length - 1) {
          // Vehicle wants to advance to the next edge in its route
          const signalAspect = this.getSignalStateForEdge(edge.id);
          const isPermitted = signalAspect === 'GREEN' || signalAspect === 'YELLOW';

          if (isPermitted) {
            const nextEdgeId = route[currentIdx + 1];
            const nextEdge = this.graph.getEdge(nextEdgeId);

            if (nextEdge && !nextEdge.isClosed && this.isExitClearForEntry(nextEdgeId)) {
              // Advance to next edge
              const overshoot = vehicle.position - edge.length;
              vehicle.currentEdgeId = nextEdgeId;
              vehicle.routeIndex = currentIdx + 1;
              vehicle.position = overshoot;

              // Assign to least crowded lane on the new edge
              vehicle.laneIndex = this.selectEntryLane(nextEdge);
              remainingActive.push(vehicle);
            } else if (nextEdge && nextEdge.isClosed) {
              // Next edge is closed: dynamic detour reroute from current node
              const currentNodeId = edge.toNodeId;
              const newRoute = Router.astar(
                this.graph,
                currentNodeId,
                vehicle.destinationNodeId ?? '',
                'travel_time'
              );

              if (newRoute && newRoute.edgePath.length > 0) {
                const reroutedNextEdgeId = newRoute.edgePath[0];
                const reroutedNextEdge = this.graph.getEdge(reroutedNextEdgeId)!;
                const overshoot = vehicle.position - edge.length;

                vehicle.currentEdgeId = reroutedNextEdgeId;
                vehicle.routeEdgeIds = newRoute.edgePath;
                vehicle.routeIndex = 0;
                vehicle.position = overshoot;
                vehicle.laneIndex = this.selectEntryLane(reroutedNextEdge);
                remainingActive.push(vehicle);
              } else {
                vehicle.position = edge.length;
                vehicle.velocity = 0;
                remainingActive.push(vehicle);
              }
            } else {
              // Downstream intersection exit is blocked (gridlock prevention hold)
              vehicle.position = edge.length;
              vehicle.velocity = 0;
              remainingActive.push(vehicle);
            }
          } else {
            // Red light: hold position at stop line
            vehicle.position = edge.length;
            vehicle.velocity = 0;
            remainingActive.push(vehicle);
          }
        } else {
          // Reached final edge destination!
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

  private updateQueueMetrics(): void {
    let currentMaxQueue = 0;
    for (const edge of this.graph.getAllEdges()) {
      const queuedCount = this.activeVehicles.filter(
        (v) => v.currentEdgeId === edge.id && v.velocity < 0.5
      ).length;
      if (queuedCount > currentMaxQueue) {
        currentMaxQueue = queuedCount;
      }
    }
    if (currentMaxQueue > this.peakQueueLength) {
      this.peakQueueLength = currentMaxQueue;
    }
  }

  /**
   * Compiles network-wide performance metrics.
   */
  public getMetrics(): SimulationMetrics {
    const elapsedSeconds = Math.max(0.001, this.currentTime);
    const elapsedHours = elapsedSeconds / 3600;

    const completedCount = this.completedVehicles.length;
    let sumTravelTime = 0;
    let sumWaitTime = 0;

    for (const v of this.completedVehicles) {
      sumTravelTime += (v.completionTime ?? this.currentTime) - v.spawnTime;
      sumWaitTime += v.totalWaitTime;
    }

    let sumSpeed = 0;
    for (const v of this.activeVehicles) {
      sumSpeed += v.velocity;
    }
    const averageSpeed =
      this.activeVehicles.length > 0
        ? sumSpeed / this.activeVehicles.length
        : 0;

    const queueLengthByEdge: Record<string, number> = {};
    for (const edge of this.graph.getAllEdges()) {
      const q = this.activeVehicles.filter(
        (v) => v.currentEdgeId === edge.id && v.velocity < 0.5
      ).length;
      queueLengthByEdge[edge.id] = q;
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

  /**
   * Returns road-level congestion index (Volume-to-Capacity ratio proxy).
   */
  public getCongestionMap(): Record<string, { vehicleCount: number; densityRatio: number; averageSpeed: number }> {
    const map: Record<string, { vehicleCount: number; densityRatio: number; averageSpeed: number }> = {};

    for (const edge of this.graph.getAllEdges()) {
      const vehs = this.activeVehicles.filter((v) => v.currentEdgeId === edge.id);
      const vehicleCount = vehs.length;

      const maxStorageCapacity = (edge.length / (this.config.defaultJamDistance! + this.config.defaultVehicleLength!)) * edge.lanes;
      const densityRatio = maxStorageCapacity > 0 ? Math.min(1.0, vehicleCount / maxStorageCapacity) : 0;

      let avgSpeed = 0;
      if (vehicleCount > 0) {
        const sumV = vehs.reduce((acc, v) => acc + v.velocity, 0);
        avgSpeed = sumV / vehicleCount;
      }

      map[edge.id] = {
        vehicleCount,
        densityRatio: Number(densityRatio.toFixed(3)),
        averageSpeed: Number(avgSpeed.toFixed(2)),
      };
    }

    return map;
  }

  // Getters
  public getCurrentTime(): number {
    return this.currentTime;
  }

  public getActiveVehicles(): ReadonlyArray<Vehicle> {
    return this.activeVehicles;
  }

  public getCompletedVehicles(): ReadonlyArray<Vehicle> {
    return this.completedVehicles;
  }

  public getGraph(): RoadGraph {
    return this.graph;
  }
}
