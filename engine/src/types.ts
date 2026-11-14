/**
 * Core domain types and interfaces for the CitySim microscopic simulation engine.
 * 
 * In microscopic modeling, each individual vehicle is simulated as an autonomous
 * agent obeying continuous physics rules, interacting with other vehicles and
 * intersection control elements.
 */

export const SIMULATION_CONSTANTS = {
  DEFAULT_TIME_STEP: 0.1, // seconds
  DEFAULT_VEHICLE_LENGTH: 4.5, // meters
  DEFAULT_MAX_ACCEL: 1.8, // m/s^2
  DEFAULT_DECEL: 2.2, // m/s^2
  DEFAULT_JAM_DISTANCE: 2.0, // meters
  DEFAULT_SAFE_HEADWAY: 1.2, // seconds
  DEFAULT_SPEED_LIMIT: 13.89, // m/s (50 km/h)
} as const;

export interface Vector2D {
  x: number;
  y: number;
}

export interface Vehicle {
  /** Unique vehicle identifier */
  id: string;

  /** Physical length of vehicle in meters (standard passenger car ~4.5m) */
  length: number;

  /** Distance in meters from the start of the current road segment (0 to edge.length) */
  position: number;

  /** Current longitudinal speed in meters per second (m/s) */
  velocity: number;

  /** Current acceleration in m/s^2 (updated at every time step) */
  acceleration: number;

  /** Maximum desired speed of the vehicle in m/s (e.g. 13.89 m/s = 50 km/h) */
  maxVelocity: number;

  /** Maximum comfortable acceleration 'a' in m/s^2 (typically 1.5 - 2.5 m/s^2) */
  maxAcceleration: number;

  /** Comfortable braking deceleration 'b' in m/s^2 (typically 1.5 - 3.0 m/s^2) */
  desiredDeceleration: number;

  /** Minimum bumper-to-bumper standstill distance 's0' in meters (typically 1.5 - 2.5m) */
  jamDistance: number;

  /** Safe time headway 'T' in seconds (typically 1.0 - 1.8s) */
  safeTimeHeadway: number;

  /** Acceleration exponent 'delta' in IDM (standard value = 4) */
  accelerationExponent: number;

  /** ID of the road segment this vehicle is currently travelling on */
  currentEdgeId: string;

  /** Current lane index (0-indexed, where 0 is the primary lane) */
  laneIndex: number;

  /** Simulation timestamp (in seconds) when the vehicle entered the network */
  spawnTime: number;

  /** Cumulative time (in seconds) spent delayed/stopped (velocity < 0.5 m/s) */
  totalWaitTime: number;

  /** Total distance traveled across all segments (in meters) */
  totalDistanceTravelled: number;

  /** Ordered sequence of edge IDs forming the vehicle's path to destination */
  routeEdgeIds?: string[];

  /** Current index in routeEdgeIds */
  routeIndex?: number;

  /** Origin node where vehicle entered network */
  originNodeId?: string;

  /** Destination node where vehicle will exit network */
  destinationNodeId?: string;

  /** Lifecycle state */
  state: 'active' | 'completed';

  /** Timestamp when vehicle exited the network */
  completionTime?: number;
}

export interface RoadSegment {
  /** Unique road edge identifier (e.g. "road_W_in") */
  id: string;

  /** Upstream origin node identifier */
  fromNodeId: string;

  /** Downstream destination node identifier */
  toNodeId: string;

  /** Physical length of the road in meters */
  length: number;

  /** Speed limit in meters per second (e.g. 13.89 m/s = 50 km/h) */
  speedLimit: number;

  /** Number of parallel lanes (default 1) */
  lanes: number;

  /** Whether the road is one-way */
  isOneWay: boolean;

  /** Whether the road is currently closed (e.g. road closure scenario) */
  isClosed?: boolean;

  /** Visual coordinates for 2D rendering */
  startCoord?: Vector2D;
  endCoord?: Vector2D;
}

export type RouteCriterion = 'distance' | 'travel_time';

export interface RouteResult {
  /** Ordered list of node IDs visited along the route */
  nodePath: string[];

  /** Ordered list of road edge IDs traversed */
  edgePath: string[];

  /** Cumulative physical path distance in meters */
  totalDistance: number;

  /** Cumulative free-flow travel time in seconds (sum of length / speedLimit) */
  estimatedFreeFlowTime: number;

  /** Number of nodes expanded during graph search (for algorithm performance evaluation) */
  visitedNodesCount: number;
}

export type SignalState = 'GREEN' | 'YELLOW' | 'RED' | 'ALL_RED';

export interface SignalPhase {
  id: string;
  name: string;
  /** Road edge IDs that receive green during this phase */
  greenEdgeIds: string[];
  /** Green interval duration in seconds */
  greenDuration: number;
  /** Amber/yellow clearance interval duration in seconds (default 3s) */
  yellowDuration?: number;
  /** All-red junction clearance interval duration in seconds (default 1.5s) */
  allRedDuration?: number;
}

export interface AdaptiveSignalParams {
  /** Minimum guaranteed green time before phase can switch (seconds) */
  minGreen: number;
  /** Maximum allowable green time before forced phase termination (seconds) */
  maxGreen: number;
  /** Duration added when active approach has continuing queue demand (seconds) */
  extensionSeconds: number;
  /** Number of vehicles queued to qualify for extension */
  queueThreshold: number;
}

export interface SignalConfig {
  type: 'fixed_signal' | 'adaptive_signal';
  phases: SignalPhase[];
  adaptiveParams?: AdaptiveSignalParams;
}

export interface IntersectionNode {
  /** Unique node identifier */
  id: string;

  /** 2D coordinates on the canvas */
  x: number;
  y: number;

  /** Junction control strategy */
  controlType: 'unsignalized' | 'fixed_signal' | 'adaptive_signal';

  /** List of incoming road IDs */
  incomingEdgeIds: string[];

  /** List of outgoing road IDs */
  outgoingEdgeIds: string[];

  /** Signal configuration when controlType is fixed_signal or adaptive_signal */
  signalConfig?: SignalConfig;
}

export interface SimulationConfig {
  /** Integration time step in seconds (dt). Recommended: 0.1s for high fidelity */
  timeStep: number;

  /** Seed for deterministic pseudo-random number generator */
  seed: number;

  /** Synthetic vehicle arrival rate per incoming road (vehicles per hour) */
  arrivalRatePerHour: number;

  /** Vehicle default parameters */
  defaultVehicleLength?: number;
  defaultMaxAcceleration?: number;
  defaultDeceleration?: number;
  defaultJamDistance?: number;
  defaultSafeHeadway?: number;
}

export interface SimulationMetrics {
  /** Elapsed simulation time in seconds */
  simulationTime: number;

  /** Number of vehicles currently driving on the network */
  activeVehiclesCount: number;

  /** Number of vehicles that reached their destination */
  completedVehiclesCount: number;

  /** Total vehicles spawned since start */
  totalSpawned: number;

  /** Current mean velocity of all active vehicles (m/s) */
  averageSpeed: number;

  /** Mean waiting time (delay) per completed vehicle (seconds) */
  averageWaitTime: number;

  /** Mean travel time per completed vehicle (seconds) */
  averageTravelTime: number;

  /** Maximum queue length observed across all approaches (in vehicles) */
  maxQueueLength: number;

  /** Hourly throughput rate (completed vehicles / elapsed hours) */
  throughputPerHour: number;

  /** Breakdown of active queue lengths by road segment ID */
  queueLengthByEdge: Record<string, number>;
}
