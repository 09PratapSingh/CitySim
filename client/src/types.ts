/**
 * Frontend Type Definitions for CitySim.
 */

export type IntersectionControlType = 'unsignalized' | 'fixed_signal' | 'adaptive_signal';

export interface IntersectionNode {
  id: string;
  x: number;
  y: number;
  controlType: IntersectionControlType;
  incomingEdgeIds: string[];
  outgoingEdgeIds: string[];
  signalConfig?: {
    type: IntersectionControlType;
    cycleTime?: number;
    phases: Array<{
      id: string;
      name: string;
      greenEdgeIds: string[];
      greenDuration: number;
      yellowDuration?: number;
      allRedDuration?: number;
    }>;
    adaptiveParams?: {
      minGreen: number;
      maxGreen: number;
      extensionSeconds?: number;
      queueThreshold?: number;
    };
  };
}

export interface RoadSegment {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  length: number;
  lanes: number;
  speedLimit: number; // m/s
  isOneWay: boolean;
  isClosed?: boolean;
  startCoord?: { x: number; y: number };
  endCoord?: { x: number; y: number };
}

export interface ODPairConfig {
  originNodeId: string;
  destinationNodeId: string;
  arrivalRatePerHour: number;
}

export interface MapData {
  id?: string;
  _id?: string;
  name: string;
  description?: string;
  nodes: IntersectionNode[];
  edges: RoadSegment[];
  odPairs?: ODPairConfig[];
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface VehicleRenderData {
  id: string;
  edgeId: string;
  position: number;
  velocity: number;
  laneIndex: number;
  x: number;
  y: number;
  angle: number;
}

export interface SignalStateItem {
  edgeId: string;
  state: 'GREEN' | 'YELLOW' | 'RED';
}

export interface SimulationMetrics {
  currentTime: number;
  simulationTime?: number;
  activeVehicleCount: number;
  activeVehiclesCount?: number;
  totalGenerated: number;
  totalSpawned?: number;
  totalCompleted: number;
  completedVehiclesCount?: number;
  throughputPerHour: number;
  avgTravelTime: number;
  averageTravelTime?: number;
  avgWaitTime: number;
  averageWaitTime?: number;
  avgSpeed: number;
  averageSpeed?: number;
  maxQueueLength: number;
  roadCongestion: Record<string, {
    edgeId?: string;
    vehicleCount: number;
    density: number;
    densityRatio: number;
    volumeToCapacityRatio: number;
    averageSpeed?: number;
    queueLength?: number;
    congestionLevel: 'FREE_FLOW' | 'MODERATE' | 'HEAVY' | 'CONGESTED';
  }>;
}

export interface SimulationFrame {
  time: number;
  vehicles: VehicleRenderData[];
  signals: SignalStateItem[];
  metrics: SimulationMetrics;
}

export type EditorTool = 'select' | 'add_node' | 'draw_edge' | 'delete' | 'pan';

export interface ViewportTransform {
  x: number;
  y: number;
  zoom: number;
}

export interface SelectedElement {
  type: 'node' | 'edge';
  id: string;
}

export interface ScenarioModifications {
  closedEdgeIds: string[];
  signalOverrides?: Array<{
    nodeId: string;
    controlType: IntersectionControlType;
    greenDuration?: number;
  }>;
  speedLimitOverrides?: Array<{
    edgeId: string;
    speedLimit: number;
  }>;
}

export interface ScenarioData {
  id?: string;
  _id?: string;
  baseMapId: string;
  name: string;
  description?: string;
  seed: number;
  demandMultiplier: number;
  modifications: ScenarioModifications;
  odPairs?: ODPairConfig[];
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface TimeSeriesSnapshot {
  time: number;
  activeVehiclesCount: number;
  completedVehiclesCount: number;
  throughputPerHour: number;
  averageSpeed: number;
  averageTravelTime: number;
  averageWaitTime: number;
  maxQueueLength: number;
}

export interface RunData {
  id?: string;
  _id?: string;
  scenarioId?: string;
  baseMapId: string;
  scenarioName?: string;
  seed: number;
  durationSeconds: number;
  modifications?: ScenarioModifications;
  aggregateMetrics: {
    currentTime: number;
    activeVehiclesCount: number;
    completedVehiclesCount: number;
    totalSpawned: number;
    throughputPerHour: number;
    averageSpeed: number;
    averageTravelTime: number;
    averageWaitTime: number;
    maxQueueLength: number;
    totalDelayHours?: number;
    travelTimeIndex?: number;
  };
  timeSeries: TimeSeriesSnapshot[];
  roadCongestion: Record<string, {
    edgeId?: string;
    vehicleCount: number;
    density: number;
    densityRatio: number;
    volumeToCapacityRatio: number;
    averageSpeed?: number;
    queueLength?: number;
    congestionLevel: 'FREE_FLOW' | 'MODERATE' | 'HEAVY' | 'CONGESTED';
  }>;
  status: 'completed' | 'failed';
  createdAt?: string | Date;
}

export interface ComparisonDeltas {
  deltaAvgWaitTime: number;
  deltaAvgWaitTimeStdDev?: number;
  deltaAvgWaitTimeCI?: [number, number];
  isWaitTimeSignificant?: boolean;
  baselineMeanWaitTime?: number;
  scenarioMeanWaitTime?: number;
  pctChangeAvgWaitTime: number;

  deltaAvgTravelTime: number;
  deltaAvgTravelTimeStdDev?: number;
  deltaAvgTravelTimeCI?: [number, number];
  isTravelTimeSignificant?: boolean;
  baselineMeanTravelTime?: number;
  scenarioMeanTravelTime?: number;
  pctChangeAvgTravelTime: number;

  deltaThroughput: number;
  deltaThroughputStdDev?: number;
  deltaThroughputCI?: [number, number];
  isThroughputSignificant?: boolean;
  baselineMeanThroughput?: number;
  scenarioMeanThroughput?: number;
  pctChangeThroughput: number;

  deltaAvgSpeed: number;
  deltaAvgSpeedStdDev?: number;
  deltaAvgSpeedCI?: [number, number];
  isSpeedSignificant?: boolean;
  baselineMeanSpeed?: number;
  scenarioMeanSpeed?: number;

  deltaCompleted: number;
  deltaCompletedStdDev?: number;
  deltaCompletedCI?: [number, number];
  isCompletedSignificant?: boolean;
  baselineMeanCompleted?: number;
  scenarioMeanCompleted?: number;

  deltaSpawned: number;
  deltaMaxQueue: number;
  warmupSeconds?: number;
  replicationsCount?: number;
  seedsUsed?: number[];
}

export interface ReplicationItem {
  seed: number;
  baselineWait: number;
  scenarioWait: number;
  deltaWait: number;
  baselineThroughput: number;
  scenarioThroughput: number;
  deltaThroughput: number;
  baselineTravel: number;
  scenarioTravel: number;
  deltaTravel: number;
  baselineSpeed: number;
  scenarioSpeed: number;
  deltaSpeed: number;
}

export interface ComparativeTimeSeriesPoint {
  time: number;
  baselineWaitTime: number;
  scenarioWaitTime: number;
  baselineSpeed: number;
  scenarioSpeed: number;
  baselineActiveVehicles: number;
  scenarioActiveVehicles: number;
  baselineCompleted: number;
  scenarioCompleted: number;
}

export interface SimulationComparisonResult {
  baseline: RunData;
  scenario: RunData;
  deltas: ComparisonDeltas;
  comparativeTimeSeries: ComparativeTimeSeriesPoint[];
  replications?: ReplicationItem[];
}
