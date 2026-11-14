import test from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { createApp } from '../src/app.ts';

const app = createApp();

test('API: GET /api/health returns 200 and operational status', async () => {
  const res = await request(app).get('/api/health');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, 'online');
  assert.notStrictEqual(res.body.database, undefined);
});

test('API: Maps CRUD lifecycle', async () => {
  // 1. List maps (seeded default map should exist)
  const listRes = await request(app).get('/api/maps');
  assert.strictEqual(listRes.status, 200);
  assert.strictEqual(listRes.body.success, true);
  assert.strictEqual(listRes.body.data.length >= 1, true);

  // 2. Create a new custom map
  const newMapPayload = {
    name: 'Unit Test Corridor',
    description: 'A 2-node single edge test corridor',
    nodes: [
      { id: 'T1', x: 0, y: 0, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] },
      { id: 'T2', x: 200, y: 0, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] },
    ],
    edges: [
      { id: 'E_T1_T2', fromNodeId: 'T1', toNodeId: 'T2', length: 200, speedLimit: 13.89, lanes: 1, isOneWay: true },
    ],
  };

  const createRes = await request(app).post('/api/maps').send(newMapPayload);
  assert.strictEqual(createRes.status, 201);
  assert.strictEqual(createRes.body.success, true);
  const createdMapId = createRes.body.data.id || createRes.body.data._id;
  assert.notStrictEqual(createdMapId, undefined);

  // 3. Get created map by ID
  const getRes = await request(app).get(`/api/maps/${createdMapId}`);
  assert.strictEqual(getRes.status, 200);
  assert.strictEqual(getRes.body.data.name, 'Unit Test Corridor');

  // 4. Update map
  const updateRes = await request(app).put(`/api/maps/${createdMapId}`).send({
    description: 'Updated corridor description',
  });
  assert.strictEqual(updateRes.status, 200);
  assert.strictEqual(updateRes.body.data.description, 'Updated corridor description');

  // 5. Delete map
  const deleteRes = await request(app).delete(`/api/maps/${createdMapId}`);
  assert.strictEqual(deleteRes.status, 200);
  assert.strictEqual(deleteRes.body.success, true);
});

test('API: Scenarios CRUD lifecycle', async () => {
  // Use seeded default map
  const mapsRes = await request(app).get('/api/maps');
  const baseMapId = mapsRes.body.data[0].id || mapsRes.body.data[0]._id;

  // 1. Create a scenario (e.g. road closure scenario)
  const scenarioPayload = {
    baseMapId,
    name: 'West Approach Closed Scenario',
    description: 'Testing closure of West road segment',
    seed: 12345,
    demandMultiplier: 1.2,
    modifications: {
      closedEdgeIds: ['road_W_C'],
    },
  };

  const createRes = await request(app).post('/api/scenarios').send(scenarioPayload);
  assert.strictEqual(createRes.status, 201);
  assert.strictEqual(createRes.body.success, true);
  const scenarioId = createRes.body.data.id || createRes.body.data._id;

  // 2. Fetch scenario
  const getRes = await request(app).get(`/api/scenarios/${scenarioId}`);
  assert.strictEqual(getRes.status, 200);
  assert.strictEqual(getRes.body.data.name, 'West Approach Closed Scenario');
  assert.deepStrictEqual(getRes.body.data.modifications.closedEdgeIds, ['road_W_C']);

  // 3. List scenarios filtered by baseMapId
  const listRes = await request(app).get(`/api/scenarios?baseMapId=${baseMapId}`);
  assert.strictEqual(listRes.status, 200);
  assert.strictEqual(listRes.body.data.length >= 1, true);
});

test('API: Headless simulation execution POST /api/simulations/run', async () => {
  const mapsRes = await request(app).get('/api/maps');
  const baseMapId = mapsRes.body.data[0].id || mapsRes.body.data[0]._id;

  const runPayload = {
    baseMapId,
    seed: 42,
    durationSeconds: 30, // 30 seconds simulation
    timeStep: 0.1,
    snapshotInterval: 5.0,
    demandMultiplier: 1.0,
  };

  const runRes = await request(app).post('/api/simulations/run').send(runPayload);
  assert.strictEqual(runRes.status, 200);
  assert.strictEqual(runRes.body.success, true);

  const runData = runRes.body.data;
  assert.strictEqual(runData.status, 'completed');
  assert.strictEqual(runData.seed, 42);
  assert.strictEqual(runData.durationSeconds, 30);
  assert.notStrictEqual(runData.aggregateMetrics, undefined);
  assert.strictEqual(runData.aggregateMetrics.totalSpawned > 0, true);
  assert.strictEqual(Array.isArray(runData.timeSeries), true);
  assert.strictEqual(runData.timeSeries.length >= 5, true);

  // Verify run is stored and queryable
  const runId = runData.id || runData._id;
  const getRunRes = await request(app).get(`/api/simulations/runs/${runId}`);
  assert.strictEqual(getRunRes.status, 200);
  assert.strictEqual(getRunRes.body.data.seed, 42);
});

test('API: Dual-Run Simulation Comparison POST /api/simulations/compare', async () => {
  const mapsRes = await request(app).get('/api/maps');
  const baseMapId = mapsRes.body.data[0].id || mapsRes.body.data[0]._id;

  const comparePayload = {
    baseMapId,
    seed: 42,
    durationSeconds: 30,
    demandMultiplier: 1.2,
    scenarioName: 'West Approach Closed vs Baseline',
    modifications: {
      closedEdgeIds: ['road_W_C'],
      signalOverrides: [],
      speedLimitOverrides: [],
    },
  };

  const compareRes = await request(app).post('/api/simulations/compare').send(comparePayload);
  assert.strictEqual(compareRes.status, 200);
  assert.strictEqual(compareRes.body.success, true);

  const { baseline, scenario, deltas, comparativeTimeSeries } = compareRes.body.data;

  // Baseline and Scenario runs must both be completed
  assert.strictEqual(baseline.status, 'completed');
  assert.strictEqual(scenario.status, 'completed');
  assert.strictEqual(baseline.seed, 42);
  assert.strictEqual(scenario.seed, 42);

  // Deltas must be calculated
  assert.notStrictEqual(deltas, undefined);
  assert.strictEqual(typeof deltas.deltaAvgWaitTime, 'number');
  assert.strictEqual(typeof deltas.deltaAvgWaitTimeStdDev, 'number');
  assert.strictEqual(typeof deltas.baselineMeanWaitTime, 'number');
  assert.strictEqual(typeof deltas.scenarioMeanWaitTime, 'number');
  assert.strictEqual(Array.isArray(deltas.deltaAvgWaitTimeCI), true);
  assert.strictEqual(deltas.deltaAvgWaitTimeCI.length, 2);
  assert.strictEqual(typeof deltas.isWaitTimeSignificant, 'boolean');
  assert.strictEqual(typeof deltas.deltaThroughput, 'number');
  assert.strictEqual(typeof deltas.deltaCompleted, 'number');
  assert.strictEqual(typeof deltas.warmupSeconds, 'number');
  assert.strictEqual(typeof deltas.replicationsCount, 'number');
  assert.strictEqual(Array.isArray(deltas.seedsUsed), true);
  assert.strictEqual(deltas.seedsUsed.length, deltas.replicationsCount);
  assert.notStrictEqual(scenario.modifications, undefined);
  assert.deepStrictEqual(scenario.modifications.closedEdgeIds, ['road_W_C']);

  // Multi-seed replications breakdown must be returned
  const { replications } = compareRes.body.data;
  assert.strictEqual(Array.isArray(replications), true);
  assert.strictEqual(replications.length, deltas.replicationsCount);
  assert.strictEqual(typeof replications[0].seed, 'number');
  assert.strictEqual(typeof replications[0].deltaWait, 'number');

  // Comparative time series must be populated
  assert.strictEqual(Array.isArray(comparativeTimeSeries), true);
  assert.strictEqual(comparativeTimeSeries.length >= 5, true);
  assert.strictEqual(typeof comparativeTimeSeries[0].baselineWaitTime, 'number');
  assert.strictEqual(typeof comparativeTimeSeries[0].scenarioWaitTime, 'number');
  assert.strictEqual(typeof comparativeTimeSeries[0].baselineSpeed, 'number');
  assert.strictEqual(typeof comparativeTimeSeries[0].scenarioSpeed, 'number');
  assert.strictEqual(typeof comparativeTimeSeries[0].baselineActiveVehicles, 'number');
  assert.strictEqual(typeof comparativeTimeSeries[0].scenarioActiveVehicles, 'number');
});

test('API: 3x3 Grid Map and Center Route Closure Detour Comparison', async () => {
  // 1. Verify 3x3 Grid Map is seeded
  const mapsRes = await request(app).get('/api/maps');
  assert.strictEqual(mapsRes.status, 200);
  const gridMap = mapsRes.body.data.find((m: any) => m.id === 'map_grid_3x3' || m.name === '3x3 City Block Grid');
  assert.ok(gridMap, '3x3 Grid Map must be seeded in store');
  assert.strictEqual(gridMap.nodes.length, 9, '3x3 Grid must have 9 nodes');
  assert.strictEqual(gridMap.edges.length, 24, '3x3 Grid must have 24 directed edges');

  const gridMapId = gridMap.id || gridMap._id;

  // 2. Verify Scenarios for 3x3 Grid
  const scenRes = await request(app).get(`/api/scenarios?baseMapId=${gridMapId}`);
  assert.strictEqual(scenRes.status, 200);
  const closureScen = scenRes.body.data.find((s: any) => s.id === 'scen_grid_closure' || s.name === 'Center Route Closure');
  assert.ok(closureScen, 'Center Route Closure scenario must be seeded for 3x3 grid');
  assert.deepStrictEqual(closureScen.modifications.closedEdgeIds, ['road_ML_C']);

  // 3. Execute Dual-Run Comparison on 3x3 Grid with Center Route Closure
  const compareRes = await request(app).post('/api/simulations/compare').send({
    baseMapId: gridMapId,
    scenarioId: closureScen.id || closureScen._id,
    seed: 42,
    durationSeconds: 60,
    warmupSeconds: 10,
    replications: 3,
  });

  assert.strictEqual(compareRes.status, 200);
  assert.strictEqual(compareRes.body.success, true);
  const { baseline, scenario, deltas } = compareRes.body.data;

  assert.strictEqual(baseline.status, 'completed');
  assert.strictEqual(scenario.status, 'completed');
  assert.ok(baseline.aggregateMetrics.totalSpawned > 0, 'Baseline must spawn vehicles');
  assert.ok(scenario.aggregateMetrics.totalSpawned > 0, 'Scenario must spawn vehicles');
  assert.strictEqual(
    scenario.aggregateMetrics.totalSpawned,
    baseline.aggregateMetrics.totalSpawned,
    'Detour scenario preserves origin demand without dropping vehicles'
  );
  assert.ok(scenario.aggregateMetrics.completedVehiclesCount > 0, 'Vehicles must successfully complete detour');
  assert.strictEqual(deltas.replicationsCount, 3);
});

test('API: Runs history retrieval and Executive Summary Report', async () => {
  // 1. Fetch runs list
  const runsRes = await request(app).get('/api/simulations/runs');
  assert.strictEqual(runsRes.status, 200);
  assert.strictEqual(runsRes.body.success, true);
  assert.ok(runsRes.body.data.length >= 1, 'Runs should be recorded from prior simulations');

  const firstRun = runsRes.body.data[0];
  const runId = firstRun.id || firstRun._id;

  // 2. Fetch specific run by ID
  const singleRunRes = await request(app).get(`/api/simulations/runs/${runId}`);
  assert.strictEqual(singleRunRes.status, 200);
  assert.strictEqual(singleRunRes.body.success, true);
  assert.strictEqual(singleRunRes.body.data.seed, firstRun.seed);

  // 3. Generate summary report via endpoint
  const reportRes = await request(app).post('/api/simulations/reports/summary').send({
    baseMapName: '3x3 City Block Grid',
    scenarioName: 'Center Route Closure',
    seed: 42,
    durationSeconds: 600,
    replicationsCount: 5,
    deltas: {
      deltaAvgWaitTime: -0.8,
      pctChangeAvgWaitTime: -5.2,
      isWaitTimeSignificant: false,
      deltaThroughput: 15,
    },
  });

  assert.strictEqual(reportRes.status, 200);
  assert.strictEqual(reportRes.body.success, true);
  assert.ok(reportRes.body.data.title.includes('CitySim'));
  assert.strictEqual(reportRes.body.data.metadata.scenarioName, 'Center Route Closure');
});
