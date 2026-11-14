/**
 * REST API Client for CitySim Backend.
 */

import type { 
  MapData, 
  ScenarioData, 
  ScenarioModifications, 
  RunData, 
  SimulationComparisonResult 
} from '../types.ts';

const BASE_URL = '/api';

export async function fetchHealth(): Promise<{ status: string; database: string }> {
  const res = await fetch(`${BASE_URL}/health`);
  if (!res.ok) throw new Error('Backend health check failed');
  return res.json();
}

export async function fetchMaps(): Promise<MapData[]> {
  const res = await fetch(`${BASE_URL}/maps`);
  if (!res.ok) throw new Error('Failed to fetch maps');
  return res.json();
}

export async function fetchMapById(id: string): Promise<MapData> {
  const res = await fetch(`${BASE_URL}/maps/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch map ${id}`);
  return res.json();
}

export async function createMap(mapData: Omit<MapData, 'id' | '_id' | 'createdAt' | 'updatedAt'>): Promise<MapData> {
  const res = await fetch(`${BASE_URL}/maps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mapData),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to create map');
  }
  return res.json();
}

export async function updateMap(id: string, updates: Partial<MapData>): Promise<MapData> {
  const res = await fetch(`${BASE_URL}/maps/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to update map');
  }
  return res.json();
}

export async function deleteMap(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/maps/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete map ${id}`);
}

// --- SCENARIO API ---

export async function fetchScenarios(baseMapId?: string): Promise<ScenarioData[]> {
  const url = baseMapId ? `${BASE_URL}/scenarios?baseMapId=${encodeURIComponent(baseMapId)}` : `${BASE_URL}/scenarios`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch scenarios');
  const json = await res.json();
  return json.data || [];
}

export async function fetchScenarioById(id: string): Promise<ScenarioData> {
  const res = await fetch(`${BASE_URL}/scenarios/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch scenario ${id}`);
  const json = await res.json();
  return json.data;
}

export async function createScenario(
  scenarioData: Omit<ScenarioData, 'id' | '_id' | 'createdAt' | 'updatedAt'>
): Promise<ScenarioData> {
  const res = await fetch(`${BASE_URL}/scenarios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(scenarioData),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to create scenario');
  }
  const json = await res.json();
  return json.data;
}

export async function updateScenario(id: string, updates: Partial<ScenarioData>): Promise<ScenarioData> {
  const res = await fetch(`${BASE_URL}/scenarios/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to update scenario');
  }
  const json = await res.json();
  return json.data;
}

export async function deleteScenario(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/scenarios/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete scenario ${id}`);
}

// --- SIMULATION EXECUTION & COMPARISON API ---

export async function runHeadlessSimulation(params: {
  baseMapId: string;
  scenarioId?: string;
  modifications?: ScenarioModifications;
  seed?: number;
  durationSeconds?: number;
  demandMultiplier?: number;
}): Promise<RunData> {
  const res = await fetch(`${BASE_URL}/simulations/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to execute simulation run');
  }
  const json = await res.json();
  return json.data;
}

export async function compareSimulations(params: {
  baseMapId: string;
  scenarioId?: string;
  modifications?: ScenarioModifications;
  scenarioName?: string;
  seed?: number;
  durationSeconds?: number;
  warmupSeconds?: number;
  replications?: number;
  demandMultiplier?: number;
}): Promise<SimulationComparisonResult> {
  const res = await fetch(`${BASE_URL}/simulations/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to execute comparative simulation');
  }
  const json = await res.json();
  return json.data;
}

export async function fetchRuns(scenarioId?: string): Promise<RunData[]> {
  const url = scenarioId ? `${BASE_URL}/simulations/runs?scenarioId=${encodeURIComponent(scenarioId)}` : `${BASE_URL}/simulations/runs`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch simulation runs');
  const json = await res.json();
  return json.data || [];
}

export async function fetchRunById(id: string): Promise<RunData> {
  const res = await fetch(`${BASE_URL}/simulations/runs/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch run ${id}`);
  const json = await res.json();
  return json.data;
}
