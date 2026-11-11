import { MessageAttachment, MessageThought, TaskPhase } from './message.model';

export interface WorkflowNode {
  id: string;
  agentId: string;
  agentName: string;
  agentDescription?: string;
  x: number;
  y: number;
  prompt: string;
}

export interface WorkflowEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
}

export interface WorkflowGraph {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt?: string;
  updatedAt: string;
}

/**
 * Struktur für das Flask-Backend (Task-Chain-Übersetzung).
 */
export interface WorkflowExecutionStep {
  step: number;
  node_id: string;
  agent_id: string;
  prompt: string;
  depends_on_step?: number;
  depends_on_steps?: number[];
}

export interface WorkflowExecutionPayload {
  workflow_id: string;
  workflow_name: string;
  steps: WorkflowExecutionStep[];
}

/**
 * Echtzeit-Ausführungsstatus eines einzelnen Agenten-Knotens im Workflow.
 */
export interface WorkflowNodeExecutionState {
  nodeId: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  output: string;
  thoughts: MessageThought[];
  isThinking: boolean;
  thoughtsExpanded: boolean;
  taskPhases: TaskPhase[];
  attachments: MessageAttachment[];
  error?: string;
}

/**
 * Vom Backend gestreamte SSE-Events während der Workflow-Ausführung.
 */
export type WorkflowStreamEvent =
  | { type: 'workflow_start'; workflow_id: string; conversation_id: string }
  | { type: 'node_start'; node_id: string; agent_id: string; agent_name: string; step: number }
  | { type: 'node_thought'; node_id: string; thought: string; delta?: string }
  | { type: 'node_task_chain'; node_id: string; payload: Record<string, unknown> }
  | { type: 'node_chunk'; node_id: string; content: string; delta?: string }
  | { type: 'node_attachments'; node_id: string; files: MessageAttachment[] }
  | { type: 'node_complete'; node_id: string; agent_id: string; output: string }
  | { type: 'node_error'; node_id: string; agent_id: string; error: string }
  | { type: 'workflow_complete'; workflow_id: string; conversation_id: string };