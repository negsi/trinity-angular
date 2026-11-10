import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  inject,
  input,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';

import { WorkflowService } from '../../services/workflow.service';
import { WorkflowEdge, WorkflowNode } from '../../models/workflow.model';
import { Agent } from '../../models/agent.model';
import { getAvatarColor, getInitials } from '../../utils/avatar.util';

interface TempConnection {
  sourceNodeId: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

@Component({
  selector: 'app-workflow-workspace',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule
  ],
  templateUrl: './workflow-workspace.component.html',
  styleUrl: './workflow-workspace.component.scss'
})
export class WorkflowWorkspaceComponent implements OnDestroy {
  @ViewChild('canvasRef', { static: true }) canvasRef!: ElementRef<HTMLDivElement>;

  readonly isLightMode = input.required<boolean>();
  readonly workflowService = inject(WorkflowService);

  // Raster- und Karten-Konstanten
  readonly GRID_SIZE = 24;
  readonly NODE_WIDTH = 220;
  readonly NODE_HEIGHT = 96;
  readonly SNAP_DISTANCE = 210; // Radius für Auto-Snap & Auto-Connect
  readonly AUTO_OFFSET_X = 280; // Abstand beim automatischen Einrasten rechts neben einem Knoten
  readonly SIMULATION_STEP_MS = 2000; // Dauer pro Agenten-Schritt in der Simulation

  // Lokaler Arbeitszustand des aktuell geöffneten Workflows
  readonly workflowId = signal<string>('');
  readonly workflowName = signal<string>('Unbenannter Workflow');
  readonly nodes = signal<WorkflowNode[]>([]);
  readonly edges = signal<WorkflowEdge[]>([]);

  // UI-Feedback-States
  readonly saveSuccessToast = signal<boolean>(false);
  readonly snapTargetNodeId = signal<string | null>(null);
  readonly dropPreviewPos = signal<{ x: number; y: number } | null>(null);

  // State für die Workflow-Simulation
  readonly isSimulating = signal<boolean>(false);
  readonly simulationFinished = signal<boolean>(false);
  readonly activeSimulationNodeId = signal<string | null>(null);
  readonly completedSimulationNodeIds = signal<Set<string>>(new Set());
  private simulationTimerId: ReturnType<typeof setTimeout> | null = null;
  private finishResetTimerId: ReturnType<typeof setTimeout> | null = null;

  // Aktuell laufender Knoten für das Status-Banner unten rechts
  readonly activeSimulationNode = computed(() => {
    const activeId = this.activeSimulationNodeId();
    if (!activeId) return null;
    return this.nodes().find((n) => n.id === activeId) ?? null;
  });

  // State für das Verschieben von Knoten auf dem Canvas
  private draggingNodeId: string | null = null;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private hasDraggedNode = false;

  // State für das manuelle Ziehen einer Verbindungslinie über die Ports
  readonly activeConnection = signal<TempConnection | null>(null);
  readonly hoveredTargetPortNodeId = signal<string | null>(null);

  // State für das Prompt-Modal bei Klick auf einen Knoten
  readonly editingNode = signal<WorkflowNode | null>(null);
  readonly editingPromptText = signal<string>('');

  // Avatar-Hilfsfunktionen
  readonly getInitials = getInitials;
  readonly getAvatarBg = getAvatarColor;

  // Berechnete SVG-Pfade für alle Verbindungen inkl. Simulations-Status
  readonly renderedEdges = computed(() => {
    const currentNodes = this.nodes();
    const currentEdges = this.edges();
    const activeId = this.activeSimulationNodeId();
    const completedIds = this.completedSimulationNodeIds();

    return currentEdges
      .map((edge) => {
        const source = currentNodes.find((n) => n.id === edge.sourceNodeId);
        const target = currentNodes.find((n) => n.id === edge.targetNodeId);
        if (!source || !target) return null;

        const startX = source.x + this.NODE_WIDTH;
        const startY = source.y + this.NODE_HEIGHT / 2;
        const endX = target.x;
        const endY = target.y + this.NODE_HEIGHT / 2;

        const isEdgeActive =
          completedIds.has(edge.sourceNodeId) && activeId === edge.targetNodeId;
        const isEdgeCompleted =
          completedIds.has(edge.sourceNodeId) && completedIds.has(edge.targetNodeId);

        return {
          ...edge,
          path: this.buildBezierPath(startX, startY, endX, endY),
          midX: (startX + endX) / 2,
          midY: (startY + endY) / 2,
          isEdgeActive,
          isEdgeCompleted
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);
  });

  // Berechneter SVG-Pfad für die gerade gezogene Linie
  readonly tempConnectionPath = computed(() => {
    const conn = this.activeConnection();
    if (!conn) return null;
    return this.buildBezierPath(conn.startX, conn.startY, conn.currentX, conn.currentY);
  });

  constructor() {
    // Synchronisiert den lokalen Canvas-State, wenn im Service ein Workflow geladen wird
    effect(
      () => {
        const active = this.workflowService.activeWorkflow();
        this.stopSimulation(true);
        this.workflowId.set(active.id);
        this.workflowName.set(active.name);
        this.nodes.set(structuredClone(active.nodes));
        this.edges.set(structuredClone(active.edges));
      },
      { allowSignalWrites: true }
    );
  }

  ngOnDestroy(): void {
    this.clearSimulationTimers();
  }

  // ===========================================================================
  // WORKFLOW-SIMULATION (START / STOPP / SCHRITT-DURCHLAUF)
  // ===========================================================================

  toggleSimulation(): void {
    if (this.isSimulating()) {
      this.stopSimulation(true);
    } else {
      this.startSimulation();
    }
  }

  startSimulation(): void {
    const currentNodes = this.nodes();
    if (currentNodes.length === 0) return;

    this.clearSimulationTimers();
    this.isSimulating.set(true);
    this.simulationFinished.set(false);
    this.completedSimulationNodeIds.set(new Set());

    const orderedNodes = this.computeExecutionOrder(currentNodes, this.edges());
    this.runSimulationStep(orderedNodes, 0);
  }

  stopSimulation(resetHighlights = true): void {
    this.clearSimulationTimers();
    this.isSimulating.set(false);
    this.activeSimulationNodeId.set(null);

    if (resetHighlights) {
      this.simulationFinished.set(false);
      this.completedSimulationNodeIds.set(new Set());
    }
  }

  isNodeRunning(nodeId: string): boolean {
    return this.activeSimulationNodeId() === nodeId;
  }

  isNodeCompleted(nodeId: string): boolean {
    return this.completedSimulationNodeIds().has(nodeId);
  }

  private runSimulationStep(orderedNodes: WorkflowNode[], index: number): void {
    if (!this.isSimulating()) return;

    // Alle Knoten wurden erfolgreich durchlaufen
    if (index >= orderedNodes.length) {
      this.activeSimulationNodeId.set(null);
      this.isSimulating.set(false);
      this.simulationFinished.set(true);

      // Nach 4 Sekunden die grünen Abschluss-Markierungen automatisch zurücksetzen
      this.finishResetTimerId = setTimeout(() => {
        this.simulationFinished.set(false);
        this.completedSimulationNodeIds.set(new Set());
      }, 4000);
      return;
    }

    const currentNode = orderedNodes[index];
    this.activeSimulationNodeId.set(currentNode.id);

    this.simulationTimerId = setTimeout(() => {
      this.completedSimulationNodeIds.update((prev) => {
        const next = new Set(prev);
        next.add(currentNode.id);
        return next;
      });
      this.runSimulationStep(orderedNodes, index + 1);
    }, this.SIMULATION_STEP_MS);
  }

  /**
   * Ermittelt die Ausführungsreihenfolge anhand der gerichteten Verbindungen (Topologische Sortierung)
   * mit Fallback auf die horizontale Position (x-Koordinate).
   */
  private computeExecutionOrder(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const node of nodes) {
      inDegree.set(node.id, 0);
      adjacency.set(node.id, []);
    }

    for (const edge of edges) {
      if (inDegree.has(edge.targetNodeId) && adjacency.has(edge.sourceNodeId)) {
        inDegree.set(edge.targetNodeId, (inDegree.get(edge.targetNodeId) ?? 0) + 1);
        adjacency.get(edge.sourceNodeId)!.push(edge.targetNodeId);
      }
    }

    const sortByPosition = (a: WorkflowNode, b: WorkflowNode) =>
      a.x !== b.x ? a.x - b.x : a.y - b.y;

    const available = nodes
      .filter((n) => (inDegree.get(n.id) ?? 0) === 0)
      .sort(sortByPosition);

    const result: WorkflowNode[] = [];
    const visited = new Set<string>();

    while (available.length > 0) {
      const current = available.shift()!;
      if (visited.has(current.id)) continue;

      visited.add(current.id);
      result.push(current);

      const neighbors = adjacency.get(current.id) ?? [];
      for (const targetId of neighbors) {
        inDegree.set(targetId, (inDegree.get(targetId) ?? 1) - 1);
        if (inDegree.get(targetId) === 0 && !visited.has(targetId)) {
          const targetNode = nodes.find((n) => n.id === targetId);
          if (targetNode) {
            available.push(targetNode);
            available.sort(sortByPosition);
          }
        }
      }
    }

    // Falls Zyklen existieren, restliche Knoten nach Position anhängen
    if (result.length < nodes.length) {
      const remaining = nodes.filter((n) => !visited.has(n.id)).sort(sortByPosition);
      result.push(...remaining);
    }

    return result;
  }

  private clearSimulationTimers(): void {
    if (this.simulationTimerId !== null) {
      clearTimeout(this.simulationTimerId);
      this.simulationTimerId = null;
    }
    if (this.finishResetTimerId !== null) {
      clearTimeout(this.finishResetTimerId);
      this.finishResetTimerId = null;
    }
  }

  // ===========================================================================
  // TOP-TOOLBAR AKTIONEN (Laden, Neu, Speichern, Leeren)
  // ===========================================================================

  onSelectSavedWorkflow(workflowId: string): void {
    if (!workflowId) return;
    this.stopSimulation(true);
    this.workflowService.selectWorkflow(workflowId);
  }

  onNewWorkflow(): void {
    this.stopSimulation(true);
    this.workflowService.startNewWorkflow();
  }

  onSaveWorkflow(): void {
    const saved = this.workflowService.saveWorkflow({
      id: this.workflowId(),
      name: this.workflowName(),
      nodes: this.nodes(),
      edges: this.edges(),
      updatedAt: new Date().toISOString()
    });

    // Vorbereitete Task-Chain-Übersetzung für das Backend in der Konsole ausgeben
    const executionPayload = this.workflowService.buildExecutionPlan(saved);
    console.info('[Trinity Workflow Engine] Prepared Backend Execution Payload:', executionPayload);

    this.saveSuccessToast.set(true);
    setTimeout(() => this.saveSuccessToast.set(false), 2500);
  }

  onClearCanvas(): void {
    this.stopSimulation(true);
    this.nodes.set([]);
    this.edges.set([]);
  }

  // ===========================================================================
  // DRAG & DROP AUS DER AGENTEN-LISTE AUF DEN CANVAS
  // ===========================================================================

  onCanvasDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }

    const { x, y } = this.getCanvasCoords(event.clientX, event.clientY);
    const rawX = x - this.NODE_WIDTH / 2;
    const rawY = y - this.NODE_HEIGHT / 2;

    const snapTarget = this.findNearestSnapNode(rawX, rawY);
    if (snapTarget) {
      this.snapTargetNodeId.set(snapTarget.id);
      this.dropPreviewPos.set({
        x: this.snapToGrid(snapTarget.x + this.AUTO_OFFSET_X),
        y: this.snapToGrid(snapTarget.y)
      });
    } else {
      this.snapTargetNodeId.set(null);
      this.dropPreviewPos.set({
        x: this.snapToGrid(rawX),
        y: this.snapToGrid(rawY)
      });
    }
  }

  onCanvasDragLeave(): void {
    this.snapTargetNodeId.set(null);
    this.dropPreviewPos.set(null);
  }

  onCanvasDrop(event: DragEvent): void {
    event.preventDefault();
    const rawData = event.dataTransfer?.getData('application/trinity-agent');
    this.dropPreviewPos.set(null);

    if (!rawData) {
      this.snapTargetNodeId.set(null);
      return;
    }

    try {
      const agent: Agent = JSON.parse(rawData);
      const { x, y } = this.getCanvasCoords(event.clientX, event.clientY);

      let targetX = this.snapToGrid(x - this.NODE_WIDTH / 2);
      let targetY = this.snapToGrid(y - this.NODE_HEIGHT / 2);

      // Prüfen, ob ein bestehender Knoten zum automatischen Einrasten & Verbinden in der Nähe ist
      const nearNode = this.findNearestSnapNode(targetX, targetY);
      if (nearNode) {
        targetX = this.snapToGrid(nearNode.x + this.AUTO_OFFSET_X);
        targetY = this.snapToGrid(nearNode.y);
      }

      const newNode: WorkflowNode = {
        id: crypto.randomUUID(),
        agentId: agent.id,
        agentName: agent.name,
        agentDescription: agent.description || '',
        x: Math.max(24, targetX),
        y: Math.max(24, targetY),
        prompt: ''
      };

      this.nodes.update((list) => [...list, newNode]);

      // Automatische Verbindung (WorkflowEdge) herstellen, wenn in der Nähe gedroppt wurde
      if (nearNode) {
        this.addEdge(nearNode.id, newNode.id);
      }
    } catch (err) {
      console.error('Fehler beim Droppen des Agenten:', err);
    } finally {
      this.snapTargetNodeId.set(null);
    }
  }

  // ===========================================================================
  // KNOTEN AUF DEM RASTER VERSCHIEBEN + AUTO-SNAP & AUTO-CONNECT
  // ===========================================================================

  onNodeMouseDown(event: MouseEvent, node: WorkflowNode): void {
    // Ignorieren, falls auf einen Port oder den Löschen-Button geklickt wurde
    const targetEl = event.target as HTMLElement;
    if (targetEl.closest('.node-port') || targetEl.closest('.node-delete-btn')) {
      return;
    }

    event.stopPropagation();
    this.draggingNodeId = node.id;
    this.hasDraggedNode = false;

    const { x, y } = this.getCanvasCoords(event.clientX, event.clientY);
    this.dragOffsetX = x - node.x;
    this.dragOffsetY = y - node.y;
  }

  @HostListener('window:mousemove', ['$event'])
  onWindowMouseMove(event: MouseEvent): void {
    // 1. Knoten wird verschoben
    if (this.draggingNodeId) {
      this.hasDraggedNode = true;
      const { x, y } = this.getCanvasCoords(event.clientX, event.clientY);
      const nextX = Math.max(12, this.snapToGrid(x - this.dragOffsetX));
      const nextY = Math.max(12, this.snapToGrid(y - this.dragOffsetY));

      // Prüfen, ob wir uns einem anderen Knoten nähern (Auto-Snap Vorschau)
      const snapCandidate = this.findNearestSnapNode(nextX, nextY, this.draggingNodeId);
      this.snapTargetNodeId.set(snapCandidate ? snapCandidate.id : null);

      this.nodes.update((list) =>
        list.map((n) => (n.id === this.draggingNodeId ? { ...n, x: nextX, y: nextY } : n))
      );
      return;
    }

    // 2. Verbindungspfeil wird manuell von einem Port gezogen
    const conn = this.activeConnection();
    if (conn) {
      const { x, y } = this.getCanvasCoords(event.clientX, event.clientY);
      this.activeConnection.set({
        ...conn,
        currentX: x,
        currentY: y
      });
    }
  }

  @HostListener('window:mouseup')
  onWindowMouseUp(): void {
    // Wenn ein Knoten verschoben wurde und sich im Snap-Radius eines anderen befindet:
    // Einrasten & automatisch verbinden!
    if (this.draggingNodeId) {
      const movedNode = this.nodes().find((n) => n.id === this.draggingNodeId);
      const snapTargetId = this.snapTargetNodeId();

      if (movedNode && snapTargetId) {
        const snapTarget = this.nodes().find((n) => n.id === snapTargetId);
        if (snapTarget && !this.hasAnyConnectionBetween(snapTarget.id, movedNode.id)) {
          const snappedX = this.snapToGrid(snapTarget.x + this.AUTO_OFFSET_X);
          const snappedY = this.snapToGrid(snapTarget.y);

          this.nodes.update((list) =>
            list.map((n) => (n.id === movedNode.id ? { ...n, x: snappedX, y: snappedY } : n))
          );
          this.addEdge(snapTarget.id, movedNode.id);
        }
      }

      this.draggingNodeId = null;
      this.snapTargetNodeId.set(null);
    }

    // Wenn eine manuelle Verbindungslinie gezogen wurde:
    const conn = this.activeConnection();
    if (conn) {
      const targetId = this.hoveredTargetPortNodeId();
      if (targetId && targetId !== conn.sourceNodeId) {
        this.addEdge(conn.sourceNodeId, targetId);
      }
      this.activeConnection.set(null);
      this.hoveredTargetPortNodeId.set(null);
    }
  }

  // ===========================================================================
  // MANUELLES VERKNÜPFEN ÜBER KARTEN-PORTS
  // ===========================================================================

  onStartPortDrag(event: MouseEvent, sourceNode: WorkflowNode): void {
    event.stopPropagation();
    event.preventDefault();

    const startX = sourceNode.x + this.NODE_WIDTH;
    const startY = sourceNode.y + this.NODE_HEIGHT / 2;

    this.activeConnection.set({
      sourceNodeId: sourceNode.id,
      startX,
      startY,
      currentX: startX,
      currentY: startY
    });
  }

  onNodeMouseEnter(node: WorkflowNode): void {
    const conn = this.activeConnection();
    if (conn && conn.sourceNodeId !== node.id) {
      this.hoveredTargetPortNodeId.set(node.id);
    }
  }

  onNodeMouseLeave(node: WorkflowNode): void {
    if (this.hoveredTargetPortNodeId() === node.id) {
      this.hoveredTargetPortNodeId.set(null);
    }
  }

  // ===========================================================================
  // KLICK AUF KNOTEN -> PROMPT-KONFIGURATIONSFENSTER (MODAL)
  // ===========================================================================

  onNodeClick(event: MouseEvent, node: WorkflowNode): void {
    const targetEl = event.target as HTMLElement;
    if (targetEl.closest('.node-port') || targetEl.closest('.node-delete-btn')) {
      return;
    }

    // Nur öffnen, wenn die Karte angeklickt und nicht verschoben wurde
    if (this.hasDraggedNode) {
      this.hasDraggedNode = false;
      return;
    }

    this.editingNode.set(node);
    this.editingPromptText.set(node.prompt || '');
  }

  saveNodePrompt(): void {
    const current = this.editingNode();
    if (!current) return;

    const updatedPrompt = this.editingPromptText().trim();
    this.nodes.update((list) =>
      list.map((n) => (n.id === current.id ? { ...n, prompt: updatedPrompt } : n))
    );
    this.closePromptModal();
  }

  closePromptModal(): void {
    this.editingNode.set(null);
    this.editingPromptText.set('');
  }

  // ===========================================================================
  // LÖSCHEN VON KNOTEN & VERBINDUNGEN
  // ===========================================================================

  removeNode(event: MouseEvent, nodeId: string): void {
    event.stopPropagation();
    this.nodes.update((list) => list.filter((n) => n.id !== nodeId));
    this.edges.update((list) =>
      list.filter((e) => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId)
    );
  }

  removeEdge(event: MouseEvent, edgeId: string): void {
    event.stopPropagation();
    this.edges.update((list) => list.filter((e) => e.id !== edgeId));
  }

  // ===========================================================================
  // HILFSFUNKTIONEN (Grid-Snap, Distanzberechnung & Bézier-Kurven)
  // ===========================================================================

  private addEdge(sourceNodeId: string, targetNodeId: string): void {
    if (sourceNodeId === targetNodeId) return;
    const exists = this.edges().some(
      (e) => e.sourceNodeId === sourceNodeId && e.targetNodeId === targetNodeId
    );
    if (exists) return;

    const newEdge: WorkflowEdge = {
      id: crypto.randomUUID(),
      sourceNodeId,
      targetNodeId
    };
    this.edges.update((list) => [...list, newEdge]);
  }

  private hasAnyConnectionBetween(nodeAId: string, nodeBId: string): void | boolean {
    return this.edges().some(
      (e) =>
        (e.sourceNodeId === nodeAId && e.targetNodeId === nodeBId) ||
        (e.sourceNodeId === nodeBId && e.targetNodeId === nodeAId)
    );
  }

  private findNearestSnapNode(
    x: number,
    y: number,
    excludeNodeId?: string
  ): WorkflowNode | null {
    let closest: WorkflowNode | null = null;
    let minDistance = this.SNAP_DISTANCE;

    for (const node of this.nodes()) {
      if (node.id === excludeNodeId) continue;
      const dx = x - node.x;
      const dy = y - node.y;
      const distance = Math.hypot(dx, dy);
      if (distance < minDistance) {
        minDistance = distance;
        closest = node;
      }
    }
    return closest;
  }

  private snapToGrid(value: number): number {
    return Math.round(value / this.GRID_SIZE) * this.GRID_SIZE;
  }

  private getCanvasCoords(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  private buildBezierPath(x1: number, y1: number, x2: number, y2: number): string {
    const deltaX = Math.max(Math.abs(x2 - x1) * 0.5, 60);
    const cp1x = x1 + deltaX;
    const cp1y = y1;
    const cp2x = x2 - deltaX;
    const cp2y = y2;
    return `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
  }
}