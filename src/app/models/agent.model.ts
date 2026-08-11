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
}