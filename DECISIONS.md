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
