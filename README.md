# CitySim – Traffic Scenario Testing Platform

> **Status:** Stage 4 Completed (Traffic Generation & Performance Metrics)

CitySim is an interactive web-based traffic simulation and scenario testing platform designed for urban planners, transportation engineers, and academic evaluation. The system allows users to design 2D road networks, configure signal control strategies, simulate microscopic vehicle behavior using deterministic time-stepped models, and evaluate the impact of infrastructure changes (such as road closures, signal timing optimizations, or adaptive signal controllers) through side-by-side "before vs. after" comparative analytics and exported reports.

---

## Current Status: Stage 4 Completed
- [x] **Deterministic PRNG:** Seeded Mulberry32 generator (`engine/src/prng.ts`)
- [x] **Car-Following Physics:** IDM with Semi-implicit Euler integration (`engine/src/carFollowing.ts`)
- [x] **Road Network Graph:** Directed Graph $G=(V,E)$ supporting one-way and two-way roads (`engine/src/graph.ts`)
- [x] **Pathfinding Algorithms:** Dijkstra & A* with admissible Euclidean distance/travel-time heuristics (`engine/src/routing.ts`)
- [x] **Traffic Signals & Safety:** Fixed-time, adaptive queue-responsive controllers, dilemma zone rule, box-blocking prevention (`engine/src/signals.ts`)
- [x] **Traffic Demand Modeling:** Origin-Destination (O-D) matrix with demand scaling and drift-free Poisson arrivals (`engine/src/trafficGenerator.ts`)
- [x] **Performance Metrics Engine:** Travel Time Index (TTI), Volume-to-Capacity (V/C) heatmaps, time-series telemetry snapshots (`engine/src/metrics.ts`)
- [x] **Testing:** 42 automated unit tests passing across all components (`npm --prefix engine test`)
- [x] **Interactive Demos:** Stage 1 (`demo:stage1`), Stage 2 (`demo:stage2`), Stage 3 (`demo:stage3`), Stage 4 O-D Matrix demo (`demo:stage4`)

---

## Tech Stack

- **Frontend:** React 18+ (Vite), HTML5 2D Canvas (Interactive map editor & real-time simulation visualizer), Recharts (Comparative KPI charts), Tailwind CSS
- **Backend:** Node.js, Express.js, Socket.IO (Bidirectional real-time simulation streaming)
- **Database:** MongoDB with Mongoose ODM (Maps, Scenarios, and Simulation Runs)
- **Simulation Engine:** Modular JavaScript/TypeScript engine (Runs deterministically on Node.js backend for batch execution and in browser for live interactive preview)
- **Testing & Tooling:** Vitest / Jest (Unit and integration testing), Seeded PRNG (Deterministic execution)
- **Reports:** CSV and PDF generation engines

---

## Planned Core Features

1. **Interactive Road Network Editor:**
   - Visual 2D canvas to place intersection nodes and draw connecting road segments.
   - Per-road attribute editing (lanes, speed limits, length, one-way/two-way directionality).
   - Persistence of road networks in MongoDB.

2. **Synthetic Traffic Generation:**
   - Seeded Poisson arrival distribution for stochastic yet reproducible vehicle injections.
   - Origin-Destination (O-D) routing using Dijkstra's shortest path and A* search algorithms.

3. **Microscopic Time-Stepped Simulation Engine:**
   - Time-slice discrete simulation loop ($\Delta t = 0.1\text{s}$).
   - Car-following physics (simplified Intelligent Driver Model) preventing vehicle collisions and maintaining safe headways.
   - Playback controls: play, pause, single-step, reset, and variable simulation speed multipliers.

4. **Traffic Signal Controllers:**
   - Fixed-time multi-phase cycle controller with amber clearance intervals.
   - Adaptive queue-responsive controller extending green phases based on incoming road backlog.

5. **A/B Scenario Testing:**
   - Forking a baseline map into hypothetical scenarios (e.g., closing an arterial road, adding traffic signals, modifying cycle timings).
   - Dual-execution with identical pseudo-random number generator seeds for fair, scientific comparisons.

6. **Comparative Analytics & Heatmaps:**
   - Real-time KPIs: Average Delay, Average Travel Time, Network Throughput (veh/hr), Maximum Queue Lengths.
   - Segment-level congestion heatmaps (volume-to-capacity index).
   - Side-by-side before vs. after comparison tables and Recharts visual graphs.

7. **Reporting & Historical Runs:**
   - Export simulation logs and summary statistics to CSV and downloadable PDF reports.
   - Reopen and inspect past simulation runs stored in the database.

---

## Project Structure

```text
CitySim/
├── client/          # React frontend application (Vite, Canvas, UI components)
├── server/          # Node.js + Express backend (REST API, WebSockets, DB models)
├── engine/          # Pure simulation engine (Physics, graph, routing, signals, metrics)
├── docs/            # Architectural specs, API documentation, viva defense notes
├── TASKS.md         # Stage-wise checklist and development tracker
├── DECISIONS.md     # Architecture Decision Record (ADR) log
└── README.md        # Project overview and setup instructions
```

---

## Setup & Installation

*(To be updated as development stages are built)*

### Prerequisites
- Node.js (v18.x or higher)
- npm or pnpm
- MongoDB (Local instance or MongoDB Atlas URI)

### Quickstart (Running Stages 1 - 4)
```bash
# 1. Run unit tests for the simulation engine (42 tests)
npm --prefix engine test

# 2. Run the interactive single-intersection CLI demo (Stage 1)
npm run demo:stage1

# 3. Run the multi-road A* routing & road closure detour demo (Stage 2)
npm run demo:stage2

# 4. Run the Fixed-Time vs. Adaptive Signal comparison demo (Stage 3)
npm run demo:stage3

# 5. Run the O-D Matrix & Performance Metrics demo (Stage 4)
npm run demo:stage4
```
