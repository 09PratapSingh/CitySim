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
  activeMode: 'editor' | 'simulation' | 'comparison';
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

  // --- RENDERING HELPERS (Day Mode / Professional Theme) ---

  const VIBRANT_CAR_PALETTE = [
    '#ef4444', // Crimson Red
    '#2563eb', // Royal Blue
    '#10b981', // Emerald Green
    '#f97316', // Sunset Orange
    '#8b5cf6', // Amethyst Violet
    '#06b6d4', // Sky Cyan
    '#ec4899', // Hot Pink
    '#eab308', // Amber Gold
  ];

  const hashVehicleId = (id: string): number => {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = ((hash << 5) - hash) + id.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  };

  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    // 1. Off-white / soft light-gray canvas background
    ctx.save();
    ctx.fillStyle = '#f8fafc'; // Slate-50 off-white
    ctx.fillRect(0, 0, width, height);

    const gridSizeMeters = 50;
    const gridScreenSize = gridSizeMeters * viewport.zoom;

    if (gridScreenSize >= 8) {
      const startWorld = screenToWorld(0, 0, width, height);
      const endWorld = screenToWorld(width, height, width, height);

      const startX = Math.floor(startWorld.x / gridSizeMeters) * gridSizeMeters;
      const endX = Math.ceil(endWorld.x / gridSizeMeters) * gridSizeMeters;
      const startY = Math.floor(startWorld.y / gridSizeMeters) * gridSizeMeters;
      const endY = Math.ceil(endWorld.y / gridSizeMeters) * gridSizeMeters;

      // Draw subtle grid lines
      for (let x = startX; x <= endX; x += gridSizeMeters) {
        const isMajor = Math.abs(x) % 100 === 0;
        const s = worldToScreen(x, 0, width, height);
        ctx.beginPath();
        ctx.strokeStyle = isMajor ? '#cbd5e1' : '#e2e8f0'; // Slate-300 / Slate-200
        ctx.lineWidth = isMajor ? 1.2 : 0.8;
        ctx.moveTo(s.x, 0);
        ctx.lineTo(s.x, height);
        ctx.stroke();
      }

      for (let y = startY; y <= endY; y += gridSizeMeters) {
        const isMajor = Math.abs(y) % 100 === 0;
        const s = worldToScreen(0, y, width, height);
        ctx.beginPath();
        ctx.strokeStyle = isMajor ? '#cbd5e1' : '#e2e8f0';
        ctx.lineWidth = isMajor ? 1.2 : 0.8;
        ctx.moveTo(0, s.y);
        ctx.lineTo(width, s.y);
        ctx.stroke();
      }
    }

    // World origin crosshair (0,0)
    const origin = worldToScreen(0, 0, width, height);
    ctx.strokeStyle = '#94a3b8'; // Slate-400
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(origin.x - 14, origin.y);
    ctx.lineTo(origin.x + 14, origin.y);
    ctx.moveTo(origin.x, origin.y - 14);
    ctx.lineTo(origin.x, origin.y + 14);
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

      // Realistic lane width: ~4.0m world width scaled by zoom factor
      const laneWidthPx = Math.max(14, 4.0 * viewport.zoom * 3.2);
      const roadWidthPx = edge.lanes * laneWidthPx;
      const shoulderPx = Math.max(3, 3.5 * viewport.zoom);
      const totalWidthPx = roadWidthPx + shoulderPx * 2;

      const isSelected = selection?.type === 'edge' && selection.id === edge.id;
      const isHovered = hoveredEdgeId === edge.id;

      ctx.save();
      ctx.translate(p1.x, p1.y);
      ctx.rotate(angle);

      // 1. Concrete Shoulder / Sidewalk Layer
      ctx.fillStyle = '#94a3b8'; // concrete curb gray
      ctx.fillRect(0, -totalWidthPx / 2, roadLengthPx, totalWidthPx);

      // 2. Dark Charcoal Multi-Layered Asphalt Surface
      let asphaltColor = '#1e293b'; // slate-800 deep asphalt
      const cong = simulationFrame?.metrics?.roadCongestion?.[edge.id];
      if (cong && cong.vehicleCount > 0) {
        const ratio = cong.volumeToCapacityRatio ?? cong.densityRatio ?? 0;
        if (ratio < 0.35) asphaltColor = '#1e293b'; // free flow charcoal
        else if (ratio < 0.65) asphaltColor = '#334155'; // moderate flow slate
        else if (ratio < 0.85) asphaltColor = '#7c2d12'; // approaching capacity orange-brown
        else asphaltColor = '#881337'; // congested deep crimson
      }

      ctx.fillStyle = asphaltColor;
      ctx.fillRect(0, -roadWidthPx / 2, roadLengthPx, roadWidthPx);

      // 3. Selection / Hover Outline
      if (isSelected) {
        ctx.strokeStyle = '#10b981'; // emerald
        ctx.lineWidth = 3;
        ctx.strokeRect(-2, -totalWidthPx / 2 - 1, roadLengthPx + 4, totalWidthPx + 2);
      } else if (isHovered) {
        ctx.strokeStyle = '#0284c7'; // sky blue
        ctx.lineWidth = 2;
        ctx.strokeRect(-1, -totalWidthPx / 2 - 0.5, roadLengthPx + 2, totalWidthPx + 1);
      }

      // 4. Solid White Outer Road Margin Lines (curb edge lines)
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.5, 1.8 * viewport.zoom);
      ctx.beginPath();
      ctx.moveTo(0, -roadWidthPx / 2);
      ctx.lineTo(roadLengthPx, -roadWidthPx / 2);
      ctx.moveTo(0, roadWidthPx / 2);
      ctx.lineTo(roadLengthPx, roadWidthPx / 2);
      ctx.stroke();

      // 5. Bright White Dashed Lane Dividers (Multi-lane roads)
      if (edge.lanes > 1) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1.2, 1.5 * viewport.zoom);
        ctx.setLineDash([12, 10]);
        for (let l = 1; l < edge.lanes; l++) {
          const laneY = -roadWidthPx / 2 + l * laneWidthPx;
          ctx.beginPath();
          ctx.moveTo(8, laneY);
          ctx.lineTo(roadLengthPx - 8, laneY);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }

      // 6. Directional Chevrons / Flow Arrows painted on asphalt
      if (roadLengthPx > 35) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        const arrowSpacing = Math.max(65, 50 * viewport.zoom * 2.2);
        const aL = Math.max(8, 7 * viewport.zoom);
        const aW = Math.max(5, 4 * viewport.zoom);

        for (let l = 0; l < edge.lanes; l++) {
          const laneCenterY = -roadWidthPx / 2 + (l + 0.5) * laneWidthPx;
          for (let dist = arrowSpacing * 0.5; dist < roadLengthPx - 15; dist += arrowSpacing) {
            ctx.beginPath();
            ctx.moveTo(dist - aL, laneCenterY - aW);
            ctx.lineTo(dist, laneCenterY);
            ctx.lineTo(dist - aL, laneCenterY + aW);
            ctx.lineTo(dist - aL + 3, laneCenterY);
            ctx.closePath();
            ctx.fill();
          }
        }
      }

      // 7. Closed Road Hazard Markings (Diagonal warning striping & barricades)
      if (edge.isClosed) {
        ctx.save();
        // Diagonal warning hatch
        ctx.strokeStyle = '#facc15'; // warning yellow
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        ctx.beginPath();
        ctx.moveTo(0, -roadWidthPx / 2);
        ctx.lineTo(roadLengthPx, roadWidthPx / 2);
        ctx.moveTo(0, roadWidthPx / 2);
        ctx.lineTo(roadLengthPx, -roadWidthPx / 2);
        ctx.stroke();

        // Barricade badge at midpoint
        const badgeW = Math.max(70, 60 * viewport.zoom);
        const badgeH = Math.max(20, 16 * viewport.zoom);
        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.fillRect(roadLengthPx / 2 - badgeW / 2, -badgeH / 2, badgeW, badgeH);
        ctx.strokeRect(roadLengthPx / 2 - badgeW / 2, -badgeH / 2, badgeW, badgeH);

        ctx.fillStyle = '#f87171';
        ctx.font = `bold ${Math.max(10, 10 * viewport.zoom)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('ROAD CLOSED', roadLengthPx / 2, 0);
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
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2.5;
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

      // Determine junction radius based on connecting roads
      const connectingEdges = edges.filter((e) => e.fromNodeId === node.id || e.toNodeId === node.id);
      const maxLanes = connectingEdges.reduce((max, e) => Math.max(max, e.lanes), 1);
      const laneWidthPx = Math.max(14, 4.0 * viewport.zoom * 3.2);
      const junctionRadius = Math.max(16, (maxLanes * laneWidthPx) / 2 + 5 * viewport.zoom);

      // 1. Outer Selection / Hover Ring
      if (isSelected || isEdgeStart) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, junctionRadius + 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#10b981';
        ctx.stroke();
      } else if (isHovered) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, junctionRadius + 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(2, 132, 199, 0.15)';
        ctx.fill();
      }

      // 2. Paved Junction Hub (Matching Dark Asphalt Surface)
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, junctionRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#1e293b'; // asphalt charcoal
      ctx.fill();

      // Concrete junction curb edge
      ctx.lineWidth = Math.max(2, 2.5 * viewport.zoom);
      ctx.strokeStyle = '#94a3b8'; // concrete curb
      ctx.stroke();

      // 3. For Signalized Intersections: Yellow "Keep Clear" Box Junction Cross-Hatch
      if (node.controlType === 'fixed_signal' || node.controlType === 'adaptive_signal') {
        ctx.save();
        const boxSize = junctionRadius * 1.3;
        ctx.strokeStyle = 'rgba(234, 179, 8, 0.5)'; // yellow box marking
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 3]);

        ctx.strokeRect(pos.x - boxSize / 2, pos.y - boxSize / 2, boxSize, boxSize);
        ctx.beginPath();
        ctx.moveTo(pos.x - boxSize / 2, pos.y - boxSize / 2);
        ctx.lineTo(pos.x + boxSize / 2, pos.y + boxSize / 2);
        ctx.moveTo(pos.x - boxSize / 2, pos.y + boxSize / 2);
        ctx.lineTo(pos.x + boxSize / 2, pos.y - boxSize / 2);
        ctx.stroke();
        ctx.restore();
      }

      // 4. Center Junction Hub Indicator Pill
      const centerBadgeRadius = Math.max(6, 6 * viewport.zoom);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, centerBadgeRadius, 0, Math.PI * 2);
      if (node.controlType === 'fixed_signal') {
        ctx.fillStyle = '#0284c7'; // cyan fixed signal
      } else if (node.controlType === 'adaptive_signal') {
        ctx.fillStyle = '#059669'; // emerald adaptive signal
      } else {
        ctx.fillStyle = '#64748b'; // slate unsignalized
      }
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 5. Node ID Typography
      if (viewport.zoom >= 0.65) {
        ctx.fillStyle = '#475569';
        ctx.font = '600 10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(node.id, pos.x, pos.y + junctionRadius + 14);
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

      const dx = targetNode.x - fromNode.x;
      const dy = targetNode.y - fromNode.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length <= 0) continue;

      const unitX = dx / length;
      const unitY = dy / length;

      // Stop distance: Position stop bar 14m before node center
      const stopDistance = Math.max(10, length - 14);
      const stopWorldX = fromNode.x + unitX * stopDistance;
      const stopWorldY = fromNode.y + unitY * stopDistance;

      const normalX = -unitY;
      const normalY = unitX;
      const laneWidthPx = Math.max(14, 4.0 * viewport.zoom * 3.2);
      const roadWidthHalfMeters = (edge.lanes * 4.0) / 2;

      // 1. Crisp Solid White Stop Line painted across the approach lanes
      const stopP1 = worldToScreen(
        stopWorldX - normalX * roadWidthHalfMeters,
        stopWorldY - normalY * roadWidthHalfMeters,
        width,
        height
      );
      const stopP2 = worldToScreen(
        stopWorldX + normalX * roadWidthHalfMeters,
        stopWorldY + normalY * roadWidthHalfMeters,
        width,
        height
      );

      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(3.5, 3.5 * viewport.zoom);
      ctx.beginPath();
      ctx.moveTo(stopP1.x, stopP1.y);
      ctx.lineTo(stopP2.x, stopP2.y);
      ctx.stroke();

      // 2. Pedestrian Zebra Crosswalk Markings between stop line and junction
      const zebraWorldX = fromNode.x + unitX * (length - 8);
      const zebraWorldY = fromNode.y + unitY * (length - 8);
      const zebraP1 = worldToScreen(
        zebraWorldX - normalX * roadWidthHalfMeters,
        zebraWorldY - normalY * roadWidthHalfMeters,
        width,
        height
      );
      const zebraP2 = worldToScreen(
        zebraWorldX + normalX * roadWidthHalfMeters,
        zebraWorldY + normalY * roadWidthHalfMeters,
        width,
        height
      );
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = Math.max(2, 2.0 * viewport.zoom);
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(zebraP1.x, zebraP1.y);
      ctx.lineTo(zebraP2.x, zebraP2.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // 3. Realistic 3-Aspect Traffic Signal Head mounted on roadside
      const roadsideDistMeters = roadWidthHalfMeters + 4.5;
      const finalSigWorldX = stopWorldX + normalX * roadsideDistMeters;
      const finalSigWorldY = stopWorldY + normalY * roadsideDistMeters;
      const p = worldToScreen(finalSigWorldX, finalSigWorldY, width, height);

      const bulbR = Math.max(4, 4.5 * viewport.zoom);
      const headW = bulbR * 2.4;
      const headH = bulbR * 6.5;

      ctx.save();
      // Signal Head Housing (Black metal chassis with yellow outline)
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 1.2;
      ctx.fillRect(p.x - headW / 2, p.y - headH / 2, headW, headH);
      ctx.strokeRect(p.x - headW / 2, p.y - headH / 2, headW, headH);

      // Three Lenses: Top = Red, Middle = Yellow, Bottom = Green
      const redY = p.y - headH / 3 + 1;
      const yellowY = p.y;
      const greenY = p.y + headH / 3 - 1;

      const isGreen = sig.state === 'GREEN';
      const isYellow = sig.state === 'YELLOW';
      const isRed = !isGreen && !isYellow;

      // RED Lens
      ctx.beginPath();
      ctx.arc(p.x, redY, bulbR, 0, Math.PI * 2);
      ctx.fillStyle = isRed ? '#ef4444' : '#450a0a';
      if (isRed) {
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 10;
      }
      ctx.fill();
      ctx.shadowBlur = 0;

      // YELLOW Lens
      ctx.beginPath();
      ctx.arc(p.x, yellowY, bulbR, 0, Math.PI * 2);
      ctx.fillStyle = isYellow ? '#f59e0b' : '#451a03';
      if (isYellow) {
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 10;
      }
      ctx.fill();
      ctx.shadowBlur = 0;

      // GREEN Lens
      ctx.beginPath();
      ctx.arc(p.x, greenY, bulbR, 0, Math.PI * 2);
      ctx.fillStyle = isGreen ? '#22c55e' : '#052e16';
      if (isGreen) {
        ctx.shadowColor = '#22c55e';
        ctx.shadowBlur = 10;
      }
      ctx.fill();
      ctx.shadowBlur = 0;

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

      // Determine Vehicle Classification (Car vs Bus/Truck) from ID hash
      const hash = hashVehicleId(v.id);
      const isTruckOrBus = hash % 7 === 0;

      const carLength = isTruckOrBus 
        ? Math.max(26, 20 * viewport.zoom) 
        : Math.max(18, 14 * viewport.zoom);
      const carWidth = isTruckOrBus 
        ? Math.max(10, 8 * viewport.zoom) 
        : Math.max(9, 7 * viewport.zoom);

      // Distinct, vibrant vehicle color
      const bodyColor = VIBRANT_CAR_PALETTE[hash % VIBRANT_CAR_PALETTE.length];

      // 1. Soft Drop Shadow for Realistic 3D Depth
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.roundRect(-carLength / 2 + 1.5, -carWidth / 2 + 1.5, carLength, carWidth, 2);
      ctx.fill();

      // 2. Vehicle Body (Rounded rectangle)
      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.roundRect(-carLength / 2, -carWidth / 2, carLength, carWidth, 2);
      ctx.fill();

      // Subtle metallic body highlight outline
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // 3. Dark Tinted Windshield & Glass Windows
      ctx.fillStyle = '#0f172a';
      if (isTruckOrBus) {
        // Truck/Bus large windshield & rear window
        ctx.fillRect(-carLength * 0.4, -carWidth * 0.38, carLength * 0.25, carWidth * 0.76);
        ctx.fillRect(carLength * 0.15, -carWidth * 0.38, carLength * 0.25, carWidth * 0.76);
      } else {
        // Passenger car windshield and rear glass
        ctx.fillRect(-carLength * 0.12, -carWidth * 0.35, carLength * 0.5, carWidth * 0.7);
        // Roof panel in body color
        ctx.fillStyle = bodyColor;
        ctx.fillRect(-carLength * 0.05, -carWidth * 0.28, carLength * 0.3, carWidth * 0.56);
      }

      // 4. Front Headlights (Warm white/yellow)
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(carLength / 2 - 2, -carWidth / 2 + 1, 2, 2);
      ctx.fillRect(carLength / 2 - 2, carWidth / 2 - 3, 2, 2);

      // Subtle forward headlight illumination beam
      ctx.fillStyle = 'rgba(254, 240, 138, 0.15)';
      ctx.beginPath();
      ctx.moveTo(carLength / 2, -carWidth / 2 + 1);
      ctx.lineTo(carLength / 2 + 12, -carWidth / 2 - 4);
      ctx.lineTo(carLength / 2 + 12, carWidth / 2 + 4);
      ctx.lineTo(carLength / 2, carWidth / 2 - 3);
      ctx.closePath();
      ctx.fill();

      // 5. Rear Taillights & Brake Lights
      const isBraking = v.velocity < 1.0;
      ctx.fillStyle = isBraking ? '#ef4444' : '#991b1b';
      if (isBraking) {
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 6;
      }
      ctx.fillRect(-carLength / 2, -carWidth / 2 + 1, 2, 2.5);
      ctx.fillRect(-carLength / 2, carWidth / 2 - 3.5, 2, 2.5);
      ctx.shadowBlur = 0;

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
