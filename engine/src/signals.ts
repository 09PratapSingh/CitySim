/**
 * Traffic Signal State Machine and Controllers.
 * 
 * THEORETICAL FOUNDATION FOR VIVA:
 * In traffic engineering, an intersection signal operates as a cyclical finite state machine (FSM).
 * 
 * 1. Signal Intervals per Phase:
 *    - GREEN: Confers legal right-of-way to vehicles entering from active approach edges.
 *    - YELLOW (Amber): Change interval (typically 3-4s). Warns drivers that right-of-way is terminating.
 *      In transportation theory, yellow timing is calculated to eliminate the "Dilemma Zone"
 *      (where a driver can neither stop comfortably nor clear the intersection before red).
 *    - ALL-RED CLEARANCE: Clearance interval (typically 1-2s). All signals are RED simultaneously
 *      to allow the last vehicle that entered on yellow to safely clear the conflicting collision
 *      box before cross-traffic receives green.
 * 
 * 2. Control Strategies:
 *    - Fixed-Time (Pre-timed): Cycles through pre-computed green times based on historic averages.
 *      Prone to high delays when traffic flows are asymmetric or fluctuating.
 *    - Adaptive (Actuated / Queue-Responsive): Dynamically adjusts green splits based on real-time
 *      queue detection. Extends green if backlog remains on the active approach up to a safety ceiling
 *      (maxGreen), and immediately terminates green if the approach clears, eliminating wasted capacity.
 */

import type {
  SignalState,
  SignalPhase,
  AdaptiveSignalParams,
  SignalConfig,
  IntersectionNode,
} from './types.ts';

export abstract class TrafficSignalController {
  public readonly nodeId: string;
  protected phases: SignalPhase[];
  protected currentPhaseIndex: number = 0;
  protected internalState: SignalState = 'GREEN';
  protected timeInState: number = 0;

  constructor(nodeId: string, phases: SignalPhase[]) {
    if (phases.length === 0) {
      throw new Error(`TrafficSignalController for node '${nodeId}' must have at least one phase.`);
    }
    this.nodeId = nodeId;
    this.phases = phases;
  }

  /**
   * Advances controller clock and evaluates state transitions.
   * @param dt Time elapsed in seconds
   * @param incomingQueues Map of edgeId -> number of queued vehicles (for adaptive logic)
   */
  public abstract update(dt: number, incomingQueues?: Map<string, number>): void;

  /**
   * Returns the current signal aspect for a specific incoming road edge.
   */
  public getEdgeSignalState(edgeId: string): SignalState {
    const currentPhase = this.phases[this.currentPhaseIndex];
    const isEdgeInActivePhase = currentPhase.greenEdgeIds.includes(edgeId);

    if (isEdgeInActivePhase) {
      // During all-red clearance, the physical signal facing the driver displays RED
      if (this.internalState === 'ALL_RED') {
        return 'RED';
      }
      return this.internalState;
    } else {
      // Non-active approaches are held at RED
      return 'RED';
    }
  }

  public getCurrentPhase(): SignalPhase {
    return this.phases[this.currentPhaseIndex];
  }

  public getCurrentPhaseIndex(): number {
    return this.currentPhaseIndex;
  }

  public getInternalState(): SignalState {
    return this.internalState;
  }

  public getTimeInState(): number {
    return this.timeInState;
  }

  public getPhases(): SignalPhase[] {
    return this.phases;
  }

  public abstract getRemainingGreenTime(): number;
}

/**
 * Fixed-Time Signal Controller.
 * Cycles deterministically through phases with fixed green, yellow, and all-red durations.
 */
export class FixedTimeSignalController extends TrafficSignalController {
  constructor(nodeId: string, phases: SignalPhase[]) {
    super(nodeId, phases);
  }

  public update(dt: number): void {
    this.timeInState += dt;
    const currentPhase = this.phases[this.currentPhaseIndex];

    const yellowDuration = currentPhase.yellowDuration ?? 3.0;
    const allRedDuration = currentPhase.allRedDuration ?? 1.5;

    switch (this.internalState) {
      case 'GREEN':
        if (this.timeInState >= currentPhase.greenDuration) {
          this.internalState = 'YELLOW';
          this.timeInState = 0;
        }
        break;

      case 'YELLOW':
        if (this.timeInState >= yellowDuration) {
          this.internalState = 'ALL_RED';
          this.timeInState = 0;
        }
        break;

      case 'ALL_RED':
        if (this.timeInState >= allRedDuration) {
          // Switch to next phase
          this.currentPhaseIndex = (this.currentPhaseIndex + 1) % this.phases.length;
          this.internalState = 'GREEN';
          this.timeInState = 0;
        }
        break;

      default:
        this.internalState = 'GREEN';
        this.timeInState = 0;
    }
  }

  public getRemainingGreenTime(): number {
    if (this.internalState !== 'GREEN') return 0;
    const duration = this.phases[this.currentPhaseIndex].greenDuration;
    return Math.max(0, duration - this.timeInState);
  }
}

/**
 * Adaptive Queue-Responsive Signal Controller.
 * 
 * Actuation Logic:
 * 1. Runs GREEN for at least minGreen.
 * 2. If active approaches still have queued vehicles and maxGreen is not exceeded, extends green.
 * 3. If active approaches are empty OR competing approaches have significant queue backlog
 *    OR maxGreen ceiling is hit, transitions to YELLOW -> ALL_RED -> next phase.
 */
export class AdaptiveSignalController extends TrafficSignalController {
  private params: AdaptiveSignalParams;
  private currentGreenAllocated: number;

  constructor(
    nodeId: string,
    phases: SignalPhase[],
    params: Partial<AdaptiveSignalParams> = {}
  ) {
    super(nodeId, phases);
    this.params = {
      minGreen: params.minGreen ?? 10.0,
      maxGreen: params.maxGreen ?? 45.0,
      extensionSeconds: params.extensionSeconds ?? 3.0,
      queueThreshold: params.queueThreshold ?? 1,
    };
    this.currentGreenAllocated = this.params.minGreen;
  }

  public update(dt: number, incomingQueues?: Map<string, number>): void {
    this.timeInState += dt;
    const currentPhase = this.phases[this.currentPhaseIndex];
    const yellowDuration = currentPhase.yellowDuration ?? 3.0;
    const allRedDuration = currentPhase.allRedDuration ?? 1.5;

    switch (this.internalState) {
      case 'GREEN': {
        // Must serve at least minGreen
        if (this.timeInState < this.params.minGreen) {
          return;
        }

        // Count queues on active approach vs competing approaches
        const activeQueue = this.countQueueForEdges(currentPhase.greenEdgeIds, incomingQueues);
        const competingQueue = this.countCompetingQueue(currentPhase.greenEdgeIds, incomingQueues);

        // Extension evaluation
        const canExtend = this.timeInState + this.params.extensionSeconds <= this.params.maxGreen;
        const hasActiveDemand = activeQueue >= this.params.queueThreshold;
        const competingStarvation = competingQueue > activeQueue * 2 && this.timeInState >= this.params.minGreen * 1.5;

        if (hasActiveDemand && canExtend && !competingStarvation) {
          // Extend green: remain in GREEN state
          this.currentGreenAllocated = Math.min(
            this.params.maxGreen,
            this.timeInState + this.params.extensionSeconds
          );
        } else if (this.timeInState >= this.currentGreenAllocated || this.timeInState >= this.params.maxGreen || !hasActiveDemand) {
          // Terminate green: advance to YELLOW
          this.internalState = 'YELLOW';
          this.timeInState = 0;
        }
        break;
      }

      case 'YELLOW':
        if (this.timeInState >= yellowDuration) {
          this.internalState = 'ALL_RED';
          this.timeInState = 0;
        }
        break;

      case 'ALL_RED':
        if (this.timeInState >= allRedDuration) {
          // Switch to next phase with fresh minGreen
          this.currentPhaseIndex = (this.currentPhaseIndex + 1) % this.phases.length;
          this.internalState = 'GREEN';
          this.timeInState = 0;
          this.currentGreenAllocated = this.params.minGreen;
        }
        break;

      default:
        this.internalState = 'GREEN';
        this.timeInState = 0;
    }
  }

  private countQueueForEdges(edgeIds: string[], incomingQueues?: Map<string, number>): number {
    if (!incomingQueues) return 0;
    let count = 0;
    for (const id of edgeIds) {
      count += incomingQueues.get(id) ?? 0;
    }
    return count;
  }

  private countCompetingQueue(activeEdgeIds: string[], incomingQueues?: Map<string, number>): number {
    if (!incomingQueues) return 0;
    let count = 0;
    for (const [edgeId, q] of incomingQueues.entries()) {
      if (!activeEdgeIds.includes(edgeId)) {
        count += q;
      }
    }
    return count;
  }

  public getRemainingGreenTime(): number {
    if (this.internalState !== 'GREEN') return 0;
    return Math.max(0, this.currentGreenAllocated - this.timeInState);
  }

  public getParams(): AdaptiveSignalParams {
    return { ...this.params };
  }
}

/**
 * Factory for creating signal controllers from node configurations.
 */
export class SignalControllerFactory {
  public static create(node: IntersectionNode): TrafficSignalController | null {
    if (node.controlType === 'unsignalized' || !node.signalConfig) {
      return null;
    }

    const { type, phases, adaptiveParams } = node.signalConfig;

    if (type === 'adaptive_signal') {
      return new AdaptiveSignalController(node.id, phases, adaptiveParams);
    } else {
      return new FixedTimeSignalController(node.id, phases);
    }
  }

  /**
   * Helper to generate a standard 2-phase signal configuration for a 4-way intersection.
   * Phase 1: East-West approaches
   * Phase 2: North-South approaches
   */
  public static createStandard4WayPhases(
    eastWestEdgeIds: string[],
    northSouthEdgeIds: string[],
    greenDuration: number = 25.0
  ): SignalPhase[] {
    return [
      {
        id: 'phase_EW',
        name: 'East-West Movement',
        greenEdgeIds: eastWestEdgeIds,
        greenDuration,
        yellowDuration: 3.0,
        allRedDuration: 1.5,
      },
      {
        id: 'phase_NS',
        name: 'North-South Movement',
        greenEdgeIds: northSouthEdgeIds,
        greenDuration,
        yellowDuration: 3.0,
        allRedDuration: 1.5,
      },
    ];
  }
}
