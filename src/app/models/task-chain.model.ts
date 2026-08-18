export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface TaskItem {
  step_number: number;
  description: string;
  tool_name?: string;
  status: TaskStatus;
}

export interface TaskChainInitPayload {
  type: 'task_chain_init';
  steps: TaskItem[];
}

export interface TaskStepUpdatePayload {
  type: 'task_step_update';
  step_number: number;
  status: TaskStatus;
}
