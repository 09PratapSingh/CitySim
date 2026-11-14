import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { 
  IntersectionNode, 
  RoadSegment, 
  EditorTool, 
  SelectedElement, 
  SimulationFrame,
  ViewportTransform 
} from '../types.ts';

interface CanvasViewportProps {
  activeMode: 'editor' | 'simulation';
  currentTool: EditorTool;
  gridSnap: boolean;
  roadMode: 'two-way' | 'one-way';
  nodes: IntersectionNode[];
  edges: RoadSegment[];
  selection: SelectedElement | null;
  onSelect: (sel: SelectedElement | null) => void;
  onAddNode: (x: number, y: number) => void;
  onAddEdge: (fromNodeId: string, toNodeId: string, isOneWay: boolean) => void;
  onMoveNode: (nodeId: string, x: number, y: number) => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  simulationFrame: SimulationFrame | null;
  viewport: ViewportTransform;
  setViewport: React.Dispatch<React.SetStateAction<ViewportTransform>>;
}

export const CanvasViewport: React.FC<CanvasViewportProps> = ({
  activeMode,
  currentTool,
  gridSnap,
  roadMode,
  nodes,
  edges,
  selection,
  onSelect,
  onAddNode,
  onAddEdge,
  onMoveNode,
  onDeleteNode,
  onDeleteEdge,
  simulationFrame,
  viewport,
  setViewport,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Interaction tracking state
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [edgeStartNodeId, setEdgeStartNodeId] = useState<string | null>(null);
  const [mouseWorldPos, setMouseWorldPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

  // Coordinate transformations
  const worldToScreen = useCallback((wx: number, wy: number, width: number, height: number) => {
    return {
      x: (wx - viewport.x) * viewport.zoom + width / 2,
      y: (wy - viewport.y) * viewport.zoom + height / 2,
    };
  }, [viewport]);

  const screenToWorld = useCallback((sx: number, sy: number, width: number, height: number) => {
    return {
      x: (sx - width / 2) / viewport.zoom + viewport.x,
      y: (sy - height / 2) / viewport.zoom + viewport.y,
    };
  }, [viewport]);

  const snapCoord = useCallback((val: number, step: number = 25): number => {
    return gridSnap ? Math.round(val / step) * step : Math.round(val);
  }, [gridSnap]);

  // Spacebar pan listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        setIsSpacePressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = canvas.parentElement?.clientWidth || window.innerWidth;
      canvas.height = canvas.parentElement?.clientHeight || window.innerHeight;
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Hit-testing functions
  const findNodeAtWorld = useCallback((wx: number, wy: number, radiusMeters: number = 18): IntersectionNode | null => {
    for (const node of nodes) {
      const dx = node.x - wx;
      const dy = node.y - wy;
      if (Math.sqrt(dx * dx + dy * dy) <= radiusMeters) {
        return node;
      }
    }
    return null;
  }, [nodes]);

  const findEdgeAtWorld = useCallback((wx: number, wy: number, thresholdMeters: number = 10): RoadSegment | null => {
    for (const edge of edges) {
      const fromNode = nodes.find((n) => n.id === edge.fromNodeId);
      const toNode = nodes.find((n) => n.id === edge.toNodeId);
      if (!fromNode || !toNode) continue;

      // Distance from point to line segment
      const l2 = (toNode.x - fromNode.x) ** 2 + (toNode.y - fromNode.y) ** 2;
      if (l2 === 0) continue;
      const t = Math.max(0, Math.min(1, ((wx - fromNode.x) * (toNode.x - fromNode.x) + (wy - fromNode.y) * (toNode.y - fromNode.y)) / l2));
      const projX = fromNode.x + t * (toNode.x - fromNode.x);
      const projY = fromNode.y + t * (toNode.y - fromNode.y);
      const dist = Math.sqrt((wx - projX) ** 2 + (wy - projY) ** 2);

      if (dist <= thresholdMeters) {
        return edge;
      }
    }
    return null;
  }, [edges, nodes]);

  // Main Canvas Rendering Loop
  useEffect(() => {
    let animId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      // 1. Draw Grid Background
      drawGrid(ctx, width, height);

      // 2. Draw Roads (Edges)
      drawRoads(ctx, width, height);

      // 3. Draw Rubberband Connection Line (if in draw_edge mode)
      if (activeMode === 'editor' && currentTool === 'draw_edge' && edgeStartNodeId) {
        drawRubberbandEdge(ctx, width, height);
      }

      // 4. Draw Intersections (Nodes)
      drawNodes(ctx, width, height);

      // 5. Draw Traffic Signals (Aspects)
      drawTrafficSignals(ctx, width, height);

      // 6. Draw Vehicles (if simulation frame available)
      if (simulationFrame && simulationFrame.vehicles.length > 0) {
        drawVehicles(ctx, width, height);
      }

      // 7. Ghost Node preview for Add Node tool
      if (activeMode === 'editor' && currentTool === 'add_node') {
        const screenPos = worldToScreen(snapCoord(mouseWorldPos.x), snapCoord(mouseWorldPos.y), width, height);
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, 10 * viewport.zoom, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(52, 211, 153, 0.4)';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#34d399';
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [
    viewport, 
    nodes, 
    edges, 
    selection, 
    hoveredNodeId, 
    hoveredEdgeId, 
    edgeStartNodeId, 
    mouseWorldPos, 
    activeMode, 
    currentTool, 
    simulationFrame, 
    gridSnap, 
    snapCoord, 
    worldToScreen
  ]);

  // --- RENDERING HELPERS ---

  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const gridSizeMeters = 50;
    const gridScreenSize = gridSizeMeters * viewport.zoom;

    if (gridScreenSize < 10) return; // Don't draw if too zoomed out

    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#0f172a'; // slate-900 subtle grid lines

    const startWorld = screenToWorld(0, 0, width, height);
    const endWorld = screenToWorld(width, height, width, height);

    const startX = Math.floor(startWorld.x / gridSizeMeters) * gridSizeMeters;
    const endX = Math.ceil(endWorld.x / gridSizeMeters) * gridSizeMeters;
    const startY = Math.floor(startWorld.y / gridSizeMeters) * gridSizeMeters;
    const endY = Math.ceil(endWorld.y / gridSizeMeters) * gridSizeMeters;

    for (let x = startX; x <= endX; x += gridSizeMeters) {
      const s = worldToScreen(x, 0, width, height);
      ctx.beginPath();
      ctx.moveTo(s.x, 0);
      ctx.lineTo(s.x, height);
      ctx.stroke();
    }

    for (let y = startY; y <= endY; y += gridSizeMeters) {
      const s = worldToScreen(0, y, width, height);
      ctx.beginPath();
      ctx.moveTo(0, s.y);
      ctx.lineTo(width, s.y);
      ctx.stroke();
    }

    // World origin crosshair (0,0)
    const origin = worldToScreen(0, 0, width, height);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(origin.x - 12, origin.y);
    ctx.lineTo(origin.x + 12, origin.y);
    ctx.moveTo(origin.x, origin.y - 12);
    ctx.lineTo(origin.x, origin.y + 12);
    ctx.stroke();

    ctx.restore();
  };

  const drawRoads = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.save();

    for (const edge of edges) {
      const fromNode = nodes.find((n) => n.id === edge.fromNodeId);
      const toNode = nodes.find((n) => n.id === edge.toNodeId);
      if (!fromNode || !toNode) continue;

      const p1 = worldToScreen(fromNode.x, fromNode.y, width, height);
      const p2 = worldToScreen(toNode.x, toNode.y, width, height);

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const angle = Math.atan2(dy, dx);
      const roadLengthPx = Math.sqrt(dx * dx + dy * dy);

      // Standard lane width: 6m world * zoom
      const laneWidthPx = Math.max(8, 6.0 * viewport.zoom);
      const roadWidthPx = edge.lanes * laneWidthPx;

      const isSelected = selection?.type === 'edge' && selection.id === edge.id;
      const isHovered = hoveredEdgeId === edge.id;

      // Base Asphalt Surface
      ctx.save();
      ctx.translate(p1.x, p1.y);
      ctx.rotate(angle);

      // Congestion Heatmap or Base Asphalt Fill: derived strictly from real vehicle density
      let roadColor = '#1e293b'; // standard clean slate-800 asphalt
      const cong = simulationFrame?.metrics?.roadCongestion?.[edge.id];
      if (cong && cong.vehicleCount > 0) {
        const ratio = cong.volumeToCapacityRatio ?? cong.densityRatio ?? 0;
        if (ratio < 0.3) roadColor = '#134e4a'; // dark teal / free flow
        else if (ratio < 0.6) roadColor = '#854d0e'; // amber / moderate
        else if (ratio < 0.85) roadColor = '#9a3412'; // orange / heavy
        else roadColor = '#881337'; // red / severe congestion
      }

      ctx.fillStyle = roadColor;
      ctx.fillRect(0, -roadWidthPx / 2, roadLengthPx, roadWidthPx);

      // Road Outline / Selection Highlight
      if (isSelected) {
        ctx.strokeStyle = '#34d399'; // emerald outline
        ctx.lineWidth = 2.5;
        ctx.strokeRect(0, -roadWidthPx / 2, roadLengthPx, roadWidthPx);
      } else if (isHovered) {
        ctx.strokeStyle = '#38bdf8'; // sky hover outline
        ctx.lineWidth = 1.5;
        ctx.strokeRect(0, -roadWidthPx / 2, roadLengthPx, roadWidthPx);
      } else {
        ctx.strokeStyle = '#334155'; // subtle border
        ctx.lineWidth = 1;
        ctx.strokeRect(0, -roadWidthPx / 2, roadLengthPx, roadWidthPx);
      }

      // Lane dividers (dashed white markings)
      if (edge.lanes > 1) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([8, 8]);
        for (let l = 1; l < edge.lanes; l++) {
          const laneY = -roadWidthPx / 2 + l * laneWidthPx;
          ctx.beginPath();
          ctx.moveTo(8, laneY);
          ctx.lineTo(roadLengthPx - 8, laneY);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }

      // Directional Flow Chevron Arrows for One-Way
      if (edge.isOneWay && roadLengthPx > 30) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        const arrowSpacing = Math.max(60, 40 * viewport.zoom);
        for (let dist = arrowSpacing / 2; dist < roadLengthPx - 20; dist += arrowSpacing) {
          ctx.beginPath();
          ctx.moveTo(dist, -2);
          ctx.lineTo(dist + 6, 0);
          ctx.lineTo(dist, 2);
          ctx.fill();
        }
      }

      // Road Closure Hazard Markings (Diagonal hazard stripes)
      if (edge.isClosed) {
        ctx.save();
        ctx.strokeStyle = '#e11d48';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(roadLengthPx, 0);
        ctx.stroke();

        // Closed banner at midpoint
        ctx.fillStyle = '#f43f5e';
        ctx.font = `bold ${Math.max(10, 11 * viewport.zoom)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('CLOSED', roadLengthPx / 2, 0);
        ctx.restore();
      }

      ctx.restore();
    }

    ctx.restore();
  };

  const drawRubberbandEdge = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const startNode = nodes.find((n) => n.id === edgeStartNodeId);
    if (!startNode) return;

    const p1 = worldToScreen(startNode.x, startNode.y, width, height);
    const targetNode = findNodeAtWorld(mouseWorldPos.x, mouseWorldPos.y);
    const p2 = targetNode
      ? worldToScreen(targetNode.x, targetNode.y, width, height)
      : worldToScreen(snapCoord(mouseWorldPos.x), snapCoord(mouseWorldPos.y), width, height);

    ctx.save();
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  };

  const drawNodes = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.save();

    for (const node of nodes) {
      const pos = worldToScreen(node.x, node.y, width, height);
      const isSelected = selection?.type === 'node' && selection.id === node.id;
      const isHovered = hoveredNodeId === node.id;
      const isEdgeStart = edgeStartNodeId === node.id;

      const baseRadius = Math.max(7, 10 * viewport.zoom);

      // Node Outer Glow / Selection Ring
      if (isSelected || isEdgeStart) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, baseRadius + 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(52, 211, 153, 0.3)';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#34d399';
        ctx.stroke();
      } else if (isHovered) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, baseRadius + 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
        ctx.fill();
      }

      // Node Junction Hub Fill
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, baseRadius, 0, Math.PI * 2);

      if (node.controlType === 'fixed_signal') {
        ctx.fillStyle = '#0284c7'; // cyan for fixed signal
      } else if (node.controlType === 'adaptive_signal') {
        ctx.fillStyle = '#059669'; // emerald for adaptive signal
      } else {
        ctx.fillStyle = '#334155'; // slate for unsignalized
      }
      ctx.fill();

      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#f8fafc';
      ctx.stroke();

      // Node label (if zoom level is sufficient)
      if (viewport.zoom >= 0.7) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(node.id, pos.x, pos.y + baseRadius + 12);
      }
    }

    ctx.restore();
  };

  const drawTrafficSignals = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (!simulationFrame || !simulationFrame.signals) return;

    ctx.save();
    for (const sig of simulationFrame.signals) {
      const edge = edges.find((e) => e.id === sig.edgeId);
      if (!edge) continue;

      const targetNode = nodes.find((n) => n.id === edge.toNodeId);
      const fromNode = nodes.find((n) => n.id === edge.fromNodeId);
      if (!targetNode || !fromNode) continue;

      // Only display traffic signals on approaches arriving at signalized intersections
      if (targetNode.controlType !== 'fixed_signal' && targetNode.controlType !== 'adaptive_signal') {
        continue;
      }

      // Position signal and stop bar 12m before intersection node center
      const dx = targetNode.x - fromNode.x;
      const dy = targetNode.y - fromNode.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length <= 0) continue;

      const unitX = dx / length;
      const unitY = dy / length;
      const stopDistance = Math.max(10, length - 12);

      const stopWorldX = fromNode.x + unitX * stopDistance;
      const stopWorldY = fromNode.y + unitY * stopDistance;

      // Normal vector pointing perpendicular to road
      const normalX = -unitY;
      const normalY = unitX;
      const laneWidth = 6.0;
      const roadWidthHalf = (edge.lanes * laneWidth) / 2;
      const roadsideDist = roadWidthHalf + 5.0;

      // 1. Draw crisp white stop line across the approach lanes
      const stopP1 = worldToScreen(
        stopWorldX - normalX * roadWidthHalf,
        stopWorldY - normalY * roadWidthHalf,
        width,
        height
      );
      const stopP2 = worldToScreen(
        stopWorldX + normalX * roadWidthHalf,
        stopWorldY + normalY * roadWidthHalf,
        width,
        height
      );
      ctx.save();
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = Math.max(2, 2.5 * viewport.zoom);
      ctx.beginPath();
      ctx.moveTo(stopP1.x, stopP1.y);
      ctx.lineTo(stopP2.x, stopP2.y);
      ctx.stroke();
      ctx.restore();

      // 2. Position signal head housing on roadside
      const finalSigWorldX = stopWorldX + normalX * roadsideDist;
      const finalSigWorldY = stopWorldY + normalY * roadsideDist;
      const p = worldToScreen(finalSigWorldX, finalSigWorldY, width, height);

      // Signal Light Aspect Color
      let bulbColor = '#ef4444'; // Red
      let shadowColor = 'rgba(239, 68, 68, 0.85)';
      if (sig.state === 'GREEN') {
        bulbColor = '#22c55e';
        shadowColor = 'rgba(34, 197, 94, 0.85)';
      } else if (sig.state === 'YELLOW') {
        bulbColor = '#f59e0b';
        shadowColor = 'rgba(245, 158, 11, 0.85)';
      }

      // Draw Signal Head Housing (square signal box)
      const bulbRadius = Math.max(6, 6.0 * viewport.zoom);
      const boxSize = bulbRadius * 2.4;

      ctx.save();
      ctx.fillStyle = '#020617';
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.5;
      ctx.fillRect(p.x - boxSize / 2, p.y - boxSize / 2, boxSize, boxSize);
      ctx.strokeRect(p.x - boxSize / 2, p.y - boxSize / 2, boxSize, boxSize);

      // Glowing Lamp Bulb
      ctx.shadowBlur = 12;
      ctx.shadowColor = shadowColor;
      ctx.beginPath();
      ctx.arc(p.x, p.y, bulbRadius, 0, Math.PI * 2);
      ctx.fillStyle = bulbColor;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Bright inner core
      ctx.beginPath();
      ctx.arc(p.x, p.y, bulbRadius * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  };

  const drawVehicles = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (!simulationFrame) return;

    ctx.save();
    for (const v of simulationFrame.vehicles) {
      const pos = worldToScreen(v.x, v.y, width, height);

      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(v.angle);

      // Vehicle Dimensions in pixels: clearly visible miniature vehicles
      const carLength = Math.max(14, 12 * viewport.zoom);
      const carWidth = Math.max(7, 6 * viewport.zoom);

      // Vehicle color by velocity
      let carColor = '#38bdf8'; // Free flow cruising (sky blue)
      if (v.velocity < 1.0) {
        carColor = '#f43f5e'; // Stopped in queue (bright rose/red)
      } else if (v.velocity < 6.0) {
        carColor = '#fbbf24'; // Slowing down (amber)
      }

      // Car Body
      ctx.fillStyle = carColor;
      ctx.fillRect(-carLength / 2, -carWidth / 2, carLength, carWidth);

      // Windshield & roof
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-carLength * 0.1, -carWidth * 0.35, carLength * 0.45, carWidth * 0.7);

      // Headlights (front)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(carLength / 2 - 2, -carWidth / 2 + 1, 2, 2);
      ctx.fillRect(carLength / 2 - 2, carWidth / 2 - 3, 2, 2);

      // Brake lights (rear)
      ctx.fillStyle = v.velocity < 1.0 ? '#ef4444' : '#991b1b';
      ctx.fillRect(-carLength / 2, -carWidth / 2 + 1, 2, 2);
      ctx.fillRect(-carLength / 2, carWidth / 2 - 3, 2, 2);

      ctx.restore();
    }
    ctx.restore();
  };

  // --- MOUSE & WHEEL INTERACTION HANDLERS ---

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const worldPos = screenToWorld(sx, sy, canvas.width, canvas.height);

    // Middle click, Pan tool, Alt drag, or Space drag initiates dragging the viewport
    if (e.button === 1 || currentTool === 'pan' || e.altKey || isSpacePressed) {
      setIsPanning(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }

    if (e.button !== 0) return; // Left click only for tools

    if (activeMode === 'editor') {
      if (currentTool === 'select') {
        const clickedNode = findNodeAtWorld(worldPos.x, worldPos.y);
        if (clickedNode) {
          onSelect({ type: 'node', id: clickedNode.id });
          setDraggedNodeId(clickedNode.id);
          return;
        }

        const clickedEdge = findEdgeAtWorld(worldPos.x, worldPos.y);
        if (clickedEdge) {
          onSelect({ type: 'edge', id: clickedEdge.id });
          return;
        }

        onSelect(null);
      } else if (currentTool === 'add_node') {
        onAddNode(snapCoord(worldPos.x), snapCoord(worldPos.y));
      } else if (currentTool === 'draw_edge') {
        const clickedNode = findNodeAtWorld(worldPos.x, worldPos.y);
        if (clickedNode) {
          if (!edgeStartNodeId) {
            setEdgeStartNodeId(clickedNode.id);
          } else if (edgeStartNodeId !== clickedNode.id) {
            onAddEdge(edgeStartNodeId, clickedNode.id, roadMode === 'one-way');
            setEdgeStartNodeId(null);
          }
        } else {
          setEdgeStartNodeId(null);
        }
      } else if (currentTool === 'delete') {
        const clickedNode = findNodeAtWorld(worldPos.x, worldPos.y);
        if (clickedNode) {
          onDeleteNode(clickedNode.id);
          return;
        }

        const clickedEdge = findEdgeAtWorld(worldPos.x, worldPos.y);
        if (clickedEdge) {
          onDeleteEdge(clickedEdge.id);
          return;
        }
      }
    } else {
      // In simulation mode, clicking selects nodes/roads to inspect their live telemetry
      const clickedEdge = findEdgeAtWorld(worldPos.x, worldPos.y);
      if (clickedEdge) {
        onSelect({ type: 'edge', id: clickedEdge.id });
        return;
      }
      const clickedNode = findNodeAtWorld(worldPos.x, worldPos.y);
      if (clickedNode) {
        onSelect({ type: 'node', id: clickedNode.id });
        return;
      }
      onSelect(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const worldPos = screenToWorld(sx, sy, canvas.width, canvas.height);
    setMouseWorldPos(worldPos);

    if (isPanning) {
      const dx = (e.clientX - dragStart.x) / viewport.zoom;
      const dy = (e.clientY - dragStart.y) / viewport.zoom;
      setViewport((prev) => ({
        ...prev,
        x: prev.x - dx,
        y: prev.y - dy,
      }));
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }

    if (draggedNodeId && currentTool === 'select') {
      onMoveNode(draggedNodeId, snapCoord(worldPos.x), snapCoord(worldPos.y));
      return;
    }

    // Hover detection for interactive feedback
    const hNode = findNodeAtWorld(worldPos.x, worldPos.y);
    setHoveredNodeId(hNode ? hNode.id : null);

    if (!hNode) {
      const hEdge = findEdgeAtWorld(worldPos.x, worldPos.y);
      setHoveredEdgeId(hEdge ? hEdge.id : null);
    } else {
      setHoveredEdgeId(null);
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggedNodeId(null);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    setViewport((prev) => ({
      ...prev,
      zoom: Math.max(0.2, Math.min(4.0, prev.zoom * zoomFactor)),
    }));
  };

  return (
    <div className="relative w-full h-full flex-1 overflow-hidden bg-slate-950">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        className={`w-full h-full block ${
          currentTool === 'pan' || isPanning 
            ? 'cursor-grab active:cursor-grabbing' 
            : currentTool === 'add_node' 
            ? 'cursor-crosshair' 
            : currentTool === 'draw_edge' 
            ? 'cursor-pointer' 
            : currentTool === 'delete' 
            ? 'cursor-not-allowed' 
            : 'cursor-default'
        }`}
      />
    </div>
  );
};
