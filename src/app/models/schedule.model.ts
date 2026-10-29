// schedule.model.ts

export type ScheduleTriggerType = 'cron' | 'event' | 'once';
export type ScheduleExecutionStatus = 'running' | 'success' | 'failed' | 'cancelled';

/**
 * Interface representing a scheduled task configuration.
 */
export interface ScheduleEntity {
  id: string;
  agent_id: string;
  name: string;
  prompt: string;
  is_active: boolean;
  trigger_type: ScheduleTriggerType;
  cron_expression?: string | null;
  scheduled_at?: string | null;
  next_run_at?: string | null;
  last_run_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * DTO for creating or updating a schedule.
 */
export interface UpsertScheduleDto {
  name: string;
  prompt: string;
  trigger_type: ScheduleTriggerType;
  is_active: boolean;
  cron_expression?: string | null;
  scheduled_at?: string | null;
}

/**
 * Interface representing a historical schedule execution run.
 */
export interface ScheduleExecutionEntity {
  id: string;
  schedule_id: string;
  conversation_id?: string | null;
  status: ScheduleExecutionStatus;
  resolved_prompt: string;
  error_message?: string | null;
  started_at: string;
  finished_at?: string | null;
}