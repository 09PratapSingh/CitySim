/**
 * Interactive CLI Demonstration for Stage 1: Single Intersection Simulation.
 * 
 * Demonstrates:
 * 1. Seeded deterministic PRNG vehicle spawning (Poisson process)
 * 2. Intelligent Driver Model (IDM) car-following dynamics
 * 3. Stop-line obedience (West green, South red -> queue buildup on South)
 * 4. Real-time metric compilation (Average Delay, Throughput, Speed)
 */

import { SingleIntersectionSimulation } from './src/simulation.ts';

function renderRoadAscii(
  roadLength: number,
  vehicles: { position: number; id: string; velocity: number }[],
  isStopLineOpen: boolean
): string {
  const charsCount = 30; // 30 characters representing the 150m road (5m per char)
  const track = new Array(charsCount).fill('·');

  for (const v of vehicles) {
    const charIndex = Math.min(
      charsCount - 1,
      Math.max(0, Math.floor((v.position / roadLength) * charsCount))
    );
    // 'C' for moving car, 'Q' for queued/stopped car
    track[charIndex] = v.velocity < 0.5 ? '█' : '▶';
  }

  const stopBar = isStopLineOpen ? ' [🟢 GREEN]' : ' [🔴 RED]';
  return `[${track.join('')}]${stopBar}`;
}

async function runDemo() {
  console.log('='.repeat(78));
  console.log('  CitySim Engine – Stage 1 Single Intersection Demonstration');
  console.log('  Physics: Intelligent Driver Model (IDM) | Arrival: Seeded Poisson (Seed 42)');
  console.log('='.repeat(78));
  console.log('');

  const sim = new SingleIntersectionSimulation({
    seed: 42,
    timeStep: 0.1,
    arrivalRatePerHour: 500, // 500 vehicles/hour (~1 car every 7.2s per approach)
  });

  // Schedule: 0s - 15s (West green, South red); 15s - 30s (West red, South green)
  const totalSeconds = 30;
  const timeStep = 0.1;
  const totalTicks = Math.round(totalSeconds / timeStep);

  console.log('Simulating 30 seconds of traffic at single intersection...\n');

  for (let tick = 0; tick <= totalTicks; tick++) {
    const currentTime = tick * timeStep;

    // Signal timing control (simple two-phase switch at 15s)
    if (currentTime < 15) {
      sim.setStopLineState('road_W_in', true);
      sim.setStopLineState('road_S_in', false);
    } else {
      sim.setStopLineState('road_W_in', false);
      sim.setStopLineState('road_S_in', true);
    }

    // Print status every 5 simulated seconds
    if (tick % 50 === 0) {
      const metrics = sim.getMetrics();
      const activeVehs = sim.getActiveVehicles();

      const westVehs = activeVehs.filter((v) => v.currentEdgeId === 'road_W_in');
      const southVehs = activeVehs.filter((v) => v.currentEdgeId === 'road_S_in');

      console.log(`⏱️  Simulation Time: ${currentTime.toFixed(1)}s`);
      console.log(
        `   Approach West  (150m): ${renderRoadAscii(
          150,
          westVehs,
          sim.getStopLineState('road_W_in')
        )} (${westVehs.length} cars)`
      );
      console.log(
        `   Approach South (150m): ${renderRoadAscii(
          150,
          southVehs,
          sim.getStopLineState('road_S_in')
        )} (${southVehs.length} cars)`
      );
      console.log(
        `   📊 Active: ${metrics.activeVehiclesCount} | Completed: ${metrics.completedVehiclesCount} | Avg Speed: ${(metrics.averageSpeed * 3.6).toFixed(1)} km/h | Max Queue: ${metrics.maxQueueLength} cars | Throughput: ${metrics.throughputPerHour} veh/h`
      );
      console.log('-'.repeat(78));
    }

    sim.tick();
  }

  const finalMetrics = sim.getMetrics();
  console.log('\n🏁 FINAL STAGE 1 METRICS SUMMARY:');
  console.log(`   - Total Simulation Time  : ${finalMetrics.simulationTime}s`);
  console.log(`   - Total Vehicles Spawned : ${finalMetrics.totalSpawned}`);
  console.log(`   - Vehicles Completed     : ${finalMetrics.completedVehiclesCount}`);
  console.log(`   - Still Active in Network: ${finalMetrics.activeVehiclesCount}`);
  console.log(`   - Average Travel Time    : ${finalMetrics.averageTravelTime}s`);
  console.log(`   - Average Wait / Delay   : ${finalMetrics.averageWaitTime}s`);
  console.log(`   - Max Queue Length       : ${finalMetrics.maxQueueLength} vehicles`);
  console.log(`   - Hourly Throughput Rate : ${finalMetrics.throughputPerHour} veh/hr`);
  console.log('='.repeat(78));
}

runDemo().catch(console.error);
