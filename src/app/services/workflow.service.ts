import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import {
  WorkflowGraph,
  WorkflowNode,
  WorkflowExecutionPayload,
  WorkflowExecutionStep
} from '../models/workflow.model';

@Injectable({
  providedIn: 'root'
})
export class WorkflowService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/v1/workflows';

  // Signal für alle gespeicherten Workflows aus dem Backend
  readonly workflows = signal<WorkflowGraph[]>([]);

  // Signal für den aktuell im Canvas geöffneten Workflow
  readonly activeWorkflow = signal<WorkflowGraph>(this.createEmptyWorkflow());

  readonly activeWorkflowId = computed(() => this.activeWorkflow().id);

  // Lade-Status
  readonly isLoading = signal<boolean>(false);

  constructor() {
    this.loadWorkflows();
  }

  /**
   * Lädt alle gespeicherten Workflows vom Flask-Backend.
   */
  loadWorkflows(): void {
    this.isLoading.set(true);
    this.http.get<WorkflowGraph[]>(this.apiUrl).subscribe({
      next: (list) => {
        this.workflows.set(list);
        if (list.length > 0 && !this.activeWorkflow().id && this.activeWorkflow().nodes.length === 0) {
          this.activeWorkflow.set(structuredClone(list[0]));
        }
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Fehler beim Laden der Workflows vom Backend:', err);
        this.isLoading.set(false);
      }
    });
  }

  /**
   * Erzeugt einen neuen, leeren Workflow-Entwurf (noch ohne Backend-ID).
   */
  createEmptyWorkflow(name = 'Unbenannter Workflow'): WorkflowGraph {
    return {
      id: '',
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
    } else {
      this.http.get<WorkflowGraph>(`${this.apiUrl}/${id}`).subscribe({
        next: (wf) => this.activeWorkflow.set(structuredClone(wf)),
        error: (err) => console.error(`Workflow ${id} konnte nicht geladen werden:`, err)
      });
    }
  }

  /**
   * Erstellt einen neuen Workflow (POST /api/v1/workflows) oder
   * aktualisiert einen bestehenden Workflow (PUT /api/v1/workflows/<id>).
   */
  saveWorkflow(graph: WorkflowGraph): Observable<WorkflowGraph> {
    const payload: WorkflowGraph = {
      ...structuredClone(graph),
      name: graph.name.trim() || 'Unbenannter Workflow',
      updatedAt: new Date().toISOString()
    };

    const isExisting =
      Boolean(payload.id) && this.workflows().some((w) => w.id === payload.id);

    const request$ = isExisting
      ? this.http.put<WorkflowGraph>(`${this.apiUrl}/${payload.id}`, payload)
      : this.http.post<WorkflowGraph>(this.apiUrl, payload);

    return request$.pipe(
      tap((savedGraph) => {
        this.workflows.update((list) => {
          const idx = list.findIndex((w) => w.id === savedGraph.id);
          if (idx >= 0) {
            const copy = [...list];
            copy[idx] = savedGraph;
            return copy;
          }
          return [savedGraph, ...list];
        });
        this.activeWorkflow.set(structuredClone(savedGraph));
      })
    );
  }

  /**
   * Löscht einen gespeicherten Workflow im Flask-Backend (DELETE /api/v1/workflows/<id>).
   */
  deleteWorkflow(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`).pipe(
      tap(() => {
        this.workflows.update((list) => list.filter((w) => w.id !== id));
        if (this.activeWorkflow().id === id) {
          const remaining = this.workflows();
          this.activeWorkflow.set(
            remaining.length > 0 ? structuredClone(remaining[0]) : this.createEmptyWorkflow()
          );
        }
      })
    );
  }

  /**
   * Übersetzt den visuellen Graphen (Nodes + Edges) topologisch in eine
   * Task-Chain für das Flask-Backend.
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

    for (const node of graph.nodes) {
      if (!visited.has(node.id)) {
        orderedNodes.push(node);
      }
    }

    const nodeStepIndex = new Map<string, number>();
    const steps: WorkflowExecutionStep[] = orderedNodes.map((node, index) => {
      const stepNum = index + 1;
      nodeStepIndex.set(node.id, stepNum);

      const incomingEdges = graph.edges.filter((e) => e.targetNodeId === node.id);
      const dependsOnSteps = incomingEdges
        .map((e) => nodeStepIndex.get(e.sourceNodeId))
        .filter((s): s is number => s !== undefined);

      return {
        step: stepNum,
        node_id: node.id,
        agent_id: node.agentId,
        prompt: node.prompt,
        ...(dependsOnSteps.length > 0 ? { depends_on_step: dependsOnSteps[0] } : {}),
        ...(dependsOnSteps.length > 1 ? { depends_on_steps: dependsOnSteps } : {})
      };
    });

    return {
      workflow_id: graph.id,
      workflow_name: graph.name,
      steps
    };
  }
}