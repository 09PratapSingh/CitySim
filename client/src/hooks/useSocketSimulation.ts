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
    // Connect to Socket.IO server (via Vite proxy or direct)
    const socket = io({
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      setError(null);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      setIsRunning(false);
    });

    socket.on('simulation_started', () => {
      setIsRunning(true);
      setIsPaused(false);
      setError(null);
    });

    socket.on('simulation_frame', (frame: SimulationFrame) => {
      setCurrentFrame(frame);
      setMetrics(frame.metrics);
    });

    socket.on('simulation_paused', () => {
      setIsPaused(true);
    });

    socket.on('simulation_resumed', () => {
      setIsPaused(false);
    });

    socket.on('simulation_stopped', () => {
      setIsRunning(false);
      setIsPaused(false);
      setCurrentFrame(null);
    });

    socket.on('simulation_error', (data: { message: string }) => {
      setError(data.message);
      setIsRunning(false);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const startSimulation = useCallback((baseMapId?: string, options?: { customMap?: { nodes: any[]; edges: any[] }; scenarioId?: string; seed?: number; speedMultiplier?: number }) => {
    if (!socketRef.current) return;
    setError(null);
    socketRef.current.emit('start_simulation', {
      baseMapId,
      customMap: options?.customMap,
      scenarioId: options?.scenarioId,
      seed: options?.seed ?? 42,
      speedMultiplier: options?.speedMultiplier ?? speed,
    });
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
