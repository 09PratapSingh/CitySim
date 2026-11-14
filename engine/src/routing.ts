/**
 * Routing and Pathfinding Algorithms for Road Networks.
 * 
 * THEORETICAL FOUNDATION FOR VIVA:
 * Transportation routing involves finding the optimal path from an Origin (O)
 * to a Destination (D) on a directed graph G = (V, E).
 * 
 * 1. Dijkstra's Algorithm (1959):
 *    - Guarantees the mathematically optimal path by exploring concentric equicost contours.
 *    - Time complexity: O((|E| + |V|) log |V|) using a binary min-heap.
 *    - Blind search: Expands equally in all directions, regardless of target direction.
 * 
 * 2. A* Search Algorithm (Hart, Nilsson, Raphael, 1968):
 *    - Uses a heuristic function h(n) to bias search directly toward the destination:
 *        f(n) = g(n) + h(n)
 *      where g(n) is the exact cost from origin, and h(n) is the heuristic estimate to goal.
 *    - For Euclidean spatial graphs:
 *        Distance heuristic: h(n) = EuclideanDistance(n, Goal)
 *        Time heuristic:     h(n) = EuclideanDistance(n, Goal) / maxNetworkSpeed
 *    - Admissibility: Since straight-line Euclidean distance is always <= actual road distance
 *      (triangle inequality), h(n) never overestimates the true cost. This guarantees that
 *      A* finds the strictly optimal path while visiting significantly fewer vertices than Dijkstra.
 */

import { RoadGraph } from './graph.ts';
import type { RouteCriterion, RouteResult, RoadSegment } from './types.ts';

interface HeapNode {
  nodeId: string;
  priority: number; // In Dijkstra: g(n); in A*: f(n) = g(n) + h(n)
}

/**
 * Lightweight, zero-dependency Binary Min-Heap Priority Queue.
 */
class MinHeap {
  private heap: HeapNode[] = [];

  public push(item: HeapNode): void {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  public pop(): HeapNode | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const bottom = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = bottom;
      this.bubbleDown(0);
    }
    return top;
  }

  public isEmpty(): boolean {
    return this.heap.length === 0;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIdx = Math.floor((index - 1) / 2);
      if (this.heap[index].priority < this.heap[parentIdx].priority) {
        const temp = this.heap[index];
        this.heap[index] = this.heap[parentIdx];
        this.heap[parentIdx] = temp;
        index = parentIdx;
      } else {
        break;
      }
    }
  }

  private bubbleDown(index: number): void {
    const length = this.heap.length;
    while (true) {
      let smallest = index;
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;

      if (
        leftChild < length &&
        this.heap[leftChild].priority < this.heap[smallest].priority
      ) {
        smallest = leftChild;
      }
      if (
        rightChild < length &&
        this.heap[rightChild].priority < this.heap[smallest].priority
      ) {
        smallest = rightChild;
      }
      if (smallest !== index) {
        const temp = this.heap[index];
        this.heap[index] = this.heap[smallest];
        this.heap[smallest] = temp;
        index = smallest;
      } else {
        break;
      }
    }
  }
}

export class Router {
  /**
   * Calculates the traversal cost of an edge based on the selected criterion.
   */
  private static getEdgeCost(edge: RoadSegment, criterion: RouteCriterion): number {
    if (criterion === 'distance') {
      return edge.length;
    }
    // Travel time in seconds = distance / speed
    return edge.length / Math.max(0.1, edge.speedLimit);
  }

  /**
   * Computes the maximum speed limit across the entire graph (used for admissible time heuristics).
   */
  private static getMaxSpeed(graph: RoadGraph): number {
    let max = 13.89; // Default ~50 km/h
    for (const edge of graph.getAllEdges()) {
      if (edge.speedLimit > max) {
        max = edge.speedLimit;
      }
    }
    return max;
  }

  /**
   * Computes the Euclidean distance heuristic between two nodes.
   */
  private static calculateHeuristic(
    graph: RoadGraph,
    fromNodeId: string,
    targetNodeId: string,
    criterion: RouteCriterion,
    maxSpeed: number
  ): number {
    const fromNode = graph.getNode(fromNodeId);
    const targetNode = graph.getNode(targetNodeId);
    if (!fromNode || !targetNode) return 0;

    const dx = targetNode.x - fromNode.x;
    const dy = targetNode.y - fromNode.y;
    const euclideanDist = Math.sqrt(dx * dx + dy * dy);

    if (criterion === 'distance') {
      return euclideanDist;
    }
    // Time heuristic: Euclidean distance / maximum speed limit in the network
    return euclideanDist / maxSpeed;
  }

  /**
   * Dijkstra's Algorithm: Finds optimal path without directional heuristic bias.
   */
  public static dijkstra(
    graph: RoadGraph,
    startNodeId: string,
    targetNodeId: string,
    criterion: RouteCriterion = 'travel_time'
  ): RouteResult | null {
    if (!graph.getNode(startNodeId) || !graph.getNode(targetNodeId)) {
      return null;
    }

    if (startNodeId === targetNodeId) {
      return {
        nodePath: [startNodeId],
        edgePath: [],
        totalDistance: 0,
        estimatedFreeFlowTime: 0,
        visitedNodesCount: 1,
      };
    }

    const dist: Map<string, number> = new Map();
    const prevNode: Map<string, string> = new Map();
    const prevEdge: Map<string, string> = new Map();
    const visited: Set<string> = new Set();
    const pq = new MinHeap();

    dist.set(startNodeId, 0);
    pq.push({ nodeId: startNodeId, priority: 0 });

    let visitedNodesCount = 0;

    while (!pq.isEmpty()) {
      const top = pq.pop()!;
      const u = top.nodeId;

      if (visited.has(u)) continue;
      visited.add(u);
      visitedNodesCount++;

      if (u === targetNodeId) {
        return this.reconstructPath(
          graph,
          startNodeId,
          targetNodeId,
          prevNode,
          prevEdge,
          visitedNodesCount
        );
      }

      const outgoing = graph.getOutgoingEdges(u);
      for (const edge of outgoing) {
        // Skip closed roads (Scenario testing: road closure)
        if (edge.isClosed) continue;

        const v = edge.toNodeId;
        if (visited.has(v)) continue;

        const cost = this.getEdgeCost(edge, criterion);
        const currentDistU = dist.get(u) ?? Infinity;
        const newDist = currentDistU + cost;

        if (newDist < (dist.get(v) ?? Infinity)) {
          dist.set(v, newDist);
          prevNode.set(v, u);
          prevEdge.set(v, edge.id);
          pq.push({ nodeId: v, priority: newDist });
        }
      }
    }

    return null; // Unreachable
  }

  /**
   * A* Search Algorithm: Heuristic-guided optimal pathfinding.
   */
  public static astar(
    graph: RoadGraph,
    startNodeId: string,
    targetNodeId: string,
    criterion: RouteCriterion = 'travel_time'
  ): RouteResult | null {
    if (!graph.getNode(startNodeId) || !graph.getNode(targetNodeId)) {
      return null;
    }

    if (startNodeId === targetNodeId) {
      return {
        nodePath: [startNodeId],
        edgePath: [],
        totalDistance: 0,
        estimatedFreeFlowTime: 0,
        visitedNodesCount: 1,
      };
    }

    const maxSpeed = this.getMaxSpeed(graph);
    const gScore: Map<string, number> = new Map();
    const prevNode: Map<string, string> = new Map();
    const prevEdge: Map<string, string> = new Map();
    const closedSet: Set<string> = new Set();
    const openSet = new MinHeap();

    gScore.set(startNodeId, 0);
    const initialH = this.calculateHeuristic(
      graph,
      startNodeId,
      targetNodeId,
      criterion,
      maxSpeed
    );
    openSet.push({ nodeId: startNodeId, priority: initialH });

    let visitedNodesCount = 0;

    while (!openSet.isEmpty()) {
      const top = openSet.pop()!;
      const current = top.nodeId;

      if (closedSet.has(current)) continue;
      closedSet.add(current);
      visitedNodesCount++;

      if (current === targetNodeId) {
        return this.reconstructPath(
          graph,
          startNodeId,
          targetNodeId,
          prevNode,
          prevEdge,
          visitedNodesCount
        );
      }

      const currentG = gScore.get(current) ?? Infinity;
      const outgoing = graph.getOutgoingEdges(current);

      for (const edge of outgoing) {
        // Skip closed roads (Scenario testing: road closure)
        if (edge.isClosed) continue;

        const neighbor = edge.toNodeId;
        if (closedSet.has(neighbor)) continue;

        const edgeCost = this.getEdgeCost(edge, criterion);
        const tentativeG = currentG + edgeCost;

        if (tentativeG < (gScore.get(neighbor) ?? Infinity)) {
          gScore.set(neighbor, tentativeG);
          prevNode.set(neighbor, current);
          prevEdge.set(neighbor, edge.id);

          const h = this.calculateHeuristic(
            graph,
            neighbor,
            targetNodeId,
            criterion,
            maxSpeed
          );
          const f = tentativeG + h;
          openSet.push({ nodeId: neighbor, priority: f });
        }
      }
    }

    return null; // Unreachable
  }

  /**
   * Reconstructs the complete route from predecessor maps.
   */
  private static reconstructPath(
    graph: RoadGraph,
    startNodeId: string,
    targetNodeId: string,
    prevNode: Map<string, string>,
    prevEdge: Map<string, string>,
    visitedNodesCount: number
  ): RouteResult {
    const nodePath: string[] = [];
    const edgePath: string[] = [];
    let curr: string | undefined = targetNodeId;

    while (curr !== undefined) {
      nodePath.unshift(curr);
      const edge = prevEdge.get(curr);
      if (edge) {
        edgePath.unshift(edge);
      }
      curr = prevNode.get(curr);
    }

    let totalDistance = 0;
    let estimatedFreeFlowTime = 0;

    for (const edgeId of edgePath) {
      const edge = graph.getEdge(edgeId);
      if (edge) {
        totalDistance += edge.length;
        estimatedFreeFlowTime += edge.length / Math.max(0.1, edge.speedLimit);
      }
    }

    return {
      nodePath,
      edgePath,
      totalDistance: Number(totalDistance.toFixed(2)),
      estimatedFreeFlowTime: Number(estimatedFreeFlowTime.toFixed(2)),
      visitedNodesCount,
    };
  }
}
