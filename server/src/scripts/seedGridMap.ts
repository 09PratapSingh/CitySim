/**
 * Standalone Database Seeder for 3x3 City Block Grid Map and Scenarios.
 * 
 * Usage:
 *   node --experimental-strip-types server/src/scripts/seedGridMap.ts
 */

import { connectDB, disconnectDB, isDBConnected } from '../config/db.ts';
import { MapModel } from '../models/MapModel.ts';
import { ScenarioModel } from '../models/ScenarioModel.ts';
import { DataStore } from '../models/store.ts';

async function seed(): Promise<void> {
  console.log('🚀 Seeding 3x3 City Block Grid Map and Scenarios...');

  const dbConnected = await connectDB();

  const gridMapId = 'map_grid_3x3';
  const gridMapData = {
    id: gridMapId,
    name: '3x3 City Block Grid',
    description: 'Urban 3x3 street grid (9 nodes, 24 directional links) with a signalized center intersection and perimeter bypasses for detour routing.',
    nodes: [
      // Row 1 (Top)
      {
        id: 'node_TL',
        x: 200,
        y: 150,
        controlType: 'unsignalized' as const,
        incomingEdgeIds: ['road_TC_TL', 'road_ML_TL'],
        outgoingEdgeIds: ['road_TL_TC', 'road_TL_ML'],
      },
      {
        id: 'node_TC',
        x: 400,
        y: 150,
        controlType: 'unsignalized' as const,
        incomingEdgeIds: ['road_TL_TC', 'road_TR_TC', 'road_C_TC'],
        outgoingEdgeIds: ['road_TC_TL', 'road_TC_TR', 'road_TC_C'],
      },
      {
        id: 'node_TR',
        x: 600,
        y: 150,
        controlType: 'unsignalized' as const,
        incomingEdgeIds: ['road_TC_TR', 'road_MR_TR'],
        outgoingEdgeIds: ['road_TR_TC', 'road_TR_MR'],
      },
      // Row 2 (Middle)
      {
        id: 'node_ML',
        x: 200,
        y: 300,
        controlType: 'unsignalized' as const,
        incomingEdgeIds: ['road_TL_ML', 'road_BL_ML', 'road_C_ML'],
        outgoingEdgeIds: ['road_ML_TL', 'road_ML_BL', 'road_ML_C'],
      },
      {
        id: 'node_C',
        x: 400,
        y: 300,
        controlType: 'fixed_signal' as const,
        incomingEdgeIds: ['road_ML_C', 'road_MR_C', 'road_TC_C', 'road_BC_C'],
        outgoingEdgeIds: ['road_C_ML', 'road_C_MR', 'road_C_TC', 'road_C_BC'],
        signalConfig: {
          type: 'fixed_signal' as const,
          cycleTime: 59,
          phases: [
            {
              id: 'phase_EW',
              name: 'East-West Movement',
              greenEdgeIds: ['road_ML_C', 'road_MR_C'],
              greenDuration: 25,
              yellowDuration: 3,
              allRedDuration: 1.5,
            },
            {
              id: 'phase_NS',
              name: 'North-South Movement',
              greenEdgeIds: ['road_TC_C', 'road_BC_C'],
              greenDuration: 25,
              yellowDuration: 3,
              allRedDuration: 1.5,
            },
          ],
        },
      },
      {
        id: 'node_MR',
        x: 600,
        y: 300,
        controlType: 'unsignalized' as const,
        incomingEdgeIds: ['road_TR_MR', 'road_BR_MR', 'road_C_MR'],
        outgoingEdgeIds: ['road_MR_TR', 'road_MR_BR', 'road_MR_C'],
      },
      // Row 3 (Bottom)
      {
        id: 'node_BL',
        x: 200,
        y: 450,
        controlType: 'unsignalized' as const,
        incomingEdgeIds: ['road_ML_BL', 'road_BC_BL'],
        outgoingEdgeIds: ['road_BL_ML', 'road_BL_BC'],
      },
      {
        id: 'node_BC',
        x: 400,
        y: 450,
        controlType: 'unsignalized' as const,
        incomingEdgeIds: ['road_BL_BC', 'road_BR_BC', 'road_C_BC'],
        outgoingEdgeIds: ['road_BC_BL', 'road_BC_BR', 'road_BC_C'],
      },
      {
        id: 'node_BR',
        x: 600,
        y: 450,
        controlType: 'unsignalized' as const,
        incomingEdgeIds: ['road_BC_BR', 'road_MR_BR'],
        outgoingEdgeIds: ['road_BR_BC', 'road_BR_MR'],
      },
    ],
    edges: [
      // Horizontal links (12 directed edges)
      { id: 'road_TL_TC', fromNodeId: 'node_TL', toNodeId: 'node_TC', length: 200, speedLimit: 13.89, lanes: 1, isOneWay: true },
      { id: 'road_TC_TL', fromNodeId: 'node_TC', toNodeId: 'node_TL', length: 200, speedLimit: 13.89, lanes: 1, isOneWay: true },
      { id: 'road_TC_TR', fromNodeId: 'node_TC', toNodeId: 'node_TR', length: 200, speedLimit: 13.89, lanes: 1, isOneWay: true },
      { id: 'road_TR_TC', fromNodeId: 'node_TR', toNodeId: 'node_TC', length: 200, speedLimit: 13.89, lanes: 1, isOneWay: true },

      { id: 'road_ML_C', fromNodeId: 'node_ML', toNodeId: 'node_C', length: 200, speedLimit: 13.89, lanes: 1, isOneWay: true },
      { id: 'road_C_ML', fromNodeId: 'node_C', toNodeId: 'node_ML', length: 200, speedLimit: 13.89, lanes: 1, isOneWay: true },
      { id: 'road_C_MR', fromNodeId: 'node_C', toNodeId: 'node_MR', length: 200, speedLimit: 13.89, lanes: 1, isOneWay: true },
      { id: 'road_MR_C', fromNodeId: 'node_MR', toNodeId: 'node_C', length: 200, speedLimit: 13.89, lanes: 1, isOneWay: true },

      { id: 'road_BL_BC', fromNodeId: 'node_BL', toNodeId: 'node_BC', length: 200, speedLimit: 13.89, lanes: 1, isOneWay: true },
      { id: 'road_BC_BL', fromNodeId: 'node_BC', toNodeId: 'node_BL', length: 200, speedLimit: 13.89, lanes: 1, isOneWay: true },
      { id: 'road_BC_BR', fromNodeId: 'node_BC', toNodeId: 'node_BR', length: 200, speedLimit: 13.89, lanes: 1, isOneWay: true },
      { id: 'road_BR_BC', fromNodeId: 'node_BR', toNodeId: 'node_BC', length: 200, speedLimit: 13.89, lanes: 1, isOneWay: true },

      // Vertical links (12 directed edges)
      { id: 'road_TL_ML', fromNodeId: 'node_TL', toNodeId: 'node_ML', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true },
      { id: 'road_ML_TL', fromNodeId: 'node_ML', toNodeId: 'node_TL', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true },
      { id: 'road_ML_BL', fromNodeId: 'node_ML', toNodeId: 'node_BL', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true },
      { id: 'road_BL_ML', fromNodeId: 'node_BL', toNodeId: 'node_ML', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true },

      { id: 'road_TC_C', fromNodeId: 'node_TC', toNodeId: 'node_C', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true },
      { id: 'road_C_TC', fromNodeId: 'node_C', toNodeId: 'node_TC', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true },
      { id: 'road_C_BC', fromNodeId: 'node_C', toNodeId: 'node_BC', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true },
      { id: 'road_BC_C', fromNodeId: 'node_BC', toNodeId: 'node_C', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true },

      { id: 'road_TR_MR', fromNodeId: 'node_TR', toNodeId: 'node_MR', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true },
      { id: 'road_MR_TR', fromNodeId: 'node_MR', toNodeId: 'node_TR', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true },
      { id: 'road_MR_BR', fromNodeId: 'node_MR', toNodeId: 'node_BR', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true },
      { id: 'road_BR_MR', fromNodeId: 'node_BR', toNodeId: 'node_MR', length: 150, speedLimit: 13.89, lanes: 1, isOneWay: true },
    ],
    odPairs: [
      { originNodeId: 'node_ML', destinationNodeId: 'node_MR', arrivalRatePerHour: 800 },
      { originNodeId: 'node_TC', destinationNodeId: 'node_BC', arrivalRatePerHour: 200 },
    ],
  };

  const closureScenarioData = {
    id: 'scen_grid_closure',
    baseMapId: gridMapId,
    name: 'Center Route Closure',
    description: 'Simulates closure of road_ML_C between Mid-Left and Center, diverting westbound-eastbound corridor traffic along perimeter grid bypasses.',
    seed: 42,
    demandMultiplier: 1.0,
    modifications: {
      closedEdgeIds: ['road_ML_C'],
      signalOverrides: [],
      speedLimitOverrides: [],
    },
    odPairs: [
      { originNodeId: 'node_ML', destinationNodeId: 'node_MR', arrivalRatePerHour: 800 },
      { originNodeId: 'node_TC', destinationNodeId: 'node_BC', arrivalRatePerHour: 200 },
    ],
  };

  const adaptiveScenarioData = {
    id: 'scen_grid_adaptive',
    baseMapId: gridMapId,
    name: 'Center Adaptive Signal Upgrade',
    description: 'Upgrades center intersection (node_C) to dynamic queue-responsive actuation.',
    seed: 42,
    demandMultiplier: 1.0,
    modifications: {
      closedEdgeIds: [],
      signalOverrides: [
        { nodeId: 'node_C', controlType: 'adaptive_signal' as const },
      ],
      speedLimitOverrides: [],
    },
    odPairs: [
      { originNodeId: 'node_ML', destinationNodeId: 'node_MR', arrivalRatePerHour: 800 },
      { originNodeId: 'node_TC', destinationNodeId: 'node_BC', arrivalRatePerHour: 200 },
    ],
  };

  if (dbConnected && isDBConnected()) {
    // Upsert Map in MongoDB
    await MapModel.findOneAndUpdate(
      { $or: [{ id: gridMapId }, { name: gridMapData.name }] },
      gridMapData,
      { upsert: true, new: true }
    );
    console.log(`✅ Persisted Map: '${gridMapData.name}' to MongoDB.`);

    // Upsert Scenarios
    await ScenarioModel.findOneAndUpdate(
      { $or: [{ id: closureScenarioData.id }, { name: closureScenarioData.name, baseMapId: gridMapId }] },
      closureScenarioData,
      { upsert: true, new: true }
    );
    console.log(`✅ Persisted Scenario: '${closureScenarioData.name}' to MongoDB.`);

    await ScenarioModel.findOneAndUpdate(
      { $or: [{ id: adaptiveScenarioData.id }, { name: adaptiveScenarioData.name, baseMapId: gridMapId }] },
      adaptiveScenarioData,
      { upsert: true, new: true }
    );
    console.log(`✅ Persisted Scenario: '${adaptiveScenarioData.name}' to MongoDB.`);
  } else {
    // Fallback store
    await DataStore.createMap(gridMapData);
    await DataStore.createScenario(closureScenarioData);
    await DataStore.createScenario(adaptiveScenarioData);
    console.log(`✅ Initialized Map & Scenarios in Resilient In-Memory Store.`);
  }

  await disconnectDB();
  console.log('🎉 Seeding completed successfully.');
}

// Execute
seed().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
