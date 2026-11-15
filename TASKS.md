# CitySim – Implementation Tasks & Milestones

This checklist tracks the stage-wise progress of the **CitySim: Traffic Scenario Testing Platform**. Tasks are marked with ✅ when completed and ⬜ when pending.

---

## Stage 1: Engine Core & Single Road/Intersection
- ✅ 1.1 Set up deterministic Seeded Pseudo-Random Number Generator (Mulberry32/PCG).
- ✅ 1.2 Define core entity interfaces: `Vehicle`, `RoadSegment`, `Lane`, `IntersectionNode`.
- ✅ 1.3 Implement continuous-space car-following dynamics (Intelligent Driver Model - IDM / Gipps simplified rule).
- ✅ 1.4 Implement vehicle acceleration, deceleration, safety headway, and maximum velocity constraints.
- ✅ 1.5 Implement single road-segment discrete time-step tick simulation (`deltaT = 0.1s` or `0.2s`).
- ✅ 1.6 Implement intersection boundary check (stopping at stop lines / intersection boundaries).
- ✅ 1.7 Add unit tests for vehicle acceleration, following distance maintenance, and stop-line halting.
- ✅ 1.8 Stage 1 verification walkthrough and CLI test runner.

---

## Stage 2: Road Network Graph & Routing
- ✅ 2.1 Implement Directed Graph data structure (`Graph`, `Node`, `Edge`).
- ✅ 2.2 Support multi-lane segments, road lengths, speed limits, and directional edges (one-way vs two-way).
- ✅ 2.3 Implement Dijkstra's algorithm for shortest-path calculation based on distance and travel time.
- ✅ 2.4 Implement A* search algorithm using Euclidean distance heuristic for efficient grid routing.
- ✅ 2.5 Implement multi-edge vehicle path following (transitioning across nodes to successor edges).
- ✅ 2.6 Handle lane-changing logic or lane assignment within multi-lane edges.
- ✅ 2.7 Add unit tests for network graph construction, disconnected components, and Dijkstra / A* route correctness.
- ✅ 2.8 Stage 2 verification demo script.

---

## Stage 3: Traffic Signals & Scheduling
- ✅ 3.1 Define Signal state machine: `GREEN`, `YELLOW`, `RED`, `ALL_RED_CLEARANCE`.
- ✅ 3.2 Implement Fixed-Time Phase Controller with configurable cycle times, green splits, and amber durations.
- ✅ 3.3 Implement Adaptive Queue-Responsive Signal Controller (green-time extension based on incoming lane queue lengths and minimum/maximum green bounds).
- ✅ 3.4 Integrate signal phase state with vehicle stopping behavior (right-of-way check at stop line).
- ✅ 3.5 Prevent vehicle gridlock and conflict point collisions inside intersection boxes.
- ✅ 3.6 Add unit tests for signal phase cycles, clearance intervals, and adaptive timing extensions under asymmetrical loads.
- ✅ 3.7 Stage 3 verification demo script.

---

## Stage 4: Traffic Generation & Performance Metrics
- ✅ 4.1 Implement Poisson Arrival Generator for synthetic vehicle injection based on arrival rate ($\lambda$ vehicles/hour).
- ✅ 4.2 Support Origin-Destination (O-D) matrix for trip distribution across boundary nodes.
- ✅ 4.3 Implement vehicle lifecycle tracker: spawn, in-transit, stopped/delayed, arrival at destination.
- ✅ 4.4 Implement real-time metrics collector:
  - Average travel time (seconds)
  - Average stopped delay / wait time (seconds)
  - Total network throughput (vehicles completed / simulated hour)
  - Maximum & average queue length per intersection approach
  - Road segment congestion index / volume-to-capacity ratio (for heatmaps)
- ✅ 4.5 Add unit tests for metrics math, Poisson distribution sampling accuracy, and throughput conservation.
- ✅ 4.6 Stage 4 verification demo script.

---

## Stage 5: Backend API, Socket.IO & Persistence
- ✅ 5.1 Initialize Node.js Express server with TypeScript / ES Modules.
- ✅ 5.2 Set up MongoDB connection via Mongoose with resilient fallback / memory fallback mode for offline testing.
- ✅ 5.3 Implement Mongoose Schemas:
  - `MapSchema`: name, description, nodes, edges, bounds, metadata.
  - `ScenarioSchema`: baseMapId, name, modifications (closed roads, signal overrides, demand scale), seed.
  - `RunSchema`: scenarioId, seed, config, aggregateMetrics, timeSeriesMetrics, status, timestamps.
- ✅ 5.4 Create REST endpoints:
  - `CRUD /api/maps`
  - `CRUD /api/scenarios`
  - `POST /api/simulations/run` (execute headless simulation with fixed seed and return complete report)
  - `GET /api/simulations/runs/:id`
- ✅ 5.5 Set up Socket.IO server for streaming live simulation frames to connected frontends.
- ✅ 5.6 Implement input validation, boundary checking, and informative error handling.
- ✅ 5.7 Write automated API integration tests (Supertest / Vitest / Mocha).

---

## Stage 6: React Map Editor & Live Simulation Canvas
- ✅ 6.1 Initialize React frontend with Vite, Tailwind CSS / clean styling, and Lucide icons.
- ✅ 6.2 Implement HTML5 Canvas interactive 2D map viewport (pan, zoom, grid snapping).
- ✅ 6.3 Build interactive Map Editor tools:
  - Add / move / delete intersection nodes
  - Draw directional or bidirectional road edges between nodes
  - Inspector sidebar to configure road properties (lanes, speed limit, one-way/two-way)
  - Configure intersection control type (unsignalized, fixed signal, adaptive signal)
  - Save to and load from backend API
- ✅ 6.4 Implement simulation playback controls HUD (Play, Pause, Step Forward, Speed Multiplier: 0.5x, 1x, 2x, 5x, 10x, Reset).
- ✅ 6.5 Render live simulation on Canvas:
  - Animated vehicles smoothly interpolated between simulation ticks
  - Traffic signal lights (Red / Yellow / Green indicators at intersections)
  - Congestion heatmap overlay on road edges based on density
- ✅ 6.6 Stage 6 verification in browser.

---

## Stage 7: Scenario Modification & Before/After Comparison
- ✅ 7.1 Build Scenario Editor UI:
  - Select a saved Base Map
  - Apply modifications: road closure toggle, signal cycle adjustment, adaptive toggle, demand surge
- ✅ 7.2 Implement Dual-Run Execution Engine:
  - Run Baseline (Scenario A) and Modified (Scenario B) with identical seed
  - Fetch or stream results simultaneously
- ✅ 7.3 Build Side-by-Side Comparison Dashboard:
  - KPI delta cards ($\Delta$ Average Delay, $\Delta$ Travel Time, $\Delta$ Throughput)
  - Comparative Recharts graphs (Delay over time, Queue length distribution, Hourly throughput)
  - Synchronized dual-canvas or before/after visual playback toggle
- ✅ 7.4 Stage 7 verification and scenario test run.

---

## Stage 8: Reports Export, Run History & Viva Documentation
- ✅ 8.0 3x3 City Block Grid Network Generation (9 nodes, 24 directional links, fixed signal at center `node_C`).
- ✅ 8.0b "Center Route Closure" scenario & explicit corridor OD demand matrix (`node_ML` to `node_MR`).
- ✅ 8.0c Headless verification of A* alternate route pathfinding and 100% demand preservation (zero dropped trips).
- ✅ 8.0d Database and In-Memory store persistence with UI Map and Scenario selectors.
- ✅ 8.1 Implement CSV Exporter for road-level and network-level metrics over time.
- ✅ 8.2 Implement PDF Report Generator (executive summary, scenario differences, metric charts, congestion tables).
- ✅ 8.3 Build Past Runs Browser (view, compare, or reopen historical simulation runs).
- ✅ 8.4 Finalize documentation: Architecture diagrams, API specifications, and viva defense guide (`VIVA_GUIDE.md`).
- ✅ 8.5 End-to-end user acceptance test and performance check.

---

## Stage 9: Professional 2D Canvas & "Day Mode" UI Overhaul
- ✅ 9.1 Canvas Viewport Background & Grid: Soft light off-white palette (`#f8fafc`), subtle grid lines, and major 100m coordinate ticks.
- ✅ 9.2 Multi-Layered Asphalt Road Ribbons: Dark charcoal asphalt (`#1e293b`) with paved curb shoulders (`#94a3b8`), lane width proportional to lane count, outer margin lines, crisp dashed lane dividers, directional white chevrons, and high-visibility yellow/black barricades for closed roads.
- ✅ 9.3 Realistic Intersections & Traffic Control: Paved junction boxes with yellow cross-hatch "Keep Clear" box markings, solid white approach stop lines (3.5px), pedestrian zebra crosswalks, and illuminated 3-aspect roadside signal heads.
- ✅ 9.4 Top-Down Rectangular Vehicle Models: Distinct vehicle blocks (cars: 4.8m x 2.0m, buses/trucks: 9.0m x 2.5m) with subtle drop shadows, tinted windshields, warm headlights, reactive glowing red brake lights, and deterministic vibrant color palette hashing.
- ✅ 9.5 Day Mode UI Panels: Transition all dark panels (`App`, `Navbar`, `Toolbar`, `Inspector`, `SimulationControls`, `MetricsOverlay`, `ComparisonDashboard`, `PastRunsModal`, `ReportModal`) to clean, modern white/light-gray themes with subtle drop shadows and high-contrast typography.
- ✅ 9.6 Resilient WebSocket Auto-Reconnection: Dynamic port resolution (targeting port 5000 from Vite dev server) with exponential backoff and continuous auto-reconnection.
- ✅ 9.7 Seamless 2.5D Junctions & Curbs: Removed node circle outlines, rendered seamless flat asphalt junction boxes with yellow crosshatch markings, and added light gray concrete curbs with global drop shadows (`shadowColor: rgba(0,0,0,0.15)`, `shadowBlur: 10`) for 2.5D elevation.
- ✅ 9.8 Procedural Urban Environment & Matte Charcoal Asphalt: Soft warm parkland terrain (`#f1f5ee`), procedural building footprints in open parcels with rooftop details and trees, and realistic matte charcoal asphalt (`#334155`).
- ✅ 9.9 2.5D Jaipur Architectural Overhaul & Offscreen Canvas: Extruded sandstone/terracotta havelis with chhatris and water tanks, organic sandy loam terrain (`#e6dfce`) with Charbagh green parks, high-fidelity vehicle sprites (sedans, Indian auto-rickshaws, city buses), and off-screen canvas caching for smooth 60 FPS performance.
- ✅ 9.10 Seamless Unbroken Asphalt Road Network & Flat Square Junction Fusion: Eliminated all rounded line caps (`lineCap = 'butt'`), removed circular end caps and junction discs, rendered square flat curb and junction boxes only on multi-way nodes (`degree >= 2`), guaranteed exact asphalt color matching (`#334155`), drew road segments first followed by unbordered junction polygons to achieve 100% continuous paved surface fusion, and layered yellow Keep Clear box cross-hatching and solid white approach stop lines cleanly on top.
- ✅ 9.11 Native Non-Passive Event Listeners for Canvas Wheel Zoom: Replaced React `onWheel` with native `addEventListener('wheel', handler, { passive: false })` and multi-touch gestures in `CanvasViewport.tsx` with proper cleanup, completely eliminating "Unable to preventDefault inside passive event listener invocation" console errors.
- ✅ 9.12 Live Simulation WebSocket Streaming Fix & Auto-Fit Viewport: Resolved `ReferenceError: map is not defined` in `simulationSocket.ts` on `start_simulation`, added headless WebSocket integration test (`socket.test.ts`), and implemented bounding box auto-fit (`loadMap` and `handleResetView`) to render networks at an optimal, legible scale on load.

