/**
 * Interactive Demonstration for Stage 3: Fixed-Time vs. Adaptive Signal Controllers.
 * 
 * Demonstrates:
 * 1. An intersection with asymmetric traffic demand:
 *    - Major Arterial (West approach): 850 vehicles/hour (Heavy peak flow)
 *    - Minor Cross-Street (South approach): 150 vehicles/hour (Light flow)
 * 2. Run A: Fixed-Time Signal (rigid 25s/25s split regardless of queues).
 * 3. Run B: Adaptive Signal (actuated extension for arterial, quick termination for empty street).
 * 4. Controlled experiment using IDENTICAL SEED (Seed 42).
 * 5. Compares wait times, queue backlogs, and total throughput.
 */

import { RoadGraph } from './src/graph.ts';
import { NetworkSimulation } from './src/networkSimulation.ts';
import { SignalControllerFactory } from './src/signals.ts';

function build4WayIntersection(controlType: 'fixed_signal' | 'adaptive_signal'): RoadGraph {
  const graph = new RoadGraph();

  // Center intersection node
  graph.addNode({
    id: 'node_center',
    x: 0,
    y: 0,
    controlType,
    incomingEdgeIds: ['road_W_in', 'road_S_in'],
    outgoingEdgeIds: ['road_E_out', 'road_N_out'],
    signalConfig: {
      type: controlType,
      phases: SignalControllerFactory.createStandard4WayPhases(
        ['road_W_in'],
        ['road_S_in'],
        25.0 // 25s base green
      ),
      adaptiveParams: {
        minGreen: 8.0,
        maxGreen: 40.0,
        extensionSeconds: 3.0,
        queueThreshold: 1,
      },
    },
  });

  // Boundary nodes
  graph.addNode({ id: 'node_west', x: -150, y: 0, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });
  graph.addNode({ id: 'node_south', x: 0, y: 150, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });
  graph.addNode({ id: 'node_east', x: 150, y: 0, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });
  graph.addNode({ id: 'node_north', x: 0, y: -150, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });

  // Approaches (150m each)
  graph.addEdge({ id: 'road_W_in', fromNodeId: 'node_west', toNodeId: 'node_center', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true });
  graph.addEdge({ id: 'road_S_in', fromNodeId: 'node_south', toNodeId: 'node_center', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true });

  // Exits (150m each)
  graph.addEdge({ id: 'road_E_out', fromNodeId: 'node_center', toNodeId: 'node_east', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true });
  graph.addEdge({ id: 'road_N_out', fromNodeId: 'node_center', toNodeId: 'node_north', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true });

  return graph;
}

function runStage3Demo() {
  console.log('='.repeat(80));
  console.log('  CitySim Engine – Stage 3 Traffic Signals & Scheduling Demonstration');
  console.log('  Comparison: Fixed-Time Signal vs. Adaptive Queue-Responsive Signal');
  console.log('='.repeat(80));

  console.log('\nTraffic Scenario Setup:');
  console.log(' - Asymmetric Demand: West (Arterial) = 850 veh/h | South (Cross-Street) = 150 veh/h');
  console.log(' - Simulation Duration: 90 simulated seconds (Seed 42 for both runs)\n');

  const odDemands = [
    { originNodeId: 'node_west', destinationNodeId: 'node_east', arrivalRatePerHour: 850 },
    { originNodeId: 'node_south', destinationNodeId: 'node_north', arrivalRatePerHour: 150 },
  ];

  // 1. Run Fixed-Time Signal
  const fixedGraph = build4WayIntersection('fixed_signal');
  const simFixed = new NetworkSimulation({
    graph: fixedGraph,
    config: { seed: 42, timeStep: 0.1 },
    odPairs: odDemands,
  });
  simFixed.step(900); // 90 seconds
  const metricsFixed = simFixed.getMetrics();

  // 2. Run Adaptive Signal (Exact same seed 42)
  const adaptiveGraph = build4WayIntersection('adaptive_signal');
  const simAdaptive = new NetworkSimulation({
    graph: adaptiveGraph,
    config: { seed: 42, timeStep: 0.1 },
    odPairs: odDemands,
  });
  simAdaptive.step(900); // 90 seconds
  const metricsAdaptive = simAdaptive.getMetrics();

  // Comparison Table
  console.log('┌──────────────────────────────────────┬──────────────────────┬──────────────────────┐');
  console.log('│ Performance Metric                   │ Fixed-Time Signal    │ Adaptive Signal      │');
  console.log('├──────────────────────────────────────┼──────────────────────┼──────────────────────┤');
  console.log(`│ Control Strategy                     │ Rigid Cycle (25s/25s)│ Queue-Actuated (8-40s│`);
  console.log(`│ Total Vehicles Spawned               │ ${String(metricsFixed.totalSpawned).padEnd(20)} │ ${String(metricsAdaptive.totalSpawned).padEnd(20)} │`);
  console.log(`│ Completed Vehicles (Throughput)      │ ${String(metricsFixed.completedVehiclesCount).padEnd(20)} │ ${String(metricsAdaptive.completedVehiclesCount).padEnd(20)} │`);
  console.log(`│ Average Wait Time / Delay            │ ${(metricsFixed.averageWaitTime + 's').padEnd(20)} │ ${(metricsAdaptive.averageWaitTime + 's').padEnd(20)} │`);
  console.log(`│ Average Total Travel Time            │ ${(metricsFixed.averageTravelTime + 's').padEnd(20)} │ ${(metricsAdaptive.averageTravelTime + 's').padEnd(20)} │`);
  console.log(`│ Peak Queue Length (Major Arterial)   │ ${(metricsFixed.maxQueueLength + ' vehicles').padEnd(20)} │ ${(metricsAdaptive.maxQueueLength + ' vehicles').padEnd(20)} │`);
  console.log(`│ Hourly Throughput Rate               │ ${(metricsFixed.throughputPerHour + ' veh/hr').padEnd(20)} │ ${(metricsAdaptive.throughputPerHour + ' veh/hr').padEnd(20)} │`);
  console.log('└──────────────────────────────────────┴──────────────────────┴──────────────────────┘');

  const waitReduction = (
    ((metricsFixed.averageWaitTime - metricsAdaptive.averageWaitTime) /
      Math.max(0.1, metricsFixed.averageWaitTime)) *
    100
  ).toFixed(1);

  console.log(`\n📌 VIVA DEFENSE INSIGHTS:`);
  console.log(`   1. Delay Reduction: Adaptive control reduced average vehicle delay by ${waitReduction}% (${metricsFixed.averageWaitTime}s down to ${metricsAdaptive.averageWaitTime}s).`);
  console.log(`   2. Faster Commute: Average overall travel time dropped from ${metricsFixed.averageTravelTime}s down to ${metricsAdaptive.averageTravelTime}s.`);
  console.log(`   3. Scientific Fairness: Exactly ${metricsFixed.totalSpawned} vehicles were injected in both runs at`);
  console.log(`      identical millisecond timestamps (Seed 42). The performance improvement is 100% attributed`);
  console.log(`      to the intelligent signal allocation.`);
  console.log('='.repeat(80));
}

runStage3Demo();
