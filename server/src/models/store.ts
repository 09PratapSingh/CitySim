/**
 * Unified Repository Layer with Automatic MongoDB / In-Memory Fallback.
 */

import { isDBConnected } from '../config/db.ts';
import { MapModel } from './MapModel.ts';
import { ScenarioModel } from './ScenarioModel.ts';
import { RunModel } from './RunModel.ts';
import type { MapData, ScenarioData, RunData } from '../types.ts';

// In-Memory collections for offline/fallback mode
const memMaps = new Map<string, MapData>();
const memScenarios = new Map<string, ScenarioData>();
const memRuns = new Map<string, RunData>();

let idCounter = 1;
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${idCounter++}`;
}

// Seed default initial map into in-memory store so UI has sample data immediately
function seedDefaultMap(): void {
  const defaultMapId = 'map_default_4way';
  if (!memMaps.has(defaultMapId)) {
    memMaps.set(defaultMapId, {
      id: defaultMapId,
      name: 'Default 4-Way Intersection',
      description: 'Canonical 4-arm cross intersection with East-West and North-South flows.',
      nodes: [
        {
          id: 'node_center',
          x: 200,
          y: 200,
          controlType: 'fixed_signal',
          incomingEdgeIds: ['road_W_C', 'road_S_C'],
          outgoingEdgeIds: ['road_C_E', 'road_C_N'],
          signalConfig: {
            type: 'fixed_signal',
            cycleTime: 59,
            phases: [
              { id: 'phase_EW', name: 'East-West Movement', greenEdgeIds: ['road_W_C'], greenDuration: 25, yellowDuration: 3, allRedDuration: 1.5 },
              { id: 'phase_NS', name: 'North-South Movement', greenEdgeIds: ['road_S_C'], greenDuration: 25, yellowDuration: 3, allRedDuration: 1.5 },
            ],
          },
        },
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
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // Seed 3x3 Grid Map
  const gridMapId = 'map_grid_3x3';
  if (!memMaps.has(gridMapId)) {
    memMaps.set(gridMapId, {
      id: gridMapId,
      name: '3x3 City Block Grid',
      description: 'Urban 3x3 street grid (9 nodes, 24 directional links) with a signalized center intersection and perimeter bypasses for detour routing.',
      nodes: [
        // Row 1 (Top)
        {
          id: 'node_TL',
          x: 200,
          y: 150,
          controlType: 'unsignalized',
          incomingEdgeIds: ['road_TC_TL', 'road_ML_TL'],
          outgoingEdgeIds: ['road_TL_TC', 'road_TL_ML'],
        },
        {
          id: 'node_TC',
          x: 400,
          y: 150,
          controlType: 'unsignalized',
          incomingEdgeIds: ['road_TL_TC', 'road_TR_TC', 'road_C_TC'],
          outgoingEdgeIds: ['road_TC_TL', 'road_TC_TR', 'road_TC_C'],
        },
        {
          id: 'node_TR',
          x: 600,
          y: 150,
          controlType: 'unsignalized',
          incomingEdgeIds: ['road_TC_TR', 'road_MR_TR'],
          outgoingEdgeIds: ['road_TR_TC', 'road_TR_MR'],
        },
        // Row 2 (Middle)
        {
          id: 'node_ML',
          x: 200,
          y: 300,
          controlType: 'unsignalized',
          incomingEdgeIds: ['road_TL_ML', 'road_BL_ML', 'road_C_ML'],
          outgoingEdgeIds: ['road_ML_TL', 'road_ML_BL', 'road_ML_C'],
        },
        {
          id: 'node_C',
          x: 400,
          y: 300,
          controlType: 'fixed_signal',
          incomingEdgeIds: ['road_ML_C', 'road_MR_C', 'road_TC_C', 'road_BC_C'],
          outgoingEdgeIds: ['road_C_ML', 'road_C_MR', 'road_C_TC', 'road_C_BC'],
          signalConfig: {
            type: 'fixed_signal',
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
          controlType: 'unsignalized',
          incomingEdgeIds: ['road_TR_MR', 'road_BR_MR', 'road_C_MR'],
          outgoingEdgeIds: ['road_MR_TR', 'road_MR_BR', 'road_MR_C'],
        },
        // Row 3 (Bottom)
        {
          id: 'node_BL',
          x: 200,
          y: 450,
          controlType: 'unsignalized',
          incomingEdgeIds: ['road_ML_BL', 'road_BC_BL'],
          outgoingEdgeIds: ['road_BL_ML', 'road_BL_BC'],
        },
        {
          id: 'node_BC',
          x: 400,
          y: 450,
          controlType: 'unsignalized',
          incomingEdgeIds: ['road_BL_BC', 'road_BR_BC', 'road_C_BC'],
          outgoingEdgeIds: ['road_BC_BL', 'road_BC_BR', 'road_BC_C'],
        },
        {
          id: 'node_BR',
          x: 600,
          y: 450,
          controlType: 'unsignalized',
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
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
seedDefaultMap();

// Seed initial default scenarios into in-memory store
function seedDefaultScenarios(): void {
  const defaultScenarioId = 'scen_default_closure';
  if (!memScenarios.has(defaultScenarioId)) {
    memScenarios.set(defaultScenarioId, {
      id: defaultScenarioId,
      baseMapId: 'map_default_4way',
      name: 'West Approach Road Closure',
      description: 'Simulates emergency closure of the primary westbound approach (road_W_C).',
      seed: 42,
      demandMultiplier: 1.0,
      modifications: {
        closedEdgeIds: ['road_W_C'],
        signalOverrides: [],
        speedLimitOverrides: [],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  const adaptiveScenarioId = 'scen_default_adaptive';
  if (!memScenarios.has(adaptiveScenarioId)) {
    memScenarios.set(adaptiveScenarioId, {
      id: adaptiveScenarioId,
      baseMapId: 'map_default_4way',
      name: 'Smart Adaptive Signal Upgrade',
      description: 'Upgrades center intersection to dynamic queue-responsive signal timing.',
      seed: 42,
      demandMultiplier: 1.0,
      modifications: {
        closedEdgeIds: [],
        signalOverrides: [
          { nodeId: 'node_center', controlType: 'adaptive_signal' }
        ],
        speedLimitOverrides: [],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  const rushScenarioId = 'scen_default_rushhour';
  if (!memScenarios.has(rushScenarioId)) {
    memScenarios.set(rushScenarioId, {
      id: rushScenarioId,
      baseMapId: 'map_default_4way',
      name: 'Peak Hour Traffic Surge (1.8x)',
      description: 'Simulates heavy rush hour congestion with 1.8x traffic demand across all approaches.',
      seed: 42,
      demandMultiplier: 1.8,
      modifications: {
        closedEdgeIds: [],
        signalOverrides: [],
        speedLimitOverrides: [],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // Seed 3x3 Grid Scenarios
  const gridClosureScenarioId = 'scen_grid_closure';
  if (!memScenarios.has(gridClosureScenarioId)) {
    memScenarios.set(gridClosureScenarioId, {
      id: gridClosureScenarioId,
      baseMapId: 'map_grid_3x3',
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
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  const gridAdaptiveScenarioId = 'scen_grid_adaptive';
  if (!memScenarios.has(gridAdaptiveScenarioId)) {
    memScenarios.set(gridAdaptiveScenarioId, {
      id: gridAdaptiveScenarioId,
      baseMapId: 'map_grid_3x3',
      name: 'Center Adaptive Signal Upgrade',
      description: 'Upgrades center intersection (node_C) to dynamic queue-responsive actuation.',
      seed: 42,
      demandMultiplier: 1.0,
      modifications: {
        closedEdgeIds: [],
        signalOverrides: [
          { nodeId: 'node_C', controlType: 'adaptive_signal' }
        ],
        speedLimitOverrides: [],
      },
      odPairs: [
        { originNodeId: 'node_ML', destinationNodeId: 'node_MR', arrivalRatePerHour: 800 },
        { originNodeId: 'node_TC', destinationNodeId: 'node_BC', arrivalRatePerHour: 200 },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
seedDefaultScenarios();

export class DataStore {
  // --- MAPS ---
  public static async getMaps(): Promise<MapData[]> {
    if (isDBConnected()) {
      let docs = await MapModel.find().sort({ createdAt: 1 });
      if (docs.length === 0) {
        for (const m of memMaps.values()) {
          await MapModel.create(m);
        }
        docs = await MapModel.find().sort({ createdAt: 1 });
      }
      return docs.map((d) => d.toJSON());
    }
    return Array.from(memMaps.values());
  }

  public static async getMapById(id: string): Promise<MapData | null> {
    if (isDBConnected()) {
      try {
        let doc = await MapModel.findById(id);
        if (!doc) {
          doc = await MapModel.findOne({ id });
        }
        if (doc) return doc.toJSON();
        return memMaps.get(id) ?? null;
      } catch {
        return memMaps.get(id) ?? null;
      }
    }
    return memMaps.get(id) ?? null;
  }

  public static async createMap(data: Omit<MapData, 'id' | '_id'>): Promise<MapData> {
    if (isDBConnected()) {
      const doc = await MapModel.create(data);
      return doc.toJSON();
    }
    const id = generateId('map');
    const newMap: MapData = {
      ...data,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    memMaps.set(id, newMap);
    return newMap;
  }

  public static async updateMap(id: string, updates: Partial<MapData>): Promise<MapData | null> {
    if (isDBConnected()) {
      try {
        const doc = await MapModel.findByIdAndUpdate(id, updates, { new: true });
        return doc ? doc.toJSON() : null;
      } catch {
        return null;
      }
    }
    const existing = memMaps.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    memMaps.set(id, updated);
    return updated;
  }

  public static async deleteMap(id: string): Promise<boolean> {
    if (isDBConnected()) {
      try {
        const res = await MapModel.findByIdAndDelete(id);
        return res !== null;
      } catch {
        return false;
      }
    }
    return memMaps.delete(id);
  }

  // --- SCENARIOS ---
  public static async getScenarios(baseMapId?: string): Promise<ScenarioData[]> {
    if (isDBConnected()) {
      const query = baseMapId ? { baseMapId } : {};
      let docs = await ScenarioModel.find(query).sort({ createdAt: 1 });
      if (docs.length === 0 && memScenarios.size > 0) {
        for (const s of memScenarios.values()) {
          const exists = await ScenarioModel.findOne({ name: s.name, baseMapId: s.baseMapId });
          if (!exists) {
            await ScenarioModel.create(s);
          }
        }
        docs = await ScenarioModel.find(query).sort({ createdAt: 1 });
      }
      return docs.map((d) => d.toJSON());
    }
    const list = Array.from(memScenarios.values());
    if (baseMapId) {
      return list.filter((s) => s.baseMapId === baseMapId);
    }
    return list;
  }

  public static async getScenarioById(id: string): Promise<ScenarioData | null> {
    if (isDBConnected()) {
      try {
        let doc = await ScenarioModel.findById(id);
        if (!doc) {
          doc = await ScenarioModel.findOne({ id });
        }
        if (doc) return doc.toJSON();
        return memScenarios.get(id) ?? null;
      } catch {
        return memScenarios.get(id) ?? null;
      }
    }
    return memScenarios.get(id) ?? null;
  }

  public static async createScenario(data: Omit<ScenarioData, 'id' | '_id'>): Promise<ScenarioData> {
    if (isDBConnected()) {
      const doc = await ScenarioModel.create(data);
      return doc.toJSON();
    }
    const id = generateId('scen');
    const newScen: ScenarioData = {
      ...data,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    memScenarios.set(id, newScen);
    return newScen;
  }

  public static async updateScenario(id: string, updates: Partial<ScenarioData>): Promise<ScenarioData | null> {
    if (isDBConnected()) {
      try {
        const doc = await ScenarioModel.findByIdAndUpdate(id, updates, { new: true });
        return doc ? doc.toJSON() : null;
      } catch {
        return null;
      }
    }
    const existing = memScenarios.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    memScenarios.set(id, updated);
    return updated;
  }

  public static async deleteScenario(id: string): Promise<boolean> {
    if (isDBConnected()) {
      try {
        const res = await ScenarioModel.findByIdAndDelete(id);
        return res !== null;
      } catch {
        return false;
      }
    }
    return memScenarios.delete(id);
  }

  // --- RUNS ---
  public static async getRuns(scenarioId?: string): Promise<RunData[]> {
    if (isDBConnected()) {
      const query = scenarioId ? { scenarioId } : {};
      const docs = await RunModel.find(query).sort({ createdAt: -1 });
      return docs.map((d) => d.toJSON());
    }
    const list = Array.from(memRuns.values());
    if (scenarioId) {
      return list.filter((r) => r.scenarioId === scenarioId);
    }
    return list;
  }

  public static async getRunById(id: string): Promise<RunData | null> {
    if (isDBConnected()) {
      try {
        const doc = await RunModel.findById(id);
        return doc ? doc.toJSON() : null;
      } catch {
        return null;
      }
    }
    return memRuns.get(id) ?? null;
  }

  public static async createRun(data: Omit<RunData, 'id' | '_id'>): Promise<RunData> {
    if (isDBConnected()) {
      const doc = await RunModel.create(data);
      return doc.toJSON();
    }
    const id = generateId('run');
    const newRun: RunData = {
      ...data,
      id,
      createdAt: new Date(),
    };
    memRuns.set(id, newRun);
    return newRun;
  }
}
