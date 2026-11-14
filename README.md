# CitySim – Microscopic Urban Traffic Simulation & Decision-Support Platform

> **Status:** Stage 8 Completed (Full Decision-Support Suite, CSV/PDF Exporters & History Browser)

**CitySim** is a full-stack, microscopic multi-agent urban traffic simulator and decision-support platform engineered for civil engineers, urban planners, and transportation researchers. The system allows users to design arbitrary 2D road networks, configure signal control strategies, simulate microscopic vehicle behavior using deterministic time-stepped physics (IDM + MOBIL), and evaluate the real-world impact of infrastructure changes (e.g., arterial road closures, signal retiming, capacity additions, or peak demand surges) through side-by-side comparative analytics, 95% confidence intervals, and decision-grade exported reports.

---

## 🚀 Key Features

1. **Interactive Road Network Studio:**
   - 2D Canvas editor to construct intersection nodes, draw directional or two-way road segments, and configure lanes, lengths, and speed limits.
   - Built-in map templates: Canonical 4-Way Signalized Intersection, Multi-Link Corridor, and a 3x3 Urban Block Grid Network (9 nodes, 24 directed links).

2. **Microscopic Vehicle Physics & Multi-Agent Logic:**
   - **Longitudinal:** Intelligent Driver Model (IDM) continuous acceleration with Semi-Implicit Euler integration ($\Delta t = 0.1\text{s}$) preventing collisions and vehicle tunneling.
   - **Lateral:** MOBIL lane-changing model evaluating safety deceleration bounds and polite incentive thresholds.
   - **Routing:** A* pathfinding with admissible Euclidean travel-time heuristic and dynamic perimeter detour discovery.

3. **Intersection & Traffic Signal Automation:**
   - Webster's formula optimal cycle calculation for multi-phase fixed-time signals.
   - Smart adaptive queue-responsive controllers dynamically allocating green phases based on incoming road backlog.
   - Yellow clearance and all-red clearance intervals with dilemma-zone safety rules and intersection anti-blocking.

4. **Scientific A/B Scenario Comparison (CRN):**
   - Paired execution using Common Random Numbers (identical pseudo-random seeds across runs) to isolate intervention effects from stochastic noise.
   - Configurable simulation durations (300s, 600s, 900s), warm-up period filtering (default 60s), and multi-seed replications ($N = 1, 3, 5, 10$).
   - Rigorous Student's $t$-distribution 95% Confidence Intervals for paired metric deltas ($\Delta$ Average Delay, $\Delta$ Travel Time, $\Delta$ Throughput, $\Delta$ Mean Speed).

5. **Decision-Grade Reporting & Historical Run History:**
   - **CSV Exporters:** Download full road-segment volume-to-capacity congestion breakdowns and continuous 5-second network time-series trajectories with UTF-8 BOM encoding for Excel.
   - **Executive PDF Report:** Instant, pixel-perfect executive summary report formatted with `@media print` CSS for print and PDF export.
   - **Past Runs Browser:** Filter, inspect, and export historical simulation runs stored in the backend persistence layer.

---

## 🛠 Tech Stack

- **Simulation Kernel:** Pure TypeScript, zero-dependency, deterministic engine (`engine/`). Runs identically in Node.js headless processes and browser environments.
- **Backend API & WebSockets:** Node.js, Express.js, and Socket.IO for bidirectional telemetry streaming (`server/`).
- **Frontend SPA:** React 18, Vite, Tailwind CSS, Lucide icons, HTML5 Canvas, and Recharts interactive telemetry visualizer (`client/`).
- **Persistence:** In-Memory & MongoDB compatible DataStore layer for maps, scenarios, and historical runs.
- **Testing:** Native Node.js test runner (`node --test`), 62 automated unit and integration tests passing 100%.

---

## 📂 Project Structure

```text
CitySim/
├── client/          # React 18 + Vite frontend (Canvas viewport, comparative charts, report modal)
├── server/          # Express.js REST API, Socket.IO WebSockets, controllers, DataStore
├── engine/          # Microscopic simulation kernel (IDM physics, A* routing, signals, metrics)
├── VIVA_GUIDE.md    # Comprehensive viva & engineering defense guide with math & Q&A
├── TASKS.md         # Stage-wise task tracking and acceptance records
├── DECISIONS.md     # Architecture Decision Record (ADR 001 - ADR 035)
└── README.md        # Project overview and setup instructions
```

---

## ⚡ Quickstart Guide

### Prerequisites
- Node.js (v18.x or higher)
- npm or pnpm

### 1. Run All Automated Tests
```bash
# Run engine unit tests (55 tests)
npm --prefix engine test

# Run server API & comparison tests (7 tests)
npm --prefix server test
```

### 2. Build the Production Client
```bash
npm --prefix client run build
```

### 3. Start the Server
```bash
npm --prefix server start
```
The server serves both the REST API, Socket.IO WebSockets, and the bundled React frontend on port `5000`.

### 4. Open in Browser
Navigate to **`http://localhost:5000`** in your browser.

---

## 📖 How to Run a Baseline vs. Scenario Comparison

1. Open `http://localhost:5000` and switch to the **"Scenario Comparison"** tab in the navigation bar.
2. Under **Base Map**, select **Default 4-Way Intersection** or **3x3 Urban Grid Network**.
3. Under **Test Scenarios**, click a preset (e.g. **🚧 West Road Closure**, **🚦 Adaptive Signal Upgrade**, or **Center Route Closure**).
4. Select your desired duration (e.g., `600s`), replications (`5 Paired Seeds`), and click **"Run Dual Comparison"**.
5. Once simulated:
   - Review the **KPI Delta Cards** displaying mean deltas, standard deviations, and 95% Confidence Intervals.
   - Inspect the **Comparative Recharts Graphs** (Delay, Speed, Active Vehicles, Completed Trips).
   - Click **"Export Time-Series CSV"** or **"Export Road CSV"** to download raw data.
   - Click **"Executive Report"** to view and print the PDF executive summary.
   - Click **"Past Runs"** in the navigation bar to browse and inspect all historical simulation runs.

---

## 📚 Documentation & Viva Defense

For detailed mathematical derivations (IDM equations, MOBIL criteria, Webster's cycle optimization, A* admissibility proofs, and Student's $t$ statistical confidence intervals) along with anticipated oral examination questions and answers, consult:
- **[VIVA_GUIDE.md](file:///d:/CitySim/VIVA_GUIDE.md)**
- **[DECISIONS.md](file:///d:/CitySim/DECISIONS.md)**
- **[TASKS.md](file:///d:/CitySim/TASKS.md)**
