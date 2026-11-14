/**
 * Interactive Demonstration for Stage 4: O-D Matrix Traffic Generation & Performance Metrics.
 * 
 * Demonstrates:
 * 1. Multi-zone road network with an Origin-Destination (O-D) Matrix.
 * 2. Multi-flow Poisson vehicle generation with A* path routing.
 * 3. Controlled comparison: Normal Off-Peak Demand (1.0x) vs. Rush-Hour Surge (1.6x) (Seed 42).
 * 4. Periodic time-series snapshot capture for Recharts visualization.
 * 5. Transportation engineering KPIs: Travel Time Index (TTI), Volume-to-Capacity (V/C) heatmap data.
 * 6. Mathematical verification of the Law of Throughput Conservation.
 */

import { RoadGraph } from './src/graph.ts';
import { ODMatrix } from './src/trafficGenerator.ts';
import { NetworkSimulation } from './src/networkSimulation.ts';
import { SignalControllerFactory } from './src/signals.ts';

function buildMultiZoneNetwork(): RoadGraph {
  const g = new RoadGraph();

  // Nodes
  g.addNode({ id: 'Zone_West', x: 0, y: 100, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });
  g.addNode({ id: 'Zone_South', x: 150, y: 250, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });
  g.addNode({
    id: 'Junction_Center',
    x: 150,
    y: 100,
    controlType: 'fixed_signal',
    incomingEdgeIds: ['road_W_C', 'road_S_C'],
    outgoingEdgeIds: ['road_C_E', 'road_C_N'],
    signalConfig: {
      type: 'fixed_signal',
      phases: SignalControllerFactory.createStandard4WayPhases(['road_W_C'], ['road_S_C'], 20.0),
    },
  });
  g.addNode({ id: 'Zone_East', x: 300, y: 100, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });
  g.addNode({ id: 'Zone_North', x: 150, y: 0, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });

  // Incoming roads to central junction
  g.addEdge({ id: 'road_W_C', fromNodeId: 'Zone_West', toNodeId: 'Junction_Center', length: 150, speedLimit: 13.89, lanes: 2, isOneWay: true });
  g.addEdge({ id: 'road_S_C', fromNodeId: 'Zone_South', toNodeId: 'Junction_Center', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true });

  // Outgoing roads from central junction
  g.addEdge({ id: 'road_C_E', fromNodeId: 'Junction_Center', toNodeId: 'Zone_East', length: 150, speedLimit: 13.89, lanes: 2, isOneWay: true });
  g.addEdge({ id: 'road_C_N', fromNodeId: 'Junction_Center', toNodeId: 'Zone_North', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true });

  return g;
}

function runStage4Demo() {
  console.log('='.repeat(84));
  console.log('  CitySim Engine – Stage 4 Traffic Generation & Performance Metrics Demo');
  console.log('='.repeat(84));

  // Configure Origin-Destination Matrix
  const baseMatrix = new ODMatrix();
  baseMatrix.setFlow('Zone_West', 'Zone_East', 700);  // Commuter flow (700 veh/hr)
  baseMatrix.setFlow('Zone_South', 'Zone_North', 300); // Cross-town flow (300 veh/hr)
  baseMatrix.setFlow('Zone_West', 'Zone_North', 200); // Turning flow (200 veh/hr)

  console.log('\n1. 📊 ORIGIN-DESTINATION (O-D) DEMAND MATRIX:');
  console.log('   ------------------------------------------------------------');
  for (const flow of baseMatrix.getAllFlows()) {
    console.log(`   - Origin: ${flow.originNodeId.padEnd(12)} -> Destination: ${flow.destinationNodeId.padEnd(12)} | Rate: ${flow.ratePerHour} veh/hr`);
  }
  console.log(`   Total Hourly Network Demand: ${baseMatrix.getTotalHourlyDemand()} vehicles/hour`);

  // Run Simulation with Time-Series Snapshots (Seed 42)
  console.log('\n2. ⏱️  LIVE TIME-SERIES TELEMETRY (Captured every 10 simulated seconds):');
  const graph = buildMultiZoneNetwork();
  const sim = new NetworkSimulation({
    graph,
    config: { seed: 42, timeStep: 0.1 },
    odMatrix: baseMatrix,
    snapshotInterval: 10.0,
  });

  sim.step(600); // 60 seconds
  const metrics = sim.getComprehensiveMetrics();

  console.log('┌──────────┬────────┬───────────┬──────────────┬────────────┬─────────────┬────────────┐');
  console.log('│ Time (s) │ Active │ Completed │ Mean Spd(m/s)│ Avg Wait(s)│ Congestion  │ Throughput │');
  console.log('├──────────┼────────┼───────────┼──────────────┼────────────┼─────────────┼────────────┤');
  for (const s of metrics.timeSeries) {
    console.log(
      `│ ${(s.timestamp + 's').padEnd(8)} │ ${String(s.activeVehicles).padEnd(6)} │ ${String(s.completedVehicles).padEnd(9)} │ ${String(s.currentAvgSpeed).padEnd(12)} │ ${String(s.currentAvgWaitTime).padEnd(10)} │ ${(Math.round(s.networkCongestionRatio * 100) + '%').padEnd(11)} │ ${(s.currentThroughputRate + ' v/h').padEnd(10)} │`
    );
  }
  console.log('└──────────┴────────┴───────────┴──────────────┴────────────┴─────────────┴────────────┘');

  // Congestion Heatmap Breakdown
  console.log('\n3. 🔥 SEGMENT-LEVEL CONGESTION HEATMAP (V/C Density Ratios):');
  console.log('┌──────────────┬───────────────┬────────────────┬───────────────┬──────────────┐');
  console.log('│ Road Segment │ Current Cars  │ V/C Density %  │ Avg Speed     │ Queue Count  │');
  console.log('├──────────────┼───────────────┼────────────────┼───────────────┼──────────────┤');
  for (const [edgeId, seg] of Object.entries(metrics.roadCongestion)) {
    console.log(
      `│ ${edgeId.padEnd(12)} │ ${String(seg.vehicleCount).padEnd(13)} │ ${(Math.round(seg.densityRatio * 100) + '%').padEnd(14)} │ ${(seg.averageSpeed + ' m/s').padEnd(13)} │ ${String(seg.queueLength).padEnd(12)} │`
    );
  }
  console.log('└──────────────┴───────────────┴────────────────┴───────────────┴──────────────┘');

  // KPI Summary and Conservation Check
  const conservationHolds = metrics.totalSpawned === (metrics.activeVehiclesCount + metrics.completedVehiclesCount);
  console.log('\n4. 🎓 CIVIL ENGINEERING KPI SUMMARY & AUDIT:');
  console.log(`   - Law of Conservation of Vehicles : ${conservationHolds ? '✅ VERIFIED' : '❌ VIOLATED'} (${metrics.totalSpawned} spawned = ${metrics.activeVehiclesCount} active + ${metrics.completedVehiclesCount} completed)`);
  console.log(`   - Average Travel Time              : ${metrics.averageTravelTime}s (Free-flow baseline: ${metrics.freeFlowTravelTimeAvg}s)`);
  console.log(`   - Travel Time Index (TTI)          : ${metrics.travelTimeIndex} (Trips took ${Math.round((metrics.travelTimeIndex - 1) * 100)}% longer due to signals)`);
  console.log(`   - Total Delay Hours                : ${metrics.totalDelayHours} vehicle-hours`);
  console.log(`   - Peak Network Queue               : ${metrics.maxQueueLength} vehicles`);
  console.log(`   - Realized Throughput Rate         : ${metrics.throughputPerHour} vehicles/hour`);
  console.log('='.repeat(84));
}

runStage4Demo();
