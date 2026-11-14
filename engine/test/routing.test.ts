import test from 'node:test';
import assert from 'node:assert';
import { RoadGraph } from '../src/graph.ts';
import { Router } from '../src/routing.ts';

function buildDiamondGraph(): RoadGraph {
  const graph = new RoadGraph();

  // Nodes: A (start), B (upper branch), C (lower branch), D (destination)
  graph.addNode({ id: 'A', x: 0, y: 0, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });
  graph.addNode({ id: 'B', x: 100, y: 30, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });
  graph.addNode({ id: 'C', x: 100, y: -30, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });
  graph.addNode({ id: 'D', x: 200, y: 0, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });

  // Upper path: A -> B -> D (Length: 100 + 100 = 200m, speed 15 m/s)
  graph.addEdge({ id: 'e_AB', fromNodeId: 'A', toNodeId: 'B', length: 100, speedLimit: 15, lanes: 1, isOneWay: true });
  graph.addEdge({ id: 'e_BD', fromNodeId: 'B', toNodeId: 'D', length: 100, speedLimit: 15, lanes: 1, isOneWay: true });

  // Lower path: A -> C -> D (Length: 140 + 140 = 280m, longer detour)
  graph.addEdge({ id: 'e_AC', fromNodeId: 'A', toNodeId: 'C', length: 140, speedLimit: 15, lanes: 1, isOneWay: true });
  graph.addEdge({ id: 'e_CD', fromNodeId: 'C', toNodeId: 'D', length: 140, speedLimit: 15, lanes: 1, isOneWay: true });

  return graph;
}

test('Routing: Dijkstra and A* both find the optimal shortest path', () => {
  const graph = buildDiamondGraph();

  const dijkstraResult = Router.dijkstra(graph, 'A', 'D', 'distance');
  const astarResult = Router.astar(graph, 'A', 'D', 'distance');

  assert.notStrictEqual(dijkstraResult, null);
  assert.notStrictEqual(astarResult, null);

  // Both must select the shorter upper path A -> B -> D
  assert.deepStrictEqual(dijkstraResult!.nodePath, ['A', 'B', 'D']);
  assert.deepStrictEqual(astarResult!.nodePath, ['A', 'B', 'D']);
  assert.strictEqual(dijkstraResult!.totalDistance, 200);
  assert.strictEqual(astarResult!.totalDistance, 200);
});

test('Routing: Road closure triggers automatic detour routing', () => {
  const graph = buildDiamondGraph();

  // Close the optimal edge on the upper route (Scenario testing)
  graph.setRoadClosure('e_AB', true);

  const detourResult = Router.astar(graph, 'A', 'D', 'distance');

  assert.notStrictEqual(detourResult, null);
  // Must automatically divert to lower detour A -> C -> D
  assert.deepStrictEqual(detourResult!.nodePath, ['A', 'C', 'D']);
  assert.deepStrictEqual(detourResult!.edgePath, ['e_AC', 'e_CD']);
  assert.strictEqual(detourResult!.totalDistance, 280);
});

test('Routing: Returns null when target node is unreachable', () => {
  const graph = buildDiamondGraph();

  // Close both branches
  graph.setRoadClosure('e_AB', true);
  graph.setRoadClosure('e_AC', true);

  const result = Router.astar(graph, 'A', 'D');
  assert.strictEqual(result, null);
});

test('Routing: Same start and target node returns immediate trivial route', () => {
  const graph = buildDiamondGraph();
  const result = Router.astar(graph, 'B', 'B');

  assert.notStrictEqual(result, null);
  assert.deepStrictEqual(result!.nodePath, ['B']);
  assert.strictEqual(result!.totalDistance, 0);
  assert.strictEqual(result!.edgePath.length, 0);
});

test('Routing: A* efficiency on grid network vs Dijkstra', () => {
  // Construct a 4x4 grid (16 nodes, 24 directed edges)
  const graph = new RoadGraph();
  const N = 4;

  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      graph.addNode({
        id: `N_${r}_${c}`,
        x: c * 100,
        y: r * 100,
        controlType: 'unsignalized',
        incomingEdgeIds: [],
        outgoingEdgeIds: [],
      });
    }
  }

  // Horizontal edges
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N - 1; c++) {
      graph.addEdge({
        id: `E_H_${r}_${c}`,
        fromNodeId: `N_${r}_${c}`,
        toNodeId: `N_${r}_${c + 1}`,
        length: 100,
        speedLimit: 13.89,
        lanes: 1,
        isOneWay: true,
      });
    }
  }

  // Vertical edges
  for (let r = 0; r < N - 1; r++) {
    for (let c = 0; c < N; c++) {
      graph.addEdge({
        id: `E_V_${r}_${c}`,
        fromNodeId: `N_${r}_${c}`,
        toNodeId: `N_${r + 1}_${c}`,
        length: 100,
        speedLimit: 13.89,
        lanes: 1,
        isOneWay: true,
      });
    }
  }

  const startId = 'N_0_0';
  const targetId = 'N_3_3';

  const dijkstraRes = Router.dijkstra(graph, startId, targetId, 'distance');
  const astarRes = Router.astar(graph, startId, targetId, 'distance');

  assert.notStrictEqual(dijkstraRes, null);
  assert.notStrictEqual(astarRes, null);

  // Both find identical optimal distance (6 edges * 100m = 600m)
  assert.strictEqual(dijkstraRes!.totalDistance, 600);
  assert.strictEqual(astarRes!.totalDistance, 600);

  // A* must visit fewer or equal nodes than blind Dijkstra search
  assert.strictEqual(astarRes!.visitedNodesCount <= dijkstraRes!.visitedNodesCount, true);
});
