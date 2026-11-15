import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
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

interface JaipurBuilding {
  x: number;
  y: number;
  width: number;
  depth: number;
  height: number;
  wallColor: string;
  sideColor: string;
  roofColor: string;
  hasChhatri: boolean;
  hasWaterTank: boolean;
  hasCourtyard: boolean;
  windowsCount: number;
  isPark?: boolean;
  parkLawnColor?: string;
  trees?: { x: number; y: number; r: number; hasGulmohar?: boolean }[];
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

  // Performance: Off-screen canvas cache for static background & 2.5D buildings
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgNeedsRedrawRef = useRef(true);
  const lastViewportRef = useRef<ViewportTransform>({ x: 0, y: 0, zoom: 1 });

  // Interaction tracking state
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [edgeStartNodeId, setEdgeStartNodeId] = useState<string | null>(null);
  const [mouseWorldPos, setMouseWorldPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

  // Mark background cache dirty when viewport or map topology changes
  useEffect(() => {
    bgNeedsRedrawRef.current = true;
  }, [viewport.x, viewport.y, viewport.zoom, nodes, edges]);

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
      bgNeedsRedrawRef.current = true;
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Distance helper from point to line segment
  const distToSegment = useCallback((px: number, py: number, x1: number, y1: number, x2: number, y2: number): number => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    return Math.hypot(px - projX, py - projY);
  }, []);

  // Hit-testing functions
  const findNodeAtWorld = useCallback((wx: number, wy: number, radiusMeters: number = 18): IntersectionNode | null => {
    for (const node of nodes) {
      const dx = node.x - wx;
      const dy = node.y - wy;
      if (Math.hypot(dx, dy) <= radiusMeters) {
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

      const dist = distToSegment(wx, wy, fromNode.x, fromNode.y, toNode.x, toNode.y);
      if (dist <= thresholdMeters) {
        return edge;
      }
    }
    return null;
  }, [edges, nodes, distToSegment]);

  // Procedural 2.5D Jaipur Urban Fabric: Terracotta & Sandstone Havelis, Courtyards & Parks
  const jaipurBuildings = useMemo<JaipurBuilding[]>(() => {
    if (nodes.length === 0) return [];

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y);
    }

    const margin = 220;
    const step = 52; // 52m urban lot parcels
    const startX = Math.floor((minX - margin) / step) * step;
    const endX = Math.ceil((maxX + margin) / step) * step;
    const startY = Math.floor((minY - margin) / step) * step;
    const endY = Math.ceil((maxY + margin) / step) * step;

    const buildings: JaipurBuilding[] = [];

    // Distinct Jaipur Architectural Palette
    const PALETTES = [
      // 1. Classic Pink City Terracotta
      { wall: '#cf6b54', side: '#a44230', roof: '#f2a490' },
      // 2. Dholpur Warm Sandstone
      { wall: '#d99763', side: '#ad6736', roof: '#f5c091' },
      // 3. Jaisalmer Golden Ochre / Mustard
      { wall: '#dfb768', side: '#b58a3a', roof: '#fae09d' },
      // 4. Rose Terracotta Haveli
      { wall: '#d97c67', side: '#af5440', roof: '#f5b6a7' },
      // 5. Desert Sunstone
      { wall: '#e2a878', side: '#ba7744', roof: '#fed2a8' },
    ];

    for (let x = startX; x <= endX; x += step) {
      for (let y = startY; y <= endY; y += step) {
        const seed = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        const rand1 = seed - Math.floor(seed);
        const rand2 = (seed * 1.7) - Math.floor(seed * 1.7);
        const rand3 = (seed * 2.9) - Math.floor(seed * 2.9);

        const bx = x + (rand2 - 0.5) * 10;
        const by = y + (rand3 - 0.5) * 10;

        // Check distance to all roads
        let minRoadDist = Infinity;
        for (const edge of edges) {
          const fn = nodes.find(n => n.id === edge.fromNodeId);
          const tn = nodes.find(n => n.id === edge.toNodeId);
          if (!fn || !tn) continue;
          const d = distToSegment(bx, by, fn.x, fn.y, tn.x, tn.y);
          if (d < minRoadDist) minRoadDist = d;
        }

        // Check distance to all intersections
        let minNodeDist = Infinity;
        for (const node of nodes) {
          const d = Math.hypot(bx - node.x, by - node.y);
          if (d < minNodeDist) minNodeDist = d;
        }

        // Buffer away from roadway pavement and intersections
        if (minRoadDist < 25 || minNodeDist < 35) {
          continue;
        }

        if (rand1 < 0.16) {
          // Traditional Charbagh / Garden Quadrangle with Gulmohar Trees
          buildings.push({
            x: bx,
            y: by,
            width: 38 + rand2 * 8,
            depth: 34 + rand3 * 8,
            height: 0,
            wallColor: '#b4d498',
            sideColor: '#9ec27e',
            roofColor: '#d6eabf',
            hasChhatri: false,
            hasWaterTank: false,
            hasCourtyard: true,
            windowsCount: 0,
            isPark: true,
            parkLawnColor: '#c2dfa3',
            trees: [
              { x: -11, y: -9, r: 4.8, hasGulmohar: true },
              { x: 10, y: 8, r: 5.4, hasGulmohar: false },
              { x: -6, y: 9, r: 4.2, hasGulmohar: true },
              { x: 9, y: -8, r: 4.5, hasGulmohar: false },
            ],
          });
        } else {
          // 2.5D Jaipur Extruded Building
          const pal = PALETTES[Math.floor(rand1 * PALETTES.length) % PALETTES.length];
          const hasCourtyard = rand2 > 0.45;
          const hasChhatri = rand3 > 0.40;
          const hasWaterTank = rand1 > 0.30;
          const heightMeters = 11 + rand2 * 14; // 11m to 25m tall structures

          buildings.push({
            x: bx,
            y: by,
            width: 32 + rand2 * 14,
            depth: 24 + rand3 * 12,
            height: heightMeters,
            wallColor: pal.wall,
            sideColor: pal.side,
            roofColor: pal.roof,
            hasChhatri,
            hasWaterTank,
            hasCourtyard,
            windowsCount: 2 + Math.floor(rand2 * 3),
            isPark: false,
            trees: rand3 > 0.6 ? [{ x: -14, y: 0, r: 3.8, hasGulmohar: rand1 > 0.5 }] : undefined,
          });
        }
      }
    }

    return buildings;
  }, [nodes, edges, distToSegment]);

  // Main Canvas Rendering Loop with Offscreen Caching (Strict 60 FPS)
  useEffect(() => {
    let animId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const { width, height } = canvas;

      // 1. Off-screen Background Caching: Renders static environment & 2.5D buildings
      if (
        bgNeedsRedrawRef.current || 
        !offscreenCanvasRef.current || 
        offscreenCanvasRef.current.width !== width || 
        offscreenCanvasRef.current.height !== height
      ) {
        if (!offscreenCanvasRef.current) {
          offscreenCanvasRef.current = document.createElement('canvas');
        }
        offscreenCanvasRef.current.width = width;
        offscreenCanvasRef.current.height = height;

        const offCtx = offscreenCanvasRef.current.getContext('2d');
        if (offCtx) {
          offCtx.clearRect(0, 0, width, height);
          drawOrganicTerrain(offCtx, width, height);
          draw2D5JaipurBuildings(offCtx, width, height);
        }
        bgNeedsRedrawRef.current = false;
      }

      // Fast GPU blit of cached static background (0.05ms)
      if (offscreenCanvasRef.current) {
        ctx.drawImage(offscreenCanvasRef.current, 0, 0);
      }

      // 2. Concrete Curb Base with 2.5D Unified Drop Shadow
      drawRoadCurbsAndBase(ctx, width, height);

      // 3. Matte Charcoal Asphalt (#334155) Unified Surface Fusion (Roads first, then Junction Boxes)
      drawUnifiedAsphaltSurface(ctx, width, height);

      // 4. Road Surface Markings (White Curbs, Dashed Dividers, Chevrons)
      drawRoadSurfaceMarkings(ctx, width, height);

      // 5. Seamless Intersection Markings (Yellow Keep Clear Box) & Editor Overlays
      drawIntersectionMarkings(ctx, width, height);

      // 6. Rubberband Connection Line (if in draw_edge mode)
      if (activeMode === 'editor' && currentTool === 'draw_edge' && edgeStartNodeId) {
        drawRubberbandEdge(ctx, width, height);
      }

      // 7. Traffic Signals (Aspects, Stop Lines & Zebra Crossings)
      drawTrafficSignals(ctx, width, height);

      // 7. Polished Vehicles (2D Sprites: Sedans, Auto-Rickshaws, City Buses)
      if (simulationFrame && simulationFrame.vehicles.length > 0) {
        drawVehicles(ctx, width, height);
      }

      // 8. Ghost Node preview for Add Node tool
      if (activeMode === 'editor' && currentTool === 'add_node') {
        const screenPos = worldToScreen(snapCoord(mouseWorldPos.x), snapCoord(mouseWorldPos.y), width, height);
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, 10 * viewport.zoom, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(16, 185, 129, 0.4)';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#10b981';
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
    worldToScreen,
    jaipurBuildings
  ]);

  // --- RENDERING HELPERS: 2.5D REALISTIC URBAN CARTOGRAPHY ---

  // 1. Organic Base Terrain: Warm Earthy Loam & Parkland Patches
  const drawOrganicTerrain = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.save();
    // Warm, earthy sandy-buff urban soil base
    ctx.fillStyle = '#e6dfce';
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

      // Subtle organic parcel dividers in warm earthy tone
      for (let x = startX; x <= endX; x += gridSizeMeters) {
        const isMajor = Math.abs(x) % 100 === 0;
        const s = worldToScreen(x, 0, width, height);
        ctx.beginPath();
        ctx.strokeStyle = isMajor ? 'rgba(160, 138, 110, 0.35)' : 'rgba(175, 155, 128, 0.18)';
        ctx.lineWidth = isMajor ? 1.0 : 0.6;
        ctx.moveTo(s.x, 0);
        ctx.lineTo(s.x, height);
        ctx.stroke();
      }

      for (let y = startY; y <= endY; y += gridSizeMeters) {
        const isMajor = Math.abs(y) % 100 === 0;
        const s = worldToScreen(0, y, width, height);
        ctx.beginPath();
        ctx.strokeStyle = isMajor ? 'rgba(160, 138, 110, 0.35)' : 'rgba(175, 155, 128, 0.18)';
        ctx.lineWidth = isMajor ? 1.0 : 0.6;
        ctx.moveTo(0, s.y);
        ctx.lineTo(width, s.y);
        ctx.stroke();
      }
    }

    // Origin marker
    const origin = worldToScreen(0, 0, width, height);
    ctx.strokeStyle = '#9c8266';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(origin.x - 14, origin.y);
    ctx.lineTo(origin.x + 14, origin.y);
    ctx.moveTo(origin.x, origin.y - 14);
    ctx.lineTo(origin.x, origin.y + 14);
    ctx.stroke();

    ctx.restore();
  };

  // 2. 2.5D Extruded Jaipur Buildings: Terracotta Walls, Shaded East Faces, Sunlit Roofs & Chhatris
  const draw2D5JaipurBuildings = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (jaipurBuildings.length === 0) return;

    ctx.save();
    for (const b of jaipurBuildings) {
      const sPos = worldToScreen(b.x, b.y, width, height);
      const sw = b.width * viewport.zoom;
      const sd = b.depth * viewport.zoom;
      const sh = b.height * viewport.zoom;

      // Viewport Frustum Culling
      if (sPos.x + sw < -60 || sPos.x - sw > width + 60 || sPos.y + sd < -60 || sPos.y - sd > height + 60) {
        continue;
      }

      if (b.isPark) {
        // Traditional Charbagh / Garden Quadrangle
        ctx.fillStyle = b.parkLawnColor || '#c2dfa3';
        ctx.beginPath();
        ctx.roundRect(sPos.x - sw / 2, sPos.y - sd / 2, sw, sd, Math.max(4, 5 * viewport.zoom));
        ctx.fill();
        ctx.strokeStyle = '#9ebf7c';
        ctx.lineWidth = Math.max(1, 1.2 * viewport.zoom);
        ctx.stroke();

        // Central Stone Water Pool / Fountain
        const poolSize = Math.max(6, 8 * viewport.zoom);
        ctx.fillStyle = '#bae6fd';
        ctx.beginPath();
        ctx.arc(sPos.x, sPos.y, poolSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#e2d5be';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Lush Trees & Blooming Red Gulmohars
        if (b.trees && viewport.zoom >= 0.35) {
          for (const t of b.trees) {
            const tx = sPos.x + t.x * viewport.zoom;
            const ty = sPos.y + t.y * viewport.zoom;
            const tr = t.r * viewport.zoom;

            // Tree Drop Shadow
            ctx.fillStyle = 'rgba(50, 40, 20, 0.2)';
            ctx.beginPath();
            ctx.arc(tx + 2, ty + 2.5, tr, 0, Math.PI * 2);
            ctx.fill();

            // Tree Foliage
            ctx.fillStyle = '#2d7a3a';
            ctx.beginPath();
            ctx.arc(tx, ty, tr, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#42a14f';
            ctx.beginPath();
            ctx.arc(tx - tr * 0.2, ty - tr * 0.2, tr * 0.65, 0, Math.PI * 2);
            ctx.fill();

            // Red Gulmohar Blossom Accents
            if (t.hasGulmohar && tr > 3.5) {
              ctx.fillStyle = '#ea580c';
              ctx.beginPath();
              ctx.arc(tx + tr * 0.25, ty + tr * 0.2, tr * 0.35, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      } else {
        // --- 2.5D EXTRUDED ARCHITECTURAL GEOMETRY ---
        // Extrusion Vector: Roof shifts upward/northwest to create isometric depth
        const offX = -sh * 0.22;
        const offY = -sh * 0.70;

        // Ground Base Coordinates
        const BL = { x: sPos.x - sw / 2, y: sPos.y + sd / 2 };
        const BR = { x: sPos.x + sw / 2, y: sPos.y + sd / 2 };
        const TR = { x: sPos.x + sw / 2, y: sPos.y - sd / 2 };
        const TL = { x: sPos.x - sw / 2, y: sPos.y - sd / 2 };

        // Sunlit Roof Coordinates (Elevated in 3D)
        const R_BL = { x: BL.x + offX, y: BL.y + offY };
        const R_BR = { x: BR.x + offX, y: BR.y + offY };
        const R_TR = { x: TR.x + offX, y: TR.y + offY };
        const R_TL = { x: TL.x + offX, y: TL.y + offY };

        // 1. Directional Ground Shadow (Cast South-East)
        const shX = sh * 0.42;
        const shY = sh * 0.32;
        ctx.fillStyle = 'rgba(60, 42, 28, 0.18)';
        ctx.beginPath();
        ctx.moveTo(BL.x, BL.y);
        ctx.lineTo(BL.x + shX, BL.y + shY);
        ctx.lineTo(BR.x + shX, BR.y + shY);
        ctx.lineTo(TR.x + shX, TR.y + shY);
        ctx.lineTo(TR.x, TR.y);
        ctx.closePath();
        ctx.fill();

        // 2. Shaded East Wall (Shadow-facing facade)
        ctx.fillStyle = b.sideColor;
        ctx.beginPath();
        ctx.moveTo(BR.x, BR.y);
        ctx.lineTo(TR.x, TR.y);
        ctx.lineTo(R_TR.x, R_TR.y);
        ctx.lineTo(R_BR.x, R_BR.y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // 3. South / Front Wall (Ambient sunlit facade)
        ctx.fillStyle = b.wallColor;
        ctx.beginPath();
        ctx.moveTo(BL.x, BL.y);
        ctx.lineTo(BR.x, BR.y);
        ctx.lineTo(R_BR.x, R_BR.y);
        ctx.lineTo(R_BL.x, R_BL.y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // Rajasthani Arched Jharokha Windows on Front Wall
        if (sw > 22 && sh > 10 && viewport.zoom >= 0.5) {
          const winCount = Math.min(4, Math.max(2, Math.floor(sw / 14)));
          const winSpacing = sw / (winCount + 1);
          for (let wi = 1; wi <= winCount; wi++) {
            const wx = BL.x + wi * winSpacing;
            const wy = BL.y + offY * 0.45;
            const ww = Math.max(3, 4 * viewport.zoom);
            const wh = Math.max(4, 6 * viewport.zoom);

            // White sandstone window frame
            ctx.fillStyle = '#fdf6ee';
            ctx.fillRect(wx - ww / 2 - 0.6, wy - wh / 2 - 0.6, ww + 1.2, wh + 1.2);
            // Dark arched niche
            ctx.fillStyle = '#2e150d';
            ctx.fillRect(wx - ww / 2, wy - wh / 2, ww, wh);
          }
        }

        // 4. Sunlit Roof Terrace Surface
        ctx.fillStyle = b.roofColor;
        ctx.beginPath();
        ctx.moveTo(R_TL.x, R_TL.y);
        ctx.lineTo(R_TR.x, R_TR.y);
        ctx.lineTo(R_BR.x, R_BR.y);
        ctx.lineTo(R_BL.x, R_BL.y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Rooftop Inset Parapet
        const pInset = Math.max(1.5, 2 * viewport.zoom);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(
          R_TL.x + pInset - offX * 0.1, 
          R_TL.y + pInset, 
          sw - pInset * 2, 
          sd - pInset * 2
        );

        // Central Haveli Courtyard Cutout
        if (b.hasCourtyard && sw > 28 && sd > 20) {
          const cw = sw * 0.35;
          const cd = sd * 0.35;
          const cx = (R_TL.x + R_BR.x) / 2;
          const cy = (R_TL.y + R_BR.y) / 2;
          ctx.fillStyle = '#7a3124'; // shaded internal courtyard
          ctx.fillRect(cx - cw / 2, cy - cd / 2, cw, cd);
          ctx.strokeStyle = '#fef3e7';
          ctx.lineWidth = 0.8;
          ctx.strokeRect(cx - cw / 2, cy - cd / 2, cw, cd);
        }

        // Traditional Rajasthani Rooftop Chhatri (Pavilion Dome)
        if (b.hasChhatri && sw > 22 && viewport.zoom >= 0.45) {
          const chX = R_TL.x + sw * 0.78;
          const chY = R_TL.y + sd * 0.25;
          const chR = Math.max(3.5, 4.5 * viewport.zoom);

          // Chhatri Shadow
          ctx.fillStyle = 'rgba(50, 40, 20, 0.25)';
          ctx.beginPath();
          ctx.arc(chX + 1.5, chY + 2, chR, 0, Math.PI * 2);
          ctx.fill();

          // Saffron / Mustard Chhatri Dome
          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          ctx.arc(chX, chY, chR, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#fef3c7';
          ctx.lineWidth = 0.8;
          ctx.stroke();

          // Finial point
          ctx.fillStyle = '#b45309';
          ctx.fillRect(chX - 0.6, chY - chR - 2, 1.2, 2.5);
        }

        // Sintex Water Tank
        if (b.hasWaterTank && sw > 18 && viewport.zoom >= 0.5) {
          const wtX = R_TL.x + sw * 0.22;
          const wtY = R_TL.y + sd * 0.72;
          const wtR = Math.max(2.5, 3.2 * viewport.zoom);

          ctx.fillStyle = '#1e3a5f'; // classic navy water tank
          ctx.beginPath();
          ctx.arc(wtX, wtY, wtR, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }

        // Roadside Trees near building
        if (b.trees && viewport.zoom >= 0.45) {
          for (const t of b.trees) {
            const tx = sPos.x + t.x * viewport.zoom;
            const ty = sPos.y + t.y * viewport.zoom;
            const tr = t.r * viewport.zoom;

            ctx.fillStyle = 'rgba(50, 40, 20, 0.18)';
            ctx.beginPath();
            ctx.arc(tx + 2, ty + 2.5, tr, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#2d7a3a';
            ctx.beginPath();
            ctx.arc(tx, ty, tr, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#42a14f';
            ctx.beginPath();
            ctx.arc(tx - tr * 0.2, ty - tr * 0.2, tr * 0.65, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
    ctx.restore();
  };

  // 3. Concrete Curb Shoulder Base with Unified 2.5D Drop Shadow
  const drawRoadCurbsAndBase = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.save();
    // Unified roadbed elevation shadow
    ctx.shadowColor = 'rgba(50, 38, 25, 0.22)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = '#cbd5e1'; // light concrete curb gray
    ctx.lineCap = 'butt';

    // 1. Draw curb junction base plates ONLY for multi-way intersections (degree >= 2)
    // Terminal/boundary nodes (degree <= 1) are skipped so the road curb terminates squarely with zero rounded cap!
    for (const node of nodes) {
      const connectingEdges = edges.filter((e) => e.fromNodeId === node.id || e.toNodeId === node.id);
      if (connectingEdges.length <= 1) continue;

      const pos = worldToScreen(node.x, node.y, width, height);
      const maxLanes = connectingEdges.reduce((max, e) => Math.max(max, e.lanes), 1);
      const laneWidthPx = Math.max(14, 4.0 * viewport.zoom * 3.2);
      const maxRoadWidthPx = maxLanes * laneWidthPx;
      const shoulderPx = Math.max(3, 3.5 * viewport.zoom);
      const curbBoxSize = maxRoadWidthPx + shoulderPx * 2;

      // Flat rectangular curb junction box (NO circular arcs!)
      ctx.fillRect(pos.x - curbBoxSize / 2, pos.y - curbBoxSize / 2, curbBoxSize, curbBoxSize);
    }

    // 2. Draw road curb strips as rectangular polygons with lineCap = 'butt'
    for (const edge of edges) {
      const fromNode = nodes.find((n) => n.id === edge.fromNodeId);
      const toNode = nodes.find((n) => n.id === edge.toNodeId);
      if (!fromNode || !toNode) continue;

      const p1 = worldToScreen(fromNode.x, fromNode.y, width, height);
      const p2 = worldToScreen(toNode.x, toNode.y, width, height);

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const angle = Math.atan2(dy, dx);
      const roadLengthPx = Math.hypot(dx, dy);

      const laneWidthPx = Math.max(14, 4.0 * viewport.zoom * 3.2);
      const roadWidthPx = edge.lanes * laneWidthPx;
      const shoulderPx = Math.max(3, 3.5 * viewport.zoom);
      const totalWidthPx = roadWidthPx + shoulderPx * 2;

      ctx.save();
      ctx.translate(p1.x, p1.y);
      ctx.rotate(angle);
      // Flat rectangular polygon with square ends
      ctx.fillRect(0, -totalWidthPx / 2, roadLengthPx, totalWidthPx);
      ctx.restore();
    }

    ctx.restore();
  };

  // 4. Unified Matte Charcoal Asphalt (#334155) Surface Fusion
  // Draws all road segment rectangular asphalt polygons first, then intersection junction polygons over them
  // with the EXACT same fill color (#334155) and NO borders/strokes to visually fuse into one unbroken paved surface.
  const drawUnifiedAsphaltSurface = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.save();
    ctx.fillStyle = '#334155'; // Strict uniform asphalt color across all road segments & intersections

    // Step A: Draw all road segment rectangular asphalt polygons
    for (const edge of edges) {
      const fromNode = nodes.find((n) => n.id === edge.fromNodeId);
      const toNode = nodes.find((n) => n.id === edge.toNodeId);
      if (!fromNode || !toNode) continue;

      const p1 = worldToScreen(fromNode.x, fromNode.y, width, height);
      const p2 = worldToScreen(toNode.x, toNode.y, width, height);

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const angle = Math.atan2(dy, dx);
      const roadLengthPx = Math.hypot(dx, dy);

      const laneWidthPx = Math.max(14, 4.0 * viewport.zoom * 3.2);
      const roadWidthPx = edge.lanes * laneWidthPx;

      ctx.save();
      ctx.translate(p1.x, p1.y);
      ctx.rotate(angle);
      // Flat rectangular asphalt polygon (NO borders, NO strokes)
      ctx.fillRect(0, -roadWidthPx / 2, roadLengthPx, roadWidthPx);
      ctx.restore();
    }

    // Step B: Draw intersection junction polygons over the road segments with the EXACT same fill and NO borders/strokes
    for (const node of nodes) {
      const connectingEdges = edges.filter((e) => e.fromNodeId === node.id || e.toNodeId === node.id);
      // Boundary/terminal nodes (degree <= 1): skipped completely so roads terminate squarely!
      if (connectingEdges.length <= 1) continue;

      const pos = worldToScreen(node.x, node.y, width, height);
      const maxLanes = connectingEdges.reduce((max, e) => Math.max(max, e.lanes), 1);
      const laneWidthPx = Math.max(14, 4.0 * viewport.zoom * 3.2);
      const boxSize = maxLanes * laneWidthPx;

      // Flat rectangular asphalt junction box (NO circular arcs, NO borders/strokes)
      ctx.fillRect(pos.x - boxSize / 2, pos.y - boxSize / 2, boxSize, boxSize);
    }

    ctx.restore();
  };

  // 5. Road Surface Markings: Outer White Curbs, Dashed Lane Dividers & Directional Flow Chevrons
  const drawRoadSurfaceMarkings = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.save();
    ctx.lineCap = 'butt';

    for (const edge of edges) {
      const fromNode = nodes.find((n) => n.id === edge.fromNodeId);
      const toNode = nodes.find((n) => n.id === edge.toNodeId);
      if (!fromNode || !toNode) continue;

      const p1 = worldToScreen(fromNode.x, fromNode.y, width, height);
      const p2 = worldToScreen(toNode.x, toNode.y, width, height);

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const angle = Math.atan2(dy, dx);
      const roadLengthPx = Math.hypot(dx, dy);

      const laneWidthPx = Math.max(14, 4.0 * viewport.zoom * 3.2);
      const roadWidthPx = edge.lanes * laneWidthPx;

      // Calculate junction clearance so markings stop cleanly at intersection boundaries
      const fromConnecting = edges.filter((e) => e.fromNodeId === edge.fromNodeId || e.toNodeId === edge.fromNodeId);
      const toConnecting = edges.filter((e) => e.fromNodeId === edge.toNodeId || e.toNodeId === edge.toNodeId);

      const fromIsIntersection = fromConnecting.length >= 2;
      const toIsIntersection = toConnecting.length >= 2;

      const fromMaxLanes = fromConnecting.reduce((max, e) => Math.max(max, e.lanes), 1);
      const toMaxLanes = toConnecting.reduce((max, e) => Math.max(max, e.lanes), 1);

      const fromBoxSize = fromIsIntersection ? fromMaxLanes * laneWidthPx : 0;
      const toBoxSize = toIsIntersection ? toMaxLanes * laneWidthPx : 0;

      const startX = fromIsIntersection ? fromBoxSize / 2 : 0;
      const endX = toIsIntersection ? Math.max(startX + 8, roadLengthPx - toBoxSize / 2) : roadLengthPx;

      const isSelected = selection?.type === 'edge' && selection.id === edge.id;
      const isHovered = hoveredEdgeId === edge.id;

      ctx.save();
      ctx.translate(p1.x, p1.y);
      ctx.rotate(angle);

      // Selection / Hover Highlight (in Map Editor)
      if (isSelected) {
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 3;
        ctx.strokeRect(-2, -roadWidthPx / 2 - 2, roadLengthPx + 4, roadWidthPx + 4);
      } else if (isHovered) {
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 2;
        ctx.strokeRect(-1, -roadWidthPx / 2 - 1, roadLengthPx + 2, roadWidthPx + 2);
      }

      // Solid White Outer Curb Margin Lines (stop at junction boundaries, lineCap = 'butt')
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.5, 1.8 * viewport.zoom);
      ctx.beginPath();
      ctx.moveTo(startX, -roadWidthPx / 2);
      ctx.lineTo(endX, -roadWidthPx / 2);
      ctx.moveTo(startX, roadWidthPx / 2);
      ctx.lineTo(endX, roadWidthPx / 2);
      ctx.stroke();

      // Bright White Dashed Lane Dividers
      if (edge.lanes > 1) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1.2, 1.5 * viewport.zoom);
        ctx.setLineDash([12, 10]);
        for (let l = 1; l < edge.lanes; l++) {
          const laneY = -roadWidthPx / 2 + l * laneWidthPx;
          ctx.beginPath();
          ctx.moveTo(startX + 4, laneY);
          ctx.lineTo(endX - 4, laneY);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }

      // Directional Flow Chevrons / Highway Arrows
      if (endX - startX > 30) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        const arrowSpacing = Math.max(65, 50 * viewport.zoom * 2.2);
        const aL = Math.max(8, 7 * viewport.zoom);
        const aW = Math.max(5, 4 * viewport.zoom);

        for (let l = 0; l < edge.lanes; l++) {
          const laneCenterY = -roadWidthPx / 2 + (l + 0.5) * laneWidthPx;
          for (let dist = startX + arrowSpacing * 0.6; dist < endX - 12; dist += arrowSpacing) {
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

      // Closed Road Hazard Striping & Barricade Badge
      if (edge.isClosed) {
        ctx.save();
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        ctx.beginPath();
        ctx.moveTo(startX, -roadWidthPx / 2);
        ctx.lineTo(endX, roadWidthPx / 2);
        ctx.moveTo(startX, roadWidthPx / 2);
        ctx.lineTo(endX, -roadWidthPx / 2);
        ctx.stroke();

        const badgeW = Math.max(74, 64 * viewport.zoom);
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

  // 6. Intersection Markings: Yellow Keep-Clear Cross-Hatch Box & Editor Overlays
  const drawIntersectionMarkings = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.save();
    ctx.lineCap = 'butt';

    for (const node of nodes) {
      const pos = worldToScreen(node.x, node.y, width, height);
      const isSelected = selection?.type === 'node' && selection.id === node.id;
      const isHovered = hoveredNodeId === node.id;
      const isEdgeStart = edgeStartNodeId === node.id;

      const connectingEdges = edges.filter((e) => e.fromNodeId === node.id || e.toNodeId === node.id);
      const maxLanes = connectingEdges.reduce((max, e) => Math.max(max, e.lanes), 1);
      const laneWidthPx = Math.max(14, 4.0 * viewport.zoom * 3.2);
      const boxSize = maxLanes * laneWidthPx;

      // Yellow "Keep Clear" Box Junction Cross-Hatch Markings (ONLY on multi-way junctions)
      const isSignalized = node.controlType === 'fixed_signal' || node.controlType === 'adaptive_signal';
      if (connectingEdges.length >= 2 && (isSignalized || connectingEdges.length >= 3)) {
        ctx.save();
        // Yellow perimeter box
        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = Math.max(1.5, 1.8 * viewport.zoom);
        ctx.strokeRect(pos.x - boxSize / 2, pos.y - boxSize / 2, boxSize, boxSize);

        // Yellow diagonal cross-hatch grid inside junction box
        ctx.strokeStyle = 'rgba(234, 179, 8, 0.85)';
        ctx.lineWidth = Math.max(1.2, 1.4 * viewport.zoom);
        ctx.beginPath();
        // Diagonal 1: Top-Left to Bottom-Right
        ctx.moveTo(pos.x - boxSize / 2, pos.y - boxSize / 2);
        ctx.lineTo(pos.x + boxSize / 2, pos.y + boxSize / 2);
        // Diagonal 2: Bottom-Left to Top-Right
        ctx.moveTo(pos.x - boxSize / 2, pos.y + boxSize / 2);
        ctx.lineTo(pos.x + boxSize / 2, pos.y - boxSize / 2);

        // Additional diagonal grid lines for multi-lane junctions
        if (boxSize > 35) {
          ctx.moveTo(pos.x - boxSize / 4, pos.y - boxSize / 2);
          ctx.lineTo(pos.x + boxSize / 2, pos.y + boxSize / 4);
          ctx.moveTo(pos.x - boxSize / 2, pos.y - boxSize / 4);
          ctx.lineTo(pos.x + boxSize / 4, pos.y + boxSize / 2);

          ctx.moveTo(pos.x + boxSize / 4, pos.y - boxSize / 2);
          ctx.lineTo(pos.x - boxSize / 2, pos.y + boxSize / 4);
          ctx.moveTo(pos.x + boxSize / 2, pos.y - boxSize / 4);
          ctx.lineTo(pos.x - boxSize / 4, pos.y + boxSize / 2);
        }
        ctx.stroke();
        ctx.restore();
      }

      // Editor-Only Interactive Selection / Hover Target Brackets
      if (activeMode === 'editor') {
        const markerRadius = Math.max(14, boxSize / 2);

        if (isSelected || isEdgeStart) {
          // Technical corner brackets [ ] in emerald
          const bSize = markerRadius + 6;
          const cornerLen = 8;
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 2.5;

          ctx.beginPath();
          // Top-Left
          ctx.moveTo(pos.x - bSize, pos.y - bSize + cornerLen);
          ctx.lineTo(pos.x - bSize, pos.y - bSize);
          ctx.lineTo(pos.x - bSize + cornerLen, pos.y - bSize);
          // Top-Right
          ctx.moveTo(pos.x + bSize - cornerLen, pos.y - bSize);
          ctx.lineTo(pos.x + bSize, pos.y - bSize);
          ctx.lineTo(pos.x + bSize, pos.y - bSize + cornerLen);
          // Bottom-Left
          ctx.moveTo(pos.x - bSize, pos.y + bSize - cornerLen);
          ctx.lineTo(pos.x - bSize, pos.y + bSize);
          ctx.lineTo(pos.x - bSize + cornerLen, pos.y + bSize);
          // Bottom-Right
          ctx.moveTo(pos.x + bSize - cornerLen, pos.y + bSize);
          ctx.lineTo(pos.x + bSize, pos.y + bSize);
          ctx.lineTo(pos.x + bSize, pos.y + bSize - cornerLen);
          ctx.stroke();
        } else if (isHovered) {
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, markerRadius + 4, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(2, 132, 199, 0.15)';
          ctx.fill();
        }

        // Center control type dot (only visible in editor mode)
        const centerBadgeRadius = Math.max(4.5, 5 * viewport.zoom);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, centerBadgeRadius, 0, Math.PI * 2);
        if (node.controlType === 'fixed_signal') {
          ctx.fillStyle = '#0284c7';
        } else if (node.controlType === 'adaptive_signal') {
          ctx.fillStyle = '#059669';
        } else {
          ctx.fillStyle = '#64748b';
        }
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Node ID Typography in editor mode
        if (viewport.zoom >= 0.7) {
          ctx.fillStyle = '#475569';
          ctx.font = '600 10px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(node.id, pos.x, pos.y + markerRadius + 14);
        }
      }
    }

    ctx.restore();
  };

  // 6. Rubberband Connection Line for Draw Edge Tool
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

  // 7. Traffic Signals, Stop Lines, and Zebra Crossings
  const drawTrafficSignals = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (!simulationFrame || !simulationFrame.signals) return;

    ctx.save();
    for (const sig of simulationFrame.signals) {
      const edge = edges.find((e) => e.id === sig.edgeId);
      if (!edge) continue;

      const targetNode = nodes.find((n) => n.id === edge.toNodeId);
      const fromNode = nodes.find((n) => n.id === edge.fromNodeId);
      if (!targetNode || !fromNode) continue;

      if (targetNode.controlType !== 'fixed_signal' && targetNode.controlType !== 'adaptive_signal') {
        continue;
      }

      const dx = targetNode.x - fromNode.x;
      const dy = targetNode.y - fromNode.y;
      const length = Math.hypot(dx, dy);
      if (length <= 0) continue;

      const unitX = dx / length;
      const unitY = dy / length;

      // Stop distance: Position stop bar 14m before node center
      const stopDistance = Math.max(10, length - 14);
      const stopWorldX = fromNode.x + unitX * stopDistance;
      const stopWorldY = fromNode.y + unitY * stopDistance;

      const normalX = -unitY;
      const normalY = unitX;
      const roadWidthHalfMeters = (edge.lanes * 4.0) / 2;

      // Solid White Stop Line
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
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(stopP1.x, stopP1.y);
      ctx.lineTo(stopP2.x, stopP2.y);
      ctx.stroke();

      // Pedestrian Zebra Crosswalk Markings
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
      ctx.lineCap = 'butt';
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(zebraP1.x, zebraP1.y);
      ctx.lineTo(zebraP2.x, zebraP2.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // 3-Aspect Traffic Signal Head on Roadside
      const roadsideDistMeters = roadWidthHalfMeters + 4.5;
      const finalSigWorldX = stopWorldX + normalX * roadsideDistMeters;
      const finalSigWorldY = stopWorldY + normalY * roadsideDistMeters;
      const p = worldToScreen(finalSigWorldX, finalSigWorldY, width, height);

      const bulbR = Math.max(4, 4.5 * viewport.zoom);
      const headW = bulbR * 2.4;
      const headH = bulbR * 6.5;

      ctx.save();
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 1.2;
      ctx.fillRect(p.x - headW / 2, p.y - headH / 2, headW, headH);
      ctx.strokeRect(p.x - headW / 2, p.y - headH / 2, headW, headH);

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

  // 8. Polished Vehicle Sprites: Cars, Indian Auto-Rickshaws, City Buses with High-Fidelity Details
  const drawVehicles = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (!simulationFrame) return;

    ctx.save();
    for (const v of simulationFrame.vehicles) {
      const pos = worldToScreen(v.x, v.y, width, height);

      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(v.angle);

      const hash = hashVehicleId(v.id);
      const isAutoRickshaw = hash % 10 < 2; // 20% iconic Indian Auto-Rickshaws
      const isCityBus = hash % 10 === 2;    // 10% City transit buses
      const isCar = !isAutoRickshaw && !isCityBus; // 70% Passenger cars / SUVs

      const isBraking = v.velocity < 1.0;

      if (isAutoRickshaw) {
        // --- AUTO-RICKSHAW (TUK-TUK) ---
        const rLen = Math.max(15, 12 * viewport.zoom);
        const rWid = Math.max(9, 7.5 * viewport.zoom);

        // Directional Drop Shadow
        ctx.fillStyle = 'rgba(50, 40, 25, 0.28)';
        ctx.beginPath();
        ctx.roundRect(-rLen / 2 + 1.5, -rWid / 2 + 2, rLen, rWid, 2);
        ctx.fill();

        // Green Lower Chassis (#15803d)
        ctx.fillStyle = '#15803d';
        ctx.beginPath();
        ctx.roundRect(-rLen / 2, -rWid / 2, rLen, rWid, 2);
        ctx.fill();

        // Tapered Front Nose
        ctx.fillStyle = '#166534';
        ctx.beginPath();
        ctx.moveTo(rLen / 2 - 2, -rWid / 2);
        ctx.lineTo(rLen / 2 + 2, 0);
        ctx.lineTo(rLen / 2 - 2, rWid / 2);
        ctx.closePath();
        ctx.fill();

        // Yellow Canvas Canopy Roof (#eab308)
        ctx.fillStyle = '#eab308';
        ctx.beginPath();
        ctx.roundRect(-rLen / 2 + 2, -rWid / 2 + 1, rLen * 0.7, rWid - 2, 1.5);
        ctx.fill();

        // Front Windshield Glass
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(rLen * 0.15, -rWid * 0.35, 1.5, rWid * 0.7);

        // Single Centered Front Headlight
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(rLen / 2 + 1, -1, 2, 2);
        // Light Beam
        ctx.fillStyle = 'rgba(254, 240, 138, 0.18)';
        ctx.beginPath();
        ctx.moveTo(rLen / 2 + 2, -1);
        ctx.lineTo(rLen / 2 + 14, -5);
        ctx.lineTo(rLen / 2 + 14, 5);
        ctx.lineTo(rLen / 2 + 2, 1);
        ctx.closePath();
        ctx.fill();

        // Rear Taillights
        ctx.fillStyle = isBraking ? '#ef4444' : '#991b1b';
        if (isBraking) {
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 7;
        }
        ctx.fillRect(-rLen / 2, -rWid / 2 + 1, 1.5, 2);
        ctx.fillRect(-rLen / 2, rWid / 2 - 3, 1.5, 2);
        ctx.shadowBlur = 0;

      } else if (isCityBus) {
        // --- CITY TRANSIT BUS ---
        const bLen = Math.max(34, 28 * viewport.zoom);
        const bWid = Math.max(12, 10 * viewport.zoom);

        // Directional Drop Shadow
        ctx.fillStyle = 'rgba(50, 40, 25, 0.3)';
        ctx.beginPath();
        ctx.roundRect(-bLen / 2 + 2, -bWid / 2 + 2.5, bLen, bWid, 3);
        ctx.fill();

        // Transit Body (Red / Blue / Cream)
        const busColor = hash % 2 === 0 ? '#dc2626' : '#2563eb';
        ctx.fillStyle = busColor;
        ctx.beginPath();
        ctx.roundRect(-bLen / 2, -bWid / 2, bLen, bWid, 3);
        ctx.fill();

        // White Roof Panel with Air Conditioning Hatch
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(-bLen * 0.38, -bWid * 0.35, bLen * 0.65, bWid * 0.7);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(-bLen * 0.1, -bWid * 0.25, bLen * 0.2, bWid * 0.5);

        // Front Curved Panoramic Windshield
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(bLen / 2 - 4, -bWid * 0.42, 3, bWid * 0.84);
        // Specular Windshield Reflection Streak
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bLen / 2 - 3, -bWid * 0.3);
        ctx.lineTo(bLen / 2 - 2, bWid * 0.2);
        ctx.stroke();

        // Rear Glass
        ctx.fillRect(-bLen / 2 + 1, -bWid * 0.38, 2, bWid * 0.76);

        // Headlights
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(bLen / 2 - 1, -bWid / 2 + 1.5, 2, 2.5);
        ctx.fillRect(bLen / 2 - 1, bWid / 2 - 4, 2, 2.5);

        // Illuminated Forward Headlight Beams
        ctx.fillStyle = 'rgba(254, 240, 138, 0.15)';
        ctx.beginPath();
        ctx.moveTo(bLen / 2, -bWid / 2 + 1.5);
        ctx.lineTo(bLen / 2 + 18, -bWid / 2 - 6);
        ctx.lineTo(bLen / 2 + 18, bWid / 2 + 6);
        ctx.lineTo(bLen / 2, bWid / 2 - 4);
        ctx.closePath();
        ctx.fill();

        // Glowing Brake Lights
        ctx.fillStyle = isBraking ? '#ef4444' : '#991b1b';
        if (isBraking) {
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 9;
        }
        ctx.fillRect(-bLen / 2, -bWid / 2 + 1, 2, 3);
        ctx.fillRect(-bLen / 2, bWid / 2 - 4, 2, 3);
        ctx.shadowBlur = 0;

      } else {
        // --- PASSENGER SEDAN / COMPACT SUV ---
        const carLen = Math.max(19, 15 * viewport.zoom);
        const carWid = Math.max(9.5, 7.5 * viewport.zoom);

        // Directional Drop Shadow
        ctx.fillStyle = 'rgba(50, 40, 25, 0.28)';
        ctx.beginPath();
        ctx.roundRect(-carLen / 2 + 1.8, -carWid / 2 + 2.2, carLen, carWid, 2.5);
        ctx.fill();

        // Vibrant Metallic Paint Coat
        const bodyColor = VIBRANT_CAR_PALETTE[hash % VIBRANT_CAR_PALETTE.length];
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.roundRect(-carLen / 2, -carWid / 2, carLen, carWid, 2.5);
        ctx.fill();

        // Metallic Body Specular Highlight Rim
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // Front Bonnet / Hood Panel
        ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
        ctx.fillRect(carLen * 0.18, -carWid * 0.4, carLen * 0.28, carWid * 0.8);

        // Curved Dark Tinted Windshield
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.roundRect(carLen * 0.05, -carWid * 0.38, carLen * 0.22, carWid * 0.76, 1);
        ctx.fill();

        // Windshield Specular Reflection
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(carLen * 0.16, -carWid * 0.25);
        ctx.lineTo(carLen * 0.24, carWid * 0.2);
        ctx.stroke();

        // Roof Panel
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.roundRect(-carLen * 0.22, -carWid * 0.34, carLen * 0.35, carWid * 0.68, 1);
        ctx.fill();

        // Rear Window Glass
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(-carLen * 0.38, -carWid * 0.35, carLen * 0.15, carWid * 0.7);

        // Side Mirrors
        ctx.fillStyle = bodyColor;
        ctx.fillRect(carLen * 0.16, -carWid / 2 - 1.2, 1.8, 1.2);
        ctx.fillRect(carLen * 0.16, carWid / 2, 1.8, 1.2);

        // Dual Front Headlights
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(carLen / 2 - 1.5, -carWid / 2 + 1, 2, 2.2);
        ctx.fillRect(carLen / 2 - 1.5, carWid / 2 - 3.2, 2, 2.2);

        // Headlight Beams
        ctx.fillStyle = 'rgba(254, 240, 138, 0.16)';
        ctx.beginPath();
        ctx.moveTo(carLen / 2, -carWid / 2 + 1);
        ctx.lineTo(carLen / 2 + 14, -carWid / 2 - 5);
        ctx.lineTo(carLen / 2 + 14, carWid / 2 + 5);
        ctx.lineTo(carLen / 2, carWid / 2 - 3.2);
        ctx.closePath();
        ctx.fill();

        // Rear Taillights & Dynamic Brake Lights
        ctx.fillStyle = isBraking ? '#ef4444' : '#991b1b';
        if (isBraking) {
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 8;
        }
        ctx.fillRect(-carLen / 2, -carWid / 2 + 1, 2, 2.2);
        ctx.fillRect(-carLen / 2, carWid / 2 - 3.2, 2, 2.2);
        ctx.shadowBlur = 0;
      }

      ctx.restore();
    }
    ctx.restore();
  };

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

  // --- MOUSE & WHEEL INTERACTION HANDLERS ---

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const worldPos = screenToWorld(sx, sy, canvas.width, canvas.height);

    if (e.button === 1 || currentTool === 'pan' || e.altKey || isSpacePressed) {
      setIsPanning(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }

    if (e.button !== 0) return;

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

  // Native non-passive event listeners for wheel zoom and touch interactions.
  // Directly resolves "Unable to preventDefault inside passive event listener invocation" console errors.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      setViewport((prev) => ({
        ...prev,
        zoom: Math.max(0.2, Math.min(4.0, prev.zoom * zoomFactor)),
      }));
    };

    let touchStartDist = 0;
    let touchStartZoom = 1;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        touchStartDist = Math.hypot(dx, dy);
        touchStartZoom = viewport.zoom;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && touchStartDist > 0) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const factor = dist / touchStartDist;
        setViewport((prev) => ({
          ...prev,
          zoom: Math.max(0.2, Math.min(4.0, touchStartZoom * factor)),
        }));
      }
    };

    canvas.addEventListener('wheel', handleNativeWheel, { passive: false });
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      canvas.removeEventListener('wheel', handleNativeWheel);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
    };
  }, [viewport.zoom, setViewport]);

  return (
    <div className="relative w-full h-full flex-1 overflow-hidden bg-amber-50/20">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
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
