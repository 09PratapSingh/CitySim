import { Router } from 'express';
import { isDBConnected } from '../config/db.ts';
import {
  listMaps,
  getMap,
  createMap,
  updateMap,
  deleteMap,
} from '../controllers/mapController.ts';
import {
  listScenarios,
  getScenario,
  createScenario,
  updateScenario,
  deleteScenario,
} from '../controllers/scenarioController.ts';
import {
  runHeadlessSimulation,
  compareSimulations,
  listRuns,
  getRun,
  generateSummaryReport,
} from '../controllers/simulationController.ts';

const router = Router();

// Healthcheck endpoint
router.get('/health', (_req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    database: isDBConnected() ? 'mongodb' : 'in-memory-fallback',
  });
});

// Map routes
router.get('/maps', listMaps);
router.get('/maps/:id', getMap);
router.post('/maps', createMap);
router.put('/maps/:id', updateMap);
router.delete('/maps/:id', deleteMap);

// Scenario routes
router.get('/scenarios', listScenarios);
router.get('/scenarios/:id', getScenario);
router.post('/scenarios', createScenario);
router.put('/scenarios/:id', updateScenario);
router.delete('/scenarios/:id', deleteScenario);

// Simulation execution and history routes
router.post('/simulations/run', runHeadlessSimulation);
router.post('/simulations/compare', compareSimulations);
router.post('/simulations/reports/summary', generateSummaryReport);
router.get('/simulations/runs', listRuns);
r