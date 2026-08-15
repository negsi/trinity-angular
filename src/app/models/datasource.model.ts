/**
 * Categorized file types for datasource display.
 */
export type DatasourceType = 'pdf' | 'xls' | 'doc' | string;

/**
 * Datasource entity stored on the backend.
 */
export interface DatasourceEntity {
  id: string;
  name?: string;
  filename: string;
  file_size: number;
  mime_type: string;
  agent_id?: string;
  created_at?: string;
}

/**
 * UI representation of an agent's datasource.
 */
export interface DatasourceUI {
  id: string;
  name: string;
  size: string;
  type: DatasourceType;
  filename?: string;
  file_size?: number;
  mime_type?: string;
}

/**
 * Backend response structure after file upload.
 */
export interface DatasourceUploadResponse {
  id: string;
  name?: string;
  filename: string;
  file_size: number;
  mime_type: string;
}
