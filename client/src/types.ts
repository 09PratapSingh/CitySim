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

export interface MapData {
  id?: string;
  _id?: string;
  name: string;
  description?: string;
  nodes: IntersectionNode[];
  edges: RoadSegment[];
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
