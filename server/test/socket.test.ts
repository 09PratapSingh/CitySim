import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../src/app.ts';
import { setupSimulationSockets } from '../src/sockets/simulationSocket.ts';

test('WebSocket: Live Simulation streaming lifecycle (start, frames, pause, resume, stop)', async () => {
  const app = createApp();
  const server = http.createServer(app);
  const ioServer = new SocketIOServer(server, {
    cors: { origin: '*' },
  });
  setupSimulationSockets(ioServer);

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;

  const client: ClientSocket = ioClient(`http://localhost:${port}`, {
    transports: ['websocket'],
    forceNew: true,
  });

  await new Promise<void>((resolve, reject) => {
    client.on('connect', () => resolve());
    client.on('connect_error', reject);
  });
  assert.strictEqual(client.connected, true);

  // 1. Start simulation on default 4-way map
  const startPromise = new Promise<any>((resolve) => {
    client.once('simulation_started', (data) => resolve(data));
  });

  const framePromise = new Promise<any>((resolve) => {
    client.once('simulation_frame', (frame) => resolve(frame));
  });

  client.emit('start_simulation', {
    baseMapId: 'map_default_4way',
    seed: 42,
    speedMultiplier: 2.0,
  });

  const startData = await startPromise;
  assert.strictEqual(startData.baseMapId, 'map_default_4way');
  assert.strictEqual(startData.seed, 42);

  // 2. Receive simulation frame
  const initialFrame = await framePromise;
  assert.notStrictEqual(initialFrame, null);
  assert.strictEqual(typeof initialFrame.time, 'number');
  assert.strictEqual(Array.isArray(initialFrame.vehicles), true);
  assert.strictEqual(Array.isArray(initialFrame.signals), true);
  assert.strictEqual(initialFrame.signals.length >= 4, true);
  assert.notStrictEqual(initialFrame.metrics, undefined);

  // 3. Receive progressive frames over time
  const progressiveFrame = await new Promise<any>((resolve) => {
    let count = 0;
    client.on('simulation_frame', (f) => {
      count++;
      if (count >= 3) {
        resolve(f);
      }
    });
  });
  assert.strictEqual(progressiveFrame.time > initialFrame.time, true);

  // 4. Pause simulation
  const pausePromise = new Promise<any>((resolve) => {
    client.once('simulation_paused', (data) => resolve(data));
  });
  client.emit('pause_simulation');
  const pauseData = await pausePromise;
  assert.strictEqual(typeof pauseData.time, 'number');

  // 5. Resume simulation
  const resumePromise = new Promise<any>((resolve) => {
    client.once('simulation_resumed', (data) => resolve(data));
  });
  client.emit('resume_simulation');
  const resumeData = await resumePromise;
  assert.strictEqual(typeof resumeData.time, 'number');

  // 6. Stop simulation
  const stopPromise = new Promise<void>((resolve) => {
    client.once('simulation_stopped', () => resolve());
  });
  client.emit('stop_simulation');
  await stopPromise;

  // 7. Test customMap payload from live editor canvas (as emitted by App.tsx handleStartSim)
  const customMapStartPromise = new Promise<any>((resolve) => {
    client.once('simulation_started', (data) => resolve(data));
  });
  const customMapFramePromise = new Promise<any>((resolve) => {
    client.once('simulation_frame', (data) => resolve(data));
  });

  client.emit('start_simulation', {
    baseMapId: 'map_default_4way',
    customMap: {
      nodes: [
        { id: 'N1', x: 0, y: 100, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: ['R1'] },
        { id: 'N2', x: 200, y: 100, controlType: 'unsignalized', incomingEdgeIds: ['R1'], outgoingEdgeIds: [] },
      ],
      edges: [
        { id: 'R1', fromNodeId: 'N1', toNodeId: 'N2', length: 200, speedLimit: 13.89, lanes: 1, isOneWay: true },
      ],
    },
    seed: 123,
    speedMultiplier: 1.0,
  });

  const customStartData = await customMapStartPromise;
  assert.strictEqual(customStartData.seed, 123);
  const customFrameData = await customMapFramePromise;
  assert.strictEqual(typeof customFrameData.time, 'number');

  client.emit('stop_simulation');
  await new Promise((r) => setTimeout(r, 50));

  // Cleanup
  client.disconnect();
  ioServer.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
