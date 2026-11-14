import test from 'node:test';
import assert from 'node:assert';
import { RoadGraph } from '../src/graph.ts';
import type { IntersectionNode, RoadSegment } from '../src/types.ts';

test('RoadGraph: Adds nodes and directed edges properly', () => {
  const graph = new RoadGraph();

  const nodeA: IntersectionNode = {
    id: 'node_A',
    x: 0,
    y: 0,
    controlType: 'unsignalized',
    incomingEdgeIds: [],
    outgoingEdgeIds: [],
  };

  const nodeB: IntersectionNode = {
    id: 'node_B',
    x: 100,
    y: 0,
    controlType: 'unsignalized',
    incomingEdgeIds: [],
    outgoingEdgeIds: [],
  };

  graph.addNode(nodeA);
  graph.addNode(nodeB);

  const edgeAB: RoadSegment = {
    id: 'edge_A_B',
    fromNodeId: 'node_A',
    toNodeId: 'node_B',
    length: 100,
    speedLimit: 13.89,
    lanes: 2,
    isOneWay: true,
  };

  graph.addEdge(edgeAB);

  assert.strictEqual(graph.getNodeCount(), 2);
  assert.strictEqual(graph.getEdgeCount(), 1);

  const outgoingA = graph.getOutgoingEdges('node_A');
  assert.strictEqual(outgoingA.length, 1);
  assert.strictEqual(outgoingA[0].id, 'edge_A_B');

  const incomingB = graph.getIncomingEdges('node_B');
  assert.strictEqual(incomingB.length, 1);
  assert.strictEqual(incomingB[0].id, 'edge_A_B');
});

test('RoadGraph: Creates bidirectional road with two anti-parallel edges', () => {
  const graph = new RoadGraph();

  graph.addNode({ id: 'N1', x: 0, y: 0, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });
  graph.addNode({ id: 'N2', x: 200, y: 0, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });

  const { forward, backward } = graph.addBidirectionalRoad('main_st', 'N1', 'N2', 200, 2, 16.67);

  assert.strictEqual(forward.id, 'main_st_fwd');
  assert.strictEqual(backward.id, 'main_st_bwd');
  assert.strictEqual(forward.fromNodeId, 'N1');
  assert.strictEqual(forward.toNodeId, 'N2');
  assert.strictEqual(backward.fromNodeId, 'N2');
  assert.strictEqual(backward.toNodeId, 'N1');
  assert.strictEqual(graph.getEdgeCount(), 2);
});

test('RoadGraph: Validates missing endpoint references', () => {
  const graph = new RoadGraph();

  graph.addNode({ id: 'N1', x: 0, y: 0, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });

  // Adding edge pointing to non-existent N2 should throw error
  assert.throws(() => {
    graph.addEdge({
      id: 'bad_edge',
      fromNodeId: 'N1',
      toNodeId: 'N2_missing',
      length: 50,
      speedLimit: 13.89,
      lanes: 1,
      isOneWay: true,
    });
  });
});

test('RoadGraph: Serializes to JSON and reconstructs identically', () => {
  const graph = new RoadGraph();
  graph.addNode({ id: 'N1', x: 10, y: 20, controlType: 'fixed_signal', incomingEdgeIds: [], outgoingEdgeIds: [] });
  graph.addNode({ id: 'N2', x: 110, y: 20, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });
  graph.addEdge({
    id: 'e1',
    fromNodeId: 'N1',
    toNodeId: 'N2',
    length: 100,
    speedLimit: 15,
    lanes: 2,
    isOneWay: true,
  });

  const json = graph.toJSON();
  const restoredGraph = RoadGraph.fromJSON(json);

  assert.strictEqual(restoredGraph.getNodeCount(), 2);
  assert.strictEqual(restoredGraph.getEdgeCount(), 1);
  assert.strictEqual(restoredGraph.getEdge('e1')?.lanes, 2);
});

test('RoadGraph: Road closure toggling works correctly', () => {
  const graph = new RoadGraph();
  graph.addNode({ id: 'A', x: 0, y: 0, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });
  graph.addNode({ id: 'B', x: 50, y: 0, controlType: 'unsignalized', incomingEdgeIds: [], outgoingEdgeIds: [] });
  graph.addEdge({
    id: 'E_AB',
    fromNodeId: 'A',
    toNodeId: 'B',
    length: 50,
    speedLimit: 13.89,
    lanes: 1,
    isOneWay: true,
  });

  assert.strictEqual(graph.isRoadClosed('E_AB'), false);
  graph.setRoadClosure('E_AB', true);
  assert.strictEqual(graph.isRoadClosed('E_AB'), true);
  graph.setRoadClosure('E_AB', false);
  assert.strictEqual(graph.isRoadClosed('E_AB'), false);
});
