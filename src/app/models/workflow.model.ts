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