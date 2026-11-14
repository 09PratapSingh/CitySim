# Architecture Decision Record (ADR) Log

This document records the critical architectural, algorithmic, and engineering design decisions made during the design and development of **CitySim**. It is updated at the conclusion of every stage to maintain academic rigor and assist in project viva examinations.

---

## ADR 001: Separation of Pure Simulation Engine from I/O & UI Layers

- **Status:** Accepted (Milestone 0)
- **Context:** The simulation engine must run on the backend (for headless batch processing, report generation, and deterministic A/B testing) and optionally in the browser for low-latency visual previews. Furthermore, the core simulation math must be easily unit-tested without needing mock DOM or database connections.
- **Decision:** Build `/engine` as a pure, zero-dependency JavaScript/TypeScript module. It receives state/configuration inputs, executes time steps deterministically, and emits state snapshots and metrics. Neither Express nor React nor Mongoose code is permitted inside `/engine`.
- **Alternatives Rejected:**
  - *Embedding simulation inside Express server controllers:* Highly coupled, untestable in isolation, unable to run client-side without network roundtrips.
  - *Using Python / SUMO backend:* Adds significant overhead, external binary dependencies, and cross-language serialization complexity for a web-native CSE major project.
- **Viva Defense Note:** Demonstrates Clean Architecture and Single Responsibility Principle (SRP). Allows identical simulation code to run headlessly in CI/CD unit tests, in a backend worker, or directly in the browser's requestAnimationFrame loop.

---

## ADR 002: Microscopic Time-Stepped Simulation vs. Discrete-Event vs. Macroscopic

- **Status:** Accepted (Milestone 0)
- **Context:** Traffic simulation can be modeled at macroscopic level (fluid flow equations), mesoscopic level (platoon flows), or microscopic level (individual vehicles with physics). Furthermore, time progression can be event-driven (event queue jumping from event to event) or time-stepped (fixed $\Delta t$ increments).
- **Decision:** Use a **microscopic time-stepped simulation model** with a fixed time step ($\Delta t = 0.1\text{s}$) paired with a car-following model (simplified Intelligent Driver Model - IDM).
- **Alternatives Rejected:**
  - *Macroscopic continuum model (Lighthill-Whitham-Richards):* Does not represent individual vehicles, making visual canvas rendering and intersection signal interactions abstract and unengaging for users.
  - *Pure Discrete-Event Simulation (DES):* Excellent for queuing networks, but difficult to render continuous 2D vehicle acceleration, lane-following, and braking on an HTML5 canvas smoothly without artificial interpolation.
- **Viva Defense Note:** Microscopic modeling allows realistic modeling of reaction delays, bumper-to-bumper car-following, queue formation at red lights, and localized shockwave congestion. Fixed $\Delta t$ ensures easy synchronization with canvas rendering frames.

---

## ADR 003: Deterministic Pseudo-Random Number Generation (PRNG)

- **Status:** Accepted (Milestone 0)
- **Context:** To ensure fair scenario comparison (comparing Scenario A Baseline vs. Scenario B with Road Closed), the vehicle generation times, origin-destination distributions, and driver characteristics must be strictly identical across both runs.
- **Decision:** Implement a **seeded PRNG (Mulberry32 algorithm)**. Every simulation run is initialized with an explicit integer `seed`. All stochastic events (vehicle arrival intervals, driver aggressiveness) draw exclusively from this seeded generator.
- **Alternatives Rejected:**
  - *Native `Math.random()`:* Cannot be seeded in standard JavaScript environments; produces non-repeatable sequences, invalidating controlled A/B testing.
  - *Pre-recorded static vehicle schedules:* Inflexible; cannot adapt when scenario durations or injection rates are modified by user sliders.
- **Viva Defense Note:** Essential for scientific validity. In viva, if asked *"How do you prove the road closure caused the 30% delay increase rather than random traffic spikes?"*, the answer is: *"Both runs used the exact same PRNG seed (e.g., seed 42), guaranteeing identical vehicle arrival streams."*

---

## ADR 004: Network Representation: Directed Graph with Adjacency List

- **Status:** Accepted (Milestone 0)
- **Context:** Roads in urban areas have directionality (one-way streets, dual carriageways), distinct lane counts, and speed limits. Intersections act as junctions where incoming and outgoing lanes meet.
- **Decision:** Represent the road network as a **Directed Graph $G = (V, E)$** using an Adjacency List:
  - **Vertices ($V$):** Intersection nodes containing 2D spatial coordinates $(x, y)$, control type (unsignalized, fixed signal, adaptive signal), and phase configurations.
  - **Edges ($E$):** Directed road segments containing source node ID, target node ID, length in meters, lane count, speed limit, and references to current vehicles occupying the edge.
  - Bidirectional roads are represented as two complementary anti-parallel directed edges ($u \to v$ and $v \to u$).
- **Alternatives Rejected:**
  - *Adjacency Matrix:* Inefficient for sparse planar road graphs ($O(V^2)$ memory where average vertex degree is only 3 to 4).
  - *Grid coordinate array:* Restricts road geometry to fixed Manhattan grids and cannot represent arbitrary diagonal roads, roundabouts, or custom geometry.
- **Viva Defense Note:** Optimal time and space complexity. Enables rapid traversal for pathfinding algorithms ($O(V + E)$) and straightforward spatial mapping on a 2D canvas.

---

## ADR 005: Pathfinding Strategy: Static Shortest Path (Dijkstra / A*) vs. Dynamic Rerouting

- **Status:** Accepted (Milestone 0)
- **Context:** Vehicles spawned at an origin node need a path to their destination node across the directed graph.
- **Decision:** Use **A* search algorithm** (with Euclidean distance heuristic) to compute the initial route when a vehicle enters the network. Support **Dijkstra's algorithm** as a benchmark/fallback. For closed roads in modified scenarios, closed edges are assigned infinite weight ($\infty$), forcing vehicles to route around the blockage.
- **Alternatives Rejected:**
  - *Continuous real-time dynamic rerouting at every step:* High computational cost ($O(V \log V)$ per vehicle per tick) causing frame drops on large networks, and unrealistic unless modeling GPS navigation apps with live recalculation.
  - *Random walk routing:* Vehicles wander aimlessly; fails to represent goal-directed commuter behavior.
- **Viva Defense Note:** A* guarantees shortest distance/travel time paths while exploring significantly fewer nodes than Dijkstra due to the admissible Euclidean distance heuristic function $h(n) = \sqrt{(x_n - x_{goal})^2 + (y_n - y_{goal})^2}$.

---

## ADR 006: Rendering Technology: HTML5 2D Canvas vs. Leaflet / WebGL

- **Status:** Accepted (Milestone 0)
- **Context:** The frontend requires an intuitive interface to draw nodes/roads and render hundreds of animated vehicles smoothly at 60 FPS.
- **Decision:** Use native **HTML5 2D Canvas API** wrapped inside a modular React component.
- **Alternatives Rejected:**
  - *Leaflet / Mapbox / OpenStreetMap:* Adds heavy GIS dependencies and enforces real-world geographic coordinates (latitude/longitude), making custom fictional urban planning drawings unnecessarily cumbersome.
  - *DOM / SVG elements per vehicle:* DOM manipulation overhead causes severe frame rate drops when vehicle count exceeds 100.
  - *Three.js / WebGL:* Explicitly out of scope for MVP; introduces high 3D model loading overhead without improving academic simulation metrics.
- **Viva Defense Note:** HTML5 2D Canvas offers direct pixel-level control, high rendering performance ($60\text{ FPS}$ with hundreds of vehicle entities), zero external GIS licensing hurdles, and seamless pan/zoom transformation math.

---

## ADR 007: Numerical Integration Scheme: Semi-Implicit Euler

- **Status:** Accepted (Stage 1)
- **Context:** Car-following dynamics require updating velocity and position at each time step $\Delta t = 0.1\text{s}$. Standard Explicit Forward Euler ($x_{t+1} = x_t + v_t \Delta t; v_{t+1} = v_t + a_t \Delta t$) is known to add artificial kinetic energy to dynamic systems, frequently causing simulated vehicles to overshoot stopped queues or oscillate unstably.
- **Decision:** Use **Semi-Implicit Euler** (Symplectic Euler):
  $$v_{t+1} = \max(0, v_t + a_t \Delta t)$$
  $$x_{t+1} = x_t + v_{t+1} \Delta t$$
- **Alternatives Rejected:**
  - *Explicit Forward Euler:* Causes position overshoot and bumper clipping under hard deceleration.
  - *Runge-Kutta 4th Order (RK4):* Computationally expensive ($4\times$ evaluations per vehicle per tick) and unnecessary for non-stiff second-order vehicle kinematics.
- **Viva Defense Note:** Semi-Implicit Euler updates velocity first, ensuring braking immediately dampens position advancement within the same time step. It guarantees numerical stability without performance penalties.

---

## ADR 008: Virtual Leader Obstacle for Stop Lines and Red Signals

- **Status:** Accepted (Stage 1)
- **Context:** How to make vehicles halt naturally at red traffic lights, stop lines, or blocked intersection boundaries without writing separate braking logic.
- **Decision:** Represent any active stop bar or red signal as a **Virtual Stationary Leader Obstacle** ($v_{leader} = 0$, $\text{length} = 0$, $\text{position} = \text{stopLinePosition}$).
- **Alternatives Rejected:**
  - *Hard position clamping:* Snapping vehicles to the stop line looks abrupt and non-physical (infinite deceleration).
  - *Custom linear braking ramp:* Duplicates car-following physics and creates edge cases where vehicle behavior differs between following a car versus stopping at a light.
- **Viva Defense Note:** By passing a virtual stationary leader to the Intelligent Driver Model, the vehicle smoothly applies the exact same human-like deceleration curve and comes to rest at the prescribed jam distance $s_0$ (~2.0m) before the stop line, unifying all braking under a single mathematical formula.

---

## ADR 009: Poisson Process for Synthetic Traffic Generation

- **Status:** Accepted (Stage 1)
- **Context:** In real traffic, vehicles do not arrive at perfectly identical intervals (e.g. exactly 1 car every 10.0s). Instead, arrivals are stochastic with random headway clusters.
- **Decision:** Model vehicle arrivals as a **Poisson Process**, sampling the inter-arrival time $\Delta t_{arrival}$ using inverse transform sampling of the Exponential distribution:
  $$\Delta t_{arrival} = -\frac{\ln(1 - U)}{\lambda}$$
  where $\lambda = \text{arrivalRatePerHour} / 3600$, and $U \in [0, 1)$ is provided by the seeded PRNG.
- **Alternatives Rejected:**
  - *Deterministic constant interval ($t_{arrival} = 1/\lambda$):* Unrealistic; creates artificial platoons with zero natural queuing variations.
  - *Uniform random jitter:* Lacks theoretical backing in queuing theory.
- **Viva Defense Note:** The Poisson arrival process ($M/M/1$ or $M/G/1$ queue) is the standard in queuing theory and civil transportation engineering, showing examiners a strong mathematical foundation.

---

## ADR 010: Admissible Heuristic Formulation for A* Routing

- **Status:** Accepted (Stage 2)
- **Context:** When searching a road graph for the fastest route, A* requires an admissible heuristic $h(n)$ (one that never overestimates the true remaining cost to the destination) to guarantee finding the mathematically optimal path.
- **Decision:** Formulate the heuristic based on the routing criterion:
  1. **Distance Criterion:** Straight-line Euclidean distance:
     $$h_{dist}(n) = \sqrt{(x_n - x_{dest})^2 + (y_n - y_{dest})^2}$$
  2. **Travel Time Criterion:** Euclidean distance divided by the network maximum speed limit:
     $$h_{time}(n) = \frac{\sqrt{(x_n - x_{dest})^2 + (y_n - y_{dest})^2}}{\max_{e \in E} (\text{speedLimit}(e))}$$
- **Alternatives Rejected:**
  - *Manhattan distance ($|dx| + |dy|$):* Not admissible when roads run diagonally or Euclidean curvature exists (can overestimate distance).
  - *Dividing by local edge speed limit:* If the remaining path has a faster road, local speed would underestimate time, violating consistency.
- **Viva Defense Note:** Dividing straight-line distance by the maximum possible velocity ensures $h(n) \le \text{true travel time}$ under all physical conditions, proving mathematical admissibility and optimality in your viva presentation.

---

## ADR 011: Road Closure Impairment Modeling via Dynamic Edge Invalidation

- **Status:** Accepted (Stage 2)
- **Context:** In scenario testing, urban planners need to test the impact of closing a road segment (due to construction, disaster, or pedestrianization).
- **Decision:** Road closures are represented by an `isClosed` boolean flag on the directed edge. When an edge is closed:
  1. The pathfinding algorithms (A* and Dijkstra) ignore the edge ($cost = \infty$), computing alternative detour paths.
  2. If a vehicle already en route approaches an unexpectedly closed downstream edge, it initiates a local dynamic reroute from its current intersection node.
- **Alternatives Rejected:**
  - *Physically deleting edges from the graph:* Destroys the base map geometry, making before/after comparisons and UI synchronization complex and error-prone.
- **Viva Defense Note:** Preserves map topology and immutability while cleanly modeling dynamic environmental disruptions.

---

## ADR 012: Multi-Lane Partitioning and Greedy Entry Load Balancing

- **Status:** Accepted (Stage 2)
- **Context:** Real roads frequently have multiple parallel lanes ($lanes \ge 2$). Vehicles must choose lanes and follow vehicles within their specific lane.
- **Decision:**
  1. On each multi-lane road edge, vehicles are indexed by `laneIndex`.
  2. Each lane executes independent car-following physics (vehicles interact only with leaders in the same lane).
  3. When vehicles enter a multi-lane road, they select the lane with the lowest current vehicle count (greedy load balancing).
- **Alternatives Rejected:**
  - *Full MOBIL lane-changing model:* High computational complexity and prone to lane-switching chatter without adding proportional value to macroscopic travel time metrics.
- **Viva Defense Note:** Provides realistic multi-lane capacity and queuing without excessive simulation overhead, easily explainable as greedy capacity distribution.

---

## ADR 013: Signal Phase State Machine with All-Red Clearance Interval

- **Status:** Accepted (Stage 3)
- **Context:** Intersections manage non-conflicting movements through cyclical phases. Abrupt switches between Green and Red cause collisions or sudden stopping.
- **Decision:** Model signal transitions as a 4-state cyclical state machine per phase:
  $$\text{GREEN} \longrightarrow \text{YELLOW } (3.0\text{s}) \longrightarrow \text{ALL\_RED } (1.5\text{s}) \longrightarrow \text{NEXT PHASE GREEN}$$
  During the `ALL_RED` interval, all incoming approaches display a physical RED light, clearing the conflict zone before cross-traffic receives legal right-of-way.
- **Alternatives Rejected:**
  - *Instant 2-state toggle (Green/Red only):* Completely unrealistic; creates high-speed perpendicular collisions inside intersection boxes.
- **Viva Defense Note:** Mimics standard MUTCD (Manual on Uniform Traffic Control Devices) safety engineering standards, protecting physical realism.

---

## ADR 014: Adaptive Queue-Actuated Green Extension with Starvation Ceiling

- **Status:** Accepted (Stage 3)
- **Context:** Fixed-time signals waste green time on empty approaches while cross-streets build long queues.
- **Decision:** Implement an actuated adaptive controller:
  1. Guaranteed `minGreen` ($8-10\text{s}$).
  2. After `minGreen`, inspect queue detector inputs. If active queue $\ge \text{threshold}$, extend green in increments of $\Delta t_{ext} = 3\text{s}$.
  3. If active queue drops to zero, terminate green immediately.
  4. Force termination at `maxGreen` ($40-50\text{s}$) regardless of active queue to prevent cross-street starvation.
- **Alternatives Rejected:**
  - *Complex deep reinforcement learning (RL) signals:* Black box, non-deterministic, difficult to explain in an undergraduate viva, and impossible to unit-test deterministically.
- **Viva Defense Note:** Queue-actuation is the basis of real-world traffic systems like SCOOT and SCATS. It provides predictable, explainable, and mathematically bounded optimization.

---

## ADR 015: Dilemma Zone Handling and "Don't Block the Box" Gridlock Prevention

- **Status:** Accepted (Stage 3)
- **Context:** Real-world traffic suffers from two major junction phenomena: drivers unable to stop at yellow (the Dilemma Zone) and drivers entering full intersections and causing gridlock.
- **Decision:**
  1. **Dilemma Zone:** A vehicle approaching on Yellow computes its stopping distance $d_{stop} = \frac{v^2}{2b}$. If remaining distance $d_{rem} > d_{stop}$, it halts; if $d_{rem} \le d_{stop}$, it proceeds safely through the intersection.
  2. **Don't Block the Box:** Even when a signal is GREEN or YELLOW, if the downstream exit road is full/queued up to the boundary, vehicles are prohibited from entering the intersection box.
- **Alternatives Rejected:**
  - *Allowing vehicles to enter full exits:* Causes total gridlock where orthogonal cross-traffic is permanently blocked on green phases.
- **Viva Defense Note:** Demonstrates deep domain understanding of civil traffic management and defensive software engineering.

---

## ADR 016: Origin-Destination (O-D) Matrix Representation for Urban Commuter Flows

- **Status:** Accepted (Stage 4)
- **Context:** In real cities, vehicles travel from specific residential/entry zones to employment/commercial destinations. Modeling traffic as independent road injections ignores path network interactions.
- **Decision:** Implement a formal `ODMatrix` data structure defining hourly flow rates $T_{ij}$ for all $(O_i, D_j)$ pairs. Support uniform demand scaling ($\alpha \times T_{ij}$) for rush-hour peak vs. off-peak scenario comparisons.
- **Alternatives Rejected:**
  - *Hardcoded random trip assignment:* Uncontrollable and does not model directional commuter waves.
- **Viva Defense Note:** Aligns with standard 4-step urban transportation planning models (Trip Generation, Trip Distribution, Modal Split, Traffic Assignment).

---

## ADR 017: Event-Relative Poisson Scheduling to Prevent Discretization Drift

- **Status:** Accepted (Stage 4)
- **Context:** When polling synthetic arrivals at discrete intervals ($\Delta t$), adding exponential random intervals to `currentTime` causes cumulative scheduling drift because polling occurs slightly after the theoretical arrival instant.
- **Decision:** Schedule consecutive Poisson arrivals relative to the *scheduled event timestamp*:
  $$t_{next} = t_{scheduled} + \text{nextExponential}(\lambda)$$
- **Alternatives Rejected:**
  - *Scheduling relative to poll clock ($t_{next} = t_{current} + \Delta t$):* Artificially under-generates traffic by up to 20% on coarse polling steps.
- **Viva Defense Note:** Preserves exact Poisson arrival rates under discrete time simulation, guaranteeing mathematical convergence to the Poisson distribution.

---

## ADR 018: Dual-Tier Telemetry: Instantaneous State vs. Periodic Time-Series Snapshots

- **Status:** Accepted (Stage 4)
- **Context:** Frontend visual charts (Recharts) need smooth, historical time-series curves (e.g. queue length over 60 minutes), but streaming every 0.1s tick over WebSockets creates severe memory and bandwidth bottlenecks.
- **Decision:** Implement a dual-tier telemetry architecture:
  1. **Tick-level physics (0.1s):** For instantaneous canvas vehicle rendering.
  2. **Periodic Snapshots (5s or 10s intervals):** Captured by `MetricsCollector` into a compact `timeSeries` array, providing ready-to-render data points for Recharts.
- **Alternatives Rejected:**
  - *Buffering all ticks:* 3600 seconds $\times$ 10 ticks/s = 36,000 data points per run; crashes browser chart renderers.
- **Viva Defense Note:** Optimal performance engineering; reduces chart data payloads by $98\%$ while preserving macro trends and peak indicators.

---

## ADR 019: Dual-Mode Persistence: MongoDB with Resilient In-Memory Fallback

- **Status:** Accepted (Stage 5)
- **Context:** In student project presentations and viva examinations, examiners frequently run the project on machines without an active MongoDB daemon or internet connectivity.
- **Decision:** Implement a unified `DataStore` abstraction. When `connectDB()` connects to MongoDB, Mongoose schemas (`MapModel`, `ScenarioModel`, `RunModel`) are used. If MongoDB is unavailable or `MONGODB_URI` is omitted, the server automatically and transparently operates in an In-Memory Store mode with pre-seeded sample maps.
- **Alternatives Rejected:**
  - *Hard failure on missing MongoDB:* Causes immediate crash on `npm start` if MongoDB is down, ruining viva presentations.
  - *Using SQLite / local file locks:* Adds native C++ binary dependencies (e.g. better-sqlite3) that cause build failures across different Node versions.
- **Viva Defense Note:** Exemplifies enterprise resilience and defensive programming. Shows examiners that the system handles infrastructure outages gracefully without losing application functionality.

---

## ADR 020: Server-Side 2D Spatial Position Interpolation for WebSocket Streaming

- **Status:** Accepted (Stage 5)
- **Context:** The simulation engine computes 1D longitudinal positions along directed road segments (`position: meters`). The frontend HTML5 canvas requires 2D screen coordinates $(x, y)$ and heading angle $\theta$ to render vehicle shapes smoothly.
- **Decision:** Perform spatial 2D interpolation and multi-lane lateral offsets on the server inside `simulationSocket.ts` before emitting `simulation_frame` payloads over Socket.IO.
- **Alternatives Rejected:**
  - *Sending raw 1D position and forcing client to compute geometric transforms:* Duplicates road geometry logic in client components and increases frontend bundle size.
- **Viva Defense Note:** Reduces client-side computational overhead, allowing the React canvas to focus strictly on 60 FPS rendering.

---

## ADR 021: Headless Batch Execution vs. Live Socket Streaming

- **Status:** Accepted (Stage 5)
- **Context:** Users need two distinct simulation experiences: (1) watching live cars drive and queue on the interactive canvas, and (2) instantly generating statistical reports comparing 60 minutes of baseline vs. modified scenarios.
- **Decision:** Support dual execution modalities:
  1. **Live Interactive Stream (Socket.IO):** Steps tick-by-tick with adjustable speed multipliers ($1\times, 2\times, 5\times, 10\times$), streaming interpolated vehicle coordinates.
  2. **Headless Batch Runner (`POST /api/simulations/run`):** Executes 3600 simulated seconds in < 200ms on the backend, persisting the full statistical run report into the database for instant side-by-side charting.
- **Alternatives Rejected:**
  - *Only live playback:* Users would have to sit and wait minutes for long simulations to finish before seeing comparative before/after metrics.
- **Viva Defense Note:** Demonstrates architectural versatility, satisfying both visual demonstration needs and rigorous analytical evaluation.

---

## ADR 022: HTML5 2D Canvas vs. SVG / Leaflet for Microscopic Traffic Rendering

- **Status:** Accepted (Stage 6)
- **Context:** The interactive frontend must render dynamic road network geometry, signal indicators, vehicle bounding boxes, and density heatmaps smoothly at 60 FPS while supporting camera panning, zooming, and editing.
- **Decision:** Implement an HTML5 2D Canvas rendering pipeline driven by a reactive `requestAnimationFrame` loop.
- **Alternatives Rejected:**
  - *SVG / DOM Elements:* Injecting a DOM or SVG element for every vehicle, road stripe, and signal aspect results in hundreds of DOM nodes. In high-density scenarios with 200+ vehicles, DOM layout thrashing and garbage collection spikes degrade framerate below 15 FPS.
  - *Leaflet / Mapbox GIS:* Leaflet is engineered for geographic Mercator tile coordinates (lat/long). Our simulation operates in Euclidean metric space ($L$ in meters); forcing geographic transformations creates distortion, excessive dependency bloat, and prevents clean sub-pixel drawing of multi-lane asphalt ribbons.
  - *WebGL / Three.js:* 3D graphics were explicitly ruled out of scope. WebGL 2D adds shader compilation overhead and significant complexity without tangible benefits over 2D Canvas for this scale.
- **Viva Defense Note:** 2D Canvas gives complete control over immediate-mode rendering, sub-pixel antialiasing, custom asphalt lane markings, vehicle rotation matrices, and hazard overlays while maintaining a constant 60 FPS profile.

---

## ADR 023: Camera Viewport Transformation Matrix & Infinite Grid Snapping

- **Status:** Accepted (Stage 6)
- **Context:** The map editor and visualizer must allow urban planners to inspect both large-scale metropolitan networks and individual intersection stop lines.
- **Decision:** Encapsulate viewport state in `{ x, y, zoom }` where $(x, y)$ represents world coordinates at the canvas center, and apply explicit affine transformation functions:
  $$\text{screenX} = (wx - \text{viewport.x}) \cdot \text{zoom} + \frac{W}{2}$$
  $$\text{worldX} = \frac{sx - W/2}{\text{zoom}} + \text{viewport.x}$$
  Grid snapping snaps coordinates to the nearest modular 25-meter increment ($x_{\text{snapped}} = \text{round}(x / 25) \cdot 25$).
- **Alternatives Rejected:**
  - *CSS Transforms on Canvas Element:* Panning or scaling the canvas element itself blurs vector lines, distorts text labels, and invalidates mouse hit-testing.
- **Viva Defense Note:** Maintains crisp vector clarity at all zoom levels ($0.2\times$ to $4.0\times$) and allows seamless mouse wheel zooming anchored directly at the cursor position.

---

## ADR 024: Ad-Hoc In-Memory Map Simulation vs. Forced Database Persistence

- **Status:** Accepted (Stage 6)
- **Context:** When a city planner draws a hypothetical road modification or test junction, forcing them to name, validate, and save the map to MongoDB before testing disrupts exploratory workflow.
- **Decision:** Upgrade the WebSocket coordinator (`simulationSocket.ts`) and React client to accept both a stored database `baseMapId` or an ad-hoc in-memory geometry payload (`customMap: { nodes, edges }`).
- **Alternatives Rejected:**
  - *Forced Pre-Save:* Requiring a database save before running creates temporary or junk database records for every minor tweak tested by the user.
- **Viva Defense Note:** Demonstrates thoughtful UX design: the planner can sketch and immediately test traffic behavior. Once satisfied with the layout, they can persist it to the database with a single click.

---

## ADR 025: Real-Time Dynamic Road Ribbons, Directional Chevrons, and Heatmap Shading

- **Status:** Accepted (Stage 6)
- **Context:** Road segments require intuitive visual cues indicating lane count, traffic flow direction, closure status, and real-time congestion levels.
- **Decision:** Render roads as multi-layered ribbons:
  1. Base asphalt pavement sized proportional to lane count ($\text{width} = \text{lanes} \times 4\text{m} \times \text{zoom}$).
  2. White dashed longitudinal lane dividers.
  3. Dynamic one-way flow chevrons along the road centerline.
  4. Real-time congestion shading: Free Flow ($V/C < 0.5$, teal), Moderate ($0.5 \le V/C < 0.75$, amber), Heavy ($0.75 \le V/C < 0.9$, orange), and Congested ($V/C \ge 0.9$, rose-red).
  5. Road closure hazard stripes with a prominent "CLOSED" warning marker for scenario testing.
- **Alternatives Rejected:**
  - *Simple 1-pixel line graphs:* Fails to convey lane capacity, multi-lane overtaking, or intersection physical footprint.
- **Viva Defense Note:** Provides an immediate, aesthetically compelling representation of traffic conditions that non-technical stakeholders and examiners can instantly comprehend.
