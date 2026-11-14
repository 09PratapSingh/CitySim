import type { Request, Response } from 'express';
import { DataStore } from '../models/store.ts';

export async function listScenarios(req: Request, res: Response): Promise<void> {
  try {
    const { baseMapId } = req.query;
    const scenarios = await DataStore.getScenarios(baseMapId as string | undefined);
    res.json({ success: true, count: scenarios.length, data: scenarios });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function getScenario(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const scenario = await DataStore.getScenarioById(id);
    if (!scenario) {
      res.status(404).json({ success: false, error: `Scenario with ID '${id}' not found.` });
      return;
    }
    res.json({ success: true, data: scenario });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function createScenario(req: Request, res: Response): Promise<void> {
  try {
    const { baseMapId, name, description, seed, demandMultiplier, modifications } = req.body;

    if (!baseMapId) {
      res.status(400).json({ success: false, error: 'baseMapId is required.' });
      return;
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ success: false, error: 'Scenario name is required.' });
      return;
    }

    const baseMap = await DataStore.getMapById(baseMapId);
    if (!baseMap) {
      res.status(404).json({ success: false, error: `Base map with ID '${baseMapId}' does not exist.` });
      return;
    }

    const created = await DataStore.createScenario({
      baseMapId,
      name: name.trim(),
      description: description || '',
      seed: typeof seed === 'number' ? seed : 42,
      demandMultiplier: typeof demandMultiplier === 'number' ? demandMultiplier : 1.0,
      modifications: {
        closedEdgeIds: modifications?.closedEdgeIds || [],
        signalOverrides: modifications?.signalOverrides || [],
        speedLimitOverrides: modifications?.speedLimitOverrides || [],
      },
    });

    res.status(201).json({ success: true, data: created });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function updateScenario(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const updated = await DataStore.updateScenario(id, req.body);
    if (!updated) {
      res.status(404).json({ success: false, error: `Scenario with ID '${id}' not found.` });
      return;
    }
    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function deleteScenario(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const deleted = await DataStore.deleteScenario(id);
    if (!deleted) {
      res.status(404).json({ success: false, error: `Scenario with ID '${id}' not found.` });
      return;
    }
    res.json({ success: true, message: `Scenario '${id}' deleted successfully.` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
