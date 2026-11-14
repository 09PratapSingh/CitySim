/**
 * Real-Time Performance Metrics Collection & Civil Engineering KPIs.
 * 
 * THEORETICAL FOUNDATION FOR VIVA:
 * Transportation engineers evaluate road network performance using standardized
 * metrics defined by the Highway Capacity Manual (HCM) and Federal Highway Administration (FHWA):
 * 
 * 1. Average Travel Time:
 *    T_avg = (1 / N_comp) * sum(t_complete - t_spawn)
 * 
 * 2. Average Stopped Delay (Control Delay):
 *    D_avg = (1 / N_comp) * sum(t_stopped)   [where v < 0.5 m/s (~1.8 km/h)]
 * 
 * 3. Travel Time Index (TTI):
 *    TTI = T_avg / T_free_flow
 *    - TTI = 1.0 represents ideal free-flow traffic.
 *    - TTI = 1.4 means trips take 40% longer due to congestion/signals.
 * 
 * 4. Hourly Throughput Rate:
 *    Q = N_comp / (t_elapsed / 3600)  [vehicles per simulated hour]
 * 
 * 5. Law of Throughput Conservation:
 *    Total Spawned == Active Vehicles (in system) + Completed Vehicles (exited)
 * 
 * 6. Volume-to-Capacity (V/C) Density Ratio:
 *    Density Ratio = Current Active Vehicles / Max Storage Capacity
 *    where Storage Capacity = (Length / (s0 + L_car)) * Lanes
 */

import { RoadGraph } from './graph.ts';
import type {
  Vehicle,
  TimeSeriesSnapshot,
  SegmentCongestionData,
  ComprehensiveMetrics,
} from './types.ts';

export class MetricsCollector {
  private graph: RoadGraph;
  private snapshotInterval: number;
  private nextSnapshotTime: number = 0;
  private timeSeries: TimeSeriesSnapshot[] = [];

  // Peak metrics
  private peakQueueLength: number = 0;

  constructor(graph: RoadGraph, snapshotInterval: number = 5.0) {
    this.graph = graph;
    this.snapshotInterval = snapshotInterval;
  }

  /**
   * Evaluates and records simulation state at the current time step.
   * If snapshot interval has elapsed, records a time-series point for Recharts.
   */
  public recordTick(
    currentTime: number,
    activeVehicles: Vehicle[],
    completedVehicles: Vehicle[]
  ): void {
    // 1. Update peak queue length
    const queueByEdge = this.computeQueuesByEdge(activeVehicles);
    for (const q of Object.values(queueByEdge)) {
      if (q > this.peakQueueLength) {
        this.peakQueueLength = q;
      }
    }

    // 2. Check if a time-series snapshot is due
    if (currentTime >= this.nextSnapshotTime) {
      this.captureSnapshot(currentTime, activeVehicles, completedVehicles);
      this.nextSnapshotTime += this.snapshotInterval;
    }
  }

  /**
   * Captures an instantaneous snapshot for time-series charts.
   */
  private captureSnapshot(
    currentTime: number,
    activeVehicles: Vehicle[],
    completedVehicles: Vehicle[]
  ): void {
    const elapsedSeconds = Math.max(0.001, currentTime);
    const elapsedHours = elapsedSeconds / 3600;

    let sumSpeed = 0;
    for (const v of activeVehicles) {
      sumSpeed += v.velocity;
    }
    const currentAvgSpeed =
      activeVehicles.length > 0 ? sumSpeed / activeVehicles.length : 0;

    let sumWait = 0;
    for (const v of completedVehicles) {
      sumWait += v.totalWaitTime;
    }
    const currentAvgWait =
      completedVehicles.length > 0 ? sumWait / completedVehicles.length : 0;

    // Overall network congestion ratio
    const congestionMap = this.computeSegmentCongestion(activeVehicles);
    let totalDensity = 0;
    const edgeCount = this.graph.getEdgeCount();
    for (const seg of Object.values(congestionMap)) {
      totalDensity += seg.densityRatio;
    }
    const networkCongestionRatio =
      edgeCount > 0 ? totalDensity / edgeCount : 0;

    const snapshot: TimeSeriesSnapshot = {
      timestamp: Number(currentTime.toFixed(1)),
      activeVehicles: activeVehicles.length,
      completedVehicles: completedVehicles.length,
      currentAvgSpeed: Number(currentAvgSpeed.toFixed(2)),
      currentAvgWaitTime: Number(currentAvgWait.toFixed(2)),
      networkCongestionRatio: Number(networkCongestionRatio.toFixed(3)),
      currentThroughputRate: Number(
        (completedVehicles.length / elapsedHours).toFixed(1)
      ),
    };

    this.timeSeries.push(snapshot);
  }

  /**
   * Calculates comprehensive metrics and KPI summaries.
   */
  public compileMetrics(
    currentTime: number,
    totalSpawned: number,
    activeVehicles: Vehicle[],
    completedVehicles: Vehicle[]
  ): ComprehensiveMetrics {
    const elapsedSeconds = Math.max(0.001, currentTime);
    const elapsedHours = elapsedSeconds / 3600;
    const completedCount = completedVehicles.length;

    // Travel time and stopped delay calculations
    let sumTravelTime = 0;
    let sumWaitTime = 0;
    let sumFreeFlowTime = 0;

    for (const v of completedVehicles) {
      const travelTime = (v.completionTime ?? currentTime) - v.spawnTime;
      sumTravelTime += travelTime;
      sumWaitTime += v.totalWaitTime;

      // Free-flow travel time along vehicle's traversed route
      const freeFlow = this.calculateRouteFreeFlowTime(v.routeEdgeIds ?? [v.currentEdgeId]);
      sumFreeFlowTime += freeFlow;
    }

    const averageTravelTime =
      completedCount > 0 ? sumTravelTime / completedCount : 0;
    const averageWaitTime =
      completedCount > 0 ? sumWaitTime / completedCount : 0;
    const freeFlowTravelTimeAvg =
      completedCount > 0 ? sumFreeFlowTime / completedCount : 0;

    // Travel Time Index (TTI)
    const travelTimeIndex =
      freeFlowTravelTimeAvg > 0
        ? Math.max(1.0, averageTravelTime / freeFlowTravelTimeAvg)
        : 1.0;

    // Total accumulated vehicle delay in hours
    const totalDelayHours = sumWaitTime / 3600;

    // Active speed mean
    let sumSpeed = 0;
    for (const v of activeVehicles) {
      sumSpeed += v.velocity;
    }
    const averageSpeed =
      activeVehicles.length > 0 ? sumSpeed / activeVehicles.length : 0;

    const queueLengthByEdge = this.computeQueuesByEdge(activeVehicles);
    const roadCongestion = this.computeSegmentCongestion(activeVehicles);

    return {
      simulationTime: Number(currentTime.toFixed(2)),
      activeVehiclesCount: activeVehicles.length,
      completedVehiclesCount: completedCount,
      totalSpawned,
      averageSpeed: Number(averageSpeed.toFixed(2)),
      averageWaitTime: Number(averageWaitTime.toFixed(2)),
      averageTravelTime: Number(averageTravelTime.toFixed(2)),
      freeFlowTravelTimeAvg: Number(freeFlowTravelTimeAvg.toFixed(2)),
      travelTimeIndex: Number(travelTimeIndex.toFixed(2)),
      totalDelayHours: Number(totalDelayHours.toFixed(4)),
      maxQueueLength: this.peakQueueLength,
      throughputPerHour: Number((completedCount / elapsedHours).toFixed(1)),
      queueLengthByEdge,
      roadCongestion,
      timeSeries: [...this.timeSeries],
    };
  }

  /**
   * Computes stopped queues (v < 0.5 m/s) on each edge.
   */
  public computeQueuesByEdge(activeVehicles: Vehicle[]): Record<string, number> {
    const queueMap: Record<string, number> = {};
    for (const edge of this.graph.getAllEdges()) {
      queueMap[edge.id] = 0;
    }
    for (const v of activeVehicles) {
      if (v.velocity < 0.5) {
        queueMap[v.currentEdgeId] = (queueMap[v.currentEdgeId] ?? 0) + 1;
      }
    }
    return queueMap;
  }

  /**
   * Computes road-level congestion and density statistics.
   */
  public computeSegmentCongestion(activeVehicles: Vehicle[]): Record<string, SegmentCongestionData> {
    const result: Record<string, SegmentCongestionData> = {};

    for (const edge of this.graph.getAllEdges()) {
      const vehsOnEdge = activeVehicles.filter((v) => v.currentEdgeId === edge.id);
      const vehicleCount = vehsOnEdge.length;

      // Storage capacity = (road length / (jamDistance + vehicleLength)) * lanes
      const maxCapacity = (edge.length / (2.0 + 4.5)) * edge.lanes;
      const densityRatio =
        maxCapacity > 0 ? Math.min(1.0, vehicleCount / maxCapacity) : 0;

      let sumV = 0;
      let queueCount = 0;
      for (const v of vehsOnEdge) {
        sumV += v.velocity;
        if (v.velocity < 0.5) {
          queueCount++;
        }
      }

      result[edge.id] = {
        edgeId: edge.id,
        vehicleCount,
        densityRatio: Number(densityRatio.toFixed(3)),
        averageSpeed: Number(
          (vehicleCount > 0 ? sumV / vehicleCount : edge.speedLimit).toFixed(2)
        ),
        queueLength: queueCount,
      };
    }

    return result;
  }

  /**
   * Calculates the theoretical free-flow travel time along an edge sequence.
   */
  private calculateRouteFreeFlowTime(edgeIds: string[]): number {
    let t = 0;
    for (const id of edgeIds) {
      const edge = this.graph.getEdge(id);
      if (edge) {
        t += edge.length / Math.max(0.1, edge.speedLimit);
      }
    }
    return t;
  }

  public getTimeSeries(): TimeSeriesSnapshot[] {
    return this.timeSeries;
  }

  public reset(): void {
    this.timeSeries = [];
    this.nextSnapshotTime = 0;
    this.peakQueueLength = 0;
  }
}
