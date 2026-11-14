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
}
seedDefaultScenarios();

export class DataStore {
  // --- MAPS ---
  public static async getMaps(): Promise<MapData[]> {
    if (isDBConnected()) {
      const docs = await MapModel.find().sort({ createdAt: -1 });
      return docs.map((d) => d.toJSON());
    }
    return Array.from(memMaps.values());
  }

  public static async getMapById(id: string): Promise<MapData | null> {
    if (isDBConnected()) {
      try {
        const doc = await MapModel.findById(id);
        return doc ? doc.toJSON() : null;
      } catch {
        return null;
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
      const docs = await ScenarioModel.find(query).sort({ createdAt: -1 });
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
        const doc = await ScenarioModel.findById(id);
        return doc ? doc.toJSON() : null;
      } catch {
        return null;
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
