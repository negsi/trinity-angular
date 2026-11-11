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
  signal,
   untracked
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SafeHtml } from '@angular/platform-browser';

import { WorkflowService } from '../../services/workflow.service';
import {
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeExecutionState,
  WorkflowStreamEvent
} from '../../models/workflow.model';
import { Agent } from '../../models/agent.model';
import { TaskItem, TaskStatus } from '../../models/task-chain.model';
import { TaskChainListComponent } from '../task-chain-list/task-chain-list.component';
import { getAvatarColor, getInitials } from '../../utils/avatar.util';
import { SseDecoder } from '../../utils/sse-decoder.util';
import { formatMessageContent } from '../../utils/text.util';

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
    MatTooltipModule,
    TaskChainListComponent
  ],
  templateUrl: './workflow-workspace.component.html',
  styleUrl: './workflow-workspace.component.scss'
})
export class WorkflowWorkspaceComponent implements OnDestroy {
  @ViewChild('canvasRef', { static: true }) canvasRef!: ElementRef<HTMLDivElement>;

  readonly isLightMode = input.required<boolean>();
  readonly workflowService = inject(WorkflowService);

  // Raster- und Karten-Konstanten (exakt passend zu box-sizing: border-box)
  readonly GRID_SIZE = 24;
  readonly NODE_WIDTH = 250;
  readonly NODE_HEIGHT = 96;
  readonly PORT_RADIUS = 6.5;
  readonly SNAP_DISTANCE = 210;
  readonly AUTO_OFFSET_X = 280;

  // Lokaler Arbeitszustand des aktuell geöffneten Workflows
  readonly workflowId = signal<string>('');
  readonly workflowName = signal<string>('Unbenannter Workflow');
  readonly nodes = signal<WorkflowNode[]>([]);
  readonly edges = signal<WorkflowEdge[]>([]);

  // UI-Feedback-States
  readonly saveSuccessToast = signal<boolean>(false);
  readonly snapTargetNodeId = signal<string | null>(null);
  readonly dropPreviewPos = signal<{ x: number; y: number } | null>(null);

  // State für die echte Backend-Workflow-Ausführung (unterstützt parallele Knoten pro Stufe!)
  readonly isSimulating = signal<boolean>(false);
  readonly simulationFinished = signal<boolean>(false);
  readonly activeSimulationNodeIds = signal<Set<string>>(new Set());
  readonly completedSimulationNodeIds = signal<Set<string>>(new Set());
  readonly errorSimulationNodeIds = signal<Set<string>>(new Set());

  // Detaillierter Live-Ausführungszustand pro Knoten (Thoughts, Task-Chains, LLM-Output, Attachments)
  readonly nodeExecutionStates = signal<Record<string, WorkflowNodeExecutionState>>({});

  private streamAbortController: AbortController | null = null;
  private finishResetTimerId: ReturnType<typeof setTimeout> | null = null;
  private isInternalSaveBeforeRun = false;

  // Aktuell laufende Knoten für das Status-Banner unten rechts
  readonly activeSimulationNode = computed(() => {
    const activeIds = this.activeSimulationNodeIds();
    if (activeIds.size === 0) return null;
    const runningNodes = this.nodes().filter((n) => activeIds.has(n.id));
    if (runningNodes.length === 0) return null;
    if (runningNodes.length === 1) return runningNodes[0];
    return {
      ...runningNodes[0],
      agentName: runningNodes.map((n) => n.agentName).join(' & ')
    };
  });

  // Berechnet für jeden Knoten seine logische Schritt-Stufe (1-basiert, parallele Knoten = gleiche Stufe)
  readonly nodeStepNumbers = computed(() => {
    const levels = this.computeExecutionLayers(this.nodes(), this.edges());
    const map = new Map<string, number>();
    levels.forEach((levelNodes, levelIdx) => {
      for (const node of levelNodes) {
        map.set(node.id, levelIdx + 1);
      }
    });
    return map;
  });

  // State für das Verschieben von Knoten auf dem Canvas
  private draggingNodeId: string | null = null;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private hasDraggedNode = false;

  // State für das manuelle Ziehen einer Verbindungslinie über die Ports
  readonly activeConnection = signal<TempConnection | null>(null);
  readonly hoveredTargetPortNodeId = signal<string | null>(null);

  // State für das Knoten-Modal (mit Tabs: 'prompt' | 'output')
  readonly editingNode = signal<WorkflowNode | null>(null);
  readonly editingPromptText = signal<string>('');
  readonly activeModalTab = signal<'prompt' | 'output'>('prompt');

  // Berechneter Live-State des aktuell im Modal geöffneten Knotens
  readonly activeModalNodeState = computed<WorkflowNodeExecutionState | null>(() => {
    const node = this.editingNode();
    if (!node) return null;
    return this.nodeExecutionStates()[node.id] ?? null;
  });

  // Avatar-Hilfsfunktionen
  readonly getInitials = getInitials;
  readonly getAvatarBg = getAvatarColor;

  // Berechnete SVG-Pfade für alle Verbindungen inkl. exakter Port-Zentrierung & Ausführungs-Status
  readonly renderedEdges = computed(() => {
    const currentNodes = this.nodes();
    const currentEdges = this.edges();
    const activeIds = this.activeSimulationNodeIds();
    const completedIds = this.completedSimulationNodeIds();

    return currentEdges
      .map((edge) => {
        const source = currentNodes.find((n) => n.id === edge.sourceNodeId);
        const target = currentNodes.find((n) => n.id === edge.targetNodeId);
        if (!source || !target) return null;

        const startX = source.x + this.NODE_WIDTH;
        const startY = source.y + this.NODE_HEIGHT / 2;
        const endX = target.x - this.PORT_RADIUS;
        const endY = target.y + this.NODE_HEIGHT / 2;

        const isEdgeActive =
          completedIds.has(edge.sourceNodeId) && activeIds.has(edge.targetNodeId);
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
    // Synchronisiert den lokalen Canvas-State, wenn im Service ein anderer Workflow ausgewählt wird
    effect(
      () => {
        const active = this.workflowService.activeWorkflow();
        const isInternalSave = untracked(() => this.isInternalSaveBeforeRun);

        if (isInternalSave) {
          this.isInternalSaveBeforeRun = false; // <-- ERST HIER zurücksetzen!
          this.workflowId.set(active.id);
          this.workflowName.set(active.name);
          return;
        }

        this.stopSimulation(true);
        this.workflowId.set(active.id);
        this.workflowName.set(active.name);
        this.nodes.set(structuredClone(active.nodes));
        this.edges.set(structuredClone(active.edges));
        this.nodeExecutionStates.set({});
      },
      { allowSignalWrites: true }
    );
  }

  ngOnDestroy(): void {
    this.stopSimulation(false);
  }

  // ===========================================================================
  // ECHTE WORKFLOW-AUSFÜHRUNG (AUTOMATISCHES SPEICHERN + BACKEND SSE-STREAM)
  // ===========================================================================

  toggleSimulation(): void {
    if (this.isSimulating()) {
      this.stopSimulation(false);
    } else {
      this.startSimulation();
    }
  }

  startSimulation(): void {
    const currentNodes = this.nodes();
    if (currentNodes.length === 0) return;

    this.clearTimersAndStream();
    this.isSimulating.set(true);
    this.simulationFinished.set(false);
    this.activeSimulationNodeIds.set(new Set());
    this.completedSimulationNodeIds.set(new Set());
    this.errorSimulationNodeIds.set(new Set());

    // Initialisiere leere Execution-States für alle Knoten
    const initialStates: Record<string, WorkflowNodeExecutionState> = {};
    for (const n of currentNodes) {
      initialStates[n.id] = {
        nodeId: n.id,
        status: 'idle',
        output: '',
        thoughts: [],
        isThinking: false,
        thoughtsExpanded: false,
        taskPhases: [],
        attachments: []
      };
    }
    this.nodeExecutionStates.set(initialStates);

    // 1. Automatisch im Backend speichern, dann 2. Stream starten
    this.isInternalSaveBeforeRun = true;
    this.workflowService
      .saveWorkflow({
        id: this.workflowId(),
        name: this.workflowName(),
        nodes: this.nodes(),
        edges: this.edges(),
        updatedAt: new Date().toISOString()
      })
      .subscribe({
        next: (saved) => {
          // NICHT hier auf false setzen, da der effect() erst asynchron danach feuert!
          this.workflowId.set(saved.id);
          this.workflowName.set(saved.name);

          // Falls ein Knoten-Modal offen ist, direkt auf den Live-Output-Tab schalten
          if (this.editingNode()) {
            this.activeModalTab.set('output');
          }

          this.streamAbortController = this.workflowService.streamWorkflowExecution(saved.id, {
            onEvent: (event) => this.handleWorkflowStreamEvent(event),
            onComplete: () => {
              this.activeSimulationNodeIds.set(new Set());
              this.isSimulating.set(false);
              this.simulationFinished.set(true);

              this.finishResetTimerId = setTimeout(() => {
                this.simulationFinished.set(false);
              }, 5000);
            },
            onError: (err) => {
              console.error('Fehler während der Workflow-Ausführung:', err);
              this.activeSimulationNodeIds.set(new Set());
              this.isSimulating.set(false);
            }
          });
        },
        error: (err) => {
          this.isInternalSaveBeforeRun = false;
          console.error('Workflow konnte vor dem Start nicht gespeichert werden:', err);
          this.isSimulating.set(false);
        }
      });
  }

  stopSimulation(resetHighlights = true): void {
    this.clearTimersAndStream();
    this.isSimulating.set(false);
    this.activeSimulationNodeIds.set(new Set());

    // Laufende Knoten im State als nicht mehr denkend markieren
    this.nodeExecutionStates.update((states) => {
      const updated = { ...states };
      for (const key of Object.keys(updated)) {
        if (updated[key].status === 'running') {
          updated[key] = { ...updated[key], isThinking: false };
        }
      }
      return updated;
    });

    if (resetHighlights) {
      this.simulationFinished.set(false);
      this.completedSimulationNodeIds.set(new Set());
      this.errorSimulationNodeIds.set(new Set());
    }
  }

  private handleWorkflowStreamEvent(event: WorkflowStreamEvent): void {
    switch (event.type) {
      case 'node_start': {
        this.activeSimulationNodeIds.update((set) => {
          const next = new Set(set);
          next.add(event.node_id);
          return next;
        });

        this.updateNodeState(event.node_id, (state) => ({
          ...state,
          status: 'running',
          isThinking: true,
          thoughtsExpanded: true
        }));
        break;
      }

      case 'node_thought': {
        const cleaned = (event.delta || event.thought || '').trim();
        if (!cleaned) break;

        this.updateNodeState(event.node_id, (state) => ({
          ...state,
          isThinking: true,
          thoughts: [
            ...state.thoughts,
            {
              text: cleaned,
              timestamp: new Date().toISOString()
            }
          ]
        }));
        break;
      }

      case 'node_task_chain': {
        const payload = event.payload;
        const tcType = payload['type'] as string | undefined;

        if (tcType === 'task_chain_init' && Array.isArray(payload['steps'])) {
          const callDepth = (payload['call_depth'] as number) ?? 0;
          const normalizedSteps: TaskItem[] = (
            payload['steps'] as Record<string, unknown>[]
          ).map((s) => ({
            step_number: (s['step_number'] ?? s['step']) as number,
            description: (s['description'] as string) ?? '',
            tool_name: (s['tool_name'] ?? s['tool']) as string | undefined,
            parameters: (s['parameters'] ?? s['params']) as Record<string, unknown> | undefined,
            status: ((s['status'] as TaskStatus) ?? 'pending')
          }));

          this.updateNodeState(event.node_id, (state) => {
            // Top-level Phase im Workflow-Knoten hat callDepth <= 1 (da Workflow mit call_depth=1 startet)
            if (callDepth <= 1 || state.taskPhases.length === 0) {
              return {
                ...state,
                taskPhases: [
                  ...state.taskPhases,
                  {
                    phaseIndex: state.taskPhases.length,
                    callDepth,
                    agentId: payload['agent_id'] as string | undefined,
                    steps: normalizedSteps
                  }
                ]
              };
            }

            // Sub-Agenten Task-Chain an den laufenden message_agent-Schritt anhängen
            const updatedPhases = state.taskPhases.map((phase) => ({
              ...phase,
              steps: phase.steps.map((step) => {
                if (
                  step.tool_name === 'message_agent' &&
                  (step.status === 'running' || step.status === 'pending')
                ) {
                  return {
                    ...step,
                    subTaskChain: {
                      phaseIndex: 0, // <--- Hinzufügen, um den Typfehler zu lösen
                      callDepth,
                      agentId: payload['agent_id'] as string | undefined,
                      steps: normalizedSteps
                    }
                  };
                }
                return step;
              })
            }));

            return {
              ...state,
              taskPhases: updatedPhases
            };
          });
        } else if (tcType === 'task_step_update') {
          const stepNumber = payload['step_number'] as number;
          const status = payload['status'] as TaskStatus;
          const result = payload['result'] as string | Record<string, unknown> | undefined;
          const callDepth = (payload['call_depth'] as number) ?? 1;

          this.updateNodeState(event.node_id, (state) => ({
            ...state,
            taskPhases: SseDecoder.applyTaskStepUpdate(
              state.taskPhases,
              stepNumber,
              status,
              callDepth,
              result
            )
          }));
        }
        break;
      }

      case 'node_chunk': {
        const chunkText = event.delta ?? event.content ?? '';
        if (!chunkText) break;

        this.updateNodeState(event.node_id, (state) => ({
          ...state,
          isThinking: false,
          thoughtsExpanded: false,
          output: state.output + chunkText
        }));
        break;
      }

      case 'node_attachments': {
        if (!Array.isArray(event.files) || event.files.length === 0) break;
        this.updateNodeState(event.node_id, (state) => ({
          ...state,
          attachments: [...state.attachments, ...event.files]
        }));
        break;
      }

      case 'node_complete': {
        this.activeSimulationNodeIds.update((set) => {
          const next = new Set(set);
          next.delete(event.node_id);
          return next;
        });
        this.completedSimulationNodeIds.update((set) => {
          const next = new Set(set);
          next.add(event.node_id);
          return next;
        });

        this.updateNodeState(event.node_id, (state) => ({
          ...state,
          status: 'completed',
          isThinking: false,
          thoughtsExpanded: false,
          output: state.output || event.output || ''
        }));
        break;
      }

      case 'node_error': {
        this.activeSimulationNodeIds.update((set) => {
          const next = new Set(set);
          next.delete(event.node_id);
          return next;
        });
        this.errorSimulationNodeIds.update((set) => {
          const next = new Set(set);
          next.add(event.node_id);
          return next;
        });

        this.updateNodeState(event.node_id, (state) => ({
          ...state,
          status: 'error',
          isThinking: false,
          error: event.error
        }));
        break;
      }
    }
  }

  private updateNodeState(
    nodeId: string,
    updater: (prev: WorkflowNodeExecutionState) => WorkflowNodeExecutionState
  ): void {
    this.nodeExecutionStates.update((map) => {
      const current: WorkflowNodeExecutionState = map[nodeId] ?? {
        nodeId,
        status: 'idle',
        output: '',
        thoughts: [],
        isThinking: false,
        thoughtsExpanded: false,
        taskPhases: [],
        attachments: []
      };
      return {
        ...map,
        [nodeId]: updater(current)
      };
    });
  }

  isNodeRunning(nodeId: string): boolean {
    return this.activeSimulationNodeIds().has(nodeId);
  }

  isNodeCompleted(nodeId: string): boolean {
    return this.completedSimulationNodeIds().has(nodeId);
  }

  isNodeError(nodeId: string): boolean {
    return this.errorSimulationNodeIds().has(nodeId);
  }

  hasNodeExecutionData(nodeId: string): boolean {
    const st = this.nodeExecutionStates()[nodeId];
    if (!st) return false;
    return (
      st.status !== 'idle' ||
      Boolean(st.output) ||
      st.thoughts.length > 0 ||
      st.taskPhases.length > 0
    );
  }

  toggleNodeThoughts(nodeId: string): void {
    this.updateNodeState(nodeId, (st) => ({
      ...st,
      thoughtsExpanded: !st.thoughtsExpanded
    }));
  }

  formatNodeOutput(rawText: string): SafeHtml {
    return formatMessageContent(rawText);
  }

  getNodeStepNumber(nodeId: string, fallbackIndex: number): number {
    return this.nodeStepNumbers().get(nodeId) ?? fallbackIndex + 1;
  }

  /**
   * Gruppiert die Knoten topologisch in parallele Ausführungsstufen (Kahn-Algorithmus in Schichten).
   */
  private computeExecutionLayers(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[][] {
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

    let currentWave = nodes
      .filter((n) => (inDegree.get(n.id) ?? 0) === 0)
      .sort(sortByPosition);

    const layers: WorkflowNode[][] = [];
    const visited = new Set<string>();

    while (currentWave.length > 0) {
      layers.push(currentWave);
      const nextWave: WorkflowNode[] = [];

      for (const node of currentWave) {
        visited.add(node.id);
        for (const targetId of adjacency.get(node.id) ?? []) {
          inDegree.set(targetId, (inDegree.get(targetId) ?? 1) - 1);
          if (inDegree.get(targetId) === 0 && !visited.has(targetId)) {
            const targetNode = nodes.find((n) => n.id === targetId);
            if (targetNode) {
              nextWave.push(targetNode);
            }
          }
        }
      }

      currentWave = nextWave.sort(sortByPosition);
    }

    if (visited.size < nodes.length) {
      const remaining = nodes.filter((n) => !visited.has(n.id)).sort(sortByPosition);
      layers.push(remaining);
    }

    return layers;
  }

  private clearTimersAndStream(): void {
    if (this.streamAbortController) {
      this.streamAbortController.abort();
      this.streamAbortController = null;
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
    if (!workflowId || workflowId === this.workflowId()) return;
    this.stopSimulation(true);
    this.workflowService.selectWorkflow(workflowId);
  }

  onNewWorkflow(): void {
    this.stopSimulation(true);
    this.nodeExecutionStates.set({});
    this.workflowService.startNewWorkflow();
  }

  onSaveWorkflow(): void {
    this.workflowService
      .saveWorkflow({
        id: this.workflowId(),
        name: this.workflowName(),
        nodes: this.nodes(),
        edges: this.edges(),
        updatedAt: new Date().toISOString()
      })
      .subscribe({
        next: (saved) => {
          this.workflowId.set(saved.id);
          this.saveSuccessToast.set(true);
          setTimeout(() => this.saveSuccessToast.set(false), 2500);
        },
        error: (err) => {
          console.error('Fehler beim Speichern des Workflows im Backend:', err);
        }
      });
  }

  onDeleteWorkflow(): void {
    const id = this.workflowId();
    if (!id) return;
    this.stopSimulation(true);
    this.workflowService.deleteWorkflow(id).subscribe({
      error: (err) => console.error('Fehler beim Löschen des Workflows:', err)
    });
  }

  onClearCanvas(): void {
    this.stopSimulation(true);
    this.nodes.set([]);
    this.edges.set([]);
    this.nodeExecutionStates.set({});
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
    if (this.draggingNodeId) {
      this.hasDraggedNode = true;
      const { x, y } = this.getCanvasCoords(event.clientX, event.clientY);
      const nextX = Math.max(12, this.snapToGrid(x - this.dragOffsetX));
      const nextY = Math.max(12, this.snapToGrid(y - this.dragOffsetY));

      const snapCandidate = this.findNearestSnapNode(nextX, nextY, this.draggingNodeId);
      this.snapTargetNodeId.set(snapCandidate ? snapCandidate.id : null);

      this.nodes.update((list) =>
        list.map((n) => (n.id === this.draggingNodeId ? { ...n, x: nextX, y: nextY } : n))
      );
      return;
    }

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
  // KLICK AUF KNOTEN -> MODAL MIT TABS (LIVE-AUSGABE & PROMPT-KONFIGURATION)
  // ===========================================================================

  onNodeClick(event: MouseEvent, node: WorkflowNode): void {
    const targetEl = event.target as HTMLElement;
    if (targetEl.closest('.node-port') || targetEl.closest('.node-delete-btn')) {
      return;
    }

    if (this.hasDraggedNode) {
      this.hasDraggedNode = false;
      return;
    }

    this.editingNode.set(node);
    this.editingPromptText.set(node.prompt || '');

    // Smarte UX: Wenn der Agent läuft, fertig ist oder bereits Ausgaben hat -> direkt Tab "output" öffnen
    if (
      this.isNodeRunning(node.id) ||
      this.isNodeCompleted(node.id) ||
      this.hasNodeExecutionData(node.id)
    ) {
      this.activeModalTab.set('output');
    } else {
      this.activeModalTab.set('prompt');
    }
  }

  setModalTab(tab: 'prompt' | 'output'): void {
    this.activeModalTab.set(tab);
  }

  saveNodePrompt(): void {
    const current = this.editingNode();
    if (!current) return;

    const updatedPrompt = this.editingPromptText().trim();
    this.nodes.update((list) =>
      list.map((n) => (n.id === current.id ? { ...n, prompt: updatedPrompt } : n))
    );
    this.editingNode.update((n) => (n ? { ...n, prompt: updatedPrompt } : null));
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

  private hasAnyConnectionBetween(nodeAId: string, nodeBId: string): boolean {
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
      x: clientX - rect.left + this.canvasRef.nativeElement.scrollLeft,
      y: clientY - rect.top + this.canvasRef.nativeElement.scrollTop
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