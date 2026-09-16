import { DatasourceEntity } from './datasource.model';

/**
 * Available skill capability definition.
 */
export interface Skill {
  id: string;
  name: string;
  system_name: string;
  description?: string;
}

/**
 * Skill option selectable in the UI.
 */
export interface SkillOption {
  id: string;
  label: string;
  systemName: string;
  selected: boolean;
}

/**
 * Core Agent model.
 */
export interface Agent {
  id: string;
  name: string;
  description?: string;
  system_prompt: string;
  groups: string[];
  skills: Skill[];
  datasources?: DatasourceEntity[];
  created_at?: string;
  memory_enabled: boolean;
  memory_mode: 'user_only' | 'all';
  memory_limit_type: 'all' | 'message_count';
  memory_message_count?: number | null;
  last_interaction_at?: string | number;
}

/**
 * Payload for creating a new agent.
 */
export interface CreateAgentDto {
  name: string;
  description: string;
  system_prompt: string;
  group_ids?: string[];
  skills: string[];
  memory_enabled: boolean;
  memory_mode: 'user_only' | 'all';
  memory_limit_type: 'all' | 'message_count';
  memory_message_count: number | null;
}

/**
 * Payload for updating an existing agent.
 */
export type UpdateAgentDto = Partial<CreateAgentDto>;
