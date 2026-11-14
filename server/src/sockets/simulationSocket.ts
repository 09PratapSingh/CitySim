/**
 * Socket.IO Real-Time Simulation Streaming Coordinator.
 * 
 * CORE RESPONSIBILITY:
 * Orchestrates live, interactive simulation playback between the engine and the
 * React frontend canvas via WebSockets. Emits interpolated 2D vehicle positions
 * and signal lights at 10 to 30 frames per second.
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { DataStore } from '../models/store.ts';
import { RoadGraph } from '../../../engine/src/graph.ts';
import { ODMatrix } from '../../../engine/src/trafficGenerator.ts';
import { NetworkSimulation } from '../../../engine/src/networkSimulation.ts';
import type { RoadSegment, Vehicle } from '../../../engine/src/types.ts';

interface ClientSession {
  sim: NetworkSimulation;
  graph: RoadGraph;
  timer: NodeJS.Timeout | null;
  speedMultiplier: number;
  isPaused: boolean;
  timeStep: number;
}

export function setupSimulationSockets(io: SocketIOServer): void {
  const sessions = new Map<string, ClientSession>();

  io.on('connection', (socket: Socket) => {
    // console.log(`🔌 Client connected to simulation socket: ${socket.id}`);

    socket.on('start_simulation', async (payload: {
      baseMapId?: string;
      customMap?: { nodes: any[]; edges: any[] };
      scenarioId?: string;
      seed?: number;
      speedMultiplier?: number;
    }) => {
      try {
        // Clean up any existing session for this socket
        cleanupSession(socket.id);

        const { baseMapId, customMap, scenarioId, seed = 42, speedMultiplier = 1.0 } = payload;
        
        let mapNodes: any[] = [];
        let mapEdges: any[] = [];

        if (customMap && Array.isArray(customMap.nodes) && customMap.nodes.length > 0) {
          mapNodes = customMap.nodes;
          mapEdges = customMap.edges || [];
        } else if (baseMapId) {
          const baseMap = await DataStore.getMapById(baseMapId);
          if (!baseMap) {
            socket.emit('simulation_error', { message: `Base map '${baseMapId}' not found.` });
            return;
          }
          mapNodes = baseMap.nodes;
          mapEdges = baseMap.edges;
        } else {
          socket.emit('simulation_error', { message: 'No base map or custom map provided.' });
          return;
        }

        const graph = RoadGraph.fromJSON({
          nodes: mapNodes,
          edges: mapEdges,
        });

        // Apply scenario if specified
        let scenarioName = 'Baseline';
        let demandMultiplier = 1.0;
        if (scenarioId) {
          const scenario = await DataStore.getScenarioById(scenarioId);
          if (scenario) {
            scenarioName = scenario.name;
            demandMultiplier = scenario.demandMultiplier ?? 1.0;
            if (Array.isArray(scenario.modifications?.closedEdgeIds)) {
              for (const closedId of scenario.modifications.closedEdgeIds) {
                if (graph.getEdge(closedId)) {
                  graph.setRoadClosure(closedId, true);
                }
              }
            }
          }
        }

        // Setup demand matrix
        const odMatrix = new ODMatrix();
        const allNodes = graph.getAllNodes();
        const origins = allNodes.filter((n) => graph.getIncomingEdges(n.id).length === 0);
        const destinations = allNodes.filter((n) => graph.getOutgoingEdges(n.id).length === 0);
        const flowRate = 600 * demandMultiplier;

        if (origins.length > 0 && destinations.length > 0) {
          for (const orig of origins) {
            for (const dest of destinations) {
              if (orig.id !== dest.id) {
                odMatrix.setFlow(orig.id, dest.id, flowRate);
              }
            }
          }
        } else {
          for (let i = 0; i < allNodes.length; i++) {
            for (let j = 0; j < allNodes.length; j++) {
              if (i !== j) {
                odMatrix.setFlow(allNodes[i].id, allNodes[j].id, Math.max(100, flowRate / allNodes.length));
              }
            }
          }
        }

        const timeStep = 0.1;
        const sim = new NetworkSimulation({
          graph,
          config: { seed, timeStep },
          odMatrix,
          snapshotInterval: 5.0,
        });

        const session: ClientSession = {
          sim,
          graph,
          timer: null,
          speedMultiplier: Math.max(0.2, Math.min(10, speedMultiplier)),
          isPaused: false,
          timeStep,
        };

        sessions.set(socket.id, session);

        // Start frame interval (emits every 100ms / speedMultiplier)
        startSessionLoop(socket, session);

        socket.emit('simulation_started', {
          baseMapId,
          scenarioName,
          seed,
        });
      } catch (err: any) {
        socket.emit('simulation_error', { message: err.message });
      }
    });

    socket.on('pause_simulation', () => {
      const session = sessions.get(socket.id);
      if (session) {
        session.isPaused = true;
        if (session.timer) {
          clearInterval(session.timer);
          session.timer = null;
        }
        socket.emit('simulation_paused', { time: session.sim.getCurrentTime() });
      }
    });

    socket.on('resume_simulation', () => {
      const session = sessions.get(socket.id);
      if (session && session.isPaused) {
        session.isPaused = false;
        startSessionLoop(socket, session);
        socket.emit('simulation_resumed', { time: session.sim.getCurrentTime() });
      }
    });

    socket.on('step_simulation', () => {
      const session = sessions.get(socket.id);
      if (session) {
        session.sim.tick();
        broadcastFrame(socket, session);
      }
    });

    socket.on('set_speed', (data: { speedMultiplier: number }) => {
      const session = sessions.get(socket.id);
      if (session && typeof data.speedMultiplier === 'number') {
        session.speedMultiplier = Math.max(0.2, Math.min(10, data.speedMultiplier));
        if (!session.isPaused) {
          if (session.timer) clearInterval(session.timer);
          startSessionLoop(socket, session);
        }
      }
    });

    socket.on('stop_simulation', () => {
      cleanupSession(socket.id);
      socket.emit('simulation_stopped');
    });

    socket.on('disconnect', () => {
      cleanupSession(socket.id);
    });
  });

  function startSessionLoop(socket: Socket, session: ClientSession): void {
    // 20 updates per second (50ms interval)
    const baseIntervalMs = 50;
    const intervalMs = Math.max(15, Math.round(baseIntervalMs / session.speedMultiplier));

    session.timer = setInterval(() => {
      if (!session.isPaused) {
        // Step simulation tick
        session.sim.tick();
        broadcastFrame(socket, session);
      }
    }, intervalMs);
  }

  function broadcastFrame(socket: Socket, session: ClientSession): void {
    const { sim, graph } = session;
    const activeVehicles = sim.getActiveVehicles();

    // Interpolate 2D vehicle positions along road segments
    const renderedVehicles = activeVehicles.map((v) => {
      const edge = graph.getEdge(v.currentEdgeId);
      const coords = calculateVehicle2DCoordinates(v, edge);
      return {
        id: v.id,
        edgeId: v.currentEdgeId,
        position: Number(v.position.toFixed(2)),
        velocity: Number(v.velocity.toFixed(2)),
        laneIndex: v.laneIndex,
        x: coords.x,
        y: coords.y,
        angle: coords.angle,
      };
    });

    // Extract signal aspects for all roads
    const signals = graph.getAllEdges().map((edge) => ({
      edgeId: edge.id,
      state: sim.getSignalStateForEdge(edge.id),
    }));

    socket.emit('simulation_frame', {
      time: Number(sim.getCurrentTime().toFixed(2)),
      vehicles: renderedVehicles,
      signals,
      metrics: sim.getMetrics(),
    });
  }

  function calculateVehicle2DCoordinates(
    vehicle: Vehicle,
    edge?: RoadSegment
  ): { x: number; y: number; angle: number } {
    if (!edge || !edge.startCoord || !edge.endCoord) {
      return { x: 0, y: 0, angle: 0 };
    }

    const { startCoord, endCoord, length } = edge;
    const fraction = length > 0 ? Math.min(1.0, vehicle.position / length) : 0;

    // Linear interpolation
    const baseX = startCoord.x + fraction * (endCoord.x - startCoord.x);
    const baseY = startCoord.y + fraction * (endCoord.y - startCoord.y);

    const dx = endCoord.x - startCoord.x;
    const dy = endCoord.y - startCoord.y;
    const angle = Math.atan2(dy, dx);

    // Multi-lane lateral offset: 3.5m standard lane width
    const laneWidth = 4.0;
    const lateralOffset = (vehicle.laneIndex - (edge.lanes - 1) / 2) * laneWidth;
    const offsetX = -Math.sin(angle) * lateralOffset;
    const offsetY = Math.cos(angle) * lateralOffset;

    return {
      x: Number((baseX + offsetX).toFixed(2)),
      y: Number((baseY + offsetY).toFixed(2)),
      angle: Number(angle.toFixed(3)),
    };
  }

  function cleanupSession(socketId: string): void {
    const session = sessions.get(socketId);
    if (session) {
      if (session.timer) {
        clearInterval(session.timer);
      }
      sessions.delete(socketId);
    }
  }
}
