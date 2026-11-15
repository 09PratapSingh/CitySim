/**
 * Socket.IO Real-Time Simulation Hook.
 * 
 * Manages WebSocket connection to the backend simulation engine,
 * handling real-time telemetry frames, playback controls, and metrics.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { SimulationFrame, SimulationMetrics } from '../types.ts';

export interface UseSocketSimulationReturn {
  isConnected: boolean;
  isRunning: boolean;
  isPaused: boolean;
  currentFrame: SimulationFrame | null;
  metrics: SimulationMetrics | null;
  error: string | null;
  speed: number;
  startSimulation: (baseMapId?: string, options?: { customMap?: { nodes: any[]; edges: any[] }; scenarioId?: string; seed?: number; speedMultiplier?: number }) => void;
  pauseSimulation: () => void;
  resumeSimulation: () => void;
  stepSimulation: () => void;
  stopSimulation: () => void;
  setSpeedMultiplier: (speed: number) => void;
}

export function useSocketSimulation(): UseSocketSimulationReturn {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentFrame, setCurrentFrame] = useState<SimulationFrame | null>(null);
  const [metrics, setMetrics] = useState<SimulationMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState<number>(1.0);

  useEffect(() => {
    // Determine socket target URL dynamically:
    // If in dev mode on Vite (port 3000), point to backend at port 5000.
    // If in production or served by Express, connect directly to origin.
    const getSocketUrl = () => {
      if (typeof window === 'undefined') return undefined;
      if (window.location.port === '3000') {
        return `${window.location.protocol}//${window.location.hostname}:5000`;
      }
      return undefined;
    };

    const socket = io(getSocketUrl(), {
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      autoConnect: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.debug('[useSocketSimulation] Connected to simulation socket:', socket.id);
      setIsConnected(true);
      setError(null);
    });

    socket.io.on('reconnect', () => {
      console.debug('[useSocketSimulation] Reconnected to simulation socket');
      setIsConnected(true);
      setError(null);
    });

    socket.on('disconnect', (reason) => {
      console.debug('[useSocketSimulation] Disconnected from simulation socket:', reason);
      setIsConnected(false);
      setIsRunning(false);
    });

    socket.on('connect_error', (err) => {
      console.debug('[useSocketSimulation] Socket connect error:', err.message);
      setIsConnected(false);
    });

    socket.on('simulation_started', (data) => {
      console.debug('[useSocketSimulation] Received simulation_started event:', data);
      setIsRunning(true);
      setIsPaused(false);
      setError(null);
    });

    socket.on('simulation_frame', (frame: SimulationFrame) => {
      console.debug('[useSocketSimulation] Received simulation_frame, time:', frame.time, 'vehicles:', frame.vehicles?.length);
      setCurrentFrame(frame);
      setMetrics(frame.metrics);
    });

    socket.on('simulation_paused', () => {
      console.debug('[useSocketSimulation] Received simulation_paused');
      setIsPaused(true);
    });

    socket.on('simulation_resumed', () => {
      console.debug('[useSocketSimulation] Received simulation_resumed');
      setIsPaused(false);
    });

    socket.on('simulation_stopped', () => {
      console.debug('[useSocketSimulation] Received simulation_stopped');
      setIsRunning(false);
      setIsPaused(false);
      setCurrentFrame(null);
    });

    socket.on('simulation_error', (data: { message: string }) => {
      console.debug('[useSocketSimulation] Received simulation_error:', data.message);
      setError(data.message);
      setIsRunning(false);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const startSimulation = useCallback((baseMapId?: string, options?: { customMap?: { nodes: any[]; edges: any[] }; scenarioId?: string; seed?: number; speedMultiplier?: number }) => {
    if (!socketRef.current) {
      console.debug('[useSocketSimulation] startSimulation aborted: socketRef.current is null');
      return;
    }
    setError(null);
    const payload = {
      baseMapId,
      customMap: options?.customMap,
      scenarioId: options?.scenarioId,
      seed: options?.seed ?? 42,
      speedMultiplier: options?.speedMultiplier ?? speed,
    };
    console.debug('[useSocketSimulation] Emitting start_simulation with payload:', payload);
    socketRef.current.emit('start_simulation', payload);
  }, [speed]);

  const pauseSimulation = useCallback(() => {
    if (!socketRef.current) return;
    socketRef.current.emit('pause_simulation');
  }, []);

  const resumeSimulation = useCallback(() => {
    if (!socketRef.current) return;
    socketRef.current.emit('resume_simulation');
  }, []);

  const stepSimulation = useCallback(() => {
    if (!socketRef.current) return;
    socketRef.current.emit('step_simulation');
  }, []);

  const stopSimulation = useCallback(() => {
    if (!socketRef.current) return;
    socketRef.current.emit('stop_simulation');
    setIsRunning(false);
    setIsPaused(false);
  }, []);

  const setSpeedMultiplier = useCallback((newSpeed: number) => {
    if (!socketRef.current) return;
    setSpeed(newSpeed);
    socketRef.current.emit('set_speed', { speedMultiplier: newSpeed });
  }, []);

  return {
    isConnected,
    isRunning,
    isPaused,
    currentFrame,
    metrics,
    error,
    speed,
    startSimulation,
    pauseSimulation,
    resumeSimulation,
    stepSimulation,
    stopSimulation,
    setSpeedMultiplier,
  };
}
