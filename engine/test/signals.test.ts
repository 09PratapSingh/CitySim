import test from 'node:test';
import assert from 'node:assert';
import {
  FixedTimeSignalController,
  AdaptiveSignalController,
  SignalControllerFactory,
} from '../src/signals.ts';
import { RoadGraph } from '../src/graph.ts';
import { NetworkSimulation } from '../src/networkSimulation.ts';
import type { SignalPhase } from '../src/types.ts';

function createSamplePhases(): SignalPhase[] {
  return [
    {
      id: 'phase_EW',
      name: 'East-West Phase',
      greenEdgeIds: ['edge_W_in', 'edge_E_in'],
      greenDuration: 20.0,
      yellowDuration: 3.0,
      allRedDuration: 1.5,
    },
    {
      id: 'phase_NS',
      name: 'North-South Phase',
      greenEdgeIds: ['edge_N_in', 'edge_S_in'],
      greenDuration: 15.0,
      yellowDuration: 3.0,
      allRedDuration: 1.5,
    },
  ];
}

test('Signals: FixedTimeSignalController cycles predictably through GREEN -> YELLOW -> ALL_RED', () => {
  const phases = createSamplePhases();
  const controller = new FixedTimeSignalController('node_center', phases);

  // Initial state: Phase 0 (EW) GREEN
  assert.strictEqual(controller.getCurrentPhaseIndex(), 0);
  assert.strictEqual(controller.getInternalState(), 'GREEN');
  assert.strictEqual(controller.getEdgeSignalState('edge_W_in'), 'GREEN');
  assert.strictEqual(controller.getEdgeSignalState('edge_N_in'), 'RED'); // Orthogonal is RED

  // Step 19.9 seconds -> still GREEN
  controller.update(19.9);
  assert.strictEqual(controller.getInternalState(), 'GREEN');

  // Step 0.2 seconds -> reaches 20.1s => transitions to YELLOW
  controller.update(0.2);
  assert.strictEqual(controller.getInternalState(), 'YELLOW');
  assert.strictEqual(controller.getEdgeSignalState('edge_W_in'), 'YELLOW');
  assert.strictEqual(controller.getEdgeSignalState('edge_N_in'), 'RED');

  // Step 3.0 seconds -> yellow ends => transitions to ALL_RED
  controller.update(3.0);
  assert.strictEqual(controller.getInternalState(), 'ALL_RED');
  assert.strictEqual(controller.getEdgeSignalState('edge_W_in'), 'RED');
  assert.strictEqual(controller.getEdgeSignalState('edge_N_in'), 'RED');

  // Step 1.5 seconds -> clearance ends => transitions to Phase 1 (NS) GREEN
  controller.update(1.5);
  assert.strictEqual(controller.getCurrentPhaseIndex(), 1);
  assert.strictEqual(controller.getInternalState(), 'GREEN');
  assert.strictEqual(controller.getEdgeSignalState('edge_N_in'), 'GREEN');
  assert.strictEqual(controller.getEdgeSignalState('edge_W_in'), 'RED');
});

test('Signals: AdaptiveSignalController guarantees minGreen even if approach is empty', () => {
  const phases = createSamplePhases();
  const controller = new AdaptiveSignalController('node_center', phases, {
    minGreen: 10.0,
    maxGreen: 40.0,
  });

  const emptyQueues = new Map<string, number>([
    ['edge_W_in', 0],
    ['edge_E_in', 0],
    ['edge_N_in', 5], // Competing cross-street has 5 cars waiting
  ]);

  // Step 8 seconds with empty active approach
  controller.update(8.0, emptyQueues);

  // Must still be GREEN because minGreen (10s) is legally required
  assert.strictEqual(controller.getInternalState(), 'GREEN');
  assert.strictEqual(controller.getCurrentPhaseIndex(), 0);
});

test('Signals: AdaptiveSignalController extends green when queue backlog exists', () => {
  const phases = createSamplePhases();
  const controller = new AdaptiveSignalController('node_center', phases, {
    minGreen: 10.0,
    maxGreen: 30.0,
    extensionSeconds: 4.0,
  });

  const heavyActiveQueues = new Map<string, number>([
    ['edge_W_in', 6], // 6 cars waiting on active phase
    ['edge_N_in', 0],
  ]);

  // Advance past minGreen
  controller.update(10.0, heavyActiveQueues);
  assert.strictEqual(controller.getInternalState(), 'GREEN');

  // Advance another 8 seconds under continuous active demand
  controller.update(8.0, heavyActiveQueues);
  // Should remain in GREEN because of dynamic green extension
  assert.strictEqual(controller.getInternalState(), 'GREEN');
  assert.strictEqual(controller.getCurrentPhaseIndex(), 0);
});

test('Signals: AdaptiveSignalController caps green time at maxGreen to prevent starvation', () => {
  const phases = createSamplePhases();
  const controller = new AdaptiveSignalController('node_center', phases, {
    minGreen: 10.0,
    maxGreen: 25.0,
    extensionSeconds: 5.0,
  });

  const persistentQueue = new Map<string, number>([
    ['edge_W_in', 10], // Huge active queue
    ['edge_N_in', 5],  // Competing queue waiting
  ]);

  // Step up to maxGreen (25.1s)
  controller.update(25.1, persistentQueue);

  // Must be forced to YELLOW to clear and serve the waiting cross-street
  assert.strictEqual(controller.getInternalState(), 'YELLOW');
});

test('Signals: NetworkSimulation automatically connects signal controllers to stop bars', () => {
  const graph = new RoadGraph();

  // Create 4-way intersection node with fixed signals
  graph.addNode({
    id: 'center',
    x: 0,
    y: 0,
    controlType: 'fixed_signal',
    incomingEdgeIds: ['in_W', 'in_S'],
    outgoingEdgeIds: ['out_E', 'out_N'],
    signalConfig: {
      type: 'fixed_signal',
      phases: SignalControllerFactory.createStandard4WayPhases(['in_W'], ['in_S'], 15.0),
    },
  });

  graph.addNode({ id: 'west', x: -100, y: 0, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });
  graph.addNode({ id: 'south', x: 0, y: 100, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });
  graph.addNode({ id: 'east', x: 100, y: 0, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });
  graph.addNode({ id: 'north', x: 0, y: -100, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });

  graph.addEdge({ id: 'in_W', fromNodeId: 'west', toNodeId: 'center', length: 100, speedLimit: 13.89, lanes: 1, isOneWay: true });
  graph.addEdge({ id: 'in_S', fromNodeId: 'south', toNodeId: 'center', length: 100, speedLimit: 13.89, lanes: 1, isOneWay: true });
  graph.addEdge({ id: 'out_E', fromNodeId: 'center', toNodeId: 'east', length: 100, speedLimit: 13.89, lanes: 1, isOneWay: true });
  graph.addEdge({ id: 'out_N', fromNodeId: 'center', toNodeId: 'north', length: 100, speedLimit: 13.89, lanes: 1, isOneWay: true });

  const sim = new NetworkSimulation({
    graph,
    config: { seed: 42, timeStep: 0.1 },
    odPairs: [
      { originNodeId: 'west', destinationNodeId: 'east', arrivalRatePerHour: 600 },
      { originNodeId: 'south', destinationNodeId: 'north', arrivalRatePerHour: 600 },
    ],
  });

  // Verify controller was instantiated
  const ctrl = sim.getSignalController('center');
  assert.notStrictEqual(ctrl, undefined);

  // Initially: in_W is GREEN, in_S is RED
  assert.strictEqual(sim.getSignalStateForEdge('in_W'), 'GREEN');
  assert.strictEqual(sim.getSignalStateForEdge('in_S'), 'RED');

  // Step 20 seconds (15s green + 3s yellow + 1.5s all red + 0.5s into phase 2)
  sim.step(200);

  // Now in_W should be RED and in_S should be GREEN
  assert.strictEqual(sim.getSignalStateForEdge('in_S'), 'GREEN');
  assert.strictEqual(sim.getSignalStateForEdge('in_W'), 'RED');
});

test('Signals: Auto-generates signal controller and alternating phases for node without explicit signalConfig', () => {
  const graph = new RoadGraph();

  // Signalized node with NO signalConfig property
  graph.addNode({
    id: 'node_center',
    x: 200,
    y: 200,
    controlType: 'fixed_signal',
    incomingEdgeIds: ['road_W_C', 'road_S_C'],
    outgoingEdgeIds: ['road_C_E', 'road_C_N'],
  });

  graph.addNode({ id: 'node_west', x: 50, y: 200, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });
  graph.addNode({ id: 'node_south', x: 200, y: 350, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });
  graph.addNode({ id: 'node_east', x: 350, y: 200, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });
  graph.addNode({ id: 'node_north', x: 200, y: 50, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });

  graph.addEdge({ id: 'road_W_C', fromNodeId: 'node_west', toNodeId: 'node_center', length: 150, speedLimit: 13.89, lanes: 2, isOneWay: true });
  graph.addEdge({ id: 'road_S_C', fromNodeId: 'node_south', toNodeId: 'node_center', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true });
  graph.addEdge({ id: 'road_C_E', fromNodeId: 'node_center', toNodeId: 'node_east', length: 150, speedLimit: 13.89, lanes: 2, isOneWay: true });
  graph.addEdge({ id: 'road_C_N', fromNodeId: 'node_center', toNodeId: 'node_north', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true });

  const node = graph.getNode('node_center')!;
  const controller = SignalControllerFactory.create(node, graph);

  // Must successfully create a controller with 2 alternating phases
  assert.notStrictEqual(controller, null);
  const phases = controller!.getPhases();
  assert.strictEqual(phases.length, 2);
  assert.strictEqual(phases[0].greenEdgeIds.includes('road_W_C'), true);
  assert.strictEqual(phases[1].greenEdgeIds.includes('road_S_C'), true);
});

test('Signals: Default 4-way intersection cycles phases over time and vehicles stop on red with average wait time > 0', () => {
  const defaultMap = {
    nodes: [
      { id: 'node_center', x: 200, y: 200, controlType: 'fixed_signal', incomingEdgeIds: ['road_W_C', 'road_S_C'], outgoingEdgeIds: ['road_C_E', 'road_C_N'] },
      { id: 'node_west', x: 50, y: 200, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] },
      { id: 'node_south', x: 200, y: 350, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] },
      { id: 'node_east', x: 350, y: 200, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] },
      { id: 'node_north', x: 200, y: 50, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] },
    ],
    edges: [
      { id: 'road_W_C', fromNodeId: 'node_west', toNodeId: 'node_center', length: 150, speedLimit: 13.89, lanes: 2, isOneWay: true },
      { id: 'road_S_C', fromNodeId: 'node_south', toNodeId: 'node_center', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true },
      { id: 'road_C_E', fromNodeId: 'node_center', toNodeId: 'node_east', length: 150, speedLimit: 13.89, lanes: 2, isOneWay: true },
      { id: 'road_C_N', fromNodeId: 'node_center', toNodeId: 'node_north', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true },
    ],
  };

  const graph = RoadGraph.fromJSON(defaultMap as any);
  const odPairs = [
    { originNodeId: 'node_west', destinationNodeId: 'node_east', arrivalRatePerHour: 600 },
    { originNodeId: 'node_south', destinationNodeId: 'node_north', arrivalRatePerHour: 600 },
  ];

  const sim = new NetworkSimulation({
    graph,
    config: { seed: 42, timeStep: 0.1 },
    odPairs,
  });

  // Center node must have an instantiated controller
  const ctrl = sim.getSignalController('node_center');
  assert.notStrictEqual(ctrl, undefined);

  // Initial state: Approach 1 is GREEN, Approach 2 is RED
  const initialW = sim.getSignalStateForEdge('road_W_C');
  const initialS = sim.getSignalStateForEdge('road_S_C');
  assert.strictEqual(initialW, 'GREEN');
  assert.strictEqual(initialS, 'RED');

  // Step 26 seconds: Phase 1 green (25s) ends, transitions to YELLOW (3s)
  sim.step(260);
  assert.strictEqual(sim.getSignalStateForEdge('road_W_C'), 'YELLOW');
  assert.strictEqual(sim.getSignalStateForEdge('road_S_C'), 'RED');

  // Step 3.5 more seconds: Yellow + all-red clearance completes, Phase 2 starts (S is GREEN, W is RED)
  sim.step(35);
  assert.strictEqual(sim.getSignalStateForEdge('road_W_C'), 'RED');
  assert.strictEqual(sim.getSignalStateForEdge('road_S_C'), 'GREEN');

  // Run for a total of 120 seconds (1200 ticks) to let vehicles arrive, stop on red, and queue
  sim.step(905);

  const metrics = sim.getMetrics();

  // Average wait time must be strictly positive because vehicles queued at the red signal
  assert.strictEqual(metrics.averageWaitTime > 0, true);

  // Max queue length must be observed
  assert.strictEqual(metrics.maxQueueLength > 0, true);

  // Active vehicles are present and total spawned equals active + completed
  assert.strictEqual(metrics.activeVehiclesCount > 0, true);
  assert.strictEqual(metrics.totalSpawned, metrics.activeVehiclesCount + metrics.completedVehiclesCount);
});
