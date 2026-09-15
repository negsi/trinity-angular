export interface Group {
  id: string;
  name: string;
  description?: string | null;
  agent_count: number;
  created_at?: string;
}

export interface CreateGroupDto {
  name: string;
  description?: string;
}

export interface UpdateGroupDto {
  name: string;
  description?: string;
}