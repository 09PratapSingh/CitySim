/**
 * Road Network Directed Graph Data Structure.
 * 
 * THEORETICAL FOUNDATION FOR VIVA:
 * Urban road networks are inherently directed graphs G = (V, E):
 * - Vertices V: Intersections, dead ends, or highway junctions.
 * - Edges E: Directed road segments where vehicles flow from an upstream node
 *   to a downstream node.
 * 
 * Dual-carriageway / two-way roads are mathematically modeled as two anti-parallel
 * directed edges (u -> v and v -> u). This cleanly accommodates asymmetrical
 * lane configurations, different speed limits in opposite directions, or
 * directional road closures (e.g. closing inbound lanes for construction while
 * outbound lanes remain open).
 */

import type { IntersectionNode, RoadSegment, Vector2D } from './types.ts';

export class RoadGraph {
  private nodes: Map<string, IntersectionNode> = new Map();
  private edges: Map<string, RoadSegment> = new Map();

  // Adjacency indices for O(1) traversal lookups
  private outgoingEdges: Map<string, string[]> = new Map();
  private incomingEdges: Map<string, string[]> = new Map();

  /**
   * Adds an intersection/endpoint node to the graph.
   */
  public addNode(node: IntersectionNode): void {
    if (this.nodes.has(node.id)) {
      throw new Error(`Node with ID '${node.id}' already exists.`);
    }

    this.nodes.set(node.id, {
      ...node,
      incomingEdgeIds: [...(node.incomingEdgeIds ?? [])],
      outgoingEdgeIds: [...(node.outgoingEdgeIds ?? [])],
    });

    if (!this.outgoingEdges.has(node.id)) {
      this.outgoingEdges.set(node.id, []);
    }
    if (!this.incomingEdges.has(node.id)) {
      this.incomingEdges.set(node.id, []);
    }
  }

  /**
   * Adds a directed road edge connecting fromNode to toNode.
   */
  public addEdge(edge: RoadSegment): void {
    if (this.edges.has(edge.id)) {
      throw new Error(`Edge with ID '${edge.id}' already exists.`);
    }

    const fromNode = this.nodes.get(edge.fromNodeId);
    const toNode = this.nodes.get(edge.toNodeId);

    if (!fromNode) {
      throw new Error(`Source node '${edge.fromNodeId}' does not exist.`);
    }
    if (!toNode) {
      throw new Error(`Target node '${edge.toNodeId}' does not exist.`);
    }

    // Auto-calculate length from node coordinates if length is not explicitly set or <= 0
    let computedLength = edge.length;
    if (computedLength <= 0 && fromNode && toNode) {
      const dx = toNode.x - fromNode.x;
      const dy = toNode.y - fromNode.y;
      computedLength = Math.sqrt(dx * dx + dy * dy);
    }

    const newEdge: RoadSegment = {
      ...edge,
      length: computedLength,
      lanes: Math.max(1, edge.lanes ?? 1),
      speedLimit: edge.speedLimit ?? 13.89,
      isOneWay: edge.isOneWay ?? true,
      isClosed: edge.isClosed ?? false,
      startCoord: edge.startCoord ?? { x: fromNode.x, y: fromNode.y },
      endCoord: edge.endCoord ?? { x: toNode.x, y: toNode.y },
    };

    this.edges.set(newEdge.id, newEdge);

    // Update adjacency indices
    this.outgoingEdges.get(edge.fromNodeId)!.push(newEdge.id);
    this.incomingEdges.get(edge.toNodeId)!.push(newEdge.id);

    fromNode.outgoingEdgeIds.push(newEdge.id);
    toNode.incomingEdgeIds.push(newEdge.id);
  }

  /**
   * Helper to create a two-way road by adding two complementary anti-parallel directed edges.
   */
  public addBidirectionalRoad(
    baseId: string,
    nodeAId: string,
    nodeBId: string,
    length: number,
    lanesPerDirection: number = 1,
    speedLimit: number = 13.89
  ): { forward: RoadSegment; backward: RoadSegment } {
    const forwardEdge: RoadSegment = {
      id: `${baseId}_fwd`,
      fromNodeId: nodeAId,
      toNodeId: nodeBId,
      length,
      lanes: lanesPerDirection,
      speedLimit,
      isOneWay: false,
      isClosed: false,
    };

    const backwardEdge: RoadSegment = {
      id: `${baseId}_bwd`,
      fromNodeId: nodeBId,
      toNodeId: nodeAId,
      length,
      lanes: lanesPerDirection,
      speedLimit,
      isOneWay: false,
      isClosed: false,
    };

    this.addEdge(forwardEdge);
    this.addEdge(backwardEdge);

    return { forward: forwardEdge, backward: backwardEdge };
  }

  /**
   * Sets the closure status of an edge (used for scenario testing: closing a road).
   */
  public setRoadClosure(edgeId: string, isClosed: boolean): void {
    const edge = this.edges.get(edgeId);
    if (!edge) {
      throw new Error(`Edge '${edgeId}' not found.`);
    }
    edge.isClosed = isClosed;
  }

  public isRoadClosed(edgeId: string): boolean {
    return this.edges.get(edgeId)?.isClosed ?? false;
  }

  public getNode(id: string): IntersectionNode | undefined {
    return this.nodes.get(id);
  }

  public getEdge(id: string): RoadSegment | undefined {
    return this.edges.get(id);
  }

  public getOutgoingEdges(nodeId: string): RoadSegment[] {
    const edgeIds = this.outgoingEdges.get(nodeId) ?? [];
    return edgeIds.map((id) => this.edges.get(id)!);
  }

  public getIncomingEdges(nodeId: string): RoadSegment[] {
    const edgeIds = this.incomingEdges.get(nodeId) ?? [];
    return edgeIds.map((id) => this.edges.get(id)!);
  }

  public getAllNodes(): IntersectionNode[] {
    return Array.from(this.nodes.values());
  }

  public getAllEdges(): RoadSegment[] {
    return Array.from(this.edges.values());
  }

  public getNodeCount(): number {
    return this.nodes.size;
  }

  public getEdgeCount(): number {
    return this.edges.size;
  }

  /**
   * Validates graph topology and integrity.
   */
  public validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (this.nodes.size === 0) {
      errors.push('Graph has no nodes.');
    }

    for (const edge of this.edges.values()) {
      if (!this.nodes.has(edge.fromNodeId)) {
        errors.push(`Edge '${edge.id}' references non-existent fromNode '${edge.fromNodeId}'.`);
      }
      if (!this.nodes.has(edge.toNodeId)) {
        errors.push(`Edge '${edge.id}' references non-existent toNode '${edge.toNodeId}'.`);
      }
      if (edge.length <= 0) {
        errors.push(`Edge '${edge.id}' has non-positive length (${edge.length}m).`);
      }
      if (edge.speedLimit <= 0) {
        errors.push(`Edge '${edge.id}' has non-positive speed limit (${edge.speedLimit}m/s).`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Serializes the graph to a plain JSON object suitable for MongoDB storage.
   */
  public toJSON(): { nodes: IntersectionNode[]; edges: RoadSegment[] } {
    return {
      nodes: this.getAllNodes(),
      edges: this.getAllEdges(),
    };
  }

  /**
   * Deserializes and constructs a RoadGraph from a JSON object.
   */
  public static fromJSON(data: { nodes: IntersectionNode[]; edges: RoadSegment[] }): RoadGraph {
    const graph = new RoadGraph();
    for (const n of data.nodes) {
      graph.addNode(n);
    }
    for (const e of data.edges) {
      graph.addEdge(e);
    }
    return graph;
  }
}
