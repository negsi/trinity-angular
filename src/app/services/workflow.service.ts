import { Injectable, signal, computed } from '@angular/core';
import {
  WorkflowGraph,
  WorkflowNode,
  WorkflowEdge,
  WorkflowExecutionPayload,
  WorkflowExecutionStep
} from '../models/workflow.model';

@Injectable({
  providedIn: 'root'
})
export class WorkflowService {
  private readonly STORAGE_KEY = 'trinity_saved_workflows';

  // Signal für alle gespeicherten Workflows (für die Dropdown-Auswahlliste oben)
  readonly workflows = signal<WorkflowGraph[]>(this.loadFromStorage());

  // Signal für den aktuell im Canvas geöffneten Workflow
  readonly activeWorkflow = signal<WorkflowGraph>(this.createEmptyWorkflow());

  readonly activeWorkflowId = computed(() => this.activeWorkflow().id);

  constructor() {
    const existing = this.workflows();
    if (existing.length > 0) {
      this.activeWorkflow.set(structuredClone(existing[0]));
    }
  }

  /**
   * Erzeugt einen neuen, leeren Workflow im Editor.
   */
  createEmptyWorkflow(name = 'Unbenannter Workflow'): WorkflowGraph {
    return {
      id: crypto.randomUUID(),
      name,
      nodes: [],
      edges: [],
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Startet einen neuen leeren Workflow auf dem Canvas.
   */
  startNewWorkflow(): void {
    this.activeWorkflow.set(this.createEmptyWorkflow());
  }

  /**
   * Lädt einen gespeicherten Workflow anhand seiner ID in den Canvas.
   */
  selectWorkflow(id: string): void {
    const found = this.workflows().find((w) => w.id === id);
    if (found) {
      this.activeWorkflow.set(structuredClone(found));
    }
  }

  /**
   * Speichert den aktuellen Workflow (Upsert) und bereitet den Backend-Call vor.
   */
  saveWorkflow(graph: WorkflowGraph): WorkflowGraph {
    const updatedGraph: WorkflowGraph = {
      ...structuredClone(graph),
      name: graph.name.trim() || 'Unbenannter Workflow',
      updatedAt: new Date().toISOString()
    };

    this.workflows.update((list) => {
      const idx = list.findIndex((w) => w.id === updatedGraph.id);
      if (idx >= 0) {
        const copy = [...list];
        copy[idx] = updatedGraph;
        return copy;
      }
      return [updatedGraph, ...list];
    });

    this.activeWorkflow.set(structuredClone(updatedGraph));
    this.persistToStorage();

    // TODO (Backend v0.3.4): Späterer API-Call an das Flask-Backend
    // return this.http.post<WorkflowGraph>('/api/v1/workflows', updatedGraph);
    return updatedGraph;
  }

  /**
   * Löscht einen gespeicherten Workflow.
   */
  deleteWorkflow(id: string): void {
    this.workflows.update((list) => list.filter((w) => w.id !== id));
    this.persistToStorage();

    if (this.activeWorkflow().id === id) {
      const remaining = this.workflows();
      this.activeWorkflow.set(
        remaining.length > 0 ? structuredClone(remaining[0]) : this.createEmptyWorkflow()
      );
    }
  }

  /**
   * Übersetzt den visuellen Graphen (Nodes + Edges) topologisch in eine
   * sequenzielle Task-Chain für das Flask-Backend (`message_agent`).
   */
  buildExecutionPlan(graph: WorkflowGraph = this.activeWorkflow()): WorkflowExecutionPayload {
    const nodesMap = new Map<string, WorkflowNode>(graph.nodes.map((n) => [n.id, n]));
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const node of graph.nodes) {
      inDegree.set(node.id, 0);
      adjacency.set(node.id, []);
    }

    for (const edge of graph.edges) {
      if (nodesMap.has(edge.sourceNodeId) && nodesMap.has(edge.targetNodeId)) {
        adjacency.get(edge.sourceNodeId)!.push(edge.targetNodeId);
        inDegree.set(edge.targetNodeId, (inDegree.get(edge.targetNodeId) || 0) + 1);
      }
    }

    // Startknoten (ohne eingehende Kante), sortiert nach X-Koordinate (links nach rechts)
    const queue = graph.nodes
      .filter((n) => (inDegree.get(n.id) || 0) === 0)
      .sort((a, b) => a.x - b.x)
      .map((n) => n.id);

    const orderedNodes: WorkflowNode[] = [];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const node = nodesMap.get(currentId);
      if (node) orderedNodes.push(node);

      for (const neighborId of adjacency.get(currentId) || []) {
        inDegree.set(neighborId, (inDegree.get(neighborId) || 1) - 1);
        if (inDegree.get(neighborId) === 0) {
          queue.push(neighborId);
        }
      }
    }

    // Falls Zyklen existieren, restliche Knoten anhängen
    for (const node of graph.nodes) {
      if (!visited.has(node.id)) {
        orderedNodes.push(node);
      }
    }

    const nodeStepIndex = new Map<string, number>();
    const steps: WorkflowExecutionStep[] = orderedNodes.map((node, index) => {
      const stepNum = index + 1;
      nodeStepIndex.set(node.id, stepNum);

      const incomingEdge = graph.edges.find((e) => e.targetNodeId === node.id);
      const dependsOnStep = incomingEdge ? nodeStepIndex.get(incomingEdge.sourceNodeId) : undefined;

      return {
        step: stepNum,
        node_id: node.id,
        agent_id: node.agentId,
        prompt: node.prompt,
        ...(dependsOnStep ? { depends_on_step: dependsOnStep } : {})
      };
    });

    return {
      workflow_id: graph.id,
      workflow_name: graph.name,
      steps
    };
  }

  private loadFromStorage(): WorkflowGraph[] {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {
      // Fallback bei fehlerhaftem JSON
    }
    return [];
  }

  private persistToStorage(): void {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.workflows()));
  }
}