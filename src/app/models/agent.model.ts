export interface Skill {
  id: string;
  name: string;
  system_name: string;
  description?: string;
}

export interface DataSource {
  id: string;
  name?: string;       // <- Das hat gefehlt!
  filename: string;
  file_size: number;
  mime_type: string;
}

export interface Agent {
  id: string;
  name: string;
  description?: string;
  system_prompt: string;
  skills: Skill[];
  datasources?: DataSource[];
  created_at?: string;

  memory_enabled: boolean;
  memory_mode: 'user_only' | 'all';
  memory_limit_type: 'all' | 'message_count';
  memory_message_count?: number | null;
}