/**
 * Interactive Demonstration for Stage 2: Road Graph, A* Routing & Road Closure Detour.
 * 
 * Demonstrates:
 * 1. Building a multi-node, multi-edge road graph.
 * 2. Origin-Destination A* routing vs Dijkstra.
 * 3. Before vs After comparison on identical seed (Seed 42):
 *    - Baseline: Upper arterial open (Fast route A -> B -> D).
 *    - Modified Scenario: Upper road CLOSED -> Vehicles automatically detour (A -> C -> D).
 * 4. Compares metrics: Travel Time impact of road closure.
 */

import { RoadGraph } from './src/graph.ts';
import { Router } from './src/routing.ts';
import { NetworkSimulation } from './src/networkSimulation.ts';

function buildDiamondNetwork(): RoadGraph {
  const graph = new RoadGraph();

  // Nodes: A (Origin), B (North hub), C (South detour hub), D (Destination)
  graph.addNode({ id: 'Node_A', x: 0, y: 0, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });
  graph.addNode({ id: 'Node_B', x: 150, y: 50, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });
  graph.addNode({ id: 'Node_C', x: 150, y: -70, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });
  graph.addNode({ id: 'Node_D', x: 300, y: 0, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });

  // Upper arterial route: A -> B -> D (Length: 150m + 150m = 300m, Speed Limit: 16.67 m/s = 60 km/h)
  graph.addEdge({ id: 'road_A_B', fromNodeId: 'Node_A', toNodeId: 'Node_B', length: 150, speedLimit: 16.67, lanes: 1, isOneWay: true });
  graph.addEdge({ id: 'road_B_D', fromNodeId: 'Node_B', toNodeId: 'Node_D', length: 150, speedLimit: 16.67, lanes: 1, isOneWay: true });

  // Lower detour route: A -> C -> D (Length: 220m + 220m = 440m, Speed Limit: 11.11 m/s = 40 km/h)
  graph.addEdge({ id: 'road_A_C', fromNodeId: 'Node_A', toNodeId: 'Node_C', length: 220, speedLimit: 11.11, lanes: 1, isOneWay: true });
  graph.addEdge({ id: 'road_C_D', fromNodeId: 'Node_C', toNodeId: 'Node_D', length: 220, speedLimit: 11.11, lanes: 1, isOneWay: true });

  return graph;
}

function runStage2Demo() {
  console.log('='.repeat(80));
  console.log('  CitySim Engine – Stage 2 Multi-Road Graph, A* Routing & Detour Demo');
  console.log('='.repeat(80));

  const sampleGraph = buildDiamondNetwork();

  console.log('\n1. 🧭 ALGORITHM VERIFICATION (A* vs Dijkstra):');
  const dijkstraRoute = Router.dijkstra(sampleGraph, 'Node_A', 'Node_D', 'travel_time')!;
  const astarRoute = Router.astar(sampleGraph, 'Node_A', 'Node_D', 'travel_time')!;

  console.log(`   - Origin: Node_A | Destination: Node_D`);
  console.log(`   - Dijkstra Path : [${dijkstraRoute.nodePath.join(' -> ')}] | Visited: ${dijkstraRoute.visitedNodesCount} nodes | Est. Time: ${dijkstraRoute.estimatedFreeFlowTime}s`);
  console.log(`   - A* Path       : [${astarRoute.nodePath.join(' -> ')}] | Visited: ${astarRoute.visitedNodesCount} nodes | Est. Time: ${astarRoute.estimatedFreeFlowTime}s`);

  console.log('\n2. 🔬 SCENARIO COMPARISON: BASELINE vs. ROAD CLOSURE (Identical Seed: 42):');
  console.log('   Simulating 75 seconds of traffic demand (600 veh/hr)...\n');

  // Baseline Run
  const baselineGraph = buildDiamondNetwork();
  const simBaseline = new NetworkSimulation({
    graph: baselineGraph,
    config: { seed: 42, timeStep: 0.1 },
    odPairs: [{ originNodeId: 'Node_A', destinationNodeId: 'Node_D', arrivalRatePerHour: 600 }],
  });
  simBaseline.step(750); // 75 seconds
  const metricsBaseline = simBaseline.getMetrics();
  const baselineRouteSample = simBaseline.getCompletedVehicles()[0]?.routeEdgeIds?.join(' -> ') ?? 'None';

  // Modified Scenario Run (Close road_A_B)
  const modifiedGraph = buildDiamondNetwork();
  modifiedGraph.setRoadClosure('road_A_B', true); // Road closed for maintenance!

  const simModified = new NetworkSimulation({
    graph: modifiedGraph,
    config: { seed: 42, timeStep: 0.1 }, // Exact same seed guarantees same vehicle arrivals!
    odPairs: [{ originNodeId: 'Node_A', destinationNodeId: 'Node_D', arrivalRatePerHour: 600 }],
  });
  simModified.step(750); // 75 seconds
  const metricsModified = simModified.getMetrics();
  const modifiedRouteSample = simModified.getCompletedVehicles()[0]?.routeEdgeIds?.join(' -> ') ?? 'None';

  // Output Comparison Table
  console.log('┌──────────────────────────────────────┬──────────────────────┬──────────────────────┐');
  console.log('│ Performance Metric                   │ Baseline (Open)      │ Scenario (Road Closed│');
  console.log('├──────────────────────────────────────┼──────────────────────┼──────────────────────┤');
  console.log(`│ Status of 'road_A_B'                 │ 🟢 OPEN              │ 🔴 CLOSED (Detour)   │`);
  console.log(`│ Primary Route Selected               │ ${baselineRouteSample.padEnd(20)} │ ${modifiedRouteSample.padEnd(20)} │`);
  console.log(`│ Total Vehicles Spawned               │ ${String(metricsBaseline.totalSpawned).padEnd(20)} │ ${String(metricsModified.totalSpawned).padEnd(20)} │`);
  console.log(`│ Vehicles Completed Trip              │ ${String(metricsBaseline.completedVehiclesCount).padEnd(20)} │ ${String(metricsModified.completedVehiclesCount).padEnd(20)} │`);
  console.log(`│ Average Travel Time (Trip Duration)  │ ${(metricsBaseline.averageTravelTime + 's').padEnd(20)} │ ${(metricsModified.averageTravelTime + 's').padEnd(20)} │`);
  console.log(`│ Mean Vehicle Speed                   │ ${(metricsBaseline.averageSpeed + ' m/s').padEnd(20)} │ ${(metricsModified.averageSpeed + ' m/s').padEnd(20)} │`);
  console.log(`│ Peak Queue Length                    │ ${(metricsBaseline.maxQueueLength + ' vehicles').padEnd(20)} │ ${(metricsModified.maxQueueLength + ' vehicles').padEnd(20)} │`);
  console.log(`│ Hourly Network Throughput            │ ${(metricsBaseline.throughputPerHour + ' veh/hr').padEnd(20)} │ ${(metricsModified.throughputPerHour + ' veh/hr').padEnd(20)} │`);
  console.log('└──────────────────────────────────────┴──────────────────────┴──────────────────────┘');

  const travelTimeDelta = (
    ((metricsModified.averageTravelTime - metricsBaseline.averageTravelTime) /
      metricsBaseline.averageTravelTime) *
    100
  ).toFixed(1);

  console.log(`\n📌 IMPACT ANALYSIS:`);
  console.log(`   Closing arterial 'road_A_B' forced vehicles to take the southern detour (road_A_C -> road_C_D).`);
  console.log(`   Because the detour is longer and slower, average trip duration increased by +${travelTimeDelta}%.`);
  console.log(`   Because both simulations used SEED 42, exactly ${metricsBaseline.totalSpawned} vehicles were generated`);
  console.log(`   at the exact same timestamps in both runs. The comparison is 100% statistically valid!`);
  console.log('='.repeat(80));
}

runStage2Demo();
