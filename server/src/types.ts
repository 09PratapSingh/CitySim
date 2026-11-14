/**
 * Server API domain models and interfaces for CitySim.
 */

import type {
  IntersectionNode,
  RoadSegment,
  ComprehensiveMetrics,
  TimeSeriesSnapshot,
  SegmentCongestionData,
} from '../../engine/src/types.ts';

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
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface ScenarioModifications {
  closedEdgeIds: string[];
  signalOverrides?: Array<{
    nodeId: string;
    controlType: 'unsignalized' | 'fixed_signal' | 'adaptive_signal';
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
  createdAt?: Date | string;
  updatedAt?: Date | string;
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
  aggregateMetrics: ComprehensiveMetrics;
  timeSeries: TimeSeriesSnapshot[];
  roadCongestion: Record<string, SegmentCongestionData>;
  status: 'completed' | 'failed';
  createdAt?: Date | string;
}
