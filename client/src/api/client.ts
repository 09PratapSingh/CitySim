/**
 * REST API Client for CitySim Backend.
 */

import type { MapData } from '../types.ts';

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
