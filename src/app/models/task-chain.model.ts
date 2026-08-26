export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface TaskItem {
  step_number: number;
  description: string;
  tool_name?: string;
  parameters?: Record<string, unknown>;
  result?: string | Record<string, unknown>;
  status: TaskStatus;
  subTaskChain?: TaskPhase; 
}

export interface TaskPhase {
  phaseIndex: number;
  callDepth?: number;  
  agentId?: string; 
  steps: TaskItem[];
}