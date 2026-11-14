import type { Request, Response } from 'express';
import { DataStore } from '../models/store.ts';

export async function listMaps(_req: Request, res: Response): Promise<void> {
  try {
    const maps = await DataStore.getMaps();
    res.json({ success: true, count: maps.length, data: maps });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function getMap(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const map = await DataStore.getMapById(id);
    if (!map) {
      res.status(404).json({ success: false, error: `Map with ID '${id}' not found.` });
      return;
    }
    res.json({ success: true, data: map });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function createMap(req: Request, res: Response): Promise<void> {
  try {
    const { name, description, nodes, edges } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ success: false, error: 'Map name is required.' });
      return;
    }

    if (!Array.isArray(nodes) || !Array.isArray(edges)) {
      res.status(400).json({ success: false, error: 'Nodes and edges must be arrays.' });
      return;
    }

    const created = await DataStore.createMap({
      name: name.trim(),
      description: description || '',
      nodes,
      edges,
    });

    res.status(201).json({ success: true, data: created });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function updateMap(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const updated = await DataStore.updateMap(id, req.body);
    if (!updated) {
      res.status(404).json({ success: false, error: `Map with ID '${id}' not found.` });
      return;
    }
    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function deleteMap(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const deleted = await DataStore.deleteMap(id);
    if (!deleted) {
      res.status(404).json({ success: false, error: `Map with ID '${id}' not found.` });
      return;
    }
    res.json({ success: true, message: `Map '${id}' deleted successfully.` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
